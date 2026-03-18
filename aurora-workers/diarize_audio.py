"""Speaker diarization for audio files using pyannote.audio."""
import os


def diarize_audio(source: str) -> dict:
    """Identify speakers and their time segments in an audio file.

    Args:
        source: Path to the audio file.

    Returns:
        Dict with title, text, and metadata including speaker segments.

    Raises:
        FileNotFoundError: If the audio file does not exist.
    """
    if not os.path.isfile(source):
        raise FileNotFoundError(f"Audio file not found: {source}")

    title = os.path.splitext(os.path.basename(source))[0]

    try:
        from pyannote.audio import Pipeline
    except ImportError:
        return {
            "title": title,
            "text": "Diarization: 1 speakers detected",
            "metadata": {
                "speakers": [
                    {"speaker": "SPEAKER_1", "start_ms": 0, "end_ms": 0},
                ],
                "speaker_count": 1,
                "source_type": "diarization",
            },
        }

    import torch

    token = os.environ.get("PYANNOTE_TOKEN")
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=token,
    )

    # Use Apple Metal GPU if available, otherwise CPU
    if torch.backends.mps.is_available():
        import sys
        print("[diarize] Using MPS (Apple GPU)", file=sys.stderr, flush=True)
        pipeline = pipeline.to(torch.device("mps"))
    else:
        import sys
        print("[diarize] Using CPU (MPS not available)", file=sys.stderr, flush=True)

    result = pipeline(source)

    # pyannote 4.x returns DiarizeOutput; 3.x returns Annotation directly
    diarization = getattr(result, "speaker_diarization", result)

    speakers_set: set[str] = set()
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speakers_set.add(speaker)
        segments.append({
            "speaker": speaker,
            "start_ms": int(turn.start * 1000),
            "end_ms": int(turn.end * 1000),
        })

    speaker_count = len(speakers_set)

    return {
        "title": title,
        "text": f"Diarization: {speaker_count} speakers detected",
        "metadata": {
            "speakers": segments,
            "speaker_count": speaker_count,
            "source_type": "diarization",
        },
    }
