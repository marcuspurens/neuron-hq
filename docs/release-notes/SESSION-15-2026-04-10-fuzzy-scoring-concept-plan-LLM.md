---
session: 15
date: 2026-04-10
variant: llm
---

# Session 15 — Fuzzy Eval Scoring + Concept Articles Plan

## Changes

| File | Change |
|------|--------|
| `AGENTS.md` | Added CHANGELOG.md to §15 intro + session close checklist |
| `src/aurora/ocr.ts` | Added `pages` to `processExtractedText` metadata object (1 line) |
| `src/aurora/pdf-eval.ts` | +5 scoring utilities (`parseNumericValue`, `normalizedValueMatch`, `normalizeForFuzzy`, `fuzzyContains`, `valueFoundInText`), 4 matching sites updated |
| `tests/aurora/ocr.test.ts` | Added `pages` assertion on `mockProcessExtractedText` call |
| `tests/aurora/pdf-eval.test.ts` | +17 new tests (9 normalizedValueMatch, 7 fuzzyContains, 3 integration) |
| `ROADMAP-AURORA.md` | Full rewrite — current status, P3 tracking, concept articles linked |
| `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md` | NEW — 5 WP plan |

## New/Changed Interfaces

```typescript
// src/aurora/pdf-eval.ts — NEW exports
export function normalizedValueMatch(expected: string, actual: string, tolerance?: number): boolean;
export function fuzzyContains(haystack: string, needle: string): boolean;
```

No interface changes to existing types. `pages` was already on `RichPdfResult` — now also stored on `docNode.properties` via metadata spread.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Custom fuzzy utils over library | Patterns are domain-specific (Swedish %, underscores, en-dashes). No external dep needed. |
| `should_not_contain` stays exact | False negatives on negatives = missed quality problems |
| `valueFoundInText` tokenizes + compares numerically | "61%" must match "61 %" — can't do with substring alone |
| No schema change for `pages` persistence | `properties: Record<string, unknown>` + `...metadata` spread handles it |
| Concept articles as plan, not code | 10-14h feature deserves proper scoping, not rushed implementation |

## Test Delta

Before: 4015 tests
After: 4015 tests (+17 new in pdf-eval, net same due to counting at session start)
New tests: 9 `normalizedValueMatch` + 7 `fuzzyContains` + 3 integration (fuzzy scoring via `evalFromPipelineJson`)

typecheck: clean

## Known Issues

- Pre-existing flaky: `auto-cross-ref.test.ts` timeout
- `pages` on `docNode.properties` is typed as `unknown` at read-back — needs cast
- Dedup path in `processExtractedText` returns early without saving `pages` for existing docs
- Session 14 LLM release note line 98 noted "processExtractedText receives pageDigests not AuroraPageEntry[]" — now fixed

## Verification

typecheck: clean. pdf-eval: 28/28. ocr: 21/21. pdf-eval-compare: 5/5. MCP pdf-eval: 2/2.

## Next

- P3: Vision prompt tuning (interactive, needs Marcus)
- WP1-3 of compiled concept articles (can run autonomously)

Handoff: `docs/handoffs/HANDOFF-2026-04-10T0930-opencode-session15-fuzzy-scoring-concept-plan.md`
