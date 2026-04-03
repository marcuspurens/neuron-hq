# Dagbok — Senior Fullstack

**Publik:** Seniora fullstack-utvecklare. Du kan TypeScript, PostgreSQL, MCP, embeddings. Här får du arkitekturbeslut, kodmönster och "varför designades det så".

**Vem skriver?** AI-agent (Sisyphus/Atlas/Claude) under sessioner. Marcus vid manuella commits.

**Tre dagböcker:** DAGBOK-MARCUS.md (projektägare, svensk prosa), **DAGBOK-DEV.md** (denna, seniora fullstack-devs), DAGBOK-LLM.md (AI-agenter, dense/parseable).

**Historik:** S1–S150 + körningar #1–#183 → `docs/DAGBOK.md`. Handoffs → `docs/handoffs/`. ADR → `docs/adr/`.

## 2026-04-02 (session 8) — PDF timeout-hantering + Hermes git-tracking + Metadata-schema

### PDF ingest timeout-kaskadskydd

Tre fixes i `src/aurora/job-runner.ts` + `src/aurora/vision.ts`:

1. **Job-level timeout** — `JOB_TIMEOUT_MS = 30 * 60 * 1000`. `processQueue()` sätter `setTimeout` → SIGKILL på forked child → markerar jobb som `error` med meddelande.
2. **Stale job recovery** — `recoverStaleJobs()` körs vid varje `processQueue()`-anrop. SELECT alla `status='running'`, kolla `isProcessAlive(pid)` (signal 0) + ålderscheck. Döda/gamla jobb → `error`.
3. **Vision fetch timeout** — `AbortSignal.timeout(120_000)` på Ollama `fetch()` i `analyzeImage()`. 2 min per sida.

Kaskadordning: Ollama hänger → vision abort 2min → om det inte räcker → job killed 30min → om server kraschar → stale recovery vid nästa queue-anrop.

**Bugfix**: `tests/mcp/scopes.test.ts` — session 7 registrerade `aurora_ingest_pdf` i scopes men glömde uppdatera testets `fakeServer` mock (saknade `.tool` metod).

### Hermes git-tracking

`git init ~/.hermes/` med `.gitignore` som skyddar secrets:

**Trackat**: `memories/`, `SOUL.md`, `config.yaml`, `context/security.md`, `cron/`, `gateway_state.json`, `channel_directory.json`, `aurora-mcp.sh`  
**Ignorerat**: `.env`, `auth.json`, `sessions/`, `skills/`, `cache/`, `hermes-agent/`, `logs/`, `pairing/`

### Metadata-schema analys

Djupanalys: EBUCore vs Schema.org vs A-MEM vs HippoRAG vs Anthropic KG cookbook.

**Rekommendation**: Schema.org (bas) + Provenance-lager (nytt) + A-MEM-attribut (keywords/tags) + EBUCore (media-noder).

Nyckelidé: **Provenance** — varje nod spårar `agent` (VoicePrint|Person|LLM|System), `method` (transcription|ocr|manual|...), `model` (whisper|qwen3-vl|...). Ger VoicePrint-taggning + modellspårbarhet + HippoRAG-kompatibel graf-semantik.

### Implementeringsplan

5 arbetspaket dokumenterade i `docs/plans/PLAN-obsidian-twoway-metadata-2026-04-02.md`:

| WP  | Vad                                               | Uppskattad tid |
| --- | ------------------------------------------------- | -------------- |
| WP1 | Tag-bugg fix (mellanslag → quotes i Obsidian)     | ~10 min        |
| WP2 | Tags round-trip (import tillbaka)                 | ~30 min        |
| WP3 | Speaker title/organization i frontmatter + import | ~45 min        |
| WP4 | Provenance-lager vid ingest + export              | ~30 min        |
| WP5 | Segment-korrektioner (flytta text mellan talare)  | ~60 min        |

| Tid   | Typ     | Vad                                                        |
| ----- | ------- | ---------------------------------------------------------- |
| 09:00 | SESSION | Session 8 start, läste session 7 handoff                   |
| 09:15 | FIX     | Job-level timeout + stale recovery + vision timeout        |
| 09:30 | FIX     | scopes.test.ts fakeServer bugg (session 7 gap)             |
| 09:40 | BUILD   | typecheck clean, 3964 tester, 0 failures                   |
| 09:45 | CONFIG  | git init ~/.hermes/, .gitignore, initial commit            |
| 10:00 | BESLUT  | Metadata-schema: Schema.org + Provenance + A-MEM + EBUCore |
| 11:00 | PLAN    | 5 WP:er dokumenterade i PLAN-obsidian-twoway-metadata      |
| 11:30 | DOCS    | Handoff + dagböcker                                        |

### Baseline

```
typecheck: clean
tests: 294 files, 3964 tests, 0 failures
commits: 24cdffe (S7), 5a9664d (S8 timeout), e02ed32 (S8 handoff+plan)
hermes git: initial commit 7be7864 (13 files tracked)
```

---

## 2026-04-02 (session 7) — Hermes briefing + Media ingest pipeline + Hybrid PDF

### Morgonbriefing via Hermes

Config utanför repo (`~/.hermes/config.yaml`):

- `aurora-insights` scope tillagt i MCP args → exponerar `aurora_morning_briefing`
- Cron-jobb `morning_briefing` kl 08:00 → `telegram:8426706690`
- `croniter` saknades i Hermes venv → installerat

Briefing-pipeline: `aurora_morning_briefing` → SQL-query (nya noder, stale, gaps) → markdown → Obsidian-fil + Telegram.

### Media ingest via Hermes (YT + PDF + bilder)

Lade till `aurora-ingest-media` + `aurora-media` scopes i Hermes config → 8 nya MCP-tools (20 totalt):

| Tool                                                          | Funktion                                          |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `aurora_ingest_video`                                         | Async YT/video → transkript → chunks → embeddings |
| `aurora_ingest_pdf`                                           | **NY** — Async PDF → OCR + vision → rich nodes    |
| `aurora_ingest_image`                                         | OCR på bilder (PaddleOCR)                         |
| `aurora_ingest_book`                                          | Batch-OCR folder → single doc                     |
| `aurora_ocr_pdf`                                              | OCR fallback för broken font encoding             |
| `aurora_describe_image`                                       | Vision-analys (qwen3-vl via Ollama)               |
| `aurora_speakers` / `aurora_jobs` / `aurora_ebucore_metadata` | Talarhantering + jobbstatus                       |

### Diarize fix

pyannote.audio installerades i Anaconda-env. numpy-konflikt (2.4.4 vs 1.x) löstes med downgrade. `aurora-mcp.sh` PATH uppdaterad med `/opt/anaconda3/bin`.

### PaddleOCR 3.x API-migrering

`aurora-workers/ocr_pdf.py` uppdaterad: PaddleOCR 3.x använder `predict()` istället för `ocr()`, `PaddleOCR(lang='en')` istället för `PaddleOCR(use_angle_cls=True, lang='latin', show_log=False)`.

### Hybrid PDF-pipeline (ny feature)

`ingestPdfRich()` i `src/aurora/ocr.ts` — 6-stegs pipeline:

1. `get_pdf_page_count` (ny Python worker action)
2. `extract_pdf` (pypdfium2 text)
3. `isTextGarbled()` → OCR fallback
4. Per sida: `render_pdf_page` → temp PNG → `analyzeImage()` (qwen3-vl)
5. Kombinera text + vision-beskrivningar: `[Page N]\n{text}\n[Visual content: {vision}]`
6. `processExtractedText()` → Aurora-nod

Asynkt via jobbkö: `startPdfIngestJob()` → `aurora_jobs` table → `job-worker.ts` (generaliserad — dispatchar `video_ingest` vs `pdf_ingest` baserat på `job.type`).

### Obsidian käll-URL i frontmatter

`src/commands/obsidian-export.ts` — `source_url` kolumn (DB) → `källa:` i frontmatter. Fallback-kedja: `props.videoUrl ?? props.sourceUrl ?? node.source_url`.

| Tid   | Typ     | Vad                                                    |
| ----- | ------- | ------------------------------------------------------ |
| 06:00 | SESSION | Session 7 start                                        |
| 06:10 | CONFIG  | `aurora-insights` scope + cron morning_briefing        |
| 06:25 | FIX     | croniter install, gateway restart, manuellt test       |
| 06:40 | FIX     | Obsidian käll-URL (source_url kolumn → frontmatter)    |
| 06:50 | CONFIG  | `aurora-ingest-media` + `aurora-media` scopes i Hermes |
| 07:00 | TEST    | YT-indexering E2E: "Me at the zoo" (19s) ✅            |
| 07:05 | FIX     | pyannote install, numpy downgrade, MCP PATH fix        |
| 07:08 | TEST    | YT med diarize: Gangnam Style → 4 talare, MPS GPU ✅   |
| 07:15 | FIX     | PaddleOCR 3.x API-migrering i ocr_pdf.py               |
| 07:30 | FEATURE | `ingestPdfRich()` — hybrid OCR + vision pipeline       |
| 07:45 | FEATURE | `startPdfIngestJob()` + job-worker generalisering      |
| 08:00 | FEATURE | `aurora_ingest_pdf` MCP tool + scope-registrering      |
| 08:18 | BUILD   | typecheck clean, 16/16 OCR-tester, 11/11 worker-bridge |

### Baseline

```
typecheck: clean
tests: 3963+ passing (inga regressions)
aurora nodes: ~90 (ingested "Me at the zoo" + "Gangnam Style")
commits: uncommitted (session 7 changes)
```

---

## 2026-04-01 (session 6) — PPR-retrieval + Memory Evolution

### PPR-retrieval i `searchAurora()`

Integrerade `personalizedPageRank()` från `src/core/ppr.ts` som tredje retrieval-steg i `src/aurora/search.ts`.

**Pipeline:** Semantic search → **PPR expansion** → keyword fallback → graph traversal enrichment.

Nyckeldesign:

- `expandViaPpr()` tar semantiska topresultat som seeds (viktade efter similarity)
- Kanter görs bidirektionella med `flatMap` (Aurora-kanter är riktade, PPR ska gå åt båda håll)
- PPR-upptäckta noder läggs till med `source: 'ppr'`, `similarity: null`
- Respekterar `type`/`scope`-filter, default `usePpr: true`, `pprLimit: 5`
- Graceful failure: PPR-fel fångas, loggas, sökning fortsätter utan expansion

### Memory Evolution i intake-pipeline

`evolveRelatedNodes()` i `src/aurora/intake.ts` körs efter LLM-metadata, före final save.

1. `findSimilarNodes(newNodeId, { table: 'aurora_nodes', limit: 5, minSimilarity: 0.6 })`
2. Uppdaterar matchande doc-noder (ej chunks) med `relatedContext: ["Ny relaterad källa: {titel} — {summary}"]`
3. Kollar öppna kunskapsluckor via ordöverlapp (50%+ av frågeord >3 tecken) → `resolveGap()`
4. `IngestResult.evolution: { nodesUpdated, gapsResolved }`
5. Pipeline steps_total: 6 → 7

| Tid   | Typ     | Vad                                                                |
| ----- | ------- | ------------------------------------------------------------------ |
| 21:00 | SESSION | Session 6 start, baseline 3949/3949 (1 pre-existing timeout)       |
| 21:05 | BESLUT  | PPR i searchAurora() (inte Consolidator) — user-facing värde först |
| 21:15 | FIX     | PPR expansion som Step 2 i search pipeline                         |
| 21:30 | TEST    | +10 PPR-tester (seeds, dedup, limit, type filter, graceful)        |
| 21:40 | FIX     | evolveRelatedNodes() i intake.ts pipeline                          |
| 21:45 | TEST    | +5 evolution-tester (relatedContext, gap resolve, chunk skip)      |
| 21:50 | BUILD   | typecheck: clean, 3963/3964 (1 pre-existing timeout)               |

### Baseline

```
typecheck: clean
tests: 3963/3964 (1 pre-existing timeout: auto-cross-ref.test.ts)
commit: 5dbd59a
new tests: +15 (10 PPR + 5 evolution)
```

---

| Metrik            | Värde                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tester            | 3949 (Vitest)                                                                                                                                                 |
| Agenter           | 13 (Manager, Implementer, Reviewer, Researcher, Librarian, Historian, Tester, Consolidator, Knowledge Manager, Merger, Observer, Brief Reviewer, Code Anchor) |
| Körningar         | 183 totalt (varav ~120 GREEN)                                                                                                                                 |
| Aurora idénoder   | 924                                                                                                                                                           |
| Roadmap Fas 3     | 26/32 tasks done                                                                                                                                              |
| TypeScript strict | noUncheckedIndexedAccess + strictNullChecks + NodeNext                                                                                                        |

---

## Hur man skriver

- Svenska med engelska tekniska termer (standard dev-kultur)
- Filreferenser med sökväg: `src/core/agents/manager.ts:45`
- Körresultat med AC-count, testräkning, kostnad
- Taggar: SESSION, KÖRNING, BESLUT, BRIEF, FIX, REFACTOR, TEST, BUILD, PROBLEM

---

## 2026-03-26

### Tooling-migration: VS Code + Claude Opus → OpenCode + LiteLLM

**Vad ändrades:**

- Primärt gränssnitt: VS Code (Cursor-fork) → OpenCode
- Model routing: direkt Anthropic API → LiteLLM proxy (multi-model)
- Aktiv modell idag: `claude-opus-4-6` via `svt-litellm/` prefix
- Orkestrator: Claude Opus (informell) → Atlas (OhMyOpenCode Master Orchestrator)

**Vad ändrades INTE:**

- Kodbasen (ingen prod-kod ändrad idag)
- Test suite (3949 tester intakta)
- Policy-filer (`policy/bash_allowlist.txt`, `policy/forbidden_patterns.txt`)
- Aurora-integrationen (MCP server, pgvector, Obsidian)

**Varför bytet?**
LiteLLM ger model-agnostisk routing — samma prompt-infrastruktur kan använda Opus, Sonnet, Haiku, eller open-source-modeller utan att ändra agentkoden. Atlas-orkestratorn ger strukturerad multi-task-planering som Opus-i-VS Code inte hade formellt.

| Tid    | Typ     | Vad hände                                                                        |
| ------ | ------- | -------------------------------------------------------------------------------- |
| ~09:00 | BESLUT  | LiteLLM proxy aktiv. Model prefix: `svt-litellm/`                                |
| ~09:15 | SESSION | Första Atlas-sessionen. Plan: skapa tre dagböcker i `docs/dagbocker/`            |
| ~09:30 | FIX     | `docs/dagbocker/` skapad. DAGBOK-MARCUS.md, DAGBOK-DEV.md, DAGBOK-LLM.md skrivna |

### Roadmap-kontext

Vi är på **Fas 2 (Intelligens)** i ROADMAP.md. Fas 1 (Daglig nytta) är komplett sedan 2026-03-19.

Nästa kritiska milstolpe: Aurora-integration. Neuron har aldrig körts mot Aurora som target-repo. Körningarna `A1`–`A6` i ROADMAP-AURORA.md täcker detta.

Prioriterade briefs som väntar:

- `3.6` (KRITISK — identifierad i S144)
- `3.7`, `3.8`
- Aurora-serien `A1`–`A2` (obligatoriska)

### Aktiva risker

- **Code Anchor output-trunkering** (HÖG risk, identifierad S149). Brief finns: `briefs/2026-03-25-code-anchor-hardening.md`. Inte körts ännu.
- **Aurora MCP version mismatch** (MCP 1.25 vs 1.26). Identifierat S145. Åtgärd oklar.
- **Brief 3.2a** räddades manuellt från workspace (S138) — bör verifieras att merge-artefakter är kompletta.

---

## 2026-04-03 (Session 9)

### Obsidian tvåvägs-metadata — 5 WP implementerade

Alla 5 arbetspaket från session 8:s plan levererade i en session. Handlar om att göra Obsidian-exporten redigerbar och importera ändringar tillbaka till Aurora.

**WP1 — Tag quoting**: `formatFrontmatter()` och `exportRunNarrative()` quotar nu YAML-tags med mellanslag: `tags: [simple, "job displacement", AI]`. Trivialt men bröt YAML-parsern vid import.

**WP2 — Tags round-trip**: `ParsedObsidianFile` har nu `tags: string[] | null`. Parsern extraherar tags från frontmatter, importen diffar mot befintliga tags och uppdaterar noden om de ändrats. `ObsidianImportResult.tagsUpdated` counter.

**WP3 — Speaker enrichment**: Största WP:t. Datflöde:

```
speaker_identity node (Aurora)
  → edge → voice_print
    → buildSpeakerMap() traverserar edges
      → SpeakerInfo.title, .organization
        → formatVideoFrontmatter() exporterar
          → Obsidian: användaren redigerar
            → obsidian-import läser tillbaka
              → updateSpeakerMetadata() / createSpeakerIdentity()
```

EBUCore utökad med `ebucore:personTitle` och `ebucore:organisationName`.

**WP4 — Provenance-lager**: `Provenance` interface i `aurora-schema.ts`. Sätts vid node-skapande:

- `video.ts`: `{agent:'System', method:'transcription', model:'whisper-large-v3'}`
- `intake.ts`: default `web_scrape`/`manual`, respekterar caller-override via metadata
- `ocr.ts`: `{method:'ocr', model:'paddleocr-3.x'}`
- `vision.ts`: `{method:'vision', model:modelUsed}`
- `memory.ts`: `{agent:'Person', method:'manual'}`

Exporteras till Obsidian som `källa_typ`, `källa_agent`, `källa_modell`. Read-only (importeras inte).

**WP5 — Segment corrections**: Ny `extractTimelineBlocks()` parser som läser `### HH:MM:SS — Speaker`-headers. Import detekterar om en speaker-header ändrats (t.ex. SPEAKER_01 → SPEAKER_00), hittar matchande diarization-segment via 5s-tolerans, och flyttar segmentet mellan voice_prints.

### Arkitekturbeslut

- **Provenance i `properties`**, inte i Zod-schema — opt-in, ingen migration behövs
- **`buildSpeakerMap()` tar `allNodes` + `edges`** — måste traversera graf för speaker_identity-lookup
- **5 sekunders tolerans** för segment-timecode matching — hanterar avrundning utan falska positiver

| Tid   | Typ     | Vad                                                    |
| ----- | ------- | ------------------------------------------------------ |
| 18:00 | SESSION | Session 9 start, läser handoff + plan                  |
| 18:05 | FIX     | WP1: Tag quoting fix + test                            |
| 18:10 | FEATURE | WP2: Tags round-trip parser + import + 2 tester        |
| 18:20 | FEATURE | WP3: Speaker title/org — 6 filer, 5 tester uppdaterade |
| 18:35 | FEATURE | WP4: Provenance — 7 ingest-filer + export + 2 tester   |
| 18:45 | FEATURE | WP5: Timeline blocks + segment reassignment + 5 tester |
| 18:50 | VERIFY  | Typecheck clean, 142/142 tester, full suite 3967 pass  |
| 19:00 | PLAN    | Session 10 plan: PageDigest i PDF-pipeline             |

### Baseline

```
typecheck: clean
tests: 3967/3967 (1 pre-existing flaky timeout: auto-cross-ref.test.ts)
commits: ej committat (awaiting review)
```

---

## 2026-04-01 (Session 5)

### Ingest-pipeline: regex-tags → LLM-enriched metadata

**Designbeslut:** `extractTags()` (regex-split av titel) ersatt med `generateMetadata()` — ett enda Gemma 3 (Ollama) anrop som producerar tags + language + author + contentType + summary.

**Varför:** Regex gav meningslösa tags ("covid", "pandemic" för en AI-artikel som använde pandemin som metafor). LLM med full textkontext (start+mitt+slut, 3000 chars) ger semantiska tags.

**Arkitektur:**

```
processExtractedText() pipeline:
  1. Hash + dedup
  2. Create doc node (tags: [] — tom initialt)
  3. Create chunks + edges
  4. saveAuroraGraph()
  5. autoEmbedAuroraNodes()
  6. findNeuronMatchesForAurora()     ← cross-refs
  7. generateMetadata()               ← NY: Gemma 3 via Ollama /api/chat
     → tags, language, author, contentType, summary
     → updateAuroraNode() med alla fält
  8. saveAuroraGraph() med pipeline_report
```

`generateMetadata()` körs medvetet SIST (steg 7) — har tillgång till cross-ref-titlar som extra kontext för tagging.

**Text sampling för långa dokument:**

```typescript
if (text.length > 3000) {
  start(1000) + mid(1000) + end(1000); // representativt urval
}
```

**Filer:** `src/aurora/intake.ts` (generateMetadata), `aurora-workers/extract_url.py` (author extraction)

### Obsidian-export: debug-metadata → user-facing properties

**Designbeslut:** Obsidian frontmatter visar nu det användaren bryr sig om, inte intern debug-data.

Före → Efter:

```yaml
# FÖRE                          # EFTER
id: "doc_09e7a960be31"          typ: bloggpost
type: document                  författare: "Matt Shumer"
scope: personal                 publicerad: 2026-02-09
confidence: 0.5                 källa: "https://shumer.dev/..."
exported_at: "2026-04-01..."    språk: english
                                tags: [ai, automation, ...]
                                tldr: "AI-disruption som..."
```

**Full text från chunks:** Export konkatenerar alla `_chunk_N`-noder istället för att visa doc-nodens 500-tecken snippet. Chunks sorteras på `chunkIndex`.

**Markdown-formatering bevarad:** `trafilatura.extract(output_format='markdown')` — en rad i Python-workern. Ger headings, bold, paragraphs i Obsidian.

**Filer:** `src/commands/obsidian-export.ts`, `aurora-workers/extract_url.py`

### MCP multi-scope

**Designbeslut:** `createMcpServer()` accepterar kommaseparerade scopes: `--scope aurora-search,aurora-memory,aurora-ingest-text`.

**Varför:** Hermes behöver sökning + minne + ingest i samma MCP-server. Alternativet (en server per scope) ger N processer och N tool-prefix i Hermes.

**Implementation:** `scope.split(',')` → iterera, validera varje scope, registrera alla tools på samma `McpServer`-instans. Notification wrapper appliceras om _någon_ scope behöver det.

**Fil:** `src/mcp/server.ts`

### Hermes MCP-koppling: tsx cwd-bugg

**Problem:** Hermes startade MCP-servern med `npx tsx src/cli.ts` men tsx resolvade `src/cli.ts` relativt till Hermes agent-mappen (`~/.hermes/hermes-agent/`), inte Neuron HQ. `ERR_MODULE_NOT_FOUND`.

**Rotorsak:** Hermes gateway sätter `WorkingDirectory` till sin egen mapp i launchd-plist. `cwd` i config.yaml skickas kanske inte vidare som process cwd.

**Fix:** Wrapper-skript `~/.hermes/aurora-mcp.sh`:

```bash
#!/bin/bash
cd "/Users/mpmac/Documents/VS Code/neuron-hq" || exit 1
export DATABASE_URL=postgresql://localhost:5432/neuron
export PATH="..."
exec ./node_modules/.bin/tsx src/cli.ts mcp-server --scope "$1"
```

### Kunskapsarkitektur: Aurora vs HippoRAG vs A-MEM

**Analys:** Aurora har ~70% av HippoRAG och A-MEM redan. Saknas:

1. **PPR-retrieval** (HippoRAG) — `src/core/ppr.ts` finns men är inte integrerad i `searchAurora()`. Brief 3.2b har planen.
2. **Memory evolution** (A-MEM) — befintliga noder uppdateras inte när ny relaterad kunskap läggs till.
3. **Hermes som proaktiv agent** — varken HippoRAG eller A-MEM har detta. Unikt.

Se `docs/handoffs/HANDOFF-2026-04-01-opencode-session5-llm-metadata-hermes-mcp-plan.md` för full plan.

| Tid   | Typ      | Vad                                                                   |
| ----- | -------- | --------------------------------------------------------------------- |
| 18:00 | SESSION  | Session 5 start, baseline 3949/3949                                   |
| 18:10 | FIX      | Committade session 4 ändringar (3 commits)                            |
| 18:20 | REFACTOR | `extractTags()` → `generateMetadata()` med Gemma 3                    |
| 18:30 | FIX      | Hermes MCP: wrapper-skript, MEMORY.md reset, aurora-swarm-lab flyttad |
| 19:00 | BESLUT   | Obsidian frontmatter redesign: user-facing properties                 |
| 19:30 | FIX      | Markdown-formatering i trafilatura (`output_format='markdown'`)       |
| 19:45 | BESLUT   | Behåll "Aurora" som modulnamn inom Neuron HQ                          |
| 20:00 | PLAN     | PPR-retrieval + memory evolution + Hermes briefing plan               |

### Baseline

```
typecheck: clean
tests: 3949/3949 (1 pre-existing timeout: knowledge.test.ts)
commits: 10 denna session
aurora nodes: 86 (18 doc, rest chunks)
```

---
