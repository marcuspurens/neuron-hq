---
session: 11
date: 2026-04-05
variant: llm
---

# Session 11 — Docling + Vision Pipeline

## Changes

| File                                | Change                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `aurora-workers/docling_extract.py` | NEW — Docling worker: per-page markdown, tables, image count                                                       |
| `aurora-workers/__main__.py`        | Register `extract_pdf_docling` action                                                                              |
| `src/aurora/worker-bridge.ts`       | Add `extract_pdf_docling` to WorkerRequest action union                                                            |
| `src/aurora/ocr.ts`                 | `diagnosePdfPage` uses Docling as primary extractor; `PageDigest.method` now includes `'docling'`                  |
| `src/aurora/vision.ts`              | Full rewrite: VisionDiagnostics interface, stat size check, keep_alive, temperature 0, removed thinking workaround |
| `src/core/config.ts`                | Default `OLLAMA_MODEL_VISION` → `aurora-vision-extract`                                                            |
| `ollama/Modelfile.vision-extract`   | NEW — Custom wrapper on `qwen3-vl:8b-instruct-q8_0`                                                                |
| `.env.example`                      | Updated vision setup instructions                                                                                  |
| `tests/aurora/vision.test.ts`       | Full rewrite: mock stat, /api/chat, isModelAvailable, diagnostics, size limit, keep_alive                          |
| `tests/aurora/ocr.test.ts`          | Updated diagnosePdfPage mocks for Docling                                                                          |
| `tests/core/config.test.ts`         | New default model assertion                                                                                        |
| `tests/fixtures/pdf-eval/*.json`    | 5 pipeline output files (pages 1,5,10,20,30)                                                                       |
| `tests/fixtures/pdf-eval/*.yaml`    | 5 facit skeleton files                                                                                             |

## New/Changed Interfaces

```typescript
// src/aurora/vision.ts
export interface VisionDiagnostics {
  model: string;
  loadDurationMs: number;
  evalDurationMs: number;
  totalDurationMs: number;
  promptTokens: number;
  evalTokens: number;
  imageSizeBytes: number;
}

// analyzeImage now returns:
{ description: string; modelUsed: string; diagnostics?: VisionDiagnostics }

// src/aurora/ocr.ts — PageDigest.textExtraction.method extended:
method: 'pypdfium2' | 'ocr' | 'docling' | 'none';

// src/aurora/worker-bridge.ts — new action:
action: ... | 'extract_pdf_docling';
```

## Design Decisions

| Decision                                                                        | Rationale                                                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Docling as primary, pypdfium2 retained as fallback                              | Docling gives structured markdown + tables but is heavier (~38s). pypdfium2 still used by `ingestPdfRich` for backward compat |
| Vision only for pages with `<!-- image -->`                                     | Docling marks visual content it can't parse. Vision is expensive (~15-25s/page), so only triggered when needed                |
| Custom Modelfile wrapper instead of raw model                                   | Bakes in temperature 0, seed 42, system prompt. Reproducible across sessions                                                  |
| `page_type` deferred — will be computed, not prompted                           | Combining Docling element-labels + vision signal in code. Better vision model → better classification automatically           |
| Three-layer metadata model (Dublin Core + DoclingDocument + page-understanding) | Research showed no single standard covers survey reports. DoclingDocument closest to problem shape                            |

## Test Delta

- Before: 3984/3984 pass
- After: 3983/3984 pass (1 pre-existing failure in auto-cross-ref.test.ts)
- Changed test files: vision.test.ts (full rewrite), ocr.test.ts (2 tests updated), config.test.ts (1 assertion)

## Known Issues

- Docling processes entire PDF even for single-page diagnose (~38s constant). No page-range filter in Docling API
- `streamlit` has unresolved dependency conflicts after numpy/pandas upgrade (not blocking)
- Vision `key_finding` sometimes hallucinates (page 30: said "agriculture most popular" when it was least popular)

## Verification

- typecheck: clean
- tests: 3983/3984 (1 pre-existing)
- E2E: 5 pages diagnosed successfully with Docling + vision
