# Neuron HQ — LLM Agent Logbook

**Purpose:** Context injection for AI agents starting a new session. Read this first. Dense, parseable, no filler.

**Who writes:** Active agent (Atlas/Claude) at end of each session. One entry per day minimum.

**Who reads:** Any LLM agent starting work on Neuron HQ. This is your orient step.

**Historical record:** Sessions S1-S150 + runs #1-#183 → `docs/DAGBOK.md` (pre-2026-03-26). Session-level handoffs → `docs/handoffs/`. Architecture decisions → `docs/adr/`.

**Format per entry:**

```
## YYYY-MM-DD
### State       — current system snapshot
### Decisions   — what was decided and why
### Active Context — files/modules currently in flux
### Next Actions — prioritized next steps
```

---

## 2026-03-26

### State

```
project:        Neuron HQ (autonomous agent swarm control plane)
repo:           /Users/mpmac/Documents/VS Code/neuron-hq
language:       TypeScript (strict, NodeNext, noUncheckedIndexedAccess)
runtime:        Node.js + pnpm
test_suite:     Vitest, 3949 tests (all passing as of 2026-03-24)
agents:         13 (see list below)
runs_total:     183
runs_green:     ~120
knowledge_graph: Aurora (pgvector + MCP server + Obsidian)
aurora_nodes:   924 idea nodes
roadmap_phase:  Fas 2 (Intelligens) — 26/32 tasks done in Fas 3
```

**Agent roster:**
Manager, Implementer, Reviewer, Researcher, Librarian, Historian, Tester, Consolidator, Knowledge Manager, Merger, Observer, Brief Reviewer, Code Anchor

**Tooling as of today:**

- IDE: OpenCode (replacing VS Code)
- Model routing: LiteLLM proxy (`svt-litellm/` prefix)
- Active model: `claude-opus-4-6` (was direct Anthropic API via VS Code)
- Orchestrator: Atlas (OhMyOpenCode Master Orchestrator, replacing informal Opus-in-VS Code)
- Session numbering: S1-S150 retired. New sessions not yet numbered in old system.

### Decisions

**D1: Tooling migration (2026-03-26)**
Migrated from VS Code + direct Claude Opus to OpenCode + LiteLLM. Rationale: model-agnostic routing, structured multi-task orchestration via Atlas, better session management. No production code changed. Same TypeScript codebase, same policy files, same Aurora integration.

**D2: Three-audience logbook split (2026-03-26)**
`docs/DAGBOK.md` mixed audiences poorly (Marcus/developer/LLM in one stream). Split into:

- `docs/dagbocker/DAGBOK-MARCUS.md` — Swedish plain language for project owner
- `docs/dagbocker/DAGBOK-DEV.md` — Swedish+English technical for developers
- `docs/dagbocker/DAGBOK-LLM.md` — English structured for AI agents (this file)

`docs/DAGBOK.md` preserved as historical record. Do not modify it.

### Active Context

**No production code changed today.** Documentation/tooling setup + full codebase analysis.

Files written today:

- `docs/dagbocker/DAGBOK-MARCUS.md` (new) — plain Swedish logbook for Marcus
- `docs/dagbocker/DAGBOK-DEV.md` (new) — technical logbook for developers
- `docs/dagbocker/DAGBOK-LLM.md` (this file, new) — structured logbook for AI agents
- `docs/RAPPORT-KODANALYS-2026-03-26.md` (new) — **466-line comprehensive codebase analysis**

**Codebase analysis key findings** (see full report for details):

- ~46,000 lines TypeScript source code
- Aurora module: 38 files, 11,358 lines in `src/aurora/`
- Agent system: 13 agents, 9,818 lines in `src/core/agents/`
- MCP server: 44 tools in `src/mcp/tools/`
- Python workers: 12 files, 834 lines in `aurora-workers/`
- Two separate knowledge graphs: Neuron KG (`kg_nodes`) and Aurora KG (`aurora_nodes`)
- Connected via cross-references in `src/aurora/cross-ref.ts`

**Completed briefs (corrected — initial entry had stale data):**

| Brief                                  | Status  | Session |
| -------------------------------------- | ------- | ------- |
| 3.6 Historian/Consolidator reliability | ✅ DONE | S147    |
| 3.1c Code Anchor hardening             | ✅ DONE | S150    |
| A1 Obsidian round-trip                 | ✅ DONE | S150    |

**Remaining open work:**

| Priority | Brief                              | Status                       | Risk                     |
| -------- | ---------------------------------- | ---------------------------- | ------------------------ |
| HIGH     | Aurora B1 — MCP test fix           | Not started (~15 min manual) | Blocks aurora-repo tests |
| MED      | 3.3 Research before implementation | Not written                  | —                        |
| MED      | 3.4 Scheduled agent conversations  | Not written                  | Needs server             |
| MED      | 3.7 Tool-call budgets              | Not written                  | —                        |
| MED      | 3.8 Retro → prompt pipeline        | Not written                  | Depends on 3.7           |
| MED      | Aurora A2 DOCX/XLSX intake         | Not written                  | —                        |
| LOW      | 2.8 AI Act Art. 14                 | Not written                  | 3-5 runs                 |

**Known open risks:**

1. Aurora MCP version mismatch (1.25 vs 1.26) — identified S145. ~15 min manual fix.
2. TD-1: `timeline()`/`search()` load entire graph in memory — no pagination.
3. TD-4: N+1 DB writes in `saveAuroraGraphToDb()`.
4. TD-9: `requirements.txt` incomplete — new machine may fail Python worker setup.

### Next Actions

Priority order for next session:

1. **Add AURORA_PYTHON_PATH to .env** — currently requires manual export
2. **Test PDF-ingest** end-to-end
3. **Test morning briefing** — `aurora:morning-briefing`
4. **Index real content** — Marcus chooses URLs, docs, YouTube videos
5. **Fix `vid-4fc93ffbb1cd`** — debug special chars causing Ollama 400
6. **Install `gemma3` in Ollama** — or change polish model in config
7. **Update ROADMAP.md** with new status

### Session Log (2026-03-29)

**OpenCode Session 1 — Aurora end-to-end verified**

Commits pushed to main:

- `5f69730` — docs: dagböcker, rapport, swagger, handoff protocol
- `0c819da` — docs: MARCUS.md with full profile
- `04d0478` — fix: embedding text truncation + batch fallback
- `dcf34ed` — fix: YouTube temp-dir persistence

Key results:

- URL ingest → ask → answer with citations: WORKING
- YouTube ingest → transcribe → ask → answer: WORKING
- 3949 tests green
- 84 aurora_nodes in DB (was 45)
- 2 bugfixes: embedding truncation, video temp-dir

Environment setup required:

```
export PATH="/Users/mpmac/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/bin:$PATH"
corepack enable pnpm
export AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3
```

Full handoff: `docs/handoffs/HANDOFF-2026-03-29T1700-opencode-session1-aurora-e2e.md`

### Session Handoff Protocol

**IMPORTANT for future agents:** This project migrated from VS Code + Claude Opus (sessions S1-S150) to OpenCode + LiteLLM on 2026-03-26. The old handoff system (`docs/handoffs/HANDOFF-*.md`) is retired. New handoff protocol:

1. At session end: update this file (`DAGBOK-LLM.md`) with State/Decisions/Active Context/Next Actions
2. At session start: read this file FIRST, then `AGENTS.md`, then `docs/ROADMAP.md`
3. For deep history: search `docs/handoffs/` and `docs/DAGBOK.md` (pre-2026-03-26)
4. Handoff document: `docs/HANDOFF-OPENCODE.md` (see below for format)

### Session Log (2026-03-29 — Session 2)

**OpenCode Session 2 — teknisk skuld + arkitektur**

Commits:

- (denna session — ej pushad ännu)

Key results:

- MAX_EMBED_CHARS sänkt 2000→1500 (3 filer) — icke-engelska text tokeniseras hårdare
- Embedding-bug i retry-logiken fixad: `batchTexts[k-i] = shorter[k]` ersatt med `currentMaxChars`-mönster — renare och korrekt
- `vid-4fc93ffbb1cd` har nu embedding (enda noden som saknades)
- `gemma3` installerad i Ollama (3.3 GB) — polish-pipeline fullt funktionell
- ROADMAP.md + ROADMAP-AURORA.md uppdaterade
- `docs/ARKITEKTUR-AURORA.md` skapad (Scope 2 — teknisk komponentkarta, 11 sektioner)

Code review findings:

- 🔴 BLOCK: index-mutation i retry-logik var korrekt men extremt ömtålig — fixad
- 🟡 WARN: `const ids = batchIds` (dead assignment) — fixad i samma veva
- 🟡 WARN: `crossref.ts` vs `cross-ref.ts` — dubbla filer, kandidat för sammanslagning (TD-noterat i arkitektur-doc)
- 🟢 OK: `String(err).includes('400')` — tillräckligt robust för intern Ollama-kommunikation
- 🟢 OK: `buildTexts` closure är korrekt — `rows` ändras aldrig under retry

Files changed this session:

- `src/aurora/aurora-graph.ts` — MAX_EMBED_CHARS + retry-refaktor
- `src/commands/embed-nodes.ts` — MAX_EMBED_CHARS
- `scripts/reembed-aurora.ts` — MAX_EMBED_CHARS
- `ROADMAP.md` — status + TD-13
- `ROADMAP-AURORA.md` — B2 fixad, A1 klar
- `docs/ARKITEKTUR-AURORA.md` — indexfil (pekar på tre versioner)
- `docs/ARKITEKTUR-AURORA-LLM-2026-03-29.md` — modulkarta, dataflöden, DB-schema
- `docs/ARKITEKTUR-AURORA-MARCUS-2026-03-29.md` — beslutsbakgrund (Swedish prose)
- `docs/ARKITEKTUR-AURORA-DEV-2026-03-29.md` — onboarding för ny utvecklare

### Orient Checklist (for new agent)

Before touching any code, verify:

```bash
pnpm typecheck   # must be zero errors
pnpm test        # must be 3949 passing
pnpm lint        # must be zero warnings on changed files
```

Key files to read before implementing anything:

- `AGENTS.md` — engineering protocol (mandatory)
- `docs/dagbocker/DAGBOK-LLM.md` — THIS FILE, current state (mandatory)
- `docs/ROADMAP.md` — current phase and task status
- `docs/RAPPORT-KODANALYS-2026-03-26.md` — full codebase analysis
- `memory/patterns.md` — proven patterns from previous runs
- `memory/errors.md` — known failure modes to avoid

Architecture entrypoints:

- `src/cli.ts` — CLI entrypoint
- `src/aurora/` — Aurora knowledge graph (38 files, the focus area)
- `src/core/agents/` — agent implementations (13 agents)
- `src/mcp/server.ts` — MCP server (44 tools)
- `src/core/ppr.ts` — HippoRAG PPR algorithm
- `src/core/graph-merge.ts` — A-MEM abstraction/dedup
- `src/core/knowledge-graph.ts` — Neuron KG (1095 lines)
- `prompts/` — agent role definitions

---
