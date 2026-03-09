"""Transcribe audio files using faster-whisper."""
import os

from faster_whisper import WhisperModel


def transcribe_audio(source: str) -> dict:
    """Transcribe an audio file to text with timestamps.

    Args:
        source: Path to the audio file.

    Returns:
        Dict with title, text, and metadata including timed segments.

    Raises:
        FileNotFoundError: If the audio file does not exist.
        ValueError: If transcription fails.
    """
    if not os.path.isfile(source):
        raise FileNotFoundError(f"Audio file not found: {source}")

    model_size = os.environ.get("WHISPER_MODEL", "small")
    model = WhisperModel(model_size)

    try:
        raw_segments, info = model.transcribe(source)
    except Exception as e:
        raise ValueError(f"Transcription failed: {e}")

    segments = []
    text_parts = []
    for seg in raw_segments:
        start_ms = int(seg.start * 1000)
        end_ms = int(seg.end * 1000)
        segments.append({
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": seg.text.strip(),
        })
        text_parts.append(seg.text.strip())

    full_text = " ".join(text_parts)
    title = os.path.splitext(os.path.basename(source))[0]
    language = info.language if info and hasattr(info, "language") else "unknown"

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "segments": segments,
            "segment_count": len(segments),
            "language": language,
            "source_type": "audio_transcription",
        },
    }
