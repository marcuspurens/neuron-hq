---
session: 2
date: 2026-03-29
variant: llm
---

# Session 2 — Embedding Limit Refinement + Architecture Docs

## Changes

| File                                          | Change                                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/aurora-graph.ts`                  | `MAX_EMBED_CHARS` reduced from 2000 to 1500; retry logic refactored from direct index mutation (`i--`) to a `currentMaxChars` variable pattern that halves the limit on retry |
| `src/commands/embed-nodes.ts`                 | Same `MAX_EMBED_CHARS` 2000→1500 reduction; retry pattern aligned with aurora-graph.ts                                                                                        |
| `scripts/reembed-aurora.ts`                   | Same limit change; retry pattern updated to match                                                                                                                             |
| `docs/ARKITEKTUR-AURORA.md`                   | New index file linking to latest LLM, Marcus, and Dev architecture variants                                                                                                   |
| `docs/ARKITEKTUR-AURORA-LLM-2026-03-29.md`    | New LLM-variant architecture document: module map, file references, interface catalogue                                                                                       |
| `docs/ARKITEKTUR-AURORA-MARCUS-2026-03-29.md` | New Marcus-variant: Swedish prose decision rationale                                                                                                                          |
| `docs/ARKITEKTUR-AURORA-DEV-2026-03-29.md`    | New Dev-variant: setup, conventions, cookbook                                                                                                                                 |
| `AGENTS.md`                                   | Section 14 added: documentation conventions (versioned docs, three-audience pattern)                                                                                          |

## New/Changed Interfaces

No new TypeScript interfaces. The retry pattern change is behavioral, not structural:

```typescript
// OLD pattern (session 1) — mutated loop index, fragile:
for (let i = 0; i < nodes.length; i++) {
  try {
    await embed(nodes[i], MAX_EMBED_CHARS);
  } catch {
    nodes[i].text = nodes[i].text.slice(0, MAX_EMBED_CHARS / 2);
    i--; // retry same index
  }
}

// NEW pattern (session 2) — explicit currentMaxChars, readable:
for (const node of nodes) {
  let currentMaxChars = MAX_EMBED_CHARS;
  let success = false;
  while (!success) {
    try {
      await embed(node, currentMaxChars);
      success = true;
    } catch {
      currentMaxChars = Math.floor(currentMaxChars / 2);
      if (currentMaxChars < 100) throw new Error('Embedding failed even at minimal length');
    }
  }
}
```

## Design Decisions

| Decision                                                     | Rationale                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lower `MAX_EMBED_CHARS` from 2000 to 1500                    | Swedish and other multilingual text has higher char-to-token ratios than English. The Ollama embedding model (nomic-embed-text) has a 512-token context window. At ~3 chars/token for Swedish, 1500 chars ≈ 500 tokens, leaving headroom below the hard limit. 2000 chars risked silent truncation inside the model. |
| Replace index-mutation retry with `currentMaxChars` variable | `i--` in a for-loop is an anti-pattern: it's invisible to readers, interacts poorly with break/continue, and makes it impossible to track how many retries occurred. `currentMaxChars` makes the halving strategy explicit and allows adding a retry counter or minimum threshold check.                             |
| Three-audience architecture documents (LLM, Marcus, Dev)     | LLM agents need dense, structured references (module maps, interfaces). Marcus needs narrative rationale in Swedish. Developers need setup instructions and cookbook patterns. A single document cannot serve all three well without becoming bloated and unusable for any.                                          |
| AGENTS.md section 14 for documentation conventions           | Without a written convention, agents in future sessions would not know to create versioned, audience-specific documents. Codifying this in AGENTS.md makes it part of the mandatory protocol all agents follow.                                                                                                      |

## Test Delta

| Module         | Before | After    | Delta                         |
| -------------- | ------ | -------- | ----------------------------- |
| **Full suite** | 3949   | **3949** | 0 (no new tests this session) |

No new tests added. The retry-pattern refactor was covered by existing behavior tests. The `MAX_EMBED_CHARS` change was a constant update, not a logic change requiring new test cases.

## Dependencies

- **Ollama model pulled**: `gemma3` (pulled via `ollama pull gemma3`). Used for LLM-assisted metadata generation planned for session 5. Not yet called from application code this session.

## Known Issues

- The halving retry has no maximum retry count. A node with text that fails even at 100 chars will throw, but the error message does not include the node ID, making debugging harder.
- The three architecture documents were created manually this session. Future sessions should check `ARKITEKTUR-AURORA.md` index before creating new variants to avoid version proliferation.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS (0 warnings on changed files)
- `pnpm test`: PASS (3949/3949)
- Commits: `e1d16c6`, `25ef61e`, `95c920a`
