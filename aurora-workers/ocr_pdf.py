"""Extract text from PDF using OCR (fallback for broken font encoding)."""
import os
import pypdfium2 as pdfium
from paddleocr import PaddleOCR


def ocr_pdf(file_path: str, options: dict | None = None) -> dict:
    """Extract text from PDF by rendering pages as images and running OCR.

    Args:
        file_path: Path to PDF file.
        options: Optional dict with:
            - language: OCR language hint (default: 'en').
            - dpi: Render resolution (default: 200).

    Returns:
        Dict with OCR-extracted text and metadata.
    """
    opts = options or {}
    lang_input = opts.get('language', 'en')
    dpi = int(opts.get('dpi', 200))

    # Map language codes
    lang_map = {'sv': 'latin', 'en': 'en', 'de': 'german', 'fr': 'french',
                'no': 'latin', 'da': 'latin', 'fi': 'latin'}
    lang = lang_map.get(lang_input, lang_input)

    pdf = pdfium.PdfDocument(file_path)
    ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)

    pages_text = []
    confidence_scores = []

    for i in range(len(pdf)):
        page = pdf[i]
        # Render page as image (PIL)
        bitmap = page.render(scale=dpi / 72)
        pil_image = bitmap.to_pil()

        # Save temp image for PaddleOCR
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            pil_image.save(tmp.name)
            result = ocr.ocr(tmp.name, cls=True)
            os.unlink(tmp.name)

        page_lines = []
        for page_result in (result or []):
            if page_result is None:
                continue
            for line in page_result:
                page_lines.append(line[1][0])
                confidence_scores.append(line[1][1])

        if page_lines:
            pages_text.append('\n'.join(page_lines))

    full_text = '\n\n'.join(pages_text)
    if not full_text.strip():
        raise ValueError(f"OCR extracted no text from PDF: {file_path}")

    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    words = full_text.split()
    title = os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "pdf_ocr",
            "word_count": len(words),
            "page_count": len(pdf),
            "avg_confidence": round(avg_confidence, 3),
            "language": lang_input,
            "ocr_engine": "paddleocr",
            "dpi": dpi,
        },
    }
