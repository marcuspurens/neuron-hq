"""Batch OCR: process a folder of images into a single document."""
import os
import glob
import re
from paddleocr import PaddleOCR


def natural_sort_key(s: str):
    """Sort strings with embedded numbers naturally (page1, page2, page10)."""
    return [
        int(c) if c.isdigit() else c.lower()
        for c in re.split(r'(\d+)', s)
    ]


IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'}


def batch_ocr(source: str, options: dict | None = None) -> dict:
    """OCR all images in a folder, concatenated in filename order.

    Args:
        source: Path to folder containing image files.
        options: Optional dict with:
            - language: OCR language hint (default: 'en').
            - title: Document title (default: folder name).

    Returns:
        Dict with concatenated text and metadata.
    """
    opts = options or {}

    if not os.path.isdir(source):
        raise ValueError(f"Not a directory: {source}")

    # Find all image files
    files = []
    for f in os.listdir(source):
        ext = os.path.splitext(f)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            files.append(f)

    if not files:
        raise ValueError(f"No image files found in: {source}")

    files.sort(key=natural_sort_key)

    # Map language codes
    lang_input = opts.get('language', 'en')
    lang_map = {
        'sv': 'latin', 'en': 'en', 'de': 'german', 'fr': 'french',
        'no': 'latin', 'da': 'latin', 'fi': 'latin',
    }
    lang = lang_map.get(lang_input, lang_input)

    # Initialize PaddleOCR once for all pages
    ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)

    pages = []
    total_confidence = []
    total_lines = 0

    for i, filename in enumerate(files):
        filepath = os.path.join(source, filename)
        result = ocr.ocr(filepath, cls=True)

        page_lines = []
        for page_result in (result or []):
            if page_result is None:
                continue
            for line in page_result:
                page_lines.append(line[1][0])
                total_confidence.append(line[1][1])

        total_lines += len(page_lines)
        page_text = '\n'.join(page_lines)
        pages.append({
            'page': i + 1,
            'filename': filename,
            'text': page_text,
            'line_count': len(page_lines),
        })

    # Build markdown with page markers
    md_parts = []
    for p in pages:
        md_parts.append(f"<!-- page {p['page']} ({p['filename']}) -->")
        md_parts.append(p['text'])

    full_text = '\n\n'.join(md_parts)
    words = full_text.split()
    avg_confidence = (
        sum(total_confidence) / len(total_confidence)
        if total_confidence else 0
    )

    title = opts.get('title', os.path.basename(source.rstrip('/')))

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "batch_ocr",
            "word_count": len(words),
            "page_count": len(pages),
            "line_count": total_lines,
            "avg_confidence": round(avg_confidence, 3),
            "language": lang_input,
            "ocr_engine": "paddleocr",
            "files": [p['filename'] for p in pages],
        },
    }
