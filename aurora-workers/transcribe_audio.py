"""Transcribe audio files using faster-whisper with language-aware model selection."""

import os

from faster_whisper import WhisperModel

# Language → model mapping. Override via env vars.
LANG_MODEL_MAP = {
    "sv": os.environ.get("WHISPER_MODEL_SV", "KBLab/kb-whisper-large"),
}
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "small")
DETECT_MODEL = os.environ.get("WHISPER_MODEL_DETECT", "tiny")


def transcribe_audio(source: str, options: dict | None = None) -> dict:
    """Transcribe an audio file to text with timestamps.

    Args:
        source: Path to the audio file.
        options: Optional dict with keys:
            - whisper_model: Explicit model to use (overrides auto-selection).
            - language: Language code (e.g. 'sv', 'en') — skips auto-detection.

    Returns:
        Dict with title, text, and metadata including timed segments.

    Raises:
        FileNotFoundError: If the audio file does not exist.
        ValueError: If transcription fails.
    """
    if not os.path.isfile(source):
        raise FileNotFoundError(f"Audio file not found: {source}")

    opts = options or {}
    explicit_model = opts.get("whisper_model")
    explicit_language = opts.get("language")

    if explicit_model:
        # User explicitly chose a model — respect it
        model_id = explicit_model
        detected_language = explicit_language
    elif explicit_language:
        # User specified language — pick best model for it
        model_id = LANG_MODEL_MAP.get(explicit_language, DEFAULT_MODEL)
        detected_language = explicit_language
    else:
        # Auto-detect language with tiny model, then pick model
        detect_model = WhisperModel(DETECT_MODEL)
        _, detect_info = detect_model.transcribe(
            source,
            beam_size=1,
            best_of=1,
            without_timestamps=True,
        )
        detected_language = detect_info.language if detect_info else None
        model_id = (
            LANG_MODEL_MAP.get(detected_language, DEFAULT_MODEL)
            if detected_language
            else DEFAULT_MODEL
        )

    # Full transcription with chosen model
    model = WhisperModel(model_id)
    transcribe_kwargs = {}
    if detected_language:
        transcribe_kwargs["language"] = detected_language

    transcribe_kwargs["word_timestamps"] = True

    try:
        raw_segments, info = model.transcribe(source, **transcribe_kwargs)
    except Exception as e:
        raise ValueError(f"Transcription failed: {e}")

    segments = []
    text_parts = []
    for seg in raw_segments:
        start_ms = int(seg.start * 1000)
        end_ms = int(seg.end * 1000)
        seg_dict = {
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": seg.text.strip(),
        }
        if seg.words:
            seg_dict["words"] = [
                {
                    "start_ms": int(w.start * 1000),
                    "end_ms": int(w.end * 1000),
                    "word": w.word,
                    "probability": round(w.probability, 4),
                }
                for w in seg.words
            ]
        segments.append(seg_dict)
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
            "model_used": model_id,
            "source_type": "audio_transcription",
        },
    }
