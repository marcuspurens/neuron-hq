"""Extract metadata and audio from a YouTube video using yt-dlp."""
import json
import re
import subprocess
import tempfile


def extract_youtube(source: str) -> dict:
    """Download audio and extract metadata from a YouTube URL.

    Args:
        source: YouTube URL (youtube.com/watch?v=, youtu.be/, youtube.com/shorts/).

    Returns:
        Dict with title, text, and metadata keys.

    Raises:
        ValueError: If the URL is not a valid YouTube URL or download fails.
    """
    video_id = _parse_video_id(source)
    if not video_id:
        raise ValueError(f"Could not parse YouTube video ID from URL: {source}")

    output_dir = tempfile.mkdtemp(prefix="aurora_yt_")
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

    return {
        "title": title,
        "text": "",
        "metadata": {
            "videoId": video_id,
            "duration": int(duration) if duration else 0,
            "audioPath": output_path,
            "source_type": "youtube",
        },
    }


def _parse_video_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats.

    Supports:
        - youtube.com/watch?v=VIDEO_ID
        - youtu.be/VIDEO_ID
        - youtube.com/shorts/VIDEO_ID
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
