# Handoff — Session 16: Compiled Concept Articles

**Date:** 2026-04-13
**Session:** OpenCode session 16
**Baseline:** typecheck clean, 4062/4062 tests

---

## What was delivered

All 5 work packages from `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md`:

| WP | Deliverable | Files |
|----|-------------|-------|
| WP1 | `compileConceptArticle(conceptId)` + staleness trigger + prompt | `ontology.ts`, `knowledge-library.ts`, `prompts/concept-compile.md` |
| WP2 | MCP actions: `compile_concept`, `concept_article`, `concept_index` | `mcp/tools/knowledge-library.ts` |
| WP3 | Concept index (via `concept_index` MCP action) | same as WP2 |
| WP4 | `aurora_ask` → `saveAsArticle` option | `ask.ts`, `mcp/tools/aurora-ask.ts` |
| WP5 | Ingest → concept bridge (Ollama concept extraction) | `intake.ts` |

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| `compileConceptArticle` in `knowledge-library.ts` | Co-located with `synthesizeArticle` — shares helpers (`parseJsonBlock`, `createArticle`, `getSynthesisModelConfig`) |
| Staleness via `ConceptProperties` fields, not `freshness.ts` DB columns | Concepts don't have a separate DB verification lifecycle; graph-node properties are the right layer |
| Circular dependency guard in `linkArticleToConcepts` | Articles with `synthesizedBy: 'concept-compile'` must not mark their source concept stale |
| WP5: Ollama concept extraction (not tags-as-concepts) | Depth Protocol caught the easy-path. Tags are flat keywords; LLM extraction gives facet, hierarchy, standardRefs. Local LLM is free. |
| `saveAsArticle` with 100-char minimum | Prevents garbage short answers from polluting the library |
| `importArticle` (not `createArticle`) for `saveAsArticle` | Gets LLM concept extraction for free via `importArticle`'s existing flow |

## Open risks

1. **Summary sludge** — compiled articles may be flat LLM summaries. `concept-compile.md` prompt requires epistemic marking but is untested against real concepts. Needs eval: pick 3-5 concepts, compile, review with Marcus, iterate prompt. Documented in ROADMAP-AURORA.md.
2. **WP5 Ollama availability** — concept extraction in intake depends on Ollama running. Falls through to `report.details.concepts.status: 'error'` gracefully, but concepts won't be linked if Ollama is down.
3. **Concept explosion** — every ingested document now creates concepts via LLM extraction. Low-quality extractions could pollute the ontology. `getOrCreateConcept`'s 0.85 semantic dedup threshold should prevent most duplicates, but monitor.

## Test delta

| File | Before | After | New |
|------|--------|-------|-----|
| `ontology.test.ts` | 27 | 30 | +3 staleness |
| `knowledge-library.test.ts` | 43 | 55 | +12 compile |
| `intake.test.ts` | 24 | 27 | +3 concept linking |
| `ask.test.ts` | 11 | 14 | +3 saveAsArticle |
| `concept-compile-lint.test.ts` | 0 | 7 | +7 prompt lint |
| **Total** | 4027 | 4062 | **+35** |

## Next session: Marcus wants YT video transcription with VoicePrint

Focus areas:
1. Speaker identification (VoicePrint) integration with YouTube transcription pipeline
2. Check existing `ingestVideo` + `identify-speakers` skill infrastructure
3. Likely involves `src/aurora/video.ts` + speaker diarization

## Files changed (complete list)

| File | Change |
|------|--------|
| `src/aurora/ontology.ts` | +3 fields in `ConceptProperties`, staleness trigger in `linkArticleToConcepts` |
| `src/aurora/knowledge-library.ts` | +`compileConceptArticle()`, +imports (`updateAuroraNode`, `getConcept`) |
| `src/aurora/intake.ts` | Concept extraction via Ollama replacing tags-bridge, steps_total 7→8 |
| `src/aurora/ask.ts` | +`saveAsArticle` option, +`importArticle` import |
| `src/aurora/index.ts` | +export `compileConceptArticle` |
| `src/mcp/tools/knowledge-library.ts` | +3 actions, +`compileConceptArticle` import, +`resolveConceptId` helper |
| `src/mcp/tools/aurora-ask.ts` | +`learn` and `save_as_article` params exposed |
| `prompts/concept-compile.md` | NEW — LLM prompt for concept compilation |
| `tests/aurora/ontology.test.ts` | +3 staleness tests |
| `tests/aurora/knowledge-library.test.ts` | +12 compile tests, +mocks for `updateAuroraNode` and `getConcept` |
| `tests/aurora/intake.test.ts` | +3 concept linking tests, +ontology mock |
| `tests/aurora/ask.test.ts` | +3 saveAsArticle tests, +`importArticle` mock |
| `tests/prompts/concept-compile-lint.test.ts` | NEW — 7 prompt lint tests |
| `AGENTS.md` | +Depth Protocol reference in §7 Step 1 |
| `ROADMAP-AURORA.md` | WP1-5 marked complete, summary sludge risk |
| `CHANGELOG.md` | Session 16 entry |
