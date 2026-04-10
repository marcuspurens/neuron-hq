# Handoff — Session 15: Fuzzy Scoring + Concept Articles Plan + Joel Rangsjö Research

**Date:** 2026-04-10
**Session:** 15 (OpenCode)
**Model:** Claude Opus 4.6
**Status:** P0–P2 completed. Research done. Concept articles plan written. Roadmap updated.

---

## What was done

### 1. P0: CHANGELOG.md requirement in AGENTS.md §15

- Added `CHANGELOG.md` as mandatory per-session deliverable in §15 intro text
- Added `CHANGELOG.md` to session close checklist

### 2. P1: Wire classification into processExtractedText metadata

- Added `pages` (AuroraPageEntry[]) to the metadata object passed from `ingestPdfRich` to `processExtractedText`
- Since `...metadata` is spread directly onto `docNode.properties`, page classification now persists on document nodes in the graph
- Updated test assertion to verify `pages` array is passed in metadata with correct structure

### 3. P2: Eval scoring refinements

- Added 5 new utility functions in `pdf-eval.ts`:
  - `parseNumericValue()` — extracts numbers from "61%", "61 %", "61,0%", "0.61"
  - `normalizedValueMatch()` — numeric comparison with ±1% tolerance
  - `normalizeForFuzzy()` — unicode normalization (em-dash, smart quotes, underscore→space)
  - `fuzzyContains()` — tolerant substring match
  - `valueFoundInText()` — scans text for numeric tokens and compares
- Updated 4 of 5 matching sites in `scoreText`/`scoreVision`:
  - `should_contain` → `fuzzyContains()`
  - `page_type` → `fuzzyContains()`
  - `title_contains` → `fuzzyContains()`
  - `data_points.values` → `valueFoundInText()`
- `should_not_contain` kept as exact `.includes()` — intentional (false negatives on negatives are dangerous)
- 17 new tests: 9 normalizedValueMatch, 7 fuzzyContains, 3 integration via evalFromPipelineJson

### 4. Research: Joel Rangsjö vs Aurora comparison

- Deep analysis of Joel's `llm-knowledge-base` repo (Pluggentipsar/llm-knowledge-base)
- Mapped Karpathy's "LLM Knowledge Bases" concept (April 2026 gist, 5000+ stars)
- Identified key architectural difference: compilation (wiki as artifact) vs retrieval (graph as query engine)
- Key insight: Aurora has pre-computed *structure* but on-demand *understanding*; Joel has pre-computed *understanding* but on-demand *structure*

### 5. Plan: Compiled concept articles

- Wrote `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md`
- 5 work packages: compile function, MCP tools, concept index, answer filing, ingest→concept bridge
- Estimated 10-14 hours across 2-3 sessions
- Based on thorough exploration of existing ontology.ts, knowledge-library.ts, briefing.ts

### 6. Roadmap updated

- Rewrote `ROADMAP-AURORA.md` with current state (session 15 level)
- P3 (vision prompt tuning) explicitly tracked
- Compiled concept articles plan linked

---

## Files changed

| File | Change |
|------|--------|
| `AGENTS.md` | Added CHANGELOG.md to §15 + session close checklist |
| `src/aurora/ocr.ts` | Added `pages` to `processExtractedText` metadata call |
| `src/aurora/pdf-eval.ts` | +5 scoring utilities, 4 matching sites updated to fuzzy/normalized |
| `tests/aurora/ocr.test.ts` | Added pages assertion on processExtractedText call |
| `tests/aurora/pdf-eval.test.ts` | +17 new tests (normalizedValueMatch, fuzzyContains, integration) |
| `ROADMAP-AURORA.md` | Full rewrite with current status |
| `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md` | NEW — 5 WP plan for concept compilation |

---

## What was NOT done

- P3 (vision prompt tuning) — requires interactive session with Marcus
- No DEV variant release note (following existing pattern — only Marcus + LLM)
- Schema.org JSON-LD export — deferred
- Concept articles WP1-5 — planned, not implemented

---

## Test status

- **typecheck:** clean
- **pdf-eval tests:** 28/28 pass (+17 new)
- **ocr tests:** 21/21 pass
- **pdf-eval-compare tests:** 5/5 pass
- **MCP pdf-eval tests:** 2/2 pass
- **Pre-existing failure:** `auto-cross-ref.test.ts` (flaky timeout)

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| No external fuzzy library (no fuse.js, no levenshtein) | YAGNI — our matching patterns are specific (underscores, Swedish decimals, percentage formatting). Custom utils are simpler and zero-dependency. |
| `should_not_contain` stays exact match | False negatives on negatives = missing a quality problem. Strict is correct here. |
| `valueFoundInText` scans all tokens, not just substring | "61%" in facit must match "61 %" or "61,0%" in vision output — needs tokenization + numeric comparison |
| `pages` persisted via metadata spread | Zero schema change needed — `AuroraNode.properties` is `Record<string, unknown>`, metadata is spread with `...metadata` |
| Concept articles as a separate plan, not inline implementation | Feature is 10-14 hours of work across multiple sessions — needs proper scoping |

---

## Next session priorities

### P3: Vision prompt tuning v2 (INTERACTIVE)
Create an improved vision prompt and test it against facit using `aurora:pdf-eval-compare`. **Requires Marcus** — run prompt, inspect output, iterate. Fuzzy scoring (P2) is now ready to measure real signal.

### Compiled concept articles (WP1-3)
Can run more autonomously. Start with WP1 (`compileConceptArticle(conceptId)`), then WP2 (MCP tools), then WP3 (concept index). Plan: `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md`

### Deferred
- Schema.org JSON-LD export
- DOCX/XLSX intake

---

## Key files for next session

- `src/aurora/pdf-eval.ts` — scoring with new fuzzy utilities
- `src/aurora/ocr.ts` — `ingestPdfRich()`, `PDF_VISION_PROMPT`
- `src/aurora/ontology.ts` — concept nodes (for WP1)
- `src/aurora/knowledge-library.ts` — `synthesizeArticle()` pattern (for WP1)
- `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md` — implementation plan
- `ROADMAP-AURORA.md` — current status and tracking
- `tests/fixtures/pdf-eval/` — 5 facit YAML files
