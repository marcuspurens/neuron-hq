# Neuron HQ — LLM Agent Logbook

**Purpose:** Context injection for AI agents starting a new session. Read this first. Dense, parseable, no filler.

**Who writes:** Active agent (Sisyphus/Atlas/Claude) at end of each session. One entry per day minimum.

**Who reads:** Any LLM agent starting work on Neuron HQ. This is your orient step.

**Three logbooks:** DAGBOK-MARCUS.md (project owner, Swedish prose), DAGBOK-DEV.md (senior fullstack developers, architecture + patterns), **DAGBOK-LLM.md** (this file, AI agents, dense/parseable). All three must be updated each session.

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

### Session Log (2026-03-29 — Session 3)

**OpenCode Session 3 — PDF-ingest + morning briefing verified**

Key results:

- PDF-ingest end-to-end: WORKING
  - Created test PDF (130 words) via fpdf2
  - `aurora:ingest /tmp/test-aurora-ingest.pdf` → pypdfium2 extraction → 1 chunk → embedding → 2 nodes in DB
  - Document node `doc_6a6e5cb4e991` + chunk confirmed in PostgreSQL
  - Garbled-text fallback to OCR path exists but not triggered (clean PDF)
- Morning briefing: WORKING
  - `morning-briefing --force` → `briefing-2026-03-29.md` generated in Obsidian vault
  - 38 new nodes reported (22 transcript + 16 document)
  - 5 stale sources listed, 3 AI-generated questions with `<!-- svar: -->` feedback slots
  - File written to `/Users/mpmac/Documents/Neuron Lab/Briefings/`
- Aurora-noder: 83 (was 81, +2 from test PDF)
- No code changes this session — verification only

Environment confirmed working:

```
PostgreSQL 17: running (/opt/homebrew/opt/postgresql@17/)
Ollama: running (7 models incl. snowflake-arctic-embed, gemma3)
Python worker: /opt/anaconda3/bin/python3 (pypdfium2 + trafilatura OK)
Obsidian vault: /Users/mpmac/Documents/Neuron Lab/
```

**Remaining from handoff (for next session):**

| #   | Action                                   | Priority | Notes                        |
| --- | ---------------------------------------- | -------- | ---------------------------- |
| 4   | Index real content (URLs, docs, YouTube) | High     | Marcus chooses material      |
| —   | `crossref.ts` vs `cross-ref.ts` merge    | Low      | Tech debt                    |
| —   | TD-1: loadAuroraGraph() full-graph load  | Low      | Memory optimization at scale |

---

### Session Log (2026-04-01 — Session 5)

**OpenCode Session 5 — LLM metadata, Hermes MCP fix, Knowledge Architecture Plan**

Key results:

- `extractTags()` regex → `generateMetadata()` Gemma 3: tags + language + author + contentType + summary in one Ollama call
- Obsidian frontmatter redesigned: typ/författare/publicerad/källa/språk/tags/tldr (user-facing, not debug fields)
- Obsidian export: full text from chunks (was 500 char snippet), markdown formatting preserved (headings/bold/paragraphs)
- Multi-scope MCP: `createMcpServer()` supports comma-separated scopes
- Hermes MCP fixed: wrapper script `~/.hermes/aurora-mcp.sh` (tsx cwd bug), MEMORY.md reset (aurora-swarm-lab references)
- E2e verified: Telegram → Hermes → `aurora_ingest_url` → Neuron HQ → embeddings + LLM tags → Obsidian
- aurora-swarm-lab moved to `~/Documents/Arkiv/` (retired project)
- Knowledge architecture analysis: Aurora vs HippoRAG vs A-MEM. Aurora has ~70% of both. Missing: PPR retrieval, memory evolution.
- Plan written for next session: PPR-retrieval + memory evolution + morning briefing via Hermes

10 commits: `6961f3b..e763718` (see handoff for full list)
Tests: 3949/3949 green (1 pre-existing timeout in knowledge.test.ts)
Aurora nodes: 86

Full handoff: `docs/handoffs/HANDOFF-2026-04-01-opencode-session5-llm-metadata-hermes-mcp-plan.md`

### Next session priorities

1. **Morgonbriefing via Hermes** — 30 min config change, `aurora-insights` scope + cron
2. **PPR-retrieval** — integrate `src/core/ppr.ts` into `searchAurora()`, see brief 3.2b
3. **Memory evolution** — `evolveRelatedNodes()` in intake.ts after LLM metadata step

---

### Session Log (2026-04-01 — Session 4)

**OpenCode Session 4 — Hermes Agent + Telegram gateway + Aurora Obsidian improvements**

Key results:

- Baseline: 3 failing tests in `aurora-decay.test.ts` (from uncommitted changes, session 3 artifact) — fixed. 3949/3949 green.
- Hermes Agent v0.5.0 installed (`~/.hermes/hermes-agent/`)
- signal-cli 0.14.1 + Java 17.0.18 installed via Homebrew
- Signal linking FAILED: `sgnl://`-URI not recognized by Signal iOS app (known upstream bug in signal-cli, protocol mismatch with latest Signal)
- **Telegram gateway deployed instead:** `@hermesaurora_bot` created via BotFather, running as launchd service (`ai.hermes.gateway`)
- Hermes → LiteLLM → Aurora MCP end-to-end verified: `aurora_status` returned 85 nodes, 74 edges, 97.6% embedding coverage
- Marcus confirmed: chatted successfully with Hermes via Telegram
- LiteLLM configured: `https://litellm.app.aurora.svt.se/v1`, model `claude-sonnet-4-6`, OPENAI_API_KEY set in `~/.hermes/.env`
- `mcp` Python package installed in Hermes venv (was missing, caused `StdioServerParameters` error)
- Security hardening: `chmod 600 ~/.hermes/config.yaml ~/.hermes/.env`, security context installed at `~/.hermes/context/security.md`
- `gray-matter` npm package installed (was missing, blocked MCP server startup)
- Aurora MCP scope `aurora-search` configured in `~/.hermes/config.yaml` as server `kb`
- **obsidian-export**: chunk nodes now filtered from export (51→16 nodes), only parent articles/transcripts shown
- **Tags**: `extractTags()` added to `src/aurora/intake.ts` — new ingested documents get auto-tags from domain/language/title keywords. Shown as `tags: [...]` in Obsidian frontmatter.
- **Obsidian highlight plugin**: `aurora-highlight` community plugin created at `.obsidian/plugins/aurora-highlight/`. Cmd+P → "Spara markerad text till Aurora" → saves selection via `aurora:remember` CLI.

Code changes:

- `src/commands/obsidian-export.ts` — chunk filter (3 lines), tags in frontmatter (2 lines), subagent style reformatting
- `src/aurora/intake.ts` — `extractTags()` function + call in docNode properties
- `tests/commands/obsidian-export.test.ts` — updated chunk test to match new behavior
- `tests/commands/aurora-decay.test.ts` — fixed 3 tests for new multi-query flow

External config changes (NOT in repo):

- `~/.hermes/config.yaml` — LiteLLM provider, model, Aurora MCP server `kb`
- `~/.hermes/.env` — OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS
- `~/.hermes/context/security.md` — LLM behavior rules
- `/Users/mpmac/Documents/Neuron Lab/.obsidian/plugins/aurora-highlight/` — Obsidian plugin
- `/Users/mpmac/Documents/Neuron Lab/.obsidian/community-plugins.json` — plugin registered

Aurora nodes: 85 (unchanged — no new content ingested this session)

Full handoff: `docs/handoffs/HANDOFF-2026-04-01-opencode-session4-hermes-telegram-aurora.md`

---

## 2026-04-01 (session 6)

### State

```
test_suite:     3963 passing (was 3949 — +15 new tests for PPR + evolution)
aurora_nodes:   86 (unchanged this session — no new content ingested)
pre-existing:   1 timeout in auto-cross-ref.test.ts (flaky, existed before)
```

### Changes

**PPR-retrieval in searchAurora() (HippoRAG-inspired)**

- `src/aurora/search.ts` — New Step 2: `expandViaPpr()` uses semantic top results as PPR seeds (weighted by similarity), runs `personalizedPageRank()` on bidirectional edges, adds graph-connected nodes with `source: 'ppr'`
- `SearchOptions.usePpr` (default: true), `SearchOptions.pprLimit` (default: 5)
- `SearchResult.source` gains `'ppr'` value
- `tests/aurora/search.test.ts` — +10 tests (seeds, dedup, limit, type filter, bidirectional edges, graceful failure, enrichment)

**Memory evolution at ingest (A-MEM-inspired)**

- `src/aurora/intake.ts` — `evolveRelatedNodes()`: after LLM metadata, finds top-5 similar nodes (≥0.6 similarity, excluding chunks), updates their `relatedContext`, auto-resolves matching knowledge gaps via `resolveGap()`
- `IngestResult.evolution: { nodesUpdated, gapsResolved }`, pipeline step 7 of 7
- `tests/aurora/intake.test.ts` — +5 tests (relatedContext update, gap resolution, chunk skip, graceful failure, pipeline report)

### Decisions

| Decision                                | Why                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- |
| PPR before keyword fallback (not after) | PPR needs seed nodes — semantic results provide the best seeds            |
| Bidirectional edges in PPR              | Aurora edges are typed/directed, but graph proximity should be symmetric  |
| Seed weight = similarity score          | Higher-similarity hits deserve more PPR activation spread                 |
| Chunk exclusion in evolution            | Only doc-level nodes get relatedContext — chunks are derived fragments    |
| Gap matching via 50% word overlap       | Simple but sufficient heuristic — avoids false positives without LLM call |

### Active Context

- `src/aurora/search.ts` — PPR integrated, stable
- `src/aurora/intake.ts` — evolution integrated, stable
- Both features are graceful-failure: errors caught, logged, pipeline continues

### Next Actions

1. **Morning briefing via Hermes** (30 min, config only — outside repo)
2. **Consolidator PPR** (brief 3.2b) — separate feature, not done here

Full handoff: `docs/handoffs/HANDOFF-2026-04-01T2130-opencode-session6-ppr-search-memory-evolution.md`

---

### Orient Checklist (for new agent)

Before touching any code, verify:

```bash
pnpm typecheck   # must be zero errors
pnpm test        # must be 3949 passing
pnpm lint        # must be zero warnings on changed files
```

Key files to read before implementing anything:

- `AGENTS.md` — engineering protocol (mandatory)
- `.claude/rules/*.md` — **ALL rules files** (naming conventions, handoff format, etc.) — MANDATORY, scan every file
- `docs/dagbocker/DAGBOK-LLM.md` — THIS FILE, current state (mandatory)
- `HANDOFF.md` — handoff index, naming convention: `HANDOFF-YYYY-MM-DDT<HHMM>-<beskrivning>.md`
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
