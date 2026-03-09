"""Read plain text or markdown files."""
import os


def extract_text(file_path: str) -> dict:
    """Extract content from a plain text or markdown file.

    Args:
        file_path: Path to the text file to read.

    Returns:
        Dict with title, text, and metadata keys.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file is empty.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    if not text.strip():
        raise ValueError(f"File is empty: {file_path}")

    title = os.path.splitext(os.path.basename(file_path))[0]
    words = text.split()

    return {
        "title": title,
        "text": text,
        "metadata": {
            "source_type": "text",
            "word_count": len(words),
            "language": "unknown",
        },
    }
