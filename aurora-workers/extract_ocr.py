"""Extract text from images using PaddleOCR."""
import os
from paddleocr import PaddleOCR


def extract_ocr(file_path: str, options: dict | None = None) -> dict:
    """Extract text from an image file using OCR.

    Args:
        file_path: Path to image file (.png, .jpg, .jpeg, .webp, .tiff, .bmp).
        options: Optional dict with:
            - language: OCR language hint (default: 'en').
              Common values: 'en', 'sv' (mapped to PaddleOCR lang codes).

    Returns:
        Dict with extracted text and metadata.
    """
    opts = options or {}

    # Map common language codes to PaddleOCR lang codes
    lang_map = {
        'sv': 'latin',    # Swedish uses latin character set
        'en': 'en',
        'de': 'german',
        'fr': 'french',
        'es': 'es',
        'no': 'latin',    # Norwegian
        'da': 'latin',    # Danish
        'fi': 'latin',    # Finnish
    }
    lang_input = opts.get('language', 'en')
    lang = lang_map.get(lang_input, lang_input)

    ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
    result = ocr.ocr(file_path, cls=True)

    # Extract text lines from OCR result
    lines = []
    confidence_scores = []
    for page in result:
        if page is None:
            continue
        for line in page:
            text = line[1][0]       # Recognized text
            conf = line[1][1]       # Confidence score
            lines.append(text)
            confidence_scores.append(conf)

    full_text = '\n'.join(lines)
    if not full_text.strip():
        raise ValueError(f"No text extracted from image: {file_path}")

    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    words = full_text.split()
    title = os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "image_ocr",
            "word_count": len(words),
            "line_count": len(lines),
            "avg_confidence": round(avg_confidence, 3),
            "language": lang_input,
            "ocr_engine": "paddleocr",
        },
    }
