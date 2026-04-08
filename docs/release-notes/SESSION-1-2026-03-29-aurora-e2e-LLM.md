---
session: 1
date: 2026-03-29
variant: llm
---

# Session 1 — Aurora E2E Embedding Fixes + Worker Stability

## Changes

| File                                   | Change                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/aurora-graph.ts`           | Embedding text source changed from `JSON.stringify(properties)` to `properties.text`; text truncated to `MAX_EMBED_CHARS` (2000 chars) before sending to embedding model   |
| `src/core/embeddings.ts`               | Added batch fallback: if a batch embedding call fails, the function retries each item individually rather than aborting the entire batch                                   |
| `src/commands/embed-nodes.ts`          | Applied same `MAX_EMBED_CHARS = 2000` truncation constant as aurora-graph.ts; both files now share the same limit                                                          |
| `tests/core/embeddings.test.ts`        | +1 test covering the individual-fallback path when batch call throws                                                                                                       |
| `tests/commands/embed-nodes.test.ts`   | Updated existing tests to match new truncation behavior                                                                                                                    |
| `aurora-workers/extract_video.py`      | Replaced `tempfile.TemporaryDirectory()` context manager with `tempfile.mkdtemp()`; directory is now manually managed so audio file survives until transcription completes |
| `scripts/reembed-aurora.ts`            | New utility script: iterates all Aurora nodes and re-embeds them using the corrected logic; useful for one-time backfill after the embedding bug fix                       |
| `docs/MARCUS.md`                       | Session summary for project owner                                                                                                                                          |
| `docs/dagboker/*`                      | Session diary entries                                                                                                                                                      |
| `docs/RAPPORT-KODANALYS-2026-03-26.md` | 466-line code analysis report added                                                                                                                                        |
| `docs/aurora-api-spec.yaml`            | 1487-line API specification added                                                                                                                                          |
| `docs/HANDOFF-OPENCODE.md`             | Handoff document for next OpenCode session                                                                                                                                 |

## New/Changed Interfaces

No new TypeScript interfaces. The `MAX_EMBED_CHARS` constant (value: `2000`) was introduced in both `aurora-graph.ts` and `embed-nodes.ts`:

```typescript
// src/aurora/aurora-graph.ts and src/commands/embed-nodes.ts
const MAX_EMBED_CHARS = 2000;

// Usage before sending to embedding model:
const textToEmbed = (node.properties.text ?? '').slice(0, MAX_EMBED_CHARS);
```

## Design Decisions

| Decision                                                        | Rationale                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embed `properties.text` instead of `JSON.stringify(properties)` | `JSON.stringify(properties)` produced syntactically noisy input (keys, quotes, escape sequences) that degraded embedding quality. The embedding model expects natural language prose, not serialized JSON. The `properties.text` field contains the actual document text.                                     |
| Truncate at 2000 characters                                     | Embedding models have token limits. 2000 chars is a safe upper bound that avoids silent truncation inside the model while preserving the semantically richest part of the document (the opening). This was the initial safe limit; revised to 1500 in session 2.                                              |
| Fallback to individual calls on batch failure                   | Batch embedding calls can fail on a single malformed item. Individual fallback lets healthy items succeed and isolates failures to specific nodes, avoiding silent data loss across the entire batch.                                                                                                         |
| `mkdtemp()` instead of `TemporaryDirectory()` context manager   | `TemporaryDirectory()` as a context manager auto-deletes the directory when the `with` block exits. The Whisper transcription job ran asynchronously after the block exited, causing a race where the audio file was deleted before transcription could read it. `mkdtemp()` gives explicit lifetime control. |

## Test Delta

| Module                               | Before      | After       | Delta                                  |
| ------------------------------------ | ----------- | ----------- | -------------------------------------- |
| `tests/core/embeddings.test.ts`      | N (unknown) | N+1         | +1 batch-fallback test                 |
| `tests/commands/embed-nodes.test.ts` | N           | N (updated) | 0 new, existing updated for truncation |
| **Full suite**                       | 3948        | **3949**    | +1                                     |

New test description: `"falls back to individual embedding calls when batch call throws"` in `tests/core/embeddings.test.ts`.

## Dependencies

No new npm or Python package dependencies added. No new Ollama models pulled.

## Known Issues

- `MAX_EMBED_CHARS = 2000` was set empirically; not validated against the specific embedding model's tokenizer. Swedish text can exceed 512 tokens before 2000 characters if using extended Unicode. Revised to 1500 in session 2.
- The `reembed-aurora.ts` script has no progress indicator or dry-run mode; running it on a large graph will trigger many sequential embedding calls.
- `aurora-workers/extract_video.py` now leaks the `mkdtemp()` directory on error paths (no cleanup in exception handler). Accepted as low-priority tech debt.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS (0 warnings on changed files)
- `pnpm test`: PASS (3949/3949)
- Commits: `5f69730`, `0c819da`, `04d0478`, `dcf34ed`
