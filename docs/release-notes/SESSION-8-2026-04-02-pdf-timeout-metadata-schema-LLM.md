---
session: 8
date: 2026-04-02
variant: llm
---

# Session 8 — PDF Job Timeouts, Stale Job Recovery, Metadata Schema Research

## Changes

| File                       | Change                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/vision.ts`     | Added `AbortSignal.timeout(120_000)` to the Ollama fetch call; previously the fetch had no timeout and could hang indefinitely on a stalled Ollama model                                                        |
| `src/aurora/job-runner.ts` | Added 30-minute SIGKILL timeout via `setTimeout` for long-running jobs; added `recoverStaleJobs()` called at the start of every `processQueue()` invocation to detect and requeue jobs stuck in `running` state |
| `tests/mcp/scopes.test.ts` | Fixed pre-existing failure: `fakeServer` mock was missing the `.tool()` method required by the updated scopes registration code                                                                                 |

## New/Changed Interfaces

`recoverStaleJobs()` added to `src/aurora/job-runner.ts`:

```typescript
// Signature (internal, not exported):
async function recoverStaleJobs(): Promise<void>;

// Called at start of processQueue(). Queries for jobs with:
//   status: 'running'
//   updatedAt < now - STALE_JOB_THRESHOLD_MS
// Resets them to status: 'queued' for retry.

const STALE_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
```

`AbortSignal.timeout()` added to the Ollama fetch in `src/aurora/vision.ts`:

```typescript
const response = await fetch(ollamaUrl, {
  method: 'POST',
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(120_000), // NEW: 2-minute hard timeout
});
```

## Design Decisions

| Decision                                               | Rationale                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AbortSignal.timeout(120_000)` for vision fetch        | Ollama can stall when loading a model into VRAM or when the GPU is under pressure. Without a timeout, a single stalled `qwen3-vl` call would block the entire job worker indefinitely. 120 seconds is generous for model inference but will catch genuine stalls. |
| 30-minute SIGKILL timeout for jobs                     | Even with the vision fetch timeout, other parts of the PDF pipeline (PaddleOCR, file I/O) have no explicit timeout. The 30-minute job-level kill is a safety net that prevents a single runaway job from blocking the queue forever.                              |
| `recoverStaleJobs()` called on every `processQueue()`  | Jobs marked `running` but abandoned (e.g. due to process crash or SIGKILL) would otherwise stay stuck forever. Checking at queue-processing time means recovery is automatic and doesn't require a separate cron or monitoring job.                               |
| Stale threshold set to 30 minutes                      | Matches the SIGKILL timeout. A job that has been `running` for more than 30 minutes either timed out (and its record was not updated) or the process crashed. Either way, requeuing is safe.                                                                      |
| `~/.hermes/` initialized as git repo with `.gitignore` | Hermes configuration files are mutable and valuable. Git history allows auditing and rollback of cron schedules, scope configurations, and wrapper scripts.                                                                                                       |

## Test Delta

| Module                     | Before                     | After     | Delta     |
| -------------------------- | -------------------------- | --------- | --------- |
| `tests/mcp/scopes.test.ts` | N (1 pre-existing failure) | N (fixed) | 0 net new |
| **Full suite**             | 3964                       | **3964**  | 0 net new |

The scopes test fix was a mock correction (added `.tool()` method to `fakeServer` object), not a behavioral change. No new tests were written for the timeout or stale recovery logic.

## Dependencies

No new npm or Python packages added.

External:

| Item         | Change                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| `~/.hermes/` | Initialized as a git repository with `.gitignore` (excludes secrets, logs) |

## Known Issues

- `recoverStaleJobs()` has no unit tests. Stale recovery behavior is only manually verified.
- The 30-minute SIGKILL timeout uses `setTimeout` in Node.js. If the process itself crashes (SIGKILL from outside), the `setTimeout` callback never fires and the stale recovery on next `processQueue()` is the only safety net.
- `AbortSignal.timeout()` requires Node.js >= 17.3. If the runtime is older, this will throw at startup, not at call time. No version guard exists.
- The metadata schema analysis performed this session (comparing EBUCore, Schema.org, A-MEM, HippoRAG) is documented in `docs/PLAN-obsidian-twoway-metadata-2026-04-02.md` (Work Packages 1-5). None of the WPs are implemented this session. The plan document is aspirational.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS
- `pnpm test`: PASS (3964/3964)
- Commits: `24cdffe` (session 7, also contains session 7 code), `5a9664d` (session 8 timeout + recovery)

## Additional Context: Metadata Schema Analysis

This session included a structured comparison of metadata standards for the planned Obsidian two-way sync feature. Findings relevant to future implementers:

| Standard   | Strength                                                           | Weakness                                               |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| EBUCore    | Rich broadcast/media vocabulary (speaker, organization, role)      | Complex XML heritage, verbose in JSON-LD               |
| Schema.org | Universal, well-supported by search engines                        | Too generic for fine-grained knowledge graph semantics |
| A-MEM      | Designed for LLM memory agents, includes confidence and provenance | Not yet widely adopted, spec may change                |
| HippoRAG   | Optimized for RAG retrieval patterns                               | No speaker/media metadata vocabulary                   |

Decision: use EBUCore for media metadata (speaker, organization, role) and Schema.org for general content metadata. A-MEM patterns for confidence and provenance. HippoRAG patterns for retrieval optimization. This hybrid is implemented starting in session 9.
