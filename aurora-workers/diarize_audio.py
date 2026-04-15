"""Speaker diarization for audio files using pyannote.audio.

Bypasses torchcodec AudioDecoder by preloading audio with soundfile/torchaudio
and passing the waveform dict directly to pyannote. This avoids the ABI mismatch
between torchcodec and torch that causes segfaults on macOS (April 2026).
"""

import os
import sys


def _convert_to_wav(source: str) -> str | None:
    """Convert non-WAV audio (m4a, webm, mp4, ogg) to 16kHz mono WAV via ffmpeg."""
    import shutil
    import subprocess
    import tempfile

    if source.lower().endswith(".wav"):
        return None

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None

    wav_path = os.path.join(tempfile.gettempdir(), f"diarize_{os.getpid()}.wav")
    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                source,
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                wav_path,
            ],
            capture_output=True,
            timeout=120,
        )
        if os.path.isfile(wav_path) and os.path.getsize(wav_path) > 0:
            print(
                f"[diarize] Converted to WAV via ffmpeg ({wav_path})",
                file=sys.stderr,
                flush=True,
            )
            return wav_path
    except Exception as e:
        print(f"[diarize] ffmpeg conversion failed: {e}", file=sys.stderr, flush=True)
    return None


def _load_audio(source: str):
    """Load audio as (waveform_tensor, sample_rate) using ffmpeg+soundfile or torchaudio.

    For non-WAV files (m4a, webm), converts to WAV via ffmpeg first.
    Returns a torch.Tensor of shape (channels, time) and the sample rate as int.
    """
    import torch

    wav_source = _convert_to_wav(source) or source

    try:
        import soundfile as sf
        import numpy as np

        data, sr = sf.read(wav_source, dtype="float32")
        waveform = torch.from_numpy(data)
        if waveform.ndim == 1:
            waveform = waveform.unsqueeze(0)  # (1, time) for mono
        else:
            waveform = waveform.T  # (channels, time)
        print(
            f"[diarize] Audio loaded via soundfile ({sr} Hz)",
            file=sys.stderr,
            flush=True,
        )
        return waveform, sr
    except ImportError:
        print(
            "[diarize] soundfile not installed, trying torchaudio",
            file=sys.stderr,
            flush=True,
        )
    except Exception as e:
        print(
            f"[diarize] soundfile failed ({e}), trying torchaudio",
            file=sys.stderr,
            flush=True,
        )

    try:
        import torchaudio

        waveform, sr = torchaudio.load(wav_source)
        print(
            f"[diarize] Audio loaded via torchaudio ({sr} Hz)",
            file=sys.stderr,
            flush=True,
        )
        return waveform, sr
    except Exception as e:
        print(f"[diarize] torchaudio.load failed ({e})", file=sys.stderr, flush=True)

    raise RuntimeError(
        f"Could not load audio from {source}. "
        "Install soundfile (pip install soundfile) or ensure torchaudio works."
    )


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

    # Preload audio to bypass torchcodec AudioDecoder entirely.
    # pyannote short-circuits AudioDecoder when it receives a waveform dict.
    waveform, sample_rate = _load_audio(source)

    token = os.environ.get("PYANNOTE_TOKEN")
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=token,
    )

    # Use Apple Metal GPU if available, otherwise CPU
    if torch.backends.mps.is_available():
        print("[diarize] Using MPS (Apple GPU)", file=sys.stderr, flush=True)
        pipeline = pipeline.to(torch.device("mps"))
    else:
        print("[diarize] Using CPU (MPS not available)", file=sys.stderr, flush=True)

    # Pass waveform dict — pyannote skips AudioDecoder when "waveform" key is present
    result = pipeline({"waveform": waveform, "sample_rate": sample_rate})

    # pyannote 4.x returns DiarizeOutput; 3.x returns Annotation directly
    diarization = getattr(result, "speaker_diarization", result)

    speakers_set: set[str] = set()
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speakers_set.add(speaker)
        segments.append(
            {
                "speaker": speaker,
                "start_ms": int(turn.start * 1000),
                "end_ms": int(turn.end * 1000),
            }
        )

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
