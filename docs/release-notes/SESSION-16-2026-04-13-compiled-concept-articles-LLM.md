---
session: 16
date: 2026-04-13
variant: llm
---

# Session 16 — Compiled Concept Articles

## Changes

| File | Change |
|------|--------|
| `src/aurora/ontology.ts` | +`compiledArticleId`, `compiledAt`, `compiledStale` on `ConceptProperties`; staleness trigger in `linkArticleToConcepts` with `concept-compile` circular guard |
| `src/aurora/knowledge-library.ts` | +`compileConceptArticle(conceptId)` — 14-step pipeline (graph traversal → LLM → article create/update → concept metadata write) |
| `src/aurora/intake.ts` | Concept extraction via Ollama `concept-extraction.md` prompt replaces tags-as-concepts; steps_total 7→8 |
| `src/aurora/ask.ts` | +`saveAsArticle` option on `ask()` — calls `importArticle` for answers >100 chars |
| `src/aurora/index.ts` | +export `compileConceptArticle` |
| `src/mcp/tools/knowledge-library.ts` | +actions `compile_concept`, `concept_article`, `concept_index`; +`resolveConceptId` helper (name→id resolution) |
| `src/mcp/tools/aurora-ask.ts` | +`learn` and `save_as_article` params |
| `prompts/concept-compile.md` | NEW — concept compilation prompt with epistemic status marking |
| `AGENTS.md` | +Depth Protocol first in §7 Orient |
| `ROADMAP-AURORA.md` | WP1-5 complete, summary sludge risk noted |

## New/Changed Interfaces

```typescript
// ontology.ts — extended
interface ConceptProperties {
  // ... existing fields ...
  compiledArticleId?: string | null;
  compiledAt?: string | null;
  compiledStale?: boolean;
}

// knowledge-library.ts — new
async function compileConceptArticle(
  conceptId: string,
  options?: { model?: string }
): Promise<ArticleNode>

// ask.ts — extended
interface AskOptions {
  // ... existing ...
  saveAsArticle?: boolean;
}
interface AskResult {
  // ... existing ...
  savedArticle?: { id: string; title: string };
}
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Staleness on graph properties, not DB `last_verified` | Concepts don't have DB verification lifecycle |
| `synthesizedBy: 'concept-compile'` circular guard | Without it, compiling a concept marks it stale → infinite loop |
| WP5: Ollama extraction over tags-bridge | Depth Protocol caught the easy path. Tags give flat keywords; LLM gives facet+hierarchy+standardRefs |
| `saveAsArticle` via `importArticle` not `createArticle` | Gets concept extraction for free |
| 100-char minimum for `saveAsArticle` | Prevents short garbage answers from polluting library |

## Test Delta

Before: 4027 tests. After: 4062 tests (+35).
- ontology: +3 (staleness trigger, circular guard, no-compile-no-stale)
- knowledge-library: +12 (compile lifecycle, LLM interaction, hierarchy, source ordering, error paths)
- intake: +3 (concept extraction, ollama failure, linkArticleToConcepts error)
- ask: +3 (saveAsArticle, short-answer skip, save-failure graceful)
- prompt lint: +7 (concept-compile.md placeholders, epistemic, JSON schema)

## Known Issues

- Summary sludge risk: compiled articles untested against real concepts. Prompt may need tuning.
- Concept explosion: every ingest now creates concepts. Dedup threshold (0.85) should contain it, but unmonitored.
- WP5 Ollama dependency: concept extraction silently skipped if Ollama is down.

## Verification

typecheck: clean. tests: 4062/4062 (299 files). 0 pre-existing failures (auto-cross-ref flaky passed on rerun).

Next: YT video transcription with VoicePrint (Marcus's request).

Handoff: `docs/handoffs/HANDOFF-2026-04-13-opencode-session16-compiled-concept-articles.md`
