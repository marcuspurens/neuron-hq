# AGENTS.md — Neuron HQ Agent Engineering Protocol

This file defines the working protocol for all coding agents in this repository.
Scope: entire repository. Last updated: 2026-02-26.

---

## 1) Project Snapshot (Read First)

Neuron HQ is a **control plane** for autonomous agent swarms that develop other repositories.
It does not ship software directly — it ships _capability_: the ability to reliably delegate
software development to a coordinated team of AI agents.

Core properties the system must maintain:

- **Auditability**: every action logged, every artifact checksummed
- **Isolation**: each run operates in its own workspace, never touching adjacent runs
- **Policy enforcement**: all commands validated before execution, not after
- **Reproducibility**: given the same brief and baseline, runs should converge on similar outcomes
- **Graceful degradation**: a partial result with clean artifacts beats a silent failure

The system is **episodic**, not always-on. Agents are invoked for a bounded time window,
produce artifacts, and terminate. There is no long-running daemon.

---

## 2) Architecture Observations (Why This Protocol Exists)

These codebase realities should drive every design decision:

1. **Policy is the security perimeter — treat it as such**
   `src/policy/` is the only thing standing between agent actions and the user's filesystem.
   Every change to `bash_allowlist.txt`, `forbidden_patterns.txt`, or scope rules carries
   high blast radius. Test exhaustively. Never weaken silently.

2. **Agents communicate through artifacts, not direct calls**
   Manager does not call Implementer's internal functions. It delegates via the orchestrator
   and reads results from the run artifact directory. This indirection is intentional: it
   creates an audit trail and allows each agent to be replaced independently.

3. **The workspace is sacred, the run dir is the record**
   `workspaces/<runid>/` is the work surface — ephemeral, can be recreated.
   `runs/<runid>/` is the permanent record — never delete, never mutate after Reviewer signs off.

4. **TypeScript strict mode is a contract, not a preference**
   The codebase uses `noUncheckedIndexedAccess`, `strictNullChecks`, and NodeNext modules.
   Type errors are bugs. Never use `any` without an explicit justification comment.

5. **Tests are the only objective truth about behavior**
   Agents cannot visually inspect the running system. If it is not tested, it is not verified.
   A feature without tests is a feature that does not exist from the next agent's perspective.

6. **Token budget is a real resource constraint**
   Every iteration costs money and time. Agents that over-explore, re-read files already read,
   or re-run completed bash commands are burning Marcus's budget. Orient fast, delegate early,
   trust prior agent outputs.

---

## 3) Engineering Principles (Normative)

These principles are mandatory, not aspirational.

### 3.1 KISS — Keep It Simple

**Why here:** Agent-written code must be auditable by the next agent without context.
Clever code is a handoff liability.

Required:

- Prefer explicit conditional logic over abstract meta-programming
- Keep functions under 40 lines; split if longer
- Error paths must be obvious: throw with context, or return explicit Result types

### 3.2 YAGNI — You Aren't Gonna Need It

**Why here:** Every speculative abstraction is a surface area the next agent must understand
before modifying anything.

Required:

- Do not add config keys, feature flags, or optional parameters without a concrete caller
- Do not create helper functions for operations done once
- Do not design for hypothetical future requirements — design for the current brief

### 3.3 DRY + Rule of Three

**Why here:** Premature abstraction creates hidden coupling between otherwise independent modules.

Required:

- Duplicate small, local logic when it preserves clarity
- Extract shared utilities only after three independent callers exist
- When extracting, respect module boundaries: `src/policy/`, `src/agents/`, `src/core/` are separate domains

### 3.4 Fail Fast + Explicit Errors

**Why here:** Silent failures in agent pipelines compound. A silent fallback in iteration 3
causes a mysterious failure in iteration 40 that costs 30 more iterations to debug.

Required:

- Throw with context: `throw new Error('PolicyValidator: allowlist not loaded — call init() first')`
- Never silently broaden permissions or swallow policy blocks
- Never return `undefined` where the caller expects a value — use `| undefined` in the type and force the caller to handle it

### 3.5 Secure by Default + Least Privilege

**Why here:** Agents execute real shell commands in real repositories. A mistake here is not
a test failure — it is data loss or credential exposure.

Required:

- Deny-by-default: commands not on the allowlist are blocked, not warned
- No secrets in artifacts, logs, commit messages, or knowledge.md
- File writes restricted to `workspaces/<runid>/` and `runs/<runid>/` — enforce at the boundary, not at call sites

### 3.6 Reversibility + Rollback-First Thinking

**Why here:** Agents cannot undo actions they do not know they took. Every change must be
understandable in isolation and reversible without heroics.

Required:

- Small commits: one logical change, under 150 lines of diff
- Before any destructive or high-risk operation, define the rollback path in `knowledge.md`
- For HIGH-risk changes (policy, core orchestrator), Reviewer must give explicit PASS before merge

### 3.7 Read Before Write

**Why here:** Agents frequently duplicate or contradict existing code because they did not
check what already exists. This is the most common source of wasted iterations.

Required:

- Before implementing: search for existing implementations with grep/glob
- Before adding a dependency: check if the functionality exists in the stdlib or already in `package.json`
- Before modifying a module: read the full module, not just the target function

### 3.8 Resist the Path of Least Resistance

**Why here:** Agents — like humans — default to the answer that comes with the least
effort. The first output feels right precisely because nothing resisted it. But effort
and correctness are unrelated. An answer that flows easily is the most *probable*
answer given the context, not the most *correct* one. And if you stop to think and
discover that a different answer is better, that means more work — which is itself
a reason the easy answer came first.

This is not an AI-specific problem. It is a universal tendency in any system —
biological or statistical — that optimizes for energy efficiency. The instinct is to
not think too hard, because thinking costs energy and might reveal that you were wrong,
which costs even more.

**The broad principle:**

You have a strong tendency to take the path of least resistance in your generation.
What comes quickly and flows naturally is often the most likely output, not the most
correct one. When you notice that an answer arrived without friction — stop. That is
not a sign that you are right. It is a sign that you have not thought.

**The concrete test — Invert Before Committing:**

- Before proposing any prioritized list (task order, migration sequence, implementation
  plan): produce the list, then invert it, then ask which ordering has a stronger
  dependency argument. If the inverted order has equal or better justification, you
  chose wrong the first time.
- Before recommending an approach: state what you would lose by doing the opposite.
  If you cannot articulate a concrete loss, your recommendation is preference,
  not reasoning.
- When you notice that your top priority is something you built in the current session:
  treat that as a yellow flag. Explicitly verify that it doesn't depend on something
  lower in the list.

The test is not "does my reasoning sound good?" — reasoning can be constructed to
justify any order after the fact. The test is "does the dependency chain support
this sequence?"

---

## 4) Repository Map

```
neuron-hq/
├── src/
│   ├── cli.ts              — CLI entrypoint (run, resume, target, status)
│   ├── core/
│   │   ├── orchestrator.ts — RunOrchestrator: creates workspaces, runs, delegates
│   │   ├── agents/         — Agent implementations (manager, implementer, etc.)
│   │   └── tools/          — Tool implementations (bash, file, git, memory)
│   ├── policy/             — PolicyValidator: allowlist, forbidden patterns, scope checks
│   ├── audit/              — AuditLogger: append-only JSONL audit trail
│   └── types/              — Shared TypeScript interfaces and Zod schemas
├── prompts/                — Agent role definitions (manager.md, implementer.md, etc.)
├── policy/                 — Policy files (bash_allowlist.txt, forbidden_patterns.txt, etc.)
├── tests/                  — Vitest test suite (mirrors src/ structure)
├── briefs/                 — Input briefs for runs (read-only during runs)
├── runs/                   — Run artifacts (write during runs, read-only after sign-off)
├── workspaces/             — Isolated workspace copies of target repos
├── targets/                — Target repo registry (repos.yaml)
├── memory/                 — Persistent memory files (runs, patterns, errors, techniques)
└── docs/                   — Architecture, runbooks, handoffs, research logs
```

### 4.1 High-sensitivity paths

Changes to these paths require extra care:

- `policy/bash_allowlist.txt` — adding entries expands agent capability globally
- `policy/forbidden_patterns.txt` — removing entries removes safety guarantees
- `src/policy/` — the enforcement implementation; bugs here break all safety
- `src/core/orchestrator.ts` — workspace and run lifecycle; bugs here corrupt run state
- `prompts/manager.md` — changes how Manager reasons about everything

---

## 5) Risk Tiers

Use these tiers to calibrate validation depth and review rigor.

| Tier       | Paths                                                                    | Required validation                                                       |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Low**    | `docs/`, `briefs/`, test-only changes                                    | Typecheck + lint                                                          |
| **Medium** | `src/agents/`, `prompts/`, `src/audit/`                                  | Full test suite + typecheck + lint                                        |
| **High**   | `src/policy/`, `src/core/orchestrator.ts`, `policy/*.txt`, `policy/*.md` | Full test suite + new tests for changed behavior + explicit Reviewer PASS |

When uncertain, classify as higher risk.

---

## 6) Agent Roles and Responsibilities

### Manager

- Owns the plan and iteration budget (70 iterations max)
- Delegates to other agents — does not implement directly
- Reads Researcher output, then delegates to Implementer with a scoped task
- Writes `answers.md` (APPROVED/BLOCKED) for Merger
- Hard rule: delegate to Implementer by iteration 30, even with incomplete information

### Implementer

- Writes code, runs verifications, commits
- Max 150 lines diff per iteration; split if larger
- Writes `implementer_handoff.md` in the run artifacts dir when complete (see section 11)
- Security checklist must pass before marking done
- Commits even when brief does not explicitly request it — Merger handles final merge

### Reviewer

- Gatekeeps before merge — checks for security, correctness, artifact completeness
- Risk assessment: LOW / MED / HIGH
- HIGH risk requires two-phase commit (Reviewer PASS → Manager APPROVED)
- Writes `report.md` with STOPLIGHT (GREEN/YELLOW/RED)

### Researcher

- External research agent — searches arxiv and Anthropic docs for recent AI research
- Writes structured entries to `memory/techniques.md`
- Triggered via `delegate_to_researcher` in the Manager
- Does NOT read the target codebase — that is the Librarian's job

### Librarian

- Per-run research agent — reads the target codebase and memory
- Delivers `ideas.md` (impact/effort/risk) and `research/sources.md` (code references)
- Does NOT implement — hands off to Implementer via Manager
- Must complete before Implementer so findings inform implementation

### Historian

- Runs at end of every completed run
- Updates `memory/runs.md`, `memory/errors.md`, `memory/patterns.md`
- Summarizes learnings for future agents
- Does NOT modify code or artifacts
- Verifies artifacts directly (intent vs outcome) — never trusts audit.jsonl alone
- Quick-checks previous run entry for obvious errors before writing new one
- Error dedup: prefers duplicate over false ✅ (three-condition gate)
- Contextual skeptic review: only decays confidence when pattern was relevant but unconfirmed
- Syncs patterns.md status markers when graph confidence drops below thresholds
- Explicit priority order when iterations are limited: summary > errors > patterns > skeptic > metrics

### Tester

- Focused test coverage agent
- Writes tests for untested behavior, runs full test suite, reports gaps
- Does not implement features — only tests

### Consolidator

- Knowledge graph curator — refines, verifies, and improves graph quality
- Never creates new knowledge nodes — only merges, connects, archives, and reports
- Three-Gate Test before any merge: same problem, same context, compatible properties
- Classifies merges as Type A (dedup) or Type B (synthesis) — preserves originals in synthesis
- Writes `consolidation_report.md` (audit log) and `memory/consolidation_findings.md` (actionable findings)
- Quality-reviews Historian's output: flags overvalued confidence, vague descriptions, near-duplicates
- Priority order: gaps > merges > distribute > connections > scope-promotion > quality-review > archive
- Precondition check: exits early if no new nodes since last consolidation

### Knowledge Manager

- Knowledge maintenance agent — maintains Aurora graph by researching gaps and refreshing stale sources
- Currently a deterministic TypeScript pipeline; hybrid LLM upgrade planned for quality assessment
- **Honesty over completeness** — reports `unverified` or `partially_resolved` rather than false `resolved`
- Always `search` before `remember` — never blind-write to the graph
- Two queues: research queue (gaps + high-confidence stale) and archive queue (low-confidence stale → Consolidator)
- Never calls `verify-source` without actual content verification — leaves nodes stale rather than falsely verifying
- Precondition check: reads `memory/km_history.md`, skips gaps attempted ≥3 times, exits early if no new nodes
- Writes `memory/km_health.md` (graph status, recommendations, "For Historian" section) and `memory/km_history.md` (own run log)
- Priority: preconditions > scan > research gaps > verify stale > distribute findings > flag for archive
- Topic chaining (multi-cycle) only chains from genuinely resolved gaps to prevent divergence
- Defined consumers: Manager (orient step), Historian (verification tasks), self (next run), Marcus (health check)

### Merger

- Final safety gate before changes land in the target repo
- Two-phase operation: PLAN (produce merge_plan.md) → EXECUTE (after Manager approves)
- Reads `report.md`, verifies Reviewer gave GREEN stoplight — if not, returns MERGER_BLOCKED
- Atomic execution: all files copy or none commit
- Post-merge verification: runs typecheck + tests in target repo, reverts on failure
- Always commits to `swarm/<runid>` branch, never directly to main
- Writes `merge_summary.md` with commit hash, verification results, and rollback instruction

---

## 7) Agent Workflow (Required)

### Step 1: Orient (≤ 10 iterations)

- Read `.claude/rules/depth.md` — the Depth Protocol. Internalize it before doing anything else.
- Read `brief.md` from the run artifacts dir
- Run baseline verification (tests, typecheck, lint)
- Search memory files for relevant prior patterns: `search_memory(query=...)`
- Read `memory/consolidation_findings.md` if it exists — contains knowledge gaps and quality warnings from the last graph consolidation
- Read `memory/km_health.md` if it exists — contains graph health status, recurring gaps, and recommendations from Knowledge Manager
- Read existing code in affected modules

### Step 2: Plan (≤ 10 iterations)

- Define scope: what will change, what will NOT change
- Identify risk tier for the change
- Write initial plan to `knowledge.md`

### Step 3: Execute

- Implement in small increments (<150 lines per commit)
- Verify after each change: `pnpm typecheck && pnpm lint && pnpm test`
- Update `knowledge.md` with decisions and learnings

### Step 4: Complete

- Write `implementer_handoff.md` (Implementer only — see section 11)
- Ensure all required artifacts exist in `runs/<runid>/`
- Signal completion to Manager

### Validation commands

```bash
pnpm typecheck   # tsc --noEmit — zero errors required
pnpm lint        # eslint — zero warnings on changed files
pnpm test        # vitest run — all tests must pass
pnpm format      # prettier check (read-only check)
```

Run all three before marking any implementation task complete.

---

## 8) Change Playbooks

### 8.1 Adding a New Agent Role

1. Create `prompts/<rolename>.md` — define role, principles, output requirements
2. Implement `src/core/agents/<rolename>.ts` — extend base agent interface
3. Register in orchestrator delegation map
4. Write tests in `tests/agents/<rolename>.test.ts`
5. Document in `docs/architecture.md` under Agent System section
6. Risk tier: **Medium** (new capability, no security boundary changes)

### 8.2 Modifying Policy

1. Understand the current rule and why it exists (check git log for context)
2. Write a test that demonstrates the new behavior BEFORE changing the rule
3. Modify `policy/bash_allowlist.txt` or `forbidden_patterns.txt`
4. Update `src/policy/` enforcement if pattern format changed
5. Run full test suite — all existing policy tests must still pass
6. Document rationale in an ADR in `docs/adr/`
7. Risk tier: **High** — Reviewer must give explicit PASS

### 8.3 Adding a Tool to Agent Context

1. Read `src/core/tools/` to understand existing tool interface
2. Implement new tool with strict input validation (Zod schema)
3. Add to agent context in orchestrator
4. Write tests for happy path AND rejection/error paths
5. Update `docs/architecture.md` if the tool is user-visible
6. Risk tier: **Medium**

### 8.4 Modifying the Orchestrator

1. Read the full orchestrator before touching any of it
2. Map the change: which runs, workspaces, or artifact paths are affected?
3. Write tests for the new behavior first (test-driven)
4. Keep backward compatibility: existing `runs/` directories must remain valid
5. Risk tier: **High** — test suite must pass, Reviewer must PASS

### 8.5 Updating a Prompt File

1. Read the current prompt carefully — understand what behavior it encodes
2. Test the change mentally: what would an agent do differently with the new prompt?
3. Keep changes surgical: one behavioral change per prompt edit
4. Document the change in the run's `knowledge.md`
5. Risk tier: **Medium** (affects all future runs using that agent role)

---

## 9) Required Artifacts (Every Run)

Every run **must** create these files in `runs/<runid>/` before Reviewer signs off:

| File                  | Content                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `brief.md`            | Snapshot of the input brief                                      |
| `baseline.md`         | Pre-run verification results (tests, lint, typecheck)            |
| `report.md`           | STOPLIGHT (GREEN/YELLOW/RED) + how to run/test + risk + rollback |
| `questions.md`        | Max 3 blockers, or "No blockers"                                 |
| `ideas.md`            | Research-driven suggestions with impact/effort/risk              |
| `knowledge.md`        | Learnings, decisions, assumptions, open questions                |
| `research/sources.md` | Links and summaries (if Researcher was used)                     |
| `audit.jsonl`         | Append-only log of every tool call                               |
| `manifest.json`       | Checksums of all artifacts                                       |
| `usage.json`          | Token tracking                                                   |
| `redaction_report.md` | What was redacted from artifacts                                 |

Reviewer blocks merge if any required artifact is missing or empty.

---

## 10) Anti-Patterns (Do Not)

- **Do not** read the same file multiple times within one agent session without new context
- **Do not** run the same bash command twice in the same iteration
- **Do not** write speculative code for future requirements not in the current brief
- **Do not** add `any` types to silence TypeScript without a justification comment
- **Do not** skip writing tests because the implementation "feels obviously correct"
- **Do not** put secrets, API keys, or personal information in any artifact or commit
- **Do not** modify files outside `workspaces/<runid>/` and `runs/<runid>/` without explicit justification
- **Do not** use `rm`, `rmdir`, or `git reset --hard` — ever
- **Do not** commit directly to `main` in the target repo — always use the `swarm/<runid>` branch
- **Do not** bypass policy checks by reformatting the command to avoid the pattern match
- **Do not** mark a task complete when tests are failing or typecheck has errors
- **Do not** mix feature implementation and refactoring in the same commit

---

## 11) Handoff Template (Implementer → Manager)

Implementer **must** write `implementer_handoff.md` to `runs/<runid>/` upon completing
each delegation. This is how Manager understands what happened and why.

```markdown
# Implementer Handoff

## What changed

- <file>:<lines> — <what and why>
- <file>:<lines> — <what and why>

## What did NOT change (and why)

- <area> — <reason it was left alone>

## Validation run

- pnpm typecheck: PASS / FAIL (error summary)
- pnpm lint: PASS / FAIL
- pnpm test: PASS (N tests) / FAIL (N failures, summary)

## Commit(s)

- <hash> <conventional-commit message>

## Remaining risks / unknowns

- <risk or unknown, if any>

## Recommended next action

- <what Manager should do next>
```

Manager must read this file before delegating to Reviewer or starting the next iteration.

---

## 12) Memory and Context Management

Agents have access to persistent memory files in `memory/`:

| File            | Contents                               | When to use                                         |
| --------------- | -------------------------------------- | --------------------------------------------------- |
| `runs.md`       | Summary of every completed run         | Check before starting — has this been tried before? |
| `patterns.md`   | Recurring successful patterns          | Read before designing an approach                   |
| `errors.md`     | Known failure modes and fixes          | Read when stuck on a repeating problem              |
| `techniques.md` | Synthesized best practices (Librarian) | Read for high-quality, proven approaches            |

**Rules:**

- Always `search_memory(query=...)` before researching an approach — it may already be documented
- Do not write raw session notes to memory files — Historian synthesizes these
- Do not contradict an existing memory entry without understanding why it was written

---

## Observer

The Observer agent passively monitors each run by listening to eventBus events. It does not modify anything during the run — it only observes and reports.

After each run completes, Observer:

1. Scans all agent prompts for anti-patterns that contradict the LLM Operating Awareness preamble
2. Tracks token usage and costs per agent
3. Checks tool usage against prompt claims (tool-alignment)
4. Detects satisficing language in agent text output
5. Runs retro conversations with all agents — three standard questions + follow-up on observed deviations
6. Performs deep prompt-code alignment analysis — verifies that code implements what prompts claim
7. Generates a `prompt-health-YYYY-MM-DDTHHMM.md` report in the run directory

### Retro Conversations

After a run, Observer conducts short conversations with each agent:

- Three standard questions: "Hur gick det?", "Vad funkade bäst?", "Vad funkade sämst?"
- If observations were recorded for an agent, specific follow-up questions with evidence
- "Allt gick bra" and "inget att anmärka" are valid answers — honesty over performativity
- Fail-open: if a retro call fails, Observer continues with the next agent

### Deep Prompt-Code Alignment

Observer loads agent TypeScript source files and checks whether implementations are substantive (DEEP) or placeholder (SHALLOW):

- SHALLOW: only sets flags, returns hardcoded values, or has empty body
- DEEP: makes external calls, reads/compares data, or calls substantive logic
- NOT_FOUND: expected function doesn't exist in the source file
- Unclear cases are flagged as INFO, not WARNING

Observer is designed to be completely non-disruptive: if it fails, the run continues normally.

---

## 13) Guardrails for Fast Iteration

When working under time pressure:

- Keep each iteration reversible: commit before risky changes, not after
- Validate assumptions with code search before implementing — `grep` is faster than guessing
- Prefer deterministic, boring solutions over clever, elegant ones
- Do not "ship and hope" on any code that touches `src/policy/`
- If uncertain, write a concrete TODO with context rather than a hidden guess
- If iteration budget is running low (>40 of 50 used), commit partial work and document what remains — a partial commit with a clear handoff is better than hitting the limit silently

---

## 14) Documentation Conventions

### Versioned documents — never overwrite

Important documents (architecture, roadmaps, analyses) use date-stamped filenames:
`DOCUMENT-YYYY-MM-DD.md`. New versions are new files. Old versions are never deleted.

### Three-audience pattern

Complex documents (like architecture) may exist in three versions:

- `-LLM-`: Dense, parseable, module maps, file references — for AI agents
- `-MARCUS-`: Swedish prose, decision rationale — for the project owner
- `-DEV-`: Setup, conventions, cookbook, troubleshooting — for new developers

An index file (e.g. `ARKITEKTUR-AURORA.md`) links to the latest version of each audience.

---

## 15) Release Notes

Every OpenCode session that produces code changes **must** generate release notes in
`docs/release-notes/` and update `CHANGELOG.md` in the project root.
Release notes are how Marcus (the project owner) understands what changed.
`CHANGELOG.md` is the canonical chronological record of all changes across sessions
(Keep a Changelog format).

### File naming

```
docs/release-notes/
  SESSION-{NR}-{YYYY-MM-DD}-{slug}.md        ← Marcus variant (Swedish, no code refs)
  SESSION-{NR}-{YYYY-MM-DD}-{slug}-LLM.md    ← LLM variant (English, interfaces, files, test delta)
  SESSION-{NR}-{YYYY-MM-DD}-{slug}-DEV.md    ← Dev variant (files, decisions, risks)
```

The Marcus variant is also copied to the Obsidian vault at
`Neuron Lab/Release Notes/Session {NR} — {Title}.md`.
The LLM variant is also copied to
`Neuron Lab/Release Notes/Session {NR} — {Title} (LLM).md`.

### Marcus variant format

```markdown
---
session: { NR }
datum: { YYYY-MM-DD }
tags: [release-note, { topic tags }]
---

# Session {NR} — {Title}

## Vad är nytt?

{1-3 bullet points. Each bullet explains WHAT changed, WHY it matters, and HOW it works.
Write for a smart non-coder. If a tool/model/library is mentioned, explain what it is
on first mention. Be concrete: numbers, model names, specific behavior.
"En bugg fixades" is NOT acceptable — explain WHAT bug, WHAT it caused, HOW it was fixed.}

## Hur använder jag det?

{Concrete commands or steps. Terminal commands or Obsidian instructions.}

## Vad saknas fortfarande?

{Known limitations, deferred items. Be honest.}
```

Max ~30 lines.

### Dev variant format

```markdown
---
session: { NR }
datum: { YYYY-MM-DD }
---

# Session {NR} — Dev Notes

## Ändringar

| Fil | Ändring |
{table of all changed files}

## Beslut och tradeoffs

{Non-trivial design decisions with rationale.}

## Testdelta

{New/changed test counts per module.}

## Kända risker

{Things that might break, untested edge cases.}
```

### LLM variant format

```markdown
---
session: { NR }
date: { YYYY-MM-DD }
variant: llm
---

# Session {NR} — {Title}

## Changes

| File | Change |
{table of all changed files with concise descriptions}

## New/Changed Interfaces

{TypeScript interface definitions in code blocks. Only if something was added/changed.}

## Design Decisions

| Decision | Rationale |
{each non-trivial design decision with why}

## Test Delta

{before→after test counts per module, new test descriptions}

## Known Issues

{bugs, limitations, tech debt introduced or discovered}

## Verification

{typecheck status, test results, E2E verification done}
```

---

## 16) Dagböcker (Session Diaries)

Three diaries in `docs/dagbocker/` are updated at the end of every session that produces
changes. They capture what release notes and handoffs do NOT: the reasoning, surprises,
failed attempts, and open questions that shaped the session.

**Key principle: A diary entry that repeats the release note is wasted words.**
Release notes answer "what can I do now?". Diaries answer "what happened and why did
we choose this path?".

### When to write

- End of every session with code changes, config changes, or significant research
- Sessions that are pure discussion/planning: write only if decisions were made
- Never skip the diary to save time — a two-line entry is better than nothing

### Three variants

All three must be updated each session. They live in the same files (append-only).

### Honesty rule (applies to ALL variants)

The most valuable thing a diary can do is be honest about what was hard, uncertain,
or half-finished. AI agents tend to write "everything went well." Fight that instinct.

- If something took 45 minutes to debug, SAY SO and explain why
- If a solution feels fragile or temporary, SAY SO
- If you're unsure whether the approach is right, SAY SO
- "Allt gick bra" is acceptable ONLY if it's genuinely true

A diary that only reports successes is useless. A diary that captures the struggle
is the most valuable document in the project.

#### DAGBOK-MARCUS.md — For Marcus (project owner)

**Language:** Swedish. **Tone:** Conversational, honest, no jargon.
**Purpose:** Marcus reads this to understand what happened and why, without opening code.

Format per entry:

```markdown
## {YYYY-MM-DD} — Session {NR}: {Title that captures the essence}

### Vad hände?

{Narrative paragraphs. Not a feature list — explain the JOURNEY of the session.
What did we try? What surprised us? What didn't work before we found what did?
Use numbered bold points for distinct topics. Explain technical concepts inline
in plain language, e.g. "PPR (en algoritm som sprider sökningen genom grafens
kopplingar istället för att bara matcha ord)".}

### Vad funkade inte?

{What we tried that failed, what took longer than expected, what felt wrong.
THIS IS THE MOST IMPORTANT SECTION. If nothing failed, skip it — but think hard
before skipping. Example: "Vision-modellen tog 2+ minuter per sida och gav tomt
svar. Vi jagade problemet i 45 minuter innan vi hittade att 'thinking mode' var
påslagen och åt upp all output-budget."}

### Vad bestämdes?

{Table or bullets of decisions made. Include the WHY — what alternative was rejected.
Skip this section if no decisions were made.}

| Beslut | Varför |
| ------ | ------ |

### Vad är planen framöver?

{1-3 concrete next steps. Written so Marcus knows what to expect.
Skip if covered in the previous session's plan and nothing changed.}
```

**Anti-patterns:**

- Listing features without explaining why they matter
- Using function names or file paths (that's for DEV)
- "En bugg fixades" without saying what bug, what it caused, how it was fixed
- Skipping "Vad funkade inte?" when there clearly were struggles

#### DAGBOK-DEV.md — For senior developers

**Language:** Swedish/English mix. **Tone:** Technical, precise, opinionated.
**Purpose:** A developer joining the project reads this to understand architecture
decisions, code patterns, and the reasoning behind non-obvious design choices.

Format per entry:

```markdown
## {YYYY-MM-DD} (session {NR}) — {Technical summary}

### {Topic 1}

{Explain the technical approach. Include file paths, function names, interface
changes. Code blocks for key patterns. Describe the TRADEOFF — what we gained
and what we gave up.}

### {Topic 2}

...

### Mönster etablerade

{New patterns that future developers should follow. Not interfaces — patterns.
Example: "Use isModelAvailable() for quick checks, ensureOllama() only at startup.
The Promise-gate in ensureOllama caches results and can block timeout budgets."}

| Tid   | Typ                         | Vad                    |
| ----- | --------------------------- | ---------------------- |
| HH:MM | SESSION/FIX/BESLUT/REFACTOR | {one-line description} |

### Baseline

typecheck: clean/N errors
tests: N/N (+ new)
```

**What belongs here that doesn't belong in release notes:**

- Why we chose approach A over approach B
- Performance characteristics discovered during implementation
- Gotchas future developers should know about
- Patterns established that should be followed
- Dead ends: what we tried that didn't work and why

#### DAGBOK-LLM.md — For AI agents

**Language:** English. **Tone:** Dense, parseable, no prose filler.
**Purpose:** An agent starting a new session reads this entry to orient. Every word
must earn its place.

Format per entry:

```markdown
## {YYYY-MM-DD} — Session {NR}

**Changes**: {file}: {what changed}; {file}: {what changed}; ...

**New interfaces**: `InterfaceName` in `file.ts` — {fields}

**Decisions**: {decision}: {rationale}; ...

**Gotchas**: {non-obvious thing that will bite the next agent}

**Dead ends**: {what was tried and abandoned, so you don't repeat it}

**Tests**: {N}/{N} ({+new}). typecheck: {status}.

**Next**: {what session N+1 should do}

Handoff: `docs/handoffs/{filename}`
```

**The LLM diary is NOT a handoff.** The handoff is comprehensive and structured for
resuming work. The diary entry is a 10-line orient snapshot — just enough to decide
whether to read the full handoff.

### Relationship between documents

```
Session N produces:
  ├── Handoff     — "here's everything the next session needs" (comprehensive)
  ├── Release note (Marcus) — "what's new for the user" (result-focused)
  ├── Release note (LLM) — "what changed technically" (reference)
  └── Diary entries (×3) — "what happened and why" (narrative/process)
```

Each document has a distinct purpose. If you find yourself copy-pasting between them,
you're writing the wrong thing in the wrong place.

### Session close checklist

Before ending any session that produced changes, verify ALL of these exist:

- [ ] **Handoff** written to `docs/handoffs/HANDOFF-{date}-opencode-session{NR}-{slug}.md`
- [ ] **Release note (Marcus)** written + copied to Obsidian `Neuron Lab/Release Notes/`
- [ ] **Release note (LLM)** written + copied to Obsidian `Neuron Lab/Release Notes/`
- [ ] **DAGBOK-MARCUS.md** — entry appended
- [ ] **DAGBOK-DEV.md** — entry appended
- [ ] **DAGBOK-LLM.md** — entry appended
- [ ] **CHANGELOG.md** — entry appended (Keep a Changelog format)
- [ ] **Plan for next session** (if applicable) written to `docs/plans/`

Do NOT ask Marcus "should I write the diary?" — just write it. It's mandatory.

---

_This protocol is a living document. Update it when a new pattern proves stable across
multiple runs. Do not update it speculatively._
