"""Extract text from PDF using OCR (fallback for broken font encoding)."""

import os
import tempfile
import pypdfium2 as pdfium


def render_pdf_page(file_path: str, options: dict | None = None) -> dict:
    """Render a single PDF page as a PNG image file."""
    opts = options or {}
    page_num = int(opts.get("page", 0))
    dpi = int(opts.get("dpi", 150))
    output_path = opts.get("output_path", "")

    pdf = pdfium.PdfDocument(file_path)
    if page_num >= len(pdf):
        raise ValueError(f"Page {page_num} out of range (0-{len(pdf) - 1})")

    page = pdf[page_num]
    bitmap = page.render(scale=dpi / 72)
    pil_image = bitmap.to_pil()

    if not output_path:
        fd, output_path = tempfile.mkstemp(suffix=".png", prefix=f"pdf_page{page_num}_")
        os.close(fd)

    pil_image.save(output_path)

    return {
        "title": f"page_{page_num}",
        "text": "",
        "metadata": {
            "page_num": page_num,
            "total_pages": len(pdf),
            "output_path": output_path,
            "dpi": dpi,
        },
    }


def get_pdf_page_count(file_path: str) -> dict:
    """Return the number of pages in a PDF."""
    pdf = pdfium.PdfDocument(file_path)
    return {
        "title": os.path.basename(file_path),
        "text": "",
        "metadata": {"page_count": len(pdf)},
    }


def ocr_pdf(file_path: str, options: dict | None = None) -> dict:
    """Extract text from PDF by rendering pages as images and running OCR."""
    from paddleocr import PaddleOCR

    opts = options or {}
    lang_input = opts.get("language", "en")
    dpi = int(opts.get("dpi", 200))

    lang_map = {"sv": "en", "no": "en", "da": "en", "fi": "en", "de": "en", "fr": "en"}
    lang = lang_map.get(lang_input, lang_input)

    pdf = pdfium.PdfDocument(file_path)

    try:
        ocr = PaddleOCR(lang=lang)
        _has_predict = hasattr(ocr, "predict")
    except Exception:
        ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
        _has_predict = False

    pages_text = []
    confidence_scores = []

    for i in range(len(pdf)):
        page = pdf[i]
        # Render page as image (PIL)
        bitmap = page.render(scale=dpi / 72)
        pil_image = bitmap.to_pil()

        # Save temp image for PaddleOCR
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            pil_image.save(tmp.name)

            if _has_predict:
                # PaddleOCR v3.x API
                results = list(ocr.predict(tmp.name))
                page_lines = []
                for res in results:
                    texts = res.get("rec_texts", [])
                    scores = res.get("rec_scores", [])
                    for text, score in zip(texts, scores):
                        if text.strip():
                            page_lines.append(text)
                            confidence_scores.append(score)
            else:
                # PaddleOCR v2.x API (legacy fallback)
                result = ocr.ocr(tmp.name, cls=True)
                page_lines = []
                for page_result in result or []:
                    if page_result is None:
                        continue
                    for line in page_result:
                        page_lines.append(line[1][0])
                        confidence_scores.append(line[1][1])

            os.unlink(tmp.name)

        if page_lines:
            pages_text.append("\n".join(page_lines))

    full_text = "\n\n".join(pages_text)
    if not full_text.strip():
        raise ValueError(f"OCR extracted no text from PDF: {file_path}")

    avg_confidence = (
        sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    )
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
