"""Check which Python dependencies are available for Aurora workers."""
import importlib
import os
import sys


def check_deps(source: str, options: dict | None = None) -> dict:
    """Check availability of Python dependencies.

    Args:
        source: Ignored (required by dispatcher interface).
        options: Optional dict with:
            - preload_models: bool — if True, also try loading Whisper models.

    Returns:
        Dict with dependency status information.
    """
    deps = {
        "faster_whisper": _check_import("faster_whisper"),
        "pyannote_audio": _check_import("pyannote.audio"),
        "yt_dlp": _check_import("yt_dlp"),
        "pypdfium2": _check_import("pypdfium2"),
        "trafilatura": _check_import("trafilatura"),
    }

    models: dict = {}
    opts = options or {}
    if opts.get("preload_models") and deps["faster_whisper"]["available"]:
        from faster_whisper import WhisperModel
        for model_name in ["tiny", "small", os.environ.get("WHISPER_MODEL_SV", "KBLab/kb-whisper-large")]:
            try:
                WhisperModel(model_name)
                models[model_name] = {"available": True, "error": None}
            except Exception as e:
                models[model_name] = {"available": False, "error": str(e)}

    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

    return {
        "title": "Aurora dependency check",
        "text": f"Python {python_version}: {sum(1 for d in deps.values() if d['available'])}/{len(deps)} deps available",
        "metadata": {
            "python_version": python_version,
            "python_path": sys.executable,
            "dependencies": deps,
            "models": models,
            "source_type": "dependency_check",
        },
    }


def _check_import(module_name: str) -> dict:
    """Try importing a module and return status."""
    try:
        mod = importlib.import_module(module_name)
        version = getattr(mod, "__version__", getattr(mod, "VERSION", "unknown"))
        return {"available": True, "version": str(version), "error": None}
    except ImportError as e:
        return {"available": False, "version": None, "error": str(e)}
