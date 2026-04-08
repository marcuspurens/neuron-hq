---
session: 14
date: 2026-04-08
variant: llm
---

# Session 14 — Pipeline Wiring + MCP Eval + Prompt Comparison

## Changes

| File | Change |
|------|--------|
| `src/aurora/ocr.ts` | Export `PDF_VISION_PROMPT`, add `visionPrompt` to `diagnosePdfPage`, wire `classifyPage` post-loop, extend `RichPdfResult` with `pages: AuroraPageEntry[]` |
| `src/aurora/pdf-eval.ts` | Add `options?: { visionPrompt?: string }` to `evalPdfPage` |
| `src/aurora/pdf-eval-compare.ts` | NEW — `resolvePrompt()`, `comparePrompts()`, `formatCompareResult()` |
| `src/aurora/index.ts` | Added compare exports |
| `src/cli.ts` | Added `aurora:pdf-eval-compare` command |
| `src/mcp/tools/aurora-pdf-eval.ts` | NEW — `registerAuroraPdfEvalTool()` |
| `src/mcp/scopes.ts` | Import + register in `aurora-ingest-media` scope |
| `src/mcp/tool-catalog.ts` | Added `aurora_pdf_eval` entry |
| `tests/aurora/ocr.test.ts` | Added `result.pages` assertions to 3 tests |
| `tests/aurora/pdf-eval-compare.test.ts` | NEW — 5 tests |
| `tests/mcp/tools/aurora-pdf-eval.test.ts` | NEW — 2 tests |
| `tests/mcp/tool-catalog.test.ts` | Count 44→45 |

## New/Changed Interfaces

```typescript
// src/aurora/ocr.ts — extended
export interface RichPdfResult extends IngestResult {
  pageDescriptions: string[];
  pageDigests: PageDigest[];
  pages: AuroraPageEntry[];  // NEW — digest + classifier understanding per page
  visionUsed: boolean;
  pageCount: number;
}

// diagnosePdfPage now accepts visionPrompt
export async function diagnosePdfPage(
  filePath: string,
  page: number,
  options?: { language?: string; dpi?: number; visionPrompt?: string }
): Promise<PageDigest>;

// src/aurora/pdf-eval.ts — extended
export async function evalPdfPage(
  pdfPath: string,
  facitPath: string,
  options?: { visionPrompt?: string },
): Promise<EvalResult>;

// src/aurora/pdf-eval-compare.ts — NEW
export interface CompareResult {
  promptALabel: string;
  promptBLabel: string;
  promptAResults: EvalResult[];
  promptBResults: EvalResult[];
  promptAAvg: number;
  promptBAvg: number;
  delta: number;
  perPage: Array<{ page: number; source: string; scoreA: number; scoreB: number; delta: number }>;
  improved: number;
  degraded: number;
  unchanged: number;
}
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Post-loop classification pass | Clean separation from digest-building loop; one `map()` call over completed digests |
| `PDF_VISION_PROMPT` exported | Compare tool needs "current" prompt reference without reaching into module internals |
| `visionPrompt` option threaded through call chain | Minimal API surface change; one option propagated `diagnosePdfPage` → `evalPdfPage` → `comparePrompts` |
| MCP tool in `aurora-ingest-media` scope | PDF eval is PDF pipeline concern, not a standalone quality scope |
| Sequential A/B comparison | GPU-bound vision model, parallelism wouldn't help |

## Test Delta

Before: 4008 tests (4007 pass, 1 fail)
After: 4015 tests (4014 pass, 1 fail — same pre-existing flaky)
New: +7 tests (3 ocr assertions, 2 MCP, 5 compare — note: some new tests from sessions 10-13 also committed)

## Known Issues

- 1 pre-existing flaky test (`auto-cross-ref.test.ts` timeout)
- `processExtractedText` still receives `pageDigests` not `AuroraPageEntry[]` in metadata
- No test for `diagnosePdfPage` with custom `visionPrompt` (requires full Python pipeline mock)

## Verification

typecheck: clean. 4014/4015 tests pass. `aurora:pdf-eval-compare` tested with mock digests.
