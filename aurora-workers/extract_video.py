"""Extract metadata, audio, and subtitles from any video URL using yt-dlp."""

import glob as globmod
import html
import json
import re
import subprocess
import tempfile


def _find_subtitle_file(output_dir: str) -> str | None:
    """Find the first .vtt subtitle file in the output directory."""
    vtt_files = sorted(globmod.glob(f"{output_dir}/*.vtt"))
    return vtt_files[0] if vtt_files else None


def _parse_vtt(vtt_path: str) -> dict:
    """Parse a WebVTT file into timed segments and full text.

    Returns:
        Dict with keys:
            - text: Full transcript as plain text.
            - segments: List of {start_ms, end_ms, text} dicts.
            - segment_count: Number of segments.
            - subtitle_format: 'vtt'.
    """
    with open(vtt_path, "r", encoding="utf-8") as f:
        content = f.read()

    segments = []
    # Match VTT cue blocks: timestamp --> timestamp\ntext
    cue_pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\s*\n((?:.+\n?)+)",
        re.MULTILINE,
    )

    seen_texts = set()  # Deduplicate repeated cues (common in auto-subs)
    for match in cue_pattern.finditer(content):
        start_str, end_str, raw_text = match.group(1), match.group(2), match.group(3)
        text = re.sub(r"<[^>]+>", "", raw_text)
        text = html.unescape(text)
        text = re.sub(r"[\u00a0\xa0]", " ", text)
        text = re.sub(r"\n+", " ", text)
        text = re.sub(r" {2,}", " ", text)
        text = text.strip()
        # Skip empty or duplicate cues
        if not text or text in seen_texts:
            continue
        seen_texts.add(text)

        start_ms = _timestamp_to_ms(start_str)
        end_ms = _timestamp_to_ms(end_str)
        segments.append({"start_ms": start_ms, "end_ms": end_ms, "text": text})

    full_text = " ".join(seg["text"] for seg in segments)

    return {
        "text": full_text,
        "segments": segments,
        "segment_count": len(segments),
        "subtitle_format": "vtt",
    }


def _timestamp_to_ms(ts: str) -> int:
    """Convert HH:MM:SS.mmm to milliseconds."""
    parts = ts.split(":")
    hours = int(parts[0])
    minutes = int(parts[1])
    sec_parts = parts[2].split(".")
    seconds = int(sec_parts[0])
    millis = int(sec_parts[1]) if len(sec_parts) > 1 else 0
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + millis


def extract_video(source: str, options: dict | None = None) -> dict:
    """Download audio, subtitles, and metadata from any yt-dlp supported URL.

    Subtitle priority: manual subs > auto-generated subs > none.
    When subtitles are available, the transcription step can be skipped.

    Args:
        source: Video URL (YouTube, SVT, Vimeo, TV4, TikTok, etc.).
        options: Optional dict with keys:
            - skip_subtitles: If True, don't attempt subtitle download.
            - sub_lang: Preferred subtitle languages (default: video language, en, sv).

    Returns:
        Dict with title, text, and metadata keys.
        metadata.subtitles will contain parsed subtitle data if available.

    Raises:
        ValueError: If yt-dlp cannot handle the URL or download fails.
    """
    opts = options or {}
    output_dir = tempfile.mkdtemp(prefix="aurora_vid_")
    output_path = f"{output_dir}/audio.m4a"
    sub_path_template = f"{output_dir}/subs"

    # Build yt-dlp command with subtitle flags
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format",
        "m4a",
        "-o",
        output_path,
        "--print-json",
        "-q",
    ]

    cmd.append(source)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError:
        raise ValueError("yt-dlp is not installed or not in PATH")
    except subprocess.TimeoutExpired:
        raise ValueError(f"yt-dlp timed out downloading: {source}")

    if result.returncode != 0:
        raise ValueError(f"yt-dlp failed: {result.stderr.strip()}")

    skip_subs = opts.get("skip_subtitles", False)
    if not skip_subs:
        sub_lang = opts.get("sub_lang", "en,sv")
        sub_cmd = [
            "yt-dlp",
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            sub_lang,
            "--sub-format",
            "vtt",
            "-o",
            f"{sub_path_template}.%(ext)s",
            "-q",
            source,
        ]
        try:
            subprocess.run(sub_cmd, capture_output=True, text=True, timeout=60)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise ValueError("Could not parse yt-dlp JSON output")

    title = info.get("title", source)
    duration = info.get("duration", 0)
    video_id = _parse_youtube_id(source)

    raw_date = info.get("upload_date")
    published_date = None
    if raw_date and len(raw_date) == 8:
        published_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"

    # Check for downloaded subtitles
    subtitles_data = None
    subtitle_source = None
    if not skip_subs:
        vtt_file = _find_subtitle_file(output_dir)
        if vtt_file:
            try:
                subtitles_data = _parse_vtt(vtt_file)
                # Determine if manual or auto-generated
                requested_subs = info.get("subtitles", {})
                auto_subs = info.get("automatic_captions", {})
                sub_lang_str = opts.get("sub_lang", "en,sv")
                langs = [l.strip() for l in sub_lang_str.split(",")]
                has_manual = any(lang in requested_subs for lang in langs)
                subtitle_source = "manual" if has_manual else "auto"
            except Exception:
                # Subtitle parsing failed — fall through to Whisper
                subtitles_data = None

    metadata = {
        "videoId": video_id,
        "duration": int(duration) if duration else 0,
        "audioPath": output_path,
        "source_type": "video",
        "extractor": info.get("extractor", "unknown"),
        "webpage_url": info.get("webpage_url", source),
        "publishedDate": published_date,
        "channel": info.get("channel") or info.get("uploader", ""),
        "channelId": info.get("channel_id", ""),
        "channelHandle": info.get("uploader_id", ""),
        "videoDescription": info.get("description", ""),
        "ytTags": info.get("tags", []),
        "categories": info.get("categories", []),
        "creators": info.get("creators"),
        "chapters": info.get("chapters"),
    }

    if subtitles_data:
        metadata["subtitles"] = subtitles_data
        metadata["subtitleSource"] = subtitle_source

    return {
        "title": title,
        "text": "",
        "metadata": metadata,
    }


def _parse_youtube_id(url: str) -> str | None:
    """Extract YouTube video ID if the URL is a YouTube URL.

    Returns None for non-YouTube URLs.
    """
    patterns = [
        r"(?:youtube\.com/watch\?.*v=)([a-zA-Z0-9_-]{11})",
        r"(?:youtu\.be/)([a-zA-Z0-9_-]{11})",
        r"(?:youtube\.com/shorts/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None
