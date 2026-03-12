"""Aurora workers — JSON stdin/stdout dispatcher."""
import inspect
import json
import os
import sys

# Ensure we can import sibling modules when run directly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract_url import extract_url
from extract_pdf import extract_pdf
from extract_text import extract_text
from extract_video import extract_video
from transcribe_audio import transcribe_audio
from diarize_audio import diarize_audio
from check_deps import check_deps

# Lazy imports for OCR — PaddleOCR has heavy dependencies (paddlepaddle,
# numpy, pandas, sklearn) that may conflict with the base Anaconda env.
# Only import when actually needed so URL/PDF/video ingest still works.
_ocr_loaded = False
_extract_ocr = None
_ocr_pdf = None
_batch_ocr = None


def _load_ocr():
    global _ocr_loaded, _extract_ocr, _ocr_pdf, _batch_ocr
    if _ocr_loaded:
        return
    from extract_ocr import extract_ocr as _eo
    from ocr_pdf import ocr_pdf as _op
    from batch_ocr import batch_ocr as _bo
    _extract_ocr = _eo
    _ocr_pdf = _op
    _batch_ocr = _bo
    _ocr_loaded = True


def lazy_extract_ocr(source, options=None):
    _load_ocr()
    return _extract_ocr(source, options)


def lazy_ocr_pdf(source, options=None):
    _load_ocr()
    return _ocr_pdf(source, options)


def lazy_batch_ocr(source, options=None):
    _load_ocr()
    return _batch_ocr(source, options)


HANDLERS: dict[str, callable] = {
    "extract_url": extract_url,
    "extract_pdf": extract_pdf,
    "extract_text": extract_text,
    "extract_video": extract_video,
    "extract_youtube": extract_video,  # backward compat alias
    "transcribe_audio": transcribe_audio,
    "diarize_audio": diarize_audio,
    "check_deps": check_deps,
    "extract_ocr": lazy_extract_ocr,
    "ocr_pdf": lazy_ocr_pdf,
    "batch_ocr": lazy_batch_ocr,
}


def main() -> None:
    """Read a JSON request from stdin and dispatch to the appropriate handler."""
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
        action = request.get("action", "")
        source = request.get("source", "")
        options = request.get("options", {})

        if action not in HANDLERS:
            print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))
            sys.exit(1)

        handler = HANDLERS[action]
        sig = inspect.signature(handler)
        if len(sig.parameters) > 1:
            result = handler(source, options)
        else:
            result = handler(source)
        print(json.dumps({"ok": True, **result}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
