# Handoff — Session 13: schema-dts + Page Classifier + Eval Runner

**Date:** 2026-04-08
**Session:** 13 (OpenCode)
**Model:** Claude Opus 4.6
**Status:** All three Session 12 priorities implemented and tested.

---

## What was done

### 1. schema-dts installed + AuroraDocument types

`pnpm add -D schema-dts` (v2.0.0). New file `src/aurora/types.ts` with:

- `AuroraDocument` — Schema.org envelope (`@context`, `@type`, `name`, `creator`, `datePublished`, `inLanguage`, `keywords`, `encodingFormat`) + `aurora` namespace extensions (`id`, `sourceHash`, `provenance`, `pages`, `reviewed`)
- `AuroraPageEntry` — wraps `PageDigest` + `PageUnderstanding | null`
- `PageUnderstanding`, `PageType`, `ChartType`, `DataPoint`, `PageTypeSignals`
- `AuroraProvenance` — type alias for existing `Provenance` from `aurora-schema.ts`
- Eval types: `Facit`, `FacitTextExtraction`, `FacitVision`, `FacitDataPoint`, `EvalResult`

### 2. Page classifier

New file `src/aurora/page-classifier.ts`: pure function `classifyPage(digest: PageDigest): PageUnderstanding`.

- Primary path: parses vision description fields (`PAGE TYPE:`, `TITLE:`, `DATA:`, `KEY FINDING:`)
- Handles both `Label: Value` and markdown table `| Label | Value |` data formats
- Fallback: text heuristics (char count, dot leaders, number density)
- 15 unit tests including real pipeline fixture data

### 3. Eval runner

New file `src/aurora/pdf-eval.ts`: scores pipeline output against facit YAML.

- `parseFacit(yaml)` — validates and parses facit files
- `evalPdfPage(pdf, facit)` — live pipeline run + scoring
- `evalFromPipelineJson(json, facit)` — offline scoring from fixture JSON
- `evalDirectory(pdf, dir)` — batch eval all facits in a directory
- `formatEvalSummary(results)` — human-readable output

Weighted scoring: text 40% + vision 60%.

### 4. CLI command

`aurora:pdf-eval <facit>` — evaluates single file or directory. Options: `--pdf <path>` (live run), `--json` (raw output). Auto-detects `_pipeline.json` next to `.yaml` facit files.

---

## Files changed

| File | Change |
|------|--------|
| `package.json` | Added `schema-dts` v2.0.0 as devDependency |
| `src/aurora/types.ts` | NEW — all Aurora document and eval types |
| `src/aurora/page-classifier.ts` | NEW — `classifyPage()` pure function |
| `src/aurora/pdf-eval.ts` | NEW — eval runner |
| `src/aurora/index.ts` | Added exports for new types and functions |
| `src/cli.ts` | Added `aurora:pdf-eval` CLI command |
| `tests/aurora/page-classifier.test.ts` | NEW — 15 tests |
| `tests/aurora/pdf-eval.test.ts` | NEW — 9 tests |

---

## What was NOT done

- LiteLLM routing: fixed by Marcus manually (switched to Anthropic for all agents)
- MCP tool registration for eval (CLI-first, MCP later)
- Prompt comparison CLI (WP4 from eval plan — future session)
- `schema-dts` type import in types.ts (removed — unused per YAGNI, add when serialization needs it)
- Obsidian vault copies of release notes

---

## Test status

- **typecheck:** clean
- **tests:** 4006/4008 pass (+24 new)
- **Pre-existing failures:** `auto-cross-ref.test.ts` (flaky), `tester.test.ts` (intermittent)

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| `AuroraProvenance` = type alias for `Provenance` | Same fields, avoids duplication. Can diverge later if needed |
| `AuroraPageEntry` wraps digest + understanding | Clean separation: digest is pipeline output, understanding is classifier output |
| Classifier is sync pure function | No LLM calls — parses existing vision output. Better model = better input automatically |
| Markdown table parser in classifier | Vision output uses `\| Label \| Value \|` format, not `Label: Value` |
| Weighted scoring formula | Text 40% vision 60%. Vision weighted toward data points (60% of vision score) |
| CLI auto-detects pipeline JSON | Looks for `foo_pipeline.json` next to `foo.yaml`. Falls back to --pdf live run |

---

## Next session priorities

### P0: Obsidian vault copy of release notes
Copy Session 13 release notes to `Neuron Lab/Release Notes/`.

### P1: MCP tool for eval
Register `aurora_pdf_eval` as MCP tool following existing pattern in `src/mcp/tools/`.

### P2: Prompt comparison (WP4)
`aurora:pdf-eval-compare --facit <dir> --prompt-a current --prompt-b <file>` — compare vision prompts.

### P3: Wire classifier into pipeline
Call `classifyPage()` in `ingestPdfRich()` to populate `AuroraPageEntry.understanding`.

---

## Key files for next session

- `src/aurora/types.ts` — all new types
- `src/aurora/page-classifier.ts` — `classifyPage()`
- `src/aurora/pdf-eval.ts` — eval runner
- `src/aurora/ocr.ts` — `PageDigest`, `ingestPdfRich()`, `diagnosePdfPage()`
- `tests/fixtures/pdf-eval/` — 5 facit YAML + 5 pipeline JSON
- `docs/plans/PLAN-pdf-eval-loop-2026-04-04.md` — full eval workflow plan
