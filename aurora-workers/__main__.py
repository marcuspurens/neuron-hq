"""Aurora workers — JSON stdin/stdout dispatcher."""
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

HANDLERS: dict[str, callable] = {
    "extract_url": extract_url,
    "extract_pdf": extract_pdf,
    "extract_text": extract_text,
    "extract_video": extract_video,
    "extract_youtube": extract_video,  # backward compat alias
    "transcribe_audio": transcribe_audio,
    "diarize_audio": diarize_audio,
}


def main() -> None:
    """Read a JSON request from stdin and dispatch to the appropriate handler."""
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
        action = request.get("action", "")
        source = request.get("source", "")

        if action not in HANDLERS:
            print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))
            sys.exit(1)

        result = HANDLERS[action](source)
        print(json.dumps({"ok": True, **result}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
