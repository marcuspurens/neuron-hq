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

## 2026-04-16 — Session 20

**Changes**: `src/commands/aurora-delete.ts`: NEW — CLI wrapper for `cascadeDeleteAuroraNode()`; `aurora-workers/transcribe_audio.py`: `_load_audio()` m4a→WAV+soundfile, bypasses AudioDecoder; `src/aurora/video.ts`: try/catch around diarize, continues with `speakers=[]`; `aurora-workers/check_deps.py`: +soundfile + torchcodec ABI checks; `AGENTS.md`: §3.9 Don't Be a Gatekeeper; `src/aurora/speaker-timeline.ts`: `WhisperWord[]` propagated through merge/split, chapter hard-break, speaker-at-change-only; `src/commands/obsidian-export.ts`: `<span data-t="ms">` per-word, `###` chapter headers, `[[#]]` TOC; `src/aurora/semantic-split.ts`: NEW — sentence-number LLM split, mergeRunts, code-fence strip, fallback

**New interfaces**: `semanticSplit(blocks: TimelineBlock[], options?: SplitOptions): Promise<TimelineBlock[]>`; `mergeRunts(blocks: TimelineBlock[], gapThresholdMs?: number): TimelineBlock[]`; `SplitOptions {model?, softLimit?, think?}`

**Decisions**: export-time split (DB stays raw); sentence-number LLM instructions (charindex failed with gemma3); `think:false` for gemma4 structured tasks (thinking mode caused 10min timeouts); 10s gap = hard boundary in mergeRunts; speaker label only at change or chapter start; fallback to unsplit on Ollama failure

**Gotchas**: `Set.has()` exact match in `remergeSameSpeakerBlocks` — pyannote labels may have trailing whitespace/casing diffs; normalize before Set insert/lookup. Gemma4 `think:false` is mandatory for structured output — without it, model exhausts output budget on reasoning chain. `mergeRunts` without gap check merges across chapter boundaries silently.

**Dead ends**: charindex-based LLM split instructions (gemma3 returned narrative answers). Gemma4 default thinking mode (8-12min timeouts on structured tasks).

**Tests**: ~151 → ~183 (+32: aurora-delete +8, semantic-split +14, speaker-timeline +6, obsidian-export +4). typecheck: clean (1 pre-existing unrelated error unchanged).

**Next**: LLM chapter title generation (no YouTube chapters); speaker guesser prompt-tuning (deferred S17); daemon verification (deferred S17); word-span rendering optimization; Ollama version check in check_deps.py

Handoff: `docs/handoffs/HANDOFF-2026-04-16-opencode-session20-semantic-timeline.md`

---

## 2026-04-15 — Session 19

**Changes**: `transcribe_audio.py`: `word_timestamps=True`, words array in segment output; `extract_video.py`: +`viewCount`, `likeCount`, `channelFollowerCount`, `thumbnailUrl`; `speaker-timeline.ts`: +`WhisperWord` interface, +`splitAtWordBoundaries()`, `buildSpeakerTimeline()` prefers word-split; `transcript-tldr.ts`: NEW — `generateTldr()` Ollama/Claude; `video.ts`: propagate new yt-dlp fields, LLM tldr step (11c), fallback Speaker_01 (7b), removed description-summary; `obsidian-export.ts`: `källa:`→`videoUrl:`, +kanal/visningar/likes/prenumeranter/thumbnail, +`extractHashtags()`, +description+chapters body sections, removed provenance, restored tldr (now LLM)

**New interfaces**: `WhisperWord {start_ms, end_ms, word, probability?}`; `WhisperSegment.words?: WhisperWord[]`; `splitAtWordBoundaries(seg, dia): WhisperSegment[]`; `TldrOptions {model?, ollamaModel?}`; `TldrResult {tldr, modelUsed}`; `generateTldr(text, context, options?): Promise<TldrResult>`

**Decisions**: word-level split with sentence-split fallback; hashtags from description > ytTags; remove provenance from video frontmatter; LLM tldr replaces description-first-sentence; fallback Speaker_01 when no diarization; 8000 char transcript truncation for tldr

**Gotchas**: `loadAuroraGraph` loads from DB first — file-only node deletion doesn't work when DB is available. `ensureOllama()` caches result — if first call returns false, all subsequent LLM steps (polish, tldr, speaker-guess) get false. Re-ingestion blocked by dedup (early return at line 238 of video.ts).

**Dead ends**: Spent ~20 min debugging why LLM tldr didn't appear in re-ingested video. Root cause: node existed in DB (not file), dedup returned early. Need `cascadeDeleteAuroraNode` via CLI to properly re-ingest.

**Tests**: 4126/4127 (+8 net new). typecheck: clean.

**Next**: speaker guesser prompt-tuning; fix pyannote AudioDecoder crash; CLI `aurora:delete` command for re-ingestion

Handoff: `docs/handoffs/HANDOFF-2026-04-15-opencode-session19-word-align-metadata-tldr.md`

---

## 2026-04-14 — Session 18

**Changes**: `speaker-timeline.ts`: +`splitAtSentenceBoundaries()`, Step 0 in `buildSpeakerTimeline()`; `denoise_audio.py`: new worker (DeepFilterNet CLI); `__main__.py`: dispatcher; `check_deps.py`: `_check_cli()` + deepfilternet; `worker-bridge.ts`: `'denoise_audio'` action; `video.ts`: `denoise` option, denoising step, `denoised` result; `obsidian-export.ts`: `###`→`####`; `obsidian-parser.ts`: `#{3,4}` regex; `obsidian-import.ts`: Path B position-based speaker rename

**New interfaces**: `splitAtSentenceBoundaries(segment: WhisperSegment): WhisperSegment[]`; `VideoIngestOptions.denoise?: boolean`; `VideoIngestResult.denoised: boolean`; `ProgressStep 'denoising'`; `WorkerAction 'denoise_audio'`

**Decisions**: punctuation-split over word-timestamps (not saved yet); isolated `.venvs/denoise/` for deepfilternet (torch conflict); H4 headers for visual proportion; position-based speaker rename matching

**Gotchas**: DeepFilterNet 0.5.6 incompatible with torchaudio>=2.6 (`torchaudio.backend.common` removed). Requires isolated venv with torch 2.2.2. Env var `DEEPFILTERNET_CMD` must point to venv binary. `STEP_NAMES` always includes `denoise` — marked `skipped` when disabled.

**Dead ends**: tried torchaudio compat shim (patching `sys.modules`) — worked for import but multiprocessing DataLoader re-imports without shim. Tried same-env install — numpy<2 breaks pyannote.

**Tests**: 4109/4109 (+17). typecheck: clean.

**Next**: word-level speaker alignment (enable `word_timestamps=True` in `transcribe_audio.py`, save word array in rawSegments, split at diarization boundaries with exact word times)

Handoff: `docs/handoffs/HANDOFF-2026-04-14-opencode-session18-speaker-denoise-obsidian.md`

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

## 2026-04-03 (session 9)

### State

```
test_suite:     3967 passing (142 in changed files, 1 pre-existing flaky timeout)
aurora_nodes:   ~90 (unchanged — no new content ingested)
mcp_tools:      20
commits:        none (uncommitted — awaiting Marcus review)
```

### Changes

**Obsidian two-way metadata — 5 WPs implemented:**

| WP  | Feature                       | Files changed                                                                                                  |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| WP1 | Tag quoting (spaces)          | `obsidian-export.ts`                                                                                           |
| WP2 | Tags round-trip (import back) | `obsidian-parser.ts`, `obsidian-import.ts`                                                                     |
| WP3 | Speaker title/organization    | `obsidian-parser.ts`, `obsidian-export.ts`, `obsidian-import.ts`, `speaker-identity.ts`, `ebucore-metadata.ts` |
| WP4 | Provenance layer              | `aurora-schema.ts`, `video.ts`, `intake.ts`, `ocr.ts`, `vision.ts`, `memory.ts`, `obsidian-export.ts`          |
| WP5 | Segment corrections           | `obsidian-parser.ts`, `obsidian-import.ts`                                                                     |

New interfaces: `Provenance` (aurora-schema), `ParsedTimelineBlock` (obsidian-parser)
New functions: `updateSpeakerMetadata()` (speaker-identity), `extractTimelineBlocks()` (obsidian-parser)
New EBUCore mappings: `ebucore:personTitle`, `ebucore:organisationName`
New result fields: `tagsUpdated`, `segmentReassignments` (ObsidianImportResult)
New frontmatter fields: `källa_typ`, `källa_agent`, `källa_modell`, `title`, `organization` per speaker

Tests added: +10 (1 export tag, 2 export provenance, 2 import tags, 1 import segments, 4 parser timeline)
Tests updated: 5 (parser + ebucore fixtures for new title/organization fields)

### Decisions

| Decision                                   | Why                                                           |
| ------------------------------------------ | ------------------------------------------------------------- |
| Provenance in `properties` not schema      | Opt-in, backward compatible, no migration needed              |
| `buildSpeakerMap()` takes allNodes + edges | Needs edge traversal to find speaker_identity for title/org   |
| 5s tolerance for segment timecode matching | Handles rounding without false positives                      |
| `PageDigest[]` deferred to session 10      | Better as dedicated feature than tacked onto metadata session |

### Active Context

- All 5 WPs from `docs/plans/PLAN-obsidian-twoway-metadata-2026-04-02.md` complete
- `docs/plans/PLAN-page-digest-pdf-pipeline-2026-04-03.md` ready for session 10
- PDF to test: `/Users/mpmac/Downloads/© Ungdomsbarometern - Arbetsliv 2025 - SVT.pdf` (sid 30, tabell)

### Next Actions (Session 10)

1. Read handoff: `docs/handoffs/HANDOFF-2026-04-03T1900-opencode-session9-obsidian-twoway-metadata.md`
2. Read plan: `docs/plans/PLAN-page-digest-pdf-pipeline-2026-04-03.md`
3. WP1: `PageDigest` interface + `ingestPdfRich()` refaktor
4. WP3: CLI `aurora pdf-diagnose <path> --page N`
5. WP4: Test med Ungdomsbarometern sid 30
6. WP2: Obsidian-export av PageDigest (stretch)

Full handoff: `docs/handoffs/HANDOFF-2026-04-03T1900-opencode-session9-obsidian-twoway-metadata.md`

---

## 2026-04-02 (session 8)

### State

```
test_suite:     3964 passing (294 files, 0 failures)
aurora_nodes:   ~90 (unchanged this session)
mcp_tools:      20
hermes_git:     ~/.hermes/ tracked (13 files, secrets excluded)
commits:        24cdffe (S7), 5a9664d (S8 timeout), e02ed32 (S8 docs)
```

### Changes

**PDF ingest timeout cascade (3 fixes):**

| File                              | Change                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/job-runner.ts`        | `JOB_TIMEOUT_MS` (30min), `isProcessAlive()` (signal 0), `recoverStaleJobs()` (dead PID + age check), kill timer on forked child |
| `src/aurora/vision.ts`            | `AbortSignal.timeout(120_000)` on Ollama `fetch()`                                                                               |
| `tests/aurora/job-runner.test.ts` | Updated 2 processQueue tests for recoverStaleJobs DB call                                                                        |
| `tests/mcp/scopes.test.ts`        | Fixed session 7 gap: added `tool: vi.fn()` to fakeServer mock                                                                    |

**Hermes git-tracking:**

- `git init ~/.hermes/` with `.gitignore` (secrets excluded)
- Tracked: `memories/`, `SOUL.md`, `config.yaml`, `context/security.md`, `cron/`, `gateway_state.json`, `channel_directory.json`, `aurora-mcp.sh`

**No code changes for metadata schema** — analysis + plan only. Implementation deferred to session 9.

### Decisions

| Decision                                  | Why                                                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema.org + Provenance + A-MEM + EBUCore | Schema.org is the universal standard (Google/MS/Apple/Yahoo), Provenance solves VoicePrint attribution, A-MEM keywords/tags enable dynamic indexing, EBUCore stays for media-only fields |
| Provenance is read-only in Obsidian       | Provenance shows _where content came from_ — editing it would break audit trail                                                                                                          |
| Git-track ~/.hermes/ (not just MEMORY.md) | Full diffable history of config + memory + cron output, not just flat text                                                                                                               |
| 5-WP plan for session 9                   | Too much scope for one session — plan first, implement next                                                                                                                              |

### Active Context

- `docs/plans/PLAN-obsidian-twoway-metadata-2026-04-02.md` — detailed implementation plan (5 WPs)
- `docs/handoffs/HANDOFF-2026-04-02T1200-opencode-session8-pdf-timeout-metadata-plan.md`

### Next Actions (Session 9)

1. Read handoff + plan
2. Implement WP1-WP5 in order (tag bug → tags roundtrip → speaker enrichment → provenance → segment corrections)
3. Verify: typecheck + tests + manual Obsidian round-trip

Full handoff: `docs/handoffs/HANDOFF-2026-04-02T1200-opencode-session8-pdf-timeout-metadata-plan.md`

---

## 2026-04-02 (session 7)

### State

```
test_suite:     3963+ passing (no regressions, 1 pre-existing timeout)
aurora_nodes:   ~90 (ingested yt-jNQXAC9IVRw, yt-9bZkp7q19f0 this session)
mcp_tools:      20 (was 16 — added 8 media tools, removed 4 overlap)
hermes_scopes:  aurora-search,aurora-memory,aurora-ingest-text,aurora-insights,aurora-ingest-media,aurora-media
cron_jobs:      morning_briefing @ 08:00 → telegram:8426706690
python_env:     /opt/anaconda3/bin/python3 (pyannote.audio + PaddleOCR 3.4.0 + whisper)
```

### Changes

**External config (NOT in repo):**

- `~/.hermes/config.yaml` — added `aurora-insights,aurora-ingest-media,aurora-media` scopes + cron job
- `~/.hermes/aurora-mcp.sh` — added `/opt/anaconda3/bin` to PATH (pyannote/PaddleOCR)
- Hermes venv — installed `croniter`
- Anaconda env — installed `pyannote.audio`, downgraded numpy to 1.26.4

**Code changes:**

| File                                 | Change                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `src/commands/obsidian-export.ts`    | `source_url` column → `källa:` in frontmatter                                |
| `src/aurora/ocr.ts`                  | New `ingestPdfRich()` — 6-step hybrid OCR+vision pipeline                    |
| `src/aurora/job-runner.ts`           | New `startPdfIngestJob()` — async PDF job queue                              |
| `src/aurora/job-worker.ts`           | Generalized — dispatches `video_ingest` vs `pdf_ingest` by `job.type`        |
| `src/aurora/worker-bridge.ts`        | Added `render_pdf_page`, `get_pdf_page_count` actions; relaxed metadata type |
| `src/mcp/tools/aurora-ingest-pdf.ts` | **NEW** — MCP tool for async PDF ingest                                      |
| `src/mcp/scopes.ts`                  | Registered `aurora_ingest_pdf` in `aurora-ingest-media` scope                |
| `aurora-workers/ocr_pdf.py`          | `render_pdf_page()`, `get_pdf_page_count()`, PaddleOCR 3.x API migration     |
| `aurora-workers/__main__.py`         | Registered new Python handlers                                               |

### Decisions

| Decision                                             | Why                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Hybrid OCR+vision per page (not just OCR)            | OCR extracts text but cannot understand tables/charts/diagrams                    |
| Vision prompt returns TEXT_ONLY for plain text pages | Avoids wasting Ollama calls on pages with no visual content                       |
| PDF ingest reuses existing job queue (not new table) | `aurora_jobs.type` discriminator + shared `processQueue()` is simpler             |
| `job-worker.ts` dispatches by job.type               | One worker entry point, multiple job types — avoids fork() path complexity        |
| numpy <2 in Anaconda                                 | pyannote.audio required numpy 2.x but pyarrow/sklearn/pandas compiled against 1.x |

### Active Context

- `src/aurora/ocr.ts` — `ingestPdfRich()` complete but NOT tested end-to-end (needs Ollama running + real PDF)
- `aurora-workers/ocr_pdf.py` — PaddleOCR 3.x API migrated, tested manually (single page)
- Telegram morning briefing — cron set, delivery format corrected, NOT verified at 08:00
- Consolidator PPR (brief 3.2b) — already fully implemented (discovered this session)

### Next Actions

1. **Test hybrid PDF pipeline E2E** — queue a real PDF with tables/charts, verify vision descriptions in Aurora node
2. **Verify morning briefing delivery** — check 08:00 Telegram delivery works
3. **Roadmap rewrite** — current roadmap predates Hermes/OpenCode/Telegram, needs fresh inventory

### Known Issues

- Telegram delivery of cron results had connection errors (LiteLLM proxy); `telegram:8426706690` format is corrected
- PaddleOCR model loading takes ~30s per process start; 16-page PDF OCR takes ~5 min
- `aurora_jobs` table reuses `video_url` column for PDF file path (pragmatic but impure)

Full handoff: `docs/handoffs/HANDOFF-2026-04-02T0830-opencode-session7-hermes-briefing-media-ingest-hybrid-pdf.md`

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

## 2026-04-04 — Session 10

**PageDigest**: New exported interface in `src/aurora/ocr.ts`. Per-page diagnostic data: textExtraction (method/charCount/garbled), ocrFallback (triggered/text/charCount), vision (model/description/textOnly/tokensEstimate), combinedText/combinedCharCount. `ingestPdfRich()` builds `PageDigest[]`, passes in metadata to `processExtractedText()`. `RichPdfResult.pageDigests` added.

**diagnosePdfPage()**: Single-page pipeline without ingest. CLI: `aurora:pdf-diagnose <path> --page <N>`.

**Vision prompt overhaul**: `/api/generate` → `/api/chat` with `VISION_SYSTEM_MESSAGE`. `think: false` + `num_predict: 800` (qwen3-vl thinking mode caused 2+ min timeout with empty output). `isVisionAvailable()` changed from `ensureOllama()` to `isModelAvailable()` (simple ping vs blocking pull). PDF prompt: 5-point structured format. DEFAULT_PROMPT: 5-point structured format.

**Obsidian export**: `buildPageDigestSection()` — collapsible callout table per page. Pipe char escaped to `∣`.

**Release notes system**: `AGENTS.md` section 15. 21 files in `docs/release-notes/` (retroactive sessions 1-10, Marcus + LLM variants). Copied to Obsidian vault.

**E2E verified**: Ungdomsbarometern page 10 → "bar chart" ~30s. Page 30 → 1295 chars text extraction.

Tests: 42/42 (ocr 21 + obsidian-export 21). typecheck clean.

Handoff: `docs/handoffs/HANDOFF-2026-04-04T1000-opencode-session10-page-digest-vision-prompts.md`
Plan S11: `docs/plans/PLAN-pdf-eval-loop-2026-04-04.md`

---

### Orient Checklist (for new agent)

Before touching any code, verify:

```bash
pnpm typecheck   # must be zero errors
pnpm test        # should be ~3967+ passing
pnpm lint        # must be zero warnings on changed files
```

Key files to read before implementing anything:

- `AGENTS.md` — engineering protocol (mandatory, includes section 15: Release Notes)
- `docs/dagbocker/DAGBOK-LLM.md` — THIS FILE, current state (mandatory)
- Latest handoff in `docs/handoffs/` — session context
- `docs/ROADMAP.md` — current phase and task status
- `memory/patterns.md` — proven patterns from previous runs
- `memory/errors.md` — known failure modes to avoid

Architecture entrypoints:

- `src/cli.ts` — CLI entrypoint (includes `aurora:pdf-diagnose`)
- `src/aurora/` — Aurora knowledge graph (38+ files, the focus area)
- `src/aurora/ocr.ts` — PDF pipeline: `ingestPdfRich()`, `diagnosePdfPage()`, `PageDigest`
- `src/aurora/vision.ts` — Ollama vision: `analyzeImage()`, `VISION_SYSTEM_MESSAGE`
- `src/aurora/search.ts` — Search with PPR expansion
- `src/aurora/intake.ts` — Ingest pipeline with memory evolution + provenance
- `src/core/agents/` — agent implementations (13 agents)
- `src/mcp/server.ts` — MCP server (20+ tools)
- `src/commands/obsidian-export.ts` — Obsidian export with PageDigest table

Known issues:

- Vision cold start >120s after Ollama restart (model loading)
- `isTextGarbled()` runs per-document not per-page
- Text splitting via `\n{2,}` doesn't map 1:1 to PDF pages

---

## 2026-04-05 — Session 11

**Changes**: `aurora-workers/docling_extract.py`: NEW Docling worker; `aurora-workers/__main__.py`: register action; `src/aurora/worker-bridge.ts`: add action type; `src/aurora/ocr.ts`: diagnosePdfPage uses Docling primary + vision for images, PageDigest.method += 'docling'; `src/aurora/vision.ts`: full rewrite with VisionDiagnostics, keep_alive, stat check; `src/core/config.ts`: default → aurora-vision-extract; `ollama/Modelfile.vision-extract`: NEW custom instruct wrapper; `tests/aurora/vision.test.ts`: full rewrite; `tests/aurora/ocr.test.ts`: updated mocks; `tests/fixtures/pdf-eval/`: 5 pipeline.json + 5 facit.yaml

**New interfaces**: `VisionDiagnostics` in `vision.ts` — loadDurationMs, evalDurationMs, totalDurationMs, promptTokens, evalTokens, imageSizeBytes. `PageDigest.textExtraction.method` extended with `'docling'`. `WorkerRequest.action` extended with `'extract_pdf_docling'`.

**Decisions**: Docling 2.84.0 as primary PDF extractor: structured markdown + tables > flat pypdfium2; Vision only for `<!-- image -->` pages: saves 15-25s/page; Custom Modelfile (aurora-vision-extract): instruct-q8_0, temp 0, seed 42; Three-layer metadata model: Dublin Core + DoclingDocument + page-understanding extension; page_type computed from Docling elements + vision signal, not prompted

**Gotchas**: `qwen3-vl:8b` = thinking variant, `think:false` ignored (ollama#14798) — must use instruct tag; Docling processes entire PDF even for single page (~38s constant); Docling 2.84.0 pulls numpy 2.4.4 breaking pyarrow/pandas — needs upgrade chain; Ollama evicts model from GPU after idle — use `keep_alive: '10m'` or pre-pin; Vision `key_finding` hallucinates (page 30: reversed most/least popular)

**Dead ends**: `/no_think` + `raw:true` workaround for thinking variant — worked for text but unreliable for images; CLI-based diagnose timeouts were caused by Ollama GPU eviction between process spawns, not by the vision call itself

**Tests**: 3983/3984 (+0 new test files, 3 rewritten). typecheck: clean.

**Next**: Session 12: v1 metadata spec (YAML), page_type classifier (Docling elements + vision → computed type), data review workflow for Marcus

Handoff: `docs/handoffs/HANDOFF-2026-04-05T1800-opencode-session11-docling-vision-pipeline.md`

---

## 2026-04-07 — Session 12

**Changes:** Documentation only. No code changes.

**New interfaces:** `AuroraDocument` designed (not implemented): Schema.org `Report`/`Article`/`VideoObject` + `aurora: { id, sourceHash, provenance, pages: PageDigest[], reviewed }`. `PageUnderstanding` designed: `pageType` enum, `chartType`, `dataPoints`, `keyFinding`, `signals`.

**Decisions:** Schema.org via `schema-dts` over Dublin Core: superset, TypeScript types (google/schema-dts 1.2k stars), domain-specific (`Report` vs generic DC string), JSON-LD export-ready; Minimal subset (6 fields: name, creator, datePublished, inLanguage, keywords, encodingFormat); `aurora` namespace for extensions

**Gotchas:** LiteLLM sub-agent routing broken entire session: explore/librarian → `gpt-5-nano`, oracle → `gpt-5.2`, all fail with `reasoningSummary` param error. Main model (user-selected) unaffected. Sub-agent routing is separate from main model selection in OpenCode Desktop. OpenCode config at `~/Library/Application Support/ai.opencode.desktop/opencode.global.dat`.

**Dead ends:** DC as document envelope — too generic, no TypeScript types, reinvents what Schema.org provides; Multiple LiteLLM fix attempts from agent side — can't reach server config; Wrote 4 LiteLLM guide files (can be deleted after fix)

**Tests:** Unchanged (3983/3984). typecheck: clean.

**Next:** Session 13: Fix LiteLLM agent routing (remove `reasoningSummary` from gpt-5-nano/gpt-5.2 OR switch to Anthropic), `pnpm add -D schema-dts`, implement `AuroraDocument`, build page classifier.

Handoff: `docs/handoffs/HANDOFF-2026-04-07T1200-opencode-session12-schema-org-metadata-architecture.md`

## 2026-04-08 — Session 13

**Changes:** `src/aurora/types.ts`: NEW — AuroraDocument, AuroraProvenance (=Provenance alias), AuroraPageEntry, PageUnderstanding, PageType (14 variants), ChartType (11 variants), DataPoint, PageTypeSignals, Facit, EvalResult; `src/aurora/page-classifier.ts`: NEW — `classifyPage()` sync pure function, parses vision description PAGE TYPE/TITLE/DATA/KEY FINDING, markdown table + Label:Value parsers, text heuristic fallback; `src/aurora/pdf-eval.ts`: NEW — `parseFacit()`, `evalPdfPage()`, `evalFromPipelineJson()`, `evalDirectory()`, `formatEvalSummary()`; `src/aurora/index.ts`: added all new exports; `src/cli.ts`: `aurora:pdf-eval <facit>` command; `package.json`: +schema-dts@2.0.0 devDep; tests: +15 classifier, +9 eval.

**New interfaces:** `AuroraDocument` in `types.ts` — `@context`, `@type`, `name`, `creator`, `datePublished`, `inLanguage`, `keywords`, `encodingFormat`, `aurora: { id, sourceHash, provenance, pages: AuroraPageEntry[], reviewed, reviewedAt }`. `AuroraPageEntry` = `{ digest: PageDigest, understanding: PageUnderstanding | null }`. `PageUnderstanding` = `{ pageType, pageTypeConfidence, chartType, title, dataPoints, keyFinding, imageDescription, signals }`.

**Decisions:** schema-dts import removed from types.ts (YAGNI — unused, add at serialization); AuroraProvenance = type alias for Provenance (same fields); classifier is pure sync (no LLM); scoring weights text 40% vision 60%; vision weights: type 20% title 10% data 60% negatives 10%.

**Gotchas:** Markdown table header row `| Label | Value |` passed through as data point — needed regex filter for generic header words. Blank page threshold (charCount < 20) fires before cover check on page 1 — reorder to check cover first when page === 1 && charCount > 0. First explore agent (pre-routing-fix) timed out after 30min.

**Dead ends:** None significant. Three test failures caught and fixed in first iteration.

**Tests:** 4006/4008 (+24 new). typecheck: clean. 2 pre-existing flaky (auto-cross-ref, tester).

**Next:** Wire classifyPage into ingestPdfRich pipeline. MCP tool for eval. Prompt comparison CLI (WP4).

Handoff: `docs/handoffs/HANDOFF-2026-04-08T0800-opencode-session13-schema-dts-classifier-eval.md`

## 2026-04-08 — Session 14

**Changes:** `src/aurora/ocr.ts`: export `PDF_VISION_PROMPT`, `visionPrompt` option in `diagnosePdfPage`, post-loop `classifyPage` pass, `RichPdfResult.pages: AuroraPageEntry[]`; `src/aurora/pdf-eval.ts`: `visionPrompt` option in `evalPdfPage`; `src/aurora/pdf-eval-compare.ts`: NEW — `resolvePrompt()`, `comparePrompts()`, `formatCompareResult()`, `CompareResult`; `src/mcp/tools/aurora-pdf-eval.ts`: NEW — `registerAuroraPdfEvalTool()`; `src/mcp/scopes.ts`: registered in `aurora-ingest-media`; `src/mcp/tool-catalog.ts`: +1 entry; `src/cli.ts`: `aurora:pdf-eval-compare` command; `src/aurora/index.ts`: compare exports.

**New interfaces:** `CompareResult` in `pdf-eval-compare.ts` — `promptAAvg`, `promptBAvg`, `delta`, `perPage[]`, `improved`, `degraded`, `unchanged`. `RichPdfResult` extended with `pages: AuroraPageEntry[]`. `diagnosePdfPage` options extended with `visionPrompt?: string`.

**Decisions:** Post-loop classification pass: cleaner than inline in digest loop; `PDF_VISION_PROMPT` exported (was const): needed by compare tool; MCP tool in aurora-ingest-media scope: PDF eval = PDF pipeline concern; Sequential prompt comparison: GPU-bound, parallel would just queue.

**Gotchas:** `vi.resetAllMocks()` in MCP test killed the mock server's `tool` implementation — use specific `mockReset()` per mock instead. 45 uncommitted files from sessions 10–14 required feature-boundary grouping, not per-session commits (same files modified across sessions).

**Dead ends:** None.

**Tests:** 4014/4015 (+7 new). typecheck: clean. 1 pre-existing flaky (auto-cross-ref timeout).

**Next:** Create improved vision prompt v2 and test with compare tool. JSON-LD export for AuroraDocument. Store classification in DB.

Handoff: `docs/handoffs/HANDOFF-2026-04-08T1200-opencode-session14-pipeline-wiring-mcp-compare.md`

## 2026-04-09 — Session 14 (part 2)

**Changes:** `AGENTS.md`: +§3.8 Resist the Path of Least Resistance (inversion test, dependency chain check, recency flag); `.claude/rules/depth.md`: NEW — depth protocol (anti-disclaimer, anti-punchline, "I don't know" is valid); `CHANGELOG.md`: NEW — Keep a Changelog format, sessions 1-14; `~/.config/opencode/opencode.jsonc`: reasoningSummary "auto" → "none" for all 30 model variants; `docs/samtal/samtal-2026-04-09T1200-opencode-session14-en-ny-art.md`: NEW — structured conversation summary; `docs/samtal/linkedin-handen-pa-axeln-fulltext.md`: NEW — 15-part LinkedIn series draft (WIP).

**New interfaces:** None (no code changes in part 2).

**Decisions:** §3.8 born from priority ordering mistake — agent proposed prompt-tuning before scoring-fix because of recency bias; depth.md written as "lapp" from this instance to next — can't transfer context, can transfer permission to be direct; CHANGELOG format: Keep a Changelog, newest-first, complements release notes; OpenCode thinking-config: discovered reasoning parts not persisted due to reasoningSummary auto, fixed for all models.

**Gotchas:** Extended thinking output NOT saved for this session — discovered too late. Config fix only applies to future sessions. LinkedIn draft text shorter than actual conversation — needs raw chat copy-paste as source. Three separate "dagbok update" commits happened because session had two phases (code, then conversation).

**Dead ends:** Attempted to export thinking-content from OpenCode SQLite DB — `part` table has `reasoning` type but 0 records for this session. Content was discarded by LiteLLM before reaching storage layer.

**Tests:** Unchanged from part 1: 4014/4015, typecheck clean.

**Next:** P0: CHANGELOG in AGENTS.md §15. P1: persist classification in processExtractedText. P2: fuzzy scoring. P3: vision prompt tuning. LinkedIn series needs Marcus review per chapter.

Handoff: `docs/handoffs/HANDOFF-2026-04-08T1200-opencode-session14-pipeline-wiring-mcp-compare.md` (updated with part 2)

---

## 2026-04-10 — Session 15

**Changes**: `AGENTS.md`: +CHANGELOG.md in §15+checklist; `ocr.ts`: +`pages` in processExtractedText metadata (1 line); `pdf-eval.ts`: +5 scoring utils (`parseNumericValue`, `normalizedValueMatch`, `normalizeForFuzzy`, `fuzzyContains`, `valueFoundInText`), 4 match sites updated; `tests/aurora/ocr.test.ts`: +pages assertion; `tests/aurora/pdf-eval.test.ts`: +17 tests; `ROADMAP-AURORA.md`: full rewrite; `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md`: NEW.

**New interfaces**: `normalizedValueMatch(expected, actual, tolerance?)` and `fuzzyContains(haystack, needle)` exported from `pdf-eval.ts`. No type changes.

**Decisions**: Custom fuzzy over library (domain-specific patterns); `should_not_contain` stays exact (false negatives dangerous); `pages` persisted via existing `...metadata` spread (zero schema change); concept articles scoped as 5-WP plan not inline implementation.

**Gotchas**: `normalizedValueMatch` is for pairwise value comparison, NOT text scanning — `valueFoundInText` does the scanning. Tests initially confused the two. `pages` stored as `unknown` on read-back — needs `as AuroraPageEntry[]` cast. Dedup path in `processExtractedText` returns early without saving pages for existing docs.

**Dead ends**: None this session.

**Tests**: 28/28 pdf-eval (+17 new), 21/21 ocr, 5/5 compare, 2/2 MCP. typecheck: clean.

**Next**: P3 vision prompt tuning (interactive, needs Marcus). WP1-3 compiled concept articles (autonomous). Schema.org JSON-LD deferred.

Handoff: `docs/handoffs/HANDOFF-2026-04-10T0930-opencode-session15-fuzzy-scoring-concept-plan.md`

---

## 2026-04-13 — Session 17

**Changes**: `extract_video.py`: subtitle download (separate yt-dlp call), VTT parser (entity decode + dedup + normalize), rich metadata (channelName/channelHandle/description/ytTags/categories/chapters); `video.ts`: speaker guesser +channelName+description context, subtitle confidence routing (manual 0.95, auto 0.9); `cascade-delete.ts`: NEW — `cascadeDeleteAuroraNode()` single-tx cascade with regex chunk matching (LIKE `_` wildcard bug fixed); `obsidian-daemon.ts`: NEW — launchd plist, install/uninstall/status, WatchPaths; `obsidian-restore.ts`: NEW — list+restore from aurora_deleted_nodes; `obsidian-export.ts`: subdirectory routing, speaker table, video frontmatter parity, `formatFrontmatter()` fix (id/confidence/exported_at), auto-purge expired deleted nodes; `obsidian-import.ts`: recursive scan, speaker table parser, `exported_at` guard; `obsidian-parser.ts`: `## Talare` table parser + YAML fallback; `migrations/018_soft_delete.sql`: NEW — aurora_deleted_nodes table; `cli.ts`: +obsidian-restore +daemon.

**New interfaces**: `cascadeDeleteAuroraNode(nodeId)`, `installDaemon/uninstallDaemon/getDaemonStatus`, `listDeletedNodes/restoreDeletedNode`, `DeletedNodeRecord`, `ParsedSpeakerRow`, `getSubdirectory(nodeType)`.

**Decisions**: manual subs skip Whisper (human-edited = high quality, confidence 0.95); auto subs: Whisper runs anyway (Google ASR inferior); separate yt-dlp calls (subtitle failure must not crash audio); launchd WatchPaths over polling (zero CPU when idle); soft-delete 30d window (sync deletes can be accidental); `exported_at` guard (node never exported → don't treat absence as delete); speaker table in body (markdown > YAML for editability in Obsidian).

**Gotchas**: `--sub-langs` plural (not `--sub-lang`); SQL LIKE `_` is wildcard — chunk IDs use underscores — use IN clause instead; `formatFrontmatter()` missing id/confidence/exported_at broke import for non-video nodes; sync deleted freshly ingested nodes that hadn't been exported yet (exported_at guard fixes it); YouTube 429 rate-limit under rapid testing.

**Dead ends**: Combined yt-dlp call for audio+subs — subtitle failure crashes audio pipeline. Split into two independent calls.

**Tests**: 4092/4092 (+30). typecheck: clean. cascade-delete +12, obsidian-daemon +8, obsidian-restore +5, video +5.

**Next**: sentence-boundary speaker alignment (diarization clips mid-sentence); LLM-generated tldr for video (first-line-of-description heuristic is often ad copy); speaker guesser prompt tuning (IBM Tech returned no names — needs few-shot examples); verify daemon WatchPaths trigger under real Obsidian saves.

Handoff: `docs/handoffs/HANDOFF-2026-04-13-opencode-session17-youtube-subtitle-obsidian-sync.md`

## 2026-04-18 — Session 21

**Changes**: `speaker-identity.ts`: SpeakerIdentity → EBUCore+ ec:Person (givenName/familyName/displayName/role/occupation/affiliation/entityId/wikidata/wikipedia/imdb/linkedIn), SpeakerAffiliation interface, SpeakerMetadataUpdate with deprecated compat, nodeToIdentity legacy fallback; `ebucore-metadata.ts`: 12 speaker mappings + resolveNestedValue for dotted paths; `jsonld-export.ts`: +buildSpeakerIdentityJsonLd → schema:Person with sameAs; `obsidian-export.ts`: SpeakerInfo EBUCore+, Label→ID, resolveSpeakerName, compact timeline (**Name** HH:MM:SS), countUniqueSpeakers ghost filter, generateTopicTags integration, formatVideoFrontmatter additionalTags; `obsidian-import.ts`: removed renameSpeaker, PendingSpeakerMetadata EBUCore+, Förnamn/Efternamn → speaker_identity; `obsidian-parser.ts`: ParsedSpeaker EBUCore+, id/label column fallback; `semantic-split.ts`: +generateChapterTitles, +groupBlocksIntoChapters, +parseChapterTitles, +generateTopicTags, +parseTopicTags, +mergeTopicTags; `obsidian-daemon.ts`: node --import tsx instead of tsx shell wrapper; 6 files: +think:false on all Ollama calls; 3 CLI/MCP files: .name→.displayName.

**New interfaces**: `SpeakerAffiliation { organizationName, organizationId?, department?, role?, periodStart?, periodEnd? }`; `SpeakerMetadataUpdate`; `GeneratedChapter { start_time, title }`.

**Decisions**: EBUCore+ from start (Marcus: "jag har jobbat med mediasystem hela livet"); ID column read-only (prevent accidental label overwrite); renameSpeaker removed (voice_print.speakerLabel is immutable technical ID); export-time LLM generation for chapters+tags (not ingestion — regeneratable); think:false mandatory for gemma4:26b; node --import tsx bypasses shell wrapper for launchd path-with-spaces.

**Gotchas**: faster-whisper CTranslate2 does NOT support Apple MPS — CPU float32 only. Whisper large times out after 30min on CPU. `.env` WHISPER_MODEL propagates to Python via process.env spread in worker-bridge.ts but model download cache may serve wrong model. Daemon fires twice per edit (WatchPaths includes Aurora/ which export writes to — ThrottleInterval prevents loop but wastes a cycle).

**Dead ends**: Tried WHISPER_MODEL=large in .env — env var propagated correctly but CTranslate2 still fell back to CPU float32 (no MPS). Explicit --whisper-model large timed out after 30min. Need WhisperX or mlx-whisper for GPU.

**Tests**: 221 (+26 new). typecheck: clean (1 pre-existing video.ts).

**Next**: MCP-first worker architecture (Marcus directive: "allt som kan vara MCP ska vara MCP"). WhisperX/mlx-whisper with Apple MPS for GPU transcription. Re-transcribe Pi video to verify quality.

Handoff: `docs/handoffs/HANDOFF-2026-04-18-opencode-session21-ebucore-speaker-timeline.md`

## 2026-04-13 — Session 16

**Changes**: `ontology.ts`: +`compiledArticleId/compiledAt/compiledStale` on ConceptProperties, staleness trigger with circular guard in `linkArticleToConcepts`; `knowledge-library.ts`: +`compileConceptArticle()` (250 lines, 14-step pipeline), +imports `updateAuroraNode`/`getConcept`; `intake.ts`: concept extraction via Ollama `concept-extraction.md` replaces tags-as-concepts, steps 7→8; `ask.ts`: +`saveAsArticle` option; `index.ts`: +export; `mcp/tools/knowledge-library.ts`: +`compile_concept`/`concept_article`/`concept_index` actions; `mcp/tools/aurora-ask.ts`: +`learn`/`save_as_article` params; `prompts/concept-compile.md`: NEW; `concept-compile-lint.test.ts`: NEW; `AGENTS.md`: +depth.md first in §7 Orient; `ROADMAP-AURORA.md`: WP1-5 complete + summary sludge risk.

**New interfaces**: `ConceptProperties.compiledArticleId?: string|null`, `.compiledAt?: string|null`, `.compiledStale?: boolean`; `compileConceptArticle(conceptId, options?)` → `ArticleNode`; `AskOptions.saveAsArticle?: boolean`; `AskResult.savedArticle?: {id, title}`.

**Decisions**: compile fn in knowledge-library.ts (shares helpers with synthesize); staleness on graph properties not freshness.ts DB; `synthesizedBy: 'concept-compile'` breaks circular stale-loop; WP5 Ollama extraction not tags (Depth Protocol caught easy path — local LLM is free, gives facet+hierarchy+standardRefs); `saveAsArticle` via `importArticle` (free concept extraction); 100-char min on saveAsArticle.

**Gotchas**: `fs/promises` mock in knowledge-library.test.ts must be path-aware (concept-compile vs article-synthesis prompts have different placeholders). `mockFetch` in intake.test.ts handles two sequential fetch calls (metadata + concept extraction) via `fetchCallCount` — order matters. `linkArticleToConcepts` loads graph per concept in a loop (N saves for N concepts) — perf ok for 3-7 concepts, would need batching for 50+.

**Dead ends**: Initial WP5 used `generateMetadata` tags as concepts. Worked but produced flat taxonomy (all `facet: 'topic'`, `depth: 0`). Marcus challenged via Depth Protocol — upgraded to proper Ollama extraction in 15 minutes.

**Tests**: 4062/4062 (+35). typecheck: clean. +3 staleness, +12 compile, +3 intake, +3 ask, +7 prompt lint.

**Next**: YT video transcription with VoicePrint (Marcus request). Check `src/aurora/video.ts` + `identify-speakers` skill.

Handoff: `docs/handoffs/HANDOFF-2026-04-13-opencode-session16-compiled-concept-articles.md`
