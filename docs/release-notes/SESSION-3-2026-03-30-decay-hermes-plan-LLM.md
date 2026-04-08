---
session: 3
date: 2026-03-30
variant: llm
---

# Session 3 — Decay Rewrite + Hermes Aurora Integration Plan

## Changes

| File                                        | Change                                                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/aurora-decay.ts`              | Full rewrite: added structured JSON logging to `logs/decay/` directory with per-run log files; added Aurora fact node creation after each decay run to record the event in the knowledge graph itself |
| `docs/GAMEPLAN-HERMES-AURORA-2026-03-30.md` | New document: integration plan for Hermes agent with Aurora knowledge graph, covering ingestion pipeline, morning briefing flow, and Telegram bot architecture                                        |

## New/Changed Interfaces

The decay command now emits structured log objects. The shape written to `logs/decay/<timestamp>.json`:

```typescript
interface DecayRunLog {
  runAt: string; // ISO 8601 timestamp
  nodesProcessed: number;
  avgConfidenceBefore: number;
  avgConfidenceAfter: number;
  decayedNodes: Array<{
    id: string;
    label: string;
    confidenceBefore: number;
    confidenceAfter: number;
  }>;
}
```

The Aurora fact node created after each decay run uses a fixed structure:

```typescript
// Node created in Aurora graph after each decay run:
{
  type: 'fact',
  properties: {
    text: `Decay run completed. ${nodesProcessed} nodes processed. Avg confidence: ${before.toFixed(2)} → ${after.toFixed(2)}`,
    source: 'aurora-decay-command',
    decayRunAt: new Date().toISOString(),
  }
}
```

## Design Decisions

| Decision                                                           | Rationale                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write structured JSON logs to `logs/decay/` instead of stdout-only | Decay is a background maintenance operation. stdout output is ephemeral and not queryable. JSON logs give Hermes (and future agents) a machine-readable audit trail for decay history.                                                                            |
| Create an Aurora fact node after each decay run                    | The graph should be self-documenting. Recording decay events as fact nodes allows the morning briefing and other consumers to include system health context ("decay ran last night, confidence dropped from 0.74 to 0.66") without querying an external log file. |
| Separate log file per run (timestamp-named)                        | Append-to-one-file approaches cause lock contention and make it harder to query a specific run's outcome. One file per run allows atomic writes and direct access by run timestamp.                                                                               |

## Test Delta

| Module         | Before | After    | Delta |
| -------------- | ------ | -------- | ----- |
| **Full suite** | 3949   | **3949** | 0     |

No new tests added this session. The decay rewrite was verified via live E2E run rather than unit tests. This is a known gap documented in Known Issues.

## Dependencies

No new npm, Python, or Ollama model dependencies added.

## Known Issues

- `src/commands/aurora-decay.ts` rewrite has no unit tests covering the new JSON logging path or the Aurora fact node creation. Both behaviors were verified manually via live run only.
- `logs/decay/` directory must pre-exist or be created by the command. No `mkdir -p` guard was added; a missing directory will cause a runtime throw.
- The Hermes integration plan in `GAMEPLAN-HERMES-AURORA-2026-03-30.md` is aspirational documentation, not implemented code. Future sessions should check whether planned components have been built before referencing this document.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS
- `pnpm test`: PASS (3949/3949)
- E2E verification performed:
  - PDF ingest pipeline ran end-to-end: 130 words processed, 2 nodes created in Aurora graph
  - Morning briefing ran: 38 nodes retrieved, 3 AI-generated questions produced
  - Decay command ran live: 27 nodes processed, avg confidence 0.74 → 0.66
