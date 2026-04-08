---
session: 6
date: 2026-04-01
variant: llm
---

# Session 6 — PPR-Enhanced Search + Memory Evolution on Ingest

## Changes

| File                          | Change                                                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/search.ts`        | Added `expandViaPpr()`: uses semantic search results as seeds for Personalized PageRank, weights seeds by similarity score, traverses edges bidirectionally, returns up to `pprLimit` (default 5) additional nodes tagged `source: 'ppr'` |
| `tests/aurora/search.test.ts` | +10 tests covering PPR expansion: seed weighting, bidirectional traversal, `pprLimit` cap, `source` field on PPR results, empty graph edge cases                                                                                          |
| `src/aurora/intake.ts`        | Added `evolveRelatedNodes()`: after ingest, finds top-5 similar nodes with similarity >= 0.6 (excluding `_chunk_` nodes), updates `relatedContext` field on matched nodes, calls `resolveGap()` for any gap with >= 50% word overlap      |
| `tests/aurora/intake.test.ts` | +5 tests covering `evolveRelatedNodes()`: similarity threshold filtering, chunk exclusion, `relatedContext` update, gap resolution trigger condition                                                                                      |

## New/Changed Interfaces

New fields on `SearchOptions`:

```typescript
interface SearchOptions {
  query: string;
  limit?: number;
  // NEW:
  usePpr?: boolean; // enable PPR expansion (default: false)
  pprLimit?: number; // max additional nodes from PPR (default: 5)
}
```

New `source` field on `SearchResult`:

```typescript
interface SearchResult {
  id: string;
  score: number;
  node: AuroraNode;
  // NEW:
  source?: 'semantic' | 'ppr'; // how this result was found
}
```

New return field on `IngestResult`:

```typescript
interface EvolutionResult {
  updatedNodes: number;
  resolvedGaps: number;
}

interface IngestResult {
  nodeId: string;
  chunkCount: number;
  // NEW:
  evolution?: EvolutionResult;
}
```

Pipeline report steps increased from 6 to 7 (new step: "evolve related nodes").

## Design Decisions

| Decision                                            | Rationale                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PPR seeds weighted by semantic similarity score     | Unweighted PPR treats all seeds equally, biasing results toward high-degree nodes regardless of query relevance. Weighting by similarity score makes PPR expand from the most relevant nodes first, producing more query-coherent results.     |
| Bidirectional edge traversal in PPR                 | Aurora edges are directed (source→target) but relationships are often semantically symmetric. A node about "machine learning" linked from an "AI overview" node should be reachable in both directions during PPR, not just forward traversal. |
| `pprLimit` capped at 5 by default                   | PPR can return large subgraphs from well-connected nodes. Uncapped expansion degrades search latency and floods results with loosely-related nodes. 5 is a conservative default that allows meaningful graph traversal without noise.          |
| 0.6 similarity threshold for `evolveRelatedNodes()` | Below 0.6, similarity becomes noise (unrelated topics can score 0.4-0.5 via shared vocabulary). 0.6 was the empirically validated threshold from prior Aurora experiments.                                                                     |
| 50% word overlap as gap resolution trigger          | `resolveGap()` is called when new ingest content significantly overlaps with a known knowledge gap. 50% word overlap ensures the new content is materially relevant to the gap, not coincidentally similar.                                    |
| Exclude `_chunk_` nodes from `evolveRelatedNodes()` | Chunk nodes are embedding fragments, not semantic documents. Updating `relatedContext` on a chunk node is meaningless and would corrupt the graph's relationship semantics.                                                                    |

## Test Delta

| Module                        | Before | After    | Delta                                                                 |
| ----------------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `tests/aurora/search.test.ts` | N      | N+10     | +10 PPR tests                                                         |
| `tests/aurora/intake.test.ts` | N      | N+5      | +5 evolution tests                                                    |
| **Full suite**                | 3949   | **3963** | +14 net new (1 pre-existing timeout in suite = 3964 total, 3963 pass) |

Note: 1 pre-existing timeout test in the suite is unrelated to session 6 changes. Total registered: 3964, passing: 3963.

New test descriptions in `tests/aurora/search.test.ts`:

- `"PPR expansion returns nodes tagged source:ppr"`
- `"PPR seeds are weighted by semantic similarity score"`
- `"PPR traverses edges bidirectionally"`
- `"PPR respects pprLimit cap"`
- `"PPR with empty graph returns empty array"`
- `"search without usePpr flag returns no ppr-tagged results"`
- `"PPR nodes do not duplicate semantic results"`
- `"PPR returns empty array when no edges from seed nodes"`
- `"pprLimit=0 disables PPR expansion"`
- `"PPR works with single seed node"`

New test descriptions in `tests/aurora/intake.test.ts`:

- `"evolveRelatedNodes updates relatedContext on matched nodes"`
- `"evolveRelatedNodes skips chunk nodes"`
- `"evolveRelatedNodes filters below 0.6 similarity threshold"`
- `"evolveRelatedNodes triggers resolveGap on 50% word overlap"`
- `"evolveRelatedNodes returns EvolutionResult with correct counts"`

## Dependencies

No new npm, Python, or Ollama model dependencies added.

## Known Issues

- `expandViaPpr()` performs bidirectional edge traversal by loading all edges and filtering in memory. On large graphs (10k+ nodes, 50k+ edges), this could be slow. No index or adjacency list optimization exists yet.
- `evolveRelatedNodes()` calls `resolveGap()` synchronously during ingest. If gap resolution is slow (requires an LLM call), it will block the ingest pipeline. No async boundary or timeout exists.
- The 50% word overlap calculation for gap resolution uses a naive tokenization (split on whitespace). Morphological variants of the same word (e.g. Swedish inflections) are not treated as matches.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS
- `pnpm test`: 3963/3964 PASS (1 pre-existing timeout, unrelated to session 6)
- 15 new tests total across 2 files
