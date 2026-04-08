"""Extract structured content from PDF using Docling (IBM)."""

import json
import os
import time


def extract_pdf_docling(source: str, options: dict | None = None) -> dict:
    """Convert a PDF via Docling and return per-page markdown + tables.

    Options:
        page (int|None): 1-based page number. None = all pages.
        ocr (bool): Enable OCR (default True).
        table_mode (str): 'accurate' or 'fast' (default 'accurate').

    Returns dict with keys: title, text, metadata.
    metadata includes: pages (list of {page_no, markdown, tables, image_count}).
    """
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import (
        PdfPipelineOptions,
        TableFormerMode,
        TableStructureOptions,
    )

    options = options or {}
    target_page = options.get("page")
    do_ocr = options.get("ocr", True)
    table_mode_str = options.get("table_mode", "accurate")

    table_mode = (
        TableFormerMode.ACCURATE
        if table_mode_str == "accurate"
        else TableFormerMode.FAST
    )

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = do_ocr
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options = TableStructureOptions(
        do_cell_matching=True,
        mode=table_mode,
    )
    pipeline_options.generate_page_images = False
    pipeline_options.generate_picture_images = False

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    t0 = time.time()
    result = converter.convert(source)
    doc = result.document
    elapsed_ms = int((time.time() - t0) * 1000)

    total_pages = doc.num_pages()
    title = os.path.splitext(os.path.basename(source))[0]

    pages_to_extract = [target_page] if target_page else list(range(1, total_pages + 1))

    page_results = []
    for pg in pages_to_extract:
        md = doc.export_to_markdown(page_no=pg)
        image_count = md.count("<!-- image -->")

        tables_on_page = []
        for table in doc.tables:
            prov = table.prov[0] if table.prov else None
            if prov and prov.page_no == pg:
                df = table.export_to_dataframe(doc=doc)
                tables_on_page.append(
                    {
                        "columns": list(df.columns),
                        "rows": df.values.tolist(),
                        "row_count": len(df),
                        "col_count": len(df.columns),
                        "markdown": df.to_markdown(index=False),
                    }
                )

        page_results.append(
            {
                "page_no": pg,
                "markdown": md,
                "char_count": len(md),
                "tables": tables_on_page,
                "table_count": len(tables_on_page),
                "image_count": image_count,
            }
        )

    full_text = "\n\n".join(p["markdown"] for p in page_results)

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "pdf_docling",
            "method": "docling",
            "total_pages": total_pages,
            "extracted_pages": len(page_results),
            "total_tables": len(doc.tables),
            "elapsed_ms": elapsed_ms,
            "pages": page_results,
        },
    }
