---
session: 10
date: 2026-04-04
variant: llm
---

# Session 10 — PageDigest + Vision Prompt Overhaul + Release Notes System

## Changes

| File                                     | Change                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/ocr.ts`                      | +`PageDigest` interface (exported), `ingestPdfRich()` refactored to build `PageDigest[]` per page, `ocrText` tracked separately, `visionModels[]` per page, `pageDigests` in metadata to `processExtractedText()`, `RichPdfResult.pageDigests`, +`diagnosePdfPage()`, +`truncateDigestText()`, new structured `PDF_VISION_PROMPT`                          |
| `src/aurora/vision.ts`                   | Switched from `/api/generate` to `/api/chat`, +`VISION_SYSTEM_MESSAGE`, +`think: false` + `options: { num_predict: 800 }`, removed `ensureOllama()` from `analyzeImage()`, `isVisionAvailable()` now uses `isModelAvailable()` instead of `ensureOllama()`, new structured `DEFAULT_PROMPT`, response type `OllamaGenerateResponse` → `OllamaChatResponse` |
| `src/cli.ts`                             | +`aurora:pdf-diagnose` command with `--page`, `--language`, `--dpi`                                                                                                                                                                                                                                                                                        |
| `src/commands/obsidian-export.ts`        | +`PageDigestData` interface, +`buildPageDigestSection()` renders Obsidian callout table, wired into standard non-video export path                                                                                                                                                                                                                         |
| `tests/aurora/ocr.test.ts`               | +mock for `vision.js` (analyzeImage, isVisionAvailable), +3 ingestPdfRich tests, +2 diagnosePdfPage tests, 1 pre-existing provenance fix                                                                                                                                                                                                                   |
| `tests/commands/obsidian-export.test.ts` | +2 tests (PageDigest table renders/omits correctly)                                                                                                                                                                                                                                                                                                        |
| `AGENTS.md`                              | +section 15: Release Notes (three variants: Marcus/LLM/Dev, file naming, format templates)                                                                                                                                                                                                                                                                 |
| `docs/release-notes/*`                   | 21 new files (retroactive session 1-10, Marcus + LLM variants)                                                                                                                                                                                                                                                                                             |

## New/Changed Interfaces

```typescript
// src/aurora/ocr.ts — NEW exported
export interface PageDigest {
  page: number; // 1-indexed
  textExtraction: {
    method: 'pypdfium2' | 'ocr' | 'none';
    text: string;
    charCount: number;
    garbled: boolean;
  };
  ocrFallback: {
    triggered: boolean;
    text: string | null;
    charCount: number | null;
  } | null;
  vision: {
    model: string;
    description: string;
    textOnly: boolean;
    tokensEstimate: number;
  } | null;
  combinedText: string;
  combinedCharCount: number;
}

// src/aurora/ocr.ts — CHANGED
export interface RichPdfResult extends IngestResult {
  pageDescriptions: string[];
  pageDigests: PageDigest[]; // NEW
  visionUsed: boolean;
  pageCount: number;
}

// src/aurora/ocr.ts — NEW exported
export async function diagnosePdfPage(
  filePath: string,
  page: number, // 1-indexed
  options?: { language?: string; dpi?: number }
): Promise<PageDigest>;

// src/aurora/vision.ts — CHANGED response type
interface OllamaChatResponse {
  // was OllamaGenerateResponse
  message: { role: string; content: string };
  done: boolean;
}
```

## Design Decisions

| Decision                                                 | Rationale                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------ |
| `/api/chat` instead of `/api/generate`                   | Supports system message role for behavioral constraints. `/api/generate` has no role separation.                                                                                                                   |
| `think: false` + `num_predict: 800`                      | qwen3-vl:8b thinking mode produced 2+ minute chain-of-thought with empty content output. `think: false` disables this. `num_predict` caps output length preventing runaway generation.                             |
| `isModelAvailable()` replaces `ensureOllama()` in vision | `ensureOllama()` has a Promise-gate that caches results and attempts model pulls. Combined with the 120s timeout, the model pull ate the entire timeout budget. `isModelAvailable()` is a simple `/api/tags` ping. |
| `truncateDigestText()` max 2000 chars                    | Prevents node properties from growing unbounded. Consistent with `MAX_EMBED_CHARS` convention.                                                                                                                     |
| `diagnosePdfPage()` does not ingest                      | Side-effect-free diagnostics. Safe to call repeatedly during debugging.                                                                                                                                            |
| Pipe char `                                              | `escaped to`∣` in Obsidian table                                                                                                                                                                                   | Markdown tables break on literal ` | ` in cell content. |
| Garbled flag per-document not per-page                   | `isTextGarbled()` runs on full extracted text. Per-page requires reliable page splitting (not available). Acceptable approximation.                                                                                |

## Test Delta

| Module                                   | Before | After  | New tests                                                          |
| ---------------------------------------- | ------ | ------ | ------------------------------------------------------------------ |
| `tests/aurora/ocr.test.ts`               | 16     | 21     | +3 ingestPdfRich PageDigest, +2 diagnosePdfPage, +1 provenance fix |
| `tests/commands/obsidian-export.test.ts` | 19     | 21     | +2 PageDigest table                                                |
| **Total affected**                       | 35     | **42** | **+7**                                                             |

## Dependencies

No new dependencies. Ollama qwen3-vl:8b already installed.

## Known Issues

1. **Cold start timeout**: First vision call after Ollama restart takes >120s (model loading). Subsequent calls ~30s. Pre-loading model at session start would fix this.
2. **Text splitting**: `\n{2,}` does not map 1:1 to PDF pages. Pypdfium2 doesn't always produce double newlines between pages.
3. **`think: false` not fully honored**: qwen3-vl:8b still returns some thinking content in `message.thinking` field despite `think: false`. Content field works correctly though.
4. **Pre-existing LSP errors**: `tests/aurora/ocr.test.ts` lines 71, 73, 99, 101 have type `'never'` assignment issues (unrelated to session 10).

## Verification

```
pnpm typecheck: PASS (0 errors)
tests/aurora/ocr.test.ts: 21/21 pass
tests/commands/obsidian-export.test.ts: 21/21 pass
E2E: Ungdomsbarometern page 10 — vision identified "bar chart", ~30s
E2E: Ungdomsbarometern page 30 — text extraction 1295 chars, vision responded
```
