# Neuron HQ — OpenCode Handoff Protocol

**Date:** 2026-03-26
**Purpose:** Replace the old per-session HANDOFF-\*.md system with a lightweight routine that works with OpenCode's stateless sessions.

---

## 1. The Problem

OpenCode sessions are stateless. Each new session starts with zero context — no memory of what happened before, no awareness of prior decisions, no sense of where things stand.

The old system (sessions S1-S150) solved this by creating a new `docs/handoffs/HANDOFF-*.md` file at the end of each session. That worked well when Opus was the sole agent reading a single latest file. After 150 sessions, the directory has 120+ files. Finding the current state means hunting through timestamps. The signal is buried in the volume.

The new system puts all current-state context in one living file that gets updated in place, while preserving the ability to write a full handoff when the situation genuinely calls for one.

---

## 2. The New System (3 Files)

A new agent needs exactly three files to orient:

### File 1: `docs/dagbocker/DAGBOK-LLM.md` — PRIMARY

This is the handoff. Updated at the end of every session. Contains:

- **State** — current snapshot: test count, agent roster, active phase, open risks
- **Decisions** — what was decided and why (append-only within each date entry)
- **Active Context** — files in flux, recent changes, what's incomplete
- **Next Actions** — prioritized list of what comes next

Read this first, every time. It's dense and structured specifically for LLM parsing.

### File 2: `AGENTS.md` — Engineering Protocol

Architecture, principles, agent roles, playbooks, anti-patterns. This file is stable and rarely changes. Read it once when starting work on the project. Skim the relevant sections before touching `src/policy/` or `src/core/orchestrator.ts`.

### File 3: `docs/ROADMAP.md` — Strategic Context

Current phase (Fas 3), task checkboxes (26/32 done), what's been built. Read it when you need to understand what Marcus expects next or which brief to pick up.

---

## 3. Session Start Routine

Follow these steps at the start of every new OpenCode session:

```
1. Read docs/dagbocker/DAGBOK-LLM.md
   → Current state, recent decisions, what's in flight, what's next

2. Read AGENTS.md (if new to the project, or if it's been a while)
   → Engineering protocol, role definitions, playbooks

3. Read docs/ROADMAP.md (if picking up a new feature or brief)
   → What's done, what's next, which phase we're in

4. Run baseline verification:
   pnpm typecheck && pnpm test
   → Must be zero errors, all tests green before touching anything

5. If doing Aurora work, also read:
   docs/RAPPORT-KODANALYS-2026-03-26.md
   → 466-line codebase analysis, Aurora module map, known tech debt

6. Begin work.
```

Don't skip step 4. The test count in `DAGBOK-LLM.md` tells you what "all green" means for this codebase.

---

## 4. Session End Routine

At the end of every session, update these files before signing off:

```
1. Update docs/dagbocker/DAGBOK-LLM.md:
   - Add a new ## YYYY-MM-DD entry if it's a new day
   - Update ### State with changed stats (test count, node count, etc.)
   - Append new ### Decisions entries (never edit existing ones)
   - Update ### Active Context: files changed, what's incomplete
   - Update ### Next Actions: what the next agent should do first

2. Update docs/dagbocker/DAGBOK-MARCUS.md:
   - Add plain Swedish table rows for today's work
   - Marcus reads this to understand what happened without technical jargon

3. Update docs/dagbocker/DAGBOK-DEV.md:
   - Add technical entries for changes, test results, issues found

4. Commit all changes if Marcus has approved (use conventional commits)
```

The DAGBOK-LLM.md update is non-negotiable. Skipping it means the next session starts blind.

---

## 5. When to Write a Full Handoff Document

The lightweight system (DAGBOK-LLM.md updates) covers 90% of sessions. Write a full `docs/handoffs/HANDOFF-*.md` only when:

- A major architectural decision was made that needs detailed rationale
- A complex multi-session task just completed and the context is non-obvious
- Something went badly wrong and the recovery path needs documentation
- Marcus specifically asks for a detailed handoff record

If none of these apply, don't create a file. Update DAGBOK-LLM.md and move on.

---

## 6. Naming Convention

**Lightweight (most sessions):** No new file. Update `docs/dagbocker/DAGBOK-LLM.md` in place.

**Full handoff (rare):** `docs/handoffs/HANDOFF-YYYY-MM-DDTHHMM-<description>.md`

Examples:

- `docs/handoffs/HANDOFF-2026-03-26T1430-aurora-mcp-fix.md`
- `docs/handoffs/HANDOFF-2026-03-27T0900-fas3-complete.md`

The `HANDOFF.md` file at the repo root links to all full handoffs (historical index, S1-S150).

---

## 7. What NOT to Do

- **Don't create a new handoff file every session.** The old system had 120+ files. That's the problem this protocol solves.
- **Don't skip updating DAGBOK-LLM.md.** It's the lifeline. A session with no DAGBOK update is a session that gets forgotten.
- **Don't write for context you already have.** Write as if the next agent is completely new to the project — because they will be.
- **Don't write handoffs in Swedish.** DAGBOK-LLM.md is English because LLMs parse it more efficiently. DAGBOK-MARCUS.md is Swedish because Marcus reads it.
- **Don't batch multiple sessions into one update.** Update at session end, not "when you remember."

---

## 8. Historical Context

Sessions S1-S150 used a single-file-per-session pattern. That archive lives in:

- `docs/handoffs/` — 120+ files, S1-S150
- `docs/DAGBOK.md` — pre-2026-03-26 log (read-only, historical record)
- `HANDOFF.md` (repo root) — index of all historical handoff files

Don't modify any of those. They're the record of how this project was built.
