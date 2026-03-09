"""Extract text from PDF using pypdfium2."""
import os

import pypdfium2 as pdfium


def extract_pdf(file_path: str) -> dict:
    """Extract text content from a PDF file.

    Args:
        file_path: Path to the PDF file.

    Returns:
        Dict with title, text, and metadata keys.

    Raises:
        ValueError: If no text could be extracted from the PDF.
    """
    pdf = pdfium.PdfDocument(file_path)
    pages = []
    for i in range(len(pdf)):
        page = pdf[i]
        text = page.get_textpage().get_text_range()
        if text.strip():
            pages.append(text)

    full_text = "\n\n".join(pages)
    if not full_text.strip():
        raise ValueError(f"No text extracted from PDF: {file_path}")

    words = full_text.split()
    title = os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "pdf",
            "word_count": len(words),
            "page_count": len(pdf),
            "language": "unknown",
        },
    }
