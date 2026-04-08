---
session: 7
date: 2026-04-02
variant: llm
---

# Session 7 — Hybrid PDF Ingest (OCR + Vision), MCP Tool, Hermes Cron

## Changes

| File                                 | Change                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/ocr.ts`                  | Added `ingestPdfRich()`: orchestrates multi-stage PDF processing (get page count → extract text → detect garbled text → OCR fallback → per-page vision via qwen3-vl → combine results); added `RichPdfResult` interface; imports `analyzeImage` and `isVisionAvailable` |
| `src/aurora/job-runner.ts`           | Added `startPdfIngestJob()`: creates and enqueues a job for the rich PDF ingest pipeline                                                                                                                                                                                |
| `src/aurora/job-worker.ts`           | Generalized job dispatch: previously handled only one job type, now dispatches by `job.type` field to allow multiple job types including PDF ingest                                                                                                                     |
| `src/aurora/worker-bridge.ts`        | Added 2 new action handlers; relaxed `metadata` type from strict interface to allow broader pass-through of PDF-specific metadata                                                                                                                                       |
| `src/mcp/tools/aurora-ingest-pdf.ts` | NEW FILE: MCP tool that accepts a file path, starts a PDF ingest job via `startPdfIngestJob()`, and returns the job ID for status polling                                                                                                                               |
| `src/mcp/scopes.ts`                  | Added import and registration of `aurora-ingest-pdf` tool; added `aurora-ingest-media` and `aurora-media` scopes                                                                                                                                                        |
| `aurora-workers/ocr_pdf.py`          | Added `render_pdf_page()` function for rasterizing individual PDF pages; added `get_pdf_page_count()` function; updated PaddleOCR usage from deprecated `ocr()` to `predict()` (PaddleOCR 3.x API)                                                                      |
| `aurora-workers/__main__.py`         | Added 3 new handler registrations: `get_pdf_page_count`, `render_pdf_page`, and the OCR pipeline                                                                                                                                                                        |
| `src/commands/obsidian-export.ts`    | Added `source_url` field to exported frontmatter for all node types                                                                                                                                                                                                     |

## New/Changed Interfaces

New `RichPdfResult` interface in `src/aurora/ocr.ts`:

```typescript
interface RichPdfResult {
  nodeId: string;
  pageCount: number;
  pagesProcessed: number;
  pagesOcr: number; // pages where OCR fallback was used
  pagesVision: number; // pages where qwen3-vl vision was used
  text: string; // combined extracted text
  confidence: number;
}
```

New MCP tool schema in `src/mcp/tools/aurora-ingest-pdf.ts`:

```typescript
// Tool name: "aurora_ingest_pdf"
// Input schema:
{
  filePath: string;           // absolute path to PDF file
  language?: string;          // hint for OCR language model (default: "auto")
}
// Output:
{
  jobId: string;
  status: 'queued';
}
```

## Design Decisions

| Decision                                                     | Rationale                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-stage PDF pipeline (text → OCR → vision) with fallback | PDFs vary widely: some are text-based (direct extraction works), some are scanned (need OCR), some are diagram-heavy (need vision model). A fixed single-path approach fails for at least one category. The staged fallback tries the cheapest approach first and escalates only when needed. |
| `isTextGarbled()` check to trigger OCR                       | Direct PDF text extraction from scanned documents produces garbled Unicode (incorrect character mapping). Rather than always running OCR, the garble detector lets text-based PDFs skip OCR entirely, saving several seconds per page.                                                        |
| Per-page vision via qwen3-vl                                 | Page-level granularity allows the vision model to focus on one page at a time, producing better structured output than feeding an entire rendered PDF. It also allows selective vision: only pages where OCR confidence is low get the more expensive vision pass.                            |
| PaddleOCR `predict()` instead of `ocr()`                     | PaddleOCR 3.x deprecated `ocr()`. Using the old API produced deprecation warnings in production logs and would eventually break on a patch update. Migrated to `predict()` proactively.                                                                                                       |
| `job-worker.ts` dispatch by `job.type`                       | The original worker had a hardcoded single handler. Adding PDF as a second job type exposed the need for a proper dispatch table. The refactor is minimal but essential for adding future job types without touching every existing handler.                                                  |

## Test Delta

| Module                     | Before                                              | After     | Delta                               |
| -------------------------- | --------------------------------------------------- | --------- | ----------------------------------- |
| `tests/mcp/scopes.test.ts` | N (failing: missing `.tool` method on `fakeServer`) | N (fixed) | 0 net new, 1 pre-existing bug fixed |
| **Full suite**             | 3963                                                | **3964**  | +1 (from scopes fix)                |

Note: Session 7 code was committed as `24cdffe`. The scopes test fix was committed together.

## Dependencies

New Python packages installed:

| Package          | Version | Purpose                                                                      |
| ---------------- | ------- | ---------------------------------------------------------------------------- |
| `pyannote.audio` | latest  | Speaker diarization (installed for future use, not called in session 7 code) |
| `numpy`          | 1.26.4  | Required by pyannote.audio (pinned to avoid incompatibility with PaddleOCR)  |
| `croniter`       | latest  | Cron expression parsing for Hermes scheduled jobs                            |

External tools:

| Tool        | Configuration                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| Hermes cron | Scheduled to run at 08:00 daily                                                  |
| MCP scopes  | `aurora-insights`, `aurora-ingest-media`, `aurora-media` added to scope registry |

New Ollama model used: `qwen3-vl` (vision model for per-page PDF analysis). Must be available via `ollama pull qwen3-vl` before running `ingestPdfRich()`.

## Known Issues

- `qwen3-vl` availability is checked via `isVisionAvailable()` at runtime. If the model is not pulled, vision analysis is silently skipped. No warning is emitted to the job log.
- `ingestPdfRich()` processes pages sequentially. For a 100-page PDF, this could take minutes. No parallelism or page batching implemented.
- `render_pdf_page()` in `ocr_pdf.py` renders at a fixed DPI. No DPI parameter is exposed to the caller. Low DPI will produce poor OCR results on small-font pages.
- `pyannote.audio` is installed but not yet called from any application code. Installing it without a concrete caller violates YAGNI (AGENTS.md section 3.2). Accepted as infrastructure staging for session 8+.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS
- `pnpm test`: PASS (3964/3964 including 1 pre-existing flaky timeout)
- Commit: `24cdffe` (session 7 code)
