"""Extract metadata and audio from any video URL using yt-dlp."""
import json
import re
import subprocess
import tempfile


def extract_video(source: str) -> dict:
    """Download audio and extract metadata from any yt-dlp supported URL.

    Args:
        source: Video URL (YouTube, SVT, Vimeo, TV4, TikTok, etc.).

    Returns:
        Dict with title, text, and metadata keys.

    Raises:
        ValueError: If yt-dlp cannot handle the URL or download fails.
    """
    with tempfile.TemporaryDirectory(prefix="aurora_vid_") as output_dir:
        output_path = f"{output_dir}/audio.m4a"

        try:
            result = subprocess.run(
                [
                    "yt-dlp",
                    "-x",
                    "--audio-format", "m4a",
                    "-o", output_path,
                    "--print-json",
                    "-q",
                    source,
                ],
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

        try:
            info = json.loads(result.stdout)
        except json.JSONDecodeError:
            raise ValueError("Could not parse yt-dlp JSON output")

        title = info.get("title", source)
        duration = info.get("duration", 0)
        video_id = _parse_youtube_id(source)

        # yt-dlp returns upload_date as YYYYMMDD string
        raw_date = info.get("upload_date")
        published_date = None
        if raw_date and len(raw_date) == 8:
            published_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"

        return {
            "title": title,
            "text": "",
            "metadata": {
                "videoId": video_id,
                "duration": int(duration) if duration else 0,
                "audioPath": output_path,
                "source_type": "video",
                "extractor": info.get("extractor", "unknown"),
                "webpage_url": info.get("webpage_url", source),
                "publishedDate": published_date,
            },
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
