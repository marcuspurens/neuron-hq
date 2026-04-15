"""Denoise audio using DeepFilterNet CLI (optional preprocessing step).

Runs before transcription and diarization to improve quality on noisy recordings.
Falls back to passthrough (returns original path) if DeepFilterNet is unavailable.
"""

import os
import shlex
import shutil
import subprocess

DEEPFILTERNET_CMD = os.environ.get("DEEPFILTERNET_CMD", "deep-filter")
DEEPFILTERNET_ARGS = os.environ.get("DEEPFILTERNET_ARGS", "")
DEEPFILTERNET_TIMEOUT = int(os.environ.get("DEEPFILTERNET_TIMEOUT", "300"))


def denoise_audio(source: str, options: dict | None = None) -> dict:
    """Denoise an audio file using DeepFilterNet.

    Args:
        source: Path to the input audio file.
        options: Optional dict with:
            - output_dir: Directory for the denoised file (default: same as source).

    Returns:
        Dict with title, text, metadata including denoised_path and whether
        denoising was actually applied or fell back to passthrough.
    """
    if not os.path.isfile(source):
        raise FileNotFoundError(f"Audio file not found: {source}")

    opts = options or {}
    output_dir = opts.get("output_dir", os.path.dirname(source))

    basename = os.path.splitext(os.path.basename(source))[0]
    denoised_path = os.path.join(output_dir, f"{basename}_denoised.wav")

    cmd_name = DEEPFILTERNET_CMD
    if shutil.which(cmd_name) is None:
        return _passthrough_result(source, "DeepFilterNet not found in PATH")

    args = [cmd_name]
    if DEEPFILTERNET_ARGS:
        args.extend(shlex.split(DEEPFILTERNET_ARGS))
    args.extend(["--output-dir", output_dir, source])

    try:
        subprocess.run(
            args,
            check=True,
            capture_output=True,
            timeout=DEEPFILTERNET_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return _passthrough_result(
            source, f"DeepFilterNet timed out after {DEEPFILTERNET_TIMEOUT}s"
        )
    except subprocess.CalledProcessError as exc:
        stderr = (
            exc.stderr.decode("utf-8", errors="replace").strip()
            if exc.stderr
            else "unknown error"
        )
        return _passthrough_result(source, f"DeepFilterNet failed: {stderr}")

    # deep-filter writes to output_dir with its own naming convention.
    # Try the expected path first, then scan for any new .wav file.
    if not os.path.isfile(denoised_path):
        denoised_path = _find_denoised_output(output_dir, basename)

    if not denoised_path or not os.path.isfile(denoised_path):
        return _passthrough_result(
            source, "DeepFilterNet ran but output file not found"
        )

    return {
        "title": basename,
        "text": "Audio denoised successfully",
        "metadata": {
            "denoised_path": denoised_path,
            "original_path": source,
            "applied": True,
            "fallback_reason": None,
            "source_type": "audio_denoise",
        },
    }


def _find_denoised_output(output_dir: str, basename: str) -> str | None:
    """Scan output_dir for a denoised .wav matching the basename."""
    for fname in os.listdir(output_dir):
        if fname.endswith(".wav") and basename in fname and fname != f"{basename}.wav":
            return os.path.join(output_dir, fname)
    return None


def _passthrough_result(source: str, reason: str) -> dict:
    basename = os.path.splitext(os.path.basename(source))[0]
    return {
        "title": basename,
        "text": f"Denoise skipped: {reason}",
        "metadata": {
            "denoised_path": source,
            "original_path": source,
            "applied": False,
            "fallback_reason": reason,
            "source_type": "audio_denoise",
        },
    }
