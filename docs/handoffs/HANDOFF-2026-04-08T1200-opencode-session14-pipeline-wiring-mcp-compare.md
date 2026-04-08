# Handoff — Session 14: Pipeline Wiring + MCP Eval + Prompt Comparison

**Date:** 2026-04-08
**Session:** 14 (OpenCode)
**Model:** Claude Opus 4.6
**Status:** All four Session 13 priorities completed (P0–P3).

---

## What was done

### 1. P0: Session 13 release notes copied to Obsidian vault

Marcus + LLM variants copied to `Neuron Lab/Release Notes/Session 13 — Schema.org-typer, Sidklassificerare & Utvärderingsverktyg.md` (and LLM variant). Updated after session to reflect completed items.

### 2. P3: classifyPage() wired into ingestPdfRich pipeline

- Imported `classifyPage` from `page-classifier.js` and `AuroraPageEntry` from `types.js` into `ocr.ts`
- Added post-digest-loop classification pass: `pages: AuroraPageEntry[]` mapping each digest through `classifyPage()`
- Extended `RichPdfResult` interface with `pages: AuroraPageEntry[]`
- Three existing `ingestPdfRich` tests updated with `result.pages` assertions

### 3. P1: aurora_pdf_eval MCP tool

- New file `src/mcp/tools/aurora-pdf-eval.ts` with `registerAuroraPdfEvalTool()`
- Parameters: `facit_path` (file or dir), `pdf_path` (optional, for live), `format` (summary/json)
- Registered in `aurora-ingest-media` scope in `scopes.ts`
- Added to `TOOL_CATALOG` in `tool-catalog.ts` with Swedish description + keywords
- 2 MCP tool tests, catalog count assertion updated 44→45

### 4. P2: Prompt comparison CLI

- New file `src/aurora/pdf-eval-compare.ts`:
  - `resolvePrompt(arg)` — "current" returns built-in `PDF_VISION_PROMPT`, otherwise reads file
  - `comparePrompts(pdf, facitDir, promptA, promptB, labelA, labelB)` — runs same facit set with two prompts
  - `formatCompareResult(result)` — human-readable comparison with per-page delta
- `PDF_VISION_PROMPT` exported from `ocr.ts` (was `const`, now `export const`)
- `diagnosePdfPage` accepts new `visionPrompt` option (passed through to `analyzeImage`)
- `evalPdfPage` accepts `options?: { visionPrompt?: string }` (passed to `diagnosePdfPage`)
- CLI command `aurora:pdf-eval-compare` with `--facit`, `--pdf`, `--prompt-a`, `--prompt-b`, `--json`
- Exports added to `src/aurora/index.ts`
- 5 tests (resolvePrompt, comparePrompts, formatCompareResult)

---

## Files changed

| File | Change |
|------|--------|
| `src/aurora/ocr.ts` | Export `PDF_VISION_PROMPT`, add `visionPrompt` option to `diagnosePdfPage`, add `classifyPage` post-loop pass, extend `RichPdfResult` with `pages` |
| `src/aurora/pdf-eval.ts` | Add `options?: { visionPrompt?: string }` to `evalPdfPage` |
| `src/aurora/pdf-eval-compare.ts` | NEW — `resolvePrompt`, `comparePrompts`, `formatCompareResult`, `CompareResult` |
| `src/aurora/index.ts` | Added compare exports |
| `src/cli.ts` | Added `aurora:pdf-eval-compare` command |
| `src/mcp/tools/aurora-pdf-eval.ts` | NEW — `registerAuroraPdfEvalTool` |
| `src/mcp/scopes.ts` | Import + register `aurora-pdf-eval` in `aurora-ingest-media` scope |
| `src/mcp/tool-catalog.ts` | Added `aurora_pdf_eval` entry |
| `tests/aurora/ocr.test.ts` | Added `result.pages` assertions to 3 `ingestPdfRich` tests |
| `tests/aurora/pdf-eval-compare.test.ts` | NEW — 5 tests |
| `tests/mcp/tools/aurora-pdf-eval.test.ts` | NEW — 2 tests |
| `tests/mcp/tool-catalog.test.ts` | Updated count 44→45 |
| `docs/release-notes/SESSION-13-*` | Updated "vad saknas" with session 14 completions |

---

## What was NOT done

- No DEV variant release note for Session 13 (only Marcus + LLM existed)
- No new tests for `diagnosePdfPage` with custom `visionPrompt` — would require full Python pipeline mock
- `comparePrompts` runs prompts sequentially, not in parallel — vision model can only handle one request at a time anyway

---

## Test status

- **typecheck:** clean
- **tests:** 4014/4015 pass (+7 new)
- **Pre-existing failure:** `auto-cross-ref.test.ts` (flaky timeout)

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Post-loop classification (not inline) | Cleaner separation: digest-building loop stays focused, classification is a separate map pass |
| `PDF_VISION_PROMPT` exported | Compare tool needs to reference "current" prompt without importing a private constant |
| `visionPrompt` threaded through `diagnosePdfPage` → `evalPdfPage` | Minimal surface change — one option propagated through existing call chain |
| MCP tool in `aurora-ingest-media` scope | PDF eval is tightly coupled to the PDF ingest pipeline, not a standalone quality tool |
| Sequential prompt comparison | Vision model is GPU-bound, parallel would queue anyway. KISS. |

---

## Next session priorities

### P0: Wire classification into processExtractedText metadata
Currently `processExtractedText` receives `pageDigests` in metadata but not `pages` (with understanding). Consider passing `AuroraPageEntry[]` instead.

### P1: Schema.org JSON-LD export
`AuroraDocument` type exists but no serialization to actual JSON-LD. Implement `documentToJsonLd()` using the existing `jsonld-export.ts` patterns.

### P2: Vision prompt tuning
Now that `aurora:pdf-eval-compare` exists, actually create an improved vision prompt (v2) and test it against the existing facit set.

### P3: Eval scoring refinements
The current scoring is basic substring matching. Consider fuzzy matching for data points, handling number format variations ("67%" vs "67 %"), and language-aware comparison.

---

## Key files for next session

- `src/aurora/ocr.ts` — `ingestPdfRich()`, `diagnosePdfPage()`, `PDF_VISION_PROMPT`
- `src/aurora/pdf-eval.ts` — eval runner
- `src/aurora/pdf-eval-compare.ts` — prompt comparison
- `src/aurora/types.ts` — `AuroraDocument`, `AuroraPageEntry`
- `src/mcp/tools/aurora-pdf-eval.ts` — MCP tool
- `tests/fixtures/pdf-eval/` — 5 facit YAML + 5 pipeline JSON
