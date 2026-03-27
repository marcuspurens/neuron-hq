# Neuron HQ — Komplett kodanalys 2026-03-26

> Genererad: 2026-03-26 · Session 150+  
> Syfte: Beslutsunderlag för nästa fas — Aurora i daglig drift

---

## A. Sammanfattning (för Marcus)

Neuron HQ är ett kontrollplan för autonoma agentsvärmar som utvecklar andra kodrepositories. Du skriver ett brief på svenska, startar en körning, och ett team av AI-agenter implementerar, granskar och committar kod i ett targetrepo medan du gör annat.

Aurora är systemets "second brain" — en personlig kunskapsbas byggd ovanpå en grafdatabas med vektorsökning. Du matar in YouTube-videor, PDF-filer och webbsidor; Aurora transkriberar, chunkar, embeddar och lagrar allt i ett kunskapsgraf. Sen kan du ställa frågor på svenska och få svar med källhänvisningar.

**Var vi är just nu (2026-03-26):** Roadmappen har 26 av 32 tasks klara. Fas 1 (Daglig nytta) är komplett. Fas 2 (Intelligens) är 10 av 11 klar. Fas 3 (Agent-mognad) är 9 av 13 klar. Fas 4 (Produkt) har inte börjat.

**Vad som fungerar idag:** Du kan mata in en YouTube-video via `aurora:ingest-video`, ställa en fråga med `aurora:ask`, exportera till Obsidian och köra morgon-briefing. Alla 3949 tester passerar. 44 MCP-tools registrerade.

**Största blockeraren för daglig Aurora-användning:** Aurora-repot (det separata Python/MCP-repot, inte Neuron HQ) har trasiga tester pga en ocommittad MCP-refaktorering (`server_fastmcp.py`) som bryter mot MCP 1.25/1.26. Det tar 15 minuter att fixa manuellt (B1 i ROADMAP-AURORA.md). Neuron HQ-koden i sig är solid.

---

## B. Systemarkitektur

### Två subsystem

```
Neuron HQ
├── Neuron (agentsvärm)          — kör körningar mot target repos
│   ├── 13 agenter               — Manager, Implementer, Reviewer, ...
│   ├── Policy enforcement       — allowlist, forbidden patterns
│   └── Run lifecycle            — workspace isolation, artifact generation
│
└── Aurora (second brain)        — personlig kunskapsbas
    ├── Ingest pipeline          — URL, YouTube, PDF, OCR, book, image
    ├── Knowledge graph          — aurora_nodes + pgvector embeddings
    ├── GraphRAG / HippoRAG 2    — PPR-baserad grafnavigering
    ├── A-MEM                    — abstraktion + dedup av KG-noder
    └── MCP server               — 44 tools för Claude Desktop
```

### Hur de hänger ihop

- Delad PostgreSQL-databas: `kg_nodes` (Neuron KG) och `aurora_nodes` (Aurora KG)
- Cross-references via `src/aurora/cross-ref.ts` och `src/aurora/crossref.ts`
- Unified search i `src/core/semantic-search.ts` — söker båda graferna
- MCP-servern (`src/mcp/server.ts`) exponerar allt via stdio till Claude Desktop

### Tech stack

| Komponent      | Teknologi                                                        |
| -------------- | ---------------------------------------------------------------- |
| Runtime        | Node.js, TypeScript (strict mode, NodeNext)                      |
| Databas        | PostgreSQL + pgvector (1024-dim embeddings)                      |
| Embeddings     | Ollama, snowflake-arctic-embed, lokalt                           |
| LLM            | Anthropic API (claude-sonnet default, claude-opus for overrides) |
| Python workers | Python 3, yt-dlp, whisper, pyannote, pypdf2, pytesseract         |
| MCP            | @modelcontextprotocol/sdk ^1.27.1                                |
| Observability  | Langfuse ^3.38.6                                                 |
| Test           | Vitest (3949 tester, 294 testfiler)                              |

---

## C. Aurora — Detaljanalys

Aurora-modulen: **38 TypeScript-filer, 11 358 rader kod** (`src/aurora/`).

### C1. Datainmatningspipeline

Koordinerat av `src/aurora/intake.ts` (373 rader). Flödet: extract → chunk → embed → skapa aurora-noder.

**URL-inmatning**

- `src/aurora/intake.ts`: `ingestUrl()` — detekterar om URL är video, annars extract_url
- `aurora-workers/extract_url.py` (45 rader): HTTP fetch + trafilatur-parsing

**YouTube / video**

- `src/aurora/video.ts` (673 rader): `ingestVideo()` — full orkestrering, async job-stöd
- `src/aurora/job-runner.ts` (626 rader): bakgrundsjobb, notifiering när klart
- `src/aurora/job-worker.ts`: worker-process för async jobs
- `aurora-workers/extract_video.py` (90 rader): yt-dlp för nedladdning
- `aurora-workers/transcribe_audio.py` (94 rader): whisper-transcription
- `aurora-workers/diarize_audio.py` (79 rader): pyannote speaker diarization

**PDF**

- `aurora-workers/extract_pdf.py` (43 rader): pypdf2 text extraction
- `aurora-workers/ocr_pdf.py` (78 rader): tesseract OCR fallback
- `src/aurora/ocr.ts`: TypeScript OCR-orkestrerare

**Bilder / OCR**

- `aurora-workers/extract_ocr.py` (68 rader): single image OCR
- `aurora-workers/batch_ocr.py` (111 rader): batch-bearbetning
- `src/commands/aurora-ingest-image.ts`: CLI för bildmatning

**Böcker**

- `src/commands/aurora-ingest-book.ts`: kapitelbaserad inmatning

**Worker-brygga (TS → Python)**

- `src/aurora/worker-bridge.ts`: spawnar Python-workers som subprocesser, skickar JSON

**Textchunkning**

- `src/aurora/chunker.ts`: word-baserad chunkning, konfigurerbar storlek (default 200 ord/chunk, max 100 chunks)

**Saknas i pipeline:** DOCX/XLSX (ROADMAP-AURORA A2), voice-to-brain diktering (A3).

### C2. Kunskapsgrafen

**Två separata grafer:**

| Graf      | Schema                        | Tabell         | Node-typer | Edge-typer |
| --------- | ----------------------------- | -------------- | ---------- | ---------- |
| Aurora KG | `src/aurora/aurora-schema.ts` | `aurora_nodes` | 9          | 9          |
| Neuron KG | `src/core/knowledge-graph.ts` | `kg_nodes`     | 6          | 7          |

**Aurora KG — node-typer** (`src/aurora/aurora-schema.ts`, 61 rader):
`document`, `transcript`, `fact`, `preference`, `research`, `voice_print`, `speaker_identity`, `article`, `concept`

**Aurora KG — edge-typer:**
`related_to`, `derived_from`, `references`, `contradicts`, `supports`, `summarizes`, `supersedes`, `broader_than`, `about`

**Neuron KG — node-typer** (`src/core/knowledge-graph.ts`, 1095 rader):
`pattern`, `error`, `technique`, `run`, `agent`, `idea`

**Neuron KG — edge-typer:**
`solves`, `discovered_in`, `related_to`, `causes`, `used_by`, `inspired_by`, `generalizes`

**Graf-operationer:**

- `src/aurora/aurora-graph.ts` (438 rader): `addAuroraNode()`, `traverseAurora()`, `autoEmbedAuroraNodes()`
- Dubbelt persistenslager: PostgreSQL primär, `aurora/graph.json` JSON fallback

**Databasmigrationer:**

- `migrations/013_knowledge_library.sql`: knowledge_library-tabellen
- `migrations/014_ontology.sql`: ontologi-noder
- `migrations/015_km_chaining.sql`: KM topic-chaining
- `migrations/016_aurora_jobs.sql`: async job-queue med `aurora_jobs`-tabell

**Känt prestandaproblem (TD-1):** `timeline()` och `search()` laddar hela grafen i minnet. Inga pagineringsgränser.

### C3. GraphRAG / HippoRAG 2 / A-MEM

Det här är kärnan i systemets intelligens.

**Personalized PageRank (PPR)**

- `src/core/ppr.ts` (141 rader): `personalizedPageRank()` — power iteration, α=0.5 (HippoRAG 2 optimal), max 50 iterationer, konvergenstolerans 1e-6
- Används av: sök-traversal, A-MEM duplikatdetektering

**A-MEM (graph merge / abstraktion)**

- `src/core/graph-merge.ts` (563 rader): `abstractNodes()`, `findAbstractionCandidates()`, `findDuplicateCandidates()` med PPR-hybrid
- Jaccard-similaritet för titlar, Jaccard-threshold 0.7 för abstraktion
- Flytt till orchestrator gjord i S138 (3.2a)

**Graf-context injection**

- `src/core/graph-context.ts`: förfiltrerar KG-noder per brief, injicerar i system-prompt

**Grafhälsa**

- `src/core/graph-health.ts` (625 rader): 7 hälsokontroller (orphaned nodes, cycles, confidence distribution, etc.)

**Semantisk sökning**

- `src/core/semantic-search.ts`: pgvector cosine distance mot `kg_nodes` och `aurora_nodes`

**Cross-references**

- `src/aurora/cross-ref.ts` (352 rader): `findNeuronMatchesForAurora()`, `createCrossRef()` — kopplar Aurora ↔ Neuron KG
- `src/aurora/crossref.ts` (475 rader): mer avancerade cross-ref operationer

### C4. Sök och intelligens

**Hybridsökning**

- `src/aurora/search.ts` (234 rader): kombinerar semantisk (pgvector) + keyword + traversal (PPR-nav)
- `searchAurora()` med `SearchOptions`: limit, minSimilarity (default 0.3), typ-filter, traversalDepth

**Ask-pipeline (RAG)**

- `src/aurora/ask.ts` (252 rader): search → formatContext → Anthropic LLM → svar med citations
- System-prompt på svenska: "Du är Aurora, en personlig kunskapsassistent"
- `AskOptions.learn=true`: extraherar och sparar fakta från svaret automatiskt
- Knowledge gap-registrering: om inga sources hittas, registrerar Aurora ett gap

**Memory (minne)**

- `src/aurora/memory.ts` (452 rader): `remember()` / `recall()` med semantisk dedup (threshold ≥0.95), kontradiktion-detektering
- Typer: `fact` och `preference`

**Kunskapsluckor**

- `src/aurora/knowledge-gaps.ts` (314 rader): `recordGap()`, `getGaps()` — registrerar vad Aurora inte vet

**Bayesiansk confidence**

- `src/aurora/bayesian-confidence.ts`: confidence-beräkning vid inmatning, `classifySource()`

**Freshness scoring**

- `src/aurora/freshness.ts`: ålder-baserad score, konfigurerbar decay

**Timeline**

- `src/aurora/timeline.ts`: temporal vy av kunskapsgrafen

**Briefing**

- `src/aurora/briefing.ts` (256 rader): genererar strukturerade briefings
- `src/aurora/morning-briefing.ts` (577 rader): daglig Obsidian-fil med nya noder, körningar, KG-hälsa, 3 AI-frågor

**Knowledge Library**

- `src/aurora/knowledge-library.ts` (679 rader): strukturerad kunskapsbibliotek med ontologi

**Ontologi**

- `src/aurora/ontology.ts` (655 rader): ontologi-schema, relationer, klassificering

### C5. Talare och röst

- `src/aurora/voiceprint.ts`: röstavtryck (voice_print-noder)
- `src/aurora/speaker-identity.ts` (291 rader): speaker_identity-noder, koppling voiceprint → person
- `src/aurora/speaker-guesser.ts` (301 rader): LLM-baserad gissning utifrån kontext
- `src/aurora/speaker-timeline.ts`: temporal vy av talaridentifiering
- CLI: `aurora:identify-speakers`, `aurora:confirm-speaker`, `aurora:reject-speaker`, `aurora:merge-speakers`, `aurora:rename-speaker`

### C6. Obsidian-integration

- `src/aurora/obsidian-parser.ts` (402 rader): frontmatter, taggar, HTML-kommentarer, `extractTitle()`, `extractContentSection()`
- `src/commands/obsidian-export.ts` (563 rader): export med `exported_at` i frontmatter, stale-filrensning
- `src/commands/obsidian-import.ts` (423 rader): import med konfliktvarning, non-video text/confidence
- Round-trip verifierad S150 (3936 tester passerade)

### C7. MCP-server

- `src/mcp/server.ts` (126 rader): `createMcpServer()`, scope-baserad server-skapning, notification wrapper för async jobs
- **36 tool-filer** i `src/mcp/tools/` (3 373 rader totalt)
- Scoped server-stöd: `aurora-media`, `aurora-ingest-media`, etc.

**Aurora-tools (35 filer):**
`aurora-ask`, `aurora-search`, `aurora-memory`, `aurora-briefing`, `aurora-morning-briefing`, `aurora-ingest`, `aurora-ingest-video`, `aurora-ingest-book`, `aurora-ingest-image`, `aurora-ocr-pdf`, `aurora-speakers`, `aurora-timeline`, `aurora-gaps`, `aurora-confidence`, `aurora-freshness-consolidated`, `aurora-jobs-consolidated`, `aurora-cross-ref`, `aurora-obsidian`, `aurora-suggest-research`, `aurora-learn-conversation`, `aurora-describe-image`, `aurora-ebucore-metadata`, `aurora-check-deps`, `aurora-status`, `crossref-lookup`, `knowledge-library`

**Neuron-tools:**
`runs`, `knowledge`, `knowledge-manager`, `start`, `ideas`, `dashboard`, `run-statistics`, `graph-ppr`, `costs`, `neuron-help`

---

## D. Neuron Agentsubsystem

### 13 agenter (`src/core/agents/`, 9 818 rader totalt)

| Agent              | Fil                     | Rader              | Roll                                    |
| ------------------ | ----------------------- | ------------------ | --------------------------------------- |
| Manager            | `manager.ts`            | 1 359              | Planering, iteration-budget, delegation |
| Historian          | `historian.ts`          | 860                | Uppdaterar memory-filer efter körning   |
| Observer           | `observer.ts`           | 807                | Passiv övervakare, prompt-kvalitet      |
| Consolidator       | `consolidator.ts`       | 703                | KG-kuration, dedup, merge               |
| Code Anchor        | `code-anchor.ts`        | 531                | Verifierar brief mot faktisk kod        |
| Knowledge Manager  | `knowledge-manager.ts`  | 549                | Underhåller KG, fyller luckor           |
| Observer Alignment | `observer-alignment.ts` | 509                | Djup prompt-kod-analys                  |
| Merger             | `merger.ts`             | 481                | Sista grinden, merge till target        |
| Researcher         | `researcher.ts`         | 410                | Extern forskning, arxiv, Anthropic docs |
| Reviewer           | `reviewer.ts`           | 398                | Policy-grindvakt, risk-klassificering   |
| Observer Retro     | `observer-retro.ts`     | 373                | Retro-samtal med alla agenter           |
| Implementer        | `implementer.ts`        | 315                | Kod, verifiering, commit                |
| Librarian          | `librarian.ts`          | (i brief-agent.ts) | Codebase-forskning per körning          |

Plus stödfiler: `agent-utils.ts` (383), `graph-tools.ts` (646), `shared-tools.ts`, `adaptive-hints.ts`, `brief-context.ts`

### 19 prompt-filer (`prompts/`)

`manager.md`, `implementer.md`, `reviewer.md`, `researcher.md`, `librarian.md`, `historian.md`, `consolidator.md`, `knowledge-manager.md`, `tester.md`, `merger.md`, `observer.md`, `code-anchor.md`, `brief-agent.md`, `brief-reviewer.md`, `preamble.md`, `neuron-help.md`, `emergent-gaps.md`, `article-synthesis.md`, `concept-extraction.md`

Prompt overlays per modell: `prompts/overlays/claude-haiku/` (manager, implementer, default), `prompts/overlays/claude-opus/` (default)

### Körnings-livscykel

- `src/core/run.ts` (650 rader): `RunOrchestrator` — skapar workspaces, koordinerar agenter
- `src/core/agent-client.ts`: anropar Anthropic API med retry, streaming, tool-use
- `src/core/policy.ts` (233 rader): `PolicyValidator` — allowlist, forbidden patterns, scope-kontroll
- `policy/bash_allowlist.txt`: tillåtna bash-kommandon
- `policy/forbidden_patterns.txt`: blockerade mönster

---

## E. Infrastruktur

| Komponent         | Fil                                                | Syfte                                    |
| ----------------- | -------------------------------------------------- | ---------------------------------------- |
| Databas           | `src/core/db.ts`                                   | PostgreSQL connection pool               |
| Embeddings        | `src/core/embeddings.ts`                           | Ollama, snowflake-arctic-embed, 1024-dim |
| Audit             | `src/core/audit.ts`                                | Append-only JSONL audit trail            |
| Kostnadsspårning  | `src/core/cost-tracking.ts`                        | Token-kostnad per körning                |
| Langfuse          | `src/core/langfuse.ts`                             | Observability, trace                     |
| Config            | `src/core/config.ts`                               | .env parsing, validering                 |
| Graf-health       | `src/core/graph-health.ts` (625 rader)             | 7 hälsokontroller                        |
| Dashboard         | `src/core/dashboard-server.ts` + `dashboard-ui.ts` | Live web dashboard                       |
| Säkerhetsskanning | `src/core/security-scan.ts`                        | Pre-commit credential scan               |
| Redaktion         | `src/core/redaction.ts`                            | Hemlighetsredigering ur artefakter       |

**Python workers:** 12 filer, 834 rader (`aurora-workers/`). Beroenden: yt-dlp, whisper, pyannote, pypdf2, pytesseract, PIL.

**Känt problem (TD-9):** `requirements.txt` är ofullständig. `aurora:check-deps` finns som CLI/MCP-tool för att verifiera.

---

## F. Testtäckning

- **3949 tester** (Vitest), **294 testfiler**
- Teststrukturen speglar `src/`: `tests/aurora/`, `tests/core/`, `tests/mcp/`, `tests/commands/`
- Prompt-lint-tester för varje agent
- Kommando-tester för varje CLI-kommando

**Känt hål (TD-11):** 4 MCP-tools saknar tester.  
**Känt hål (TD-12):** Inga coverage-trösklar i vitest-konfigurationen.

---

## G. Vad fungerar / Vad är trasigt / Vad saknas

### Fungerar (verifierat)

| Funktion                        | Kommando                       | Verifierad          |
| ------------------------------- | ------------------------------ | ------------------- |
| YouTube-inmatning               | `aurora:ingest-video <url>`    | S145, fungerar      |
| PDF-inmatning + OCR-fallback    | `aurora:ingest rapport.pdf`    | S145, fungerar      |
| Semantisk sökning               | `aurora:search <term>`         | S145, fungerar      |
| Fråga-svar med källhänvisningar | `aurora:ask <fråga>`           | S145, fungerar      |
| Confidence decay + audit trail  | `aurora:decay --days 30`       | S145, dubbelkoll    |
| Auto-embedding vid inmatning    | Automatisk i intake-pipeline   | S145, dubbelkoll    |
| Semantisk dedup i memory        | `aurora:remember` (>=0.95=dup) | S145, dubbelkoll    |
| Cross-system sökning            | `unifiedSearch()`              | S145, dubbelkoll    |
| Obsidian export                 | `obsidian-export`              | S104, fungerar      |
| Obsidian import med taggar      | `obsidian-import`              | S104, fungerar      |
| Obsidian round-trip (non-video) | export + edit + import         | S150, 19 nya tester |
| Speaker diarization + timeline  | `aurora:identify-speakers`     | S145, fungerar      |
| LLM transcript-polish           | `aurora:polish <nodeId>`       | S145, fungerar      |
| Knowledge gaps                  | `aurora:gaps`                  | S145, fungerar      |
| Morning briefing                | `morning-briefing`             | S105, fungerar      |
| Bayesiansk confidence           | `aurora:confidence`            | S145, implementerad |
| PPR-baserad grafnavigering      | via `searchAurora()`           | S140, implementerad |
| A-MEM abstraktion + dedup       | via orchestrator               | S138, S140          |
| MCP-server, 44 tools            | `src/mcp/server.ts`            | S150                |
| Alla 13 agenter                 | `src/core/agents/`             | S150                |
| 3949 tester                     | `pnpm test`                    | S150                |

### Kända blockers

**B1 — Aurora-repots trasiga tester (HÖG prioritet)**
MCP-refaktorering (`server_fastmcp.py`) ocommittad i det separata Python/MCP-repot. Bryter mot MCP 1.25/1.26. Neuron HQ-koden påverkas inte, men testerna i aurora-repot körs inte grönt. Lösning: reverta eller uppgradera MCP 1.26.0+ i repot. Tid: ~15 min manuellt.

**B2 — Historian/Consolidator 0-token (FIXAD)**
Brief 3.6, körning S147 (2026-03-24). Fixad men kräver monitorering.

**Code Anchor output-trunkering (MEDIUM risk)**
Brief 3.1c kördes S150 och är klar. Output-bevaring implementerad.

### Vad saknas för daglig Aurora-användning

| Gap                                    | Prioritet             | ROADMAP-AURORA |
| -------------------------------------- | --------------------- | -------------- |
| DOCX/XLSX-inmatning                    | Hög                   | A2             |
| HyDE-sökning (hypotetiska embeddings)  | Medium                | A5             |
| Voice-to-brain diktering               | Hög (om röst används) | A3             |
| Smart Aurora-till-Neuron-konsolidering | Hög för agentlärande  | A4             |
| Ask-pipeline polish (bättre citations) | Medium                | A6             |
| Webb-UI                                | Medium                | Fas 4 (4.2)    |
| Docker-compose deployment              | Hög för andra         | Fas 4 (4.1)    |
| Server-körning utan laptop             | Hög för autonomi      | Fas 4 (4.4)    |

---

## H. Teknisk skuld

Från `ROADMAP.md`, aktiva öppna skulder:

| ID    | Problem                                                                  | Status |
| ----- | ------------------------------------------------------------------------ | ------ |
| TD-1  | `timeline()` / `search()` laddar hela grafen i minnet — ingen paginering | Känd   |
| TD-4  | N+1 DB-skrivningar i `saveAuroraGraphToDb()`                             | Öppen  |
| TD-8  | `catch (error: any)` x29 i agentfiler — tappar typinfo                   | Öppen  |
| TD-9  | `requirements.txt` ofullständig, Python-beroenden ej deklarerade         | Öppen  |
| TD-11 | 4 MCP-tools utan tester                                                  | Öppen  |
| TD-12 | Inga coverage-trösklar i vitest — 0% täckning slår inte larm             | Öppen  |

TD-1 och TD-4 är prestandaproblem som inte syns på liten datamängd men kan bli kännbara när Aurora-grafen växer. TD-9 är driftsrisk — en ny dator kan sakna rätt Python-paket utan att det syns.

---

## I. Rekommenderade nästa steg

Fokus: Aurora i daglig drift. Prioriterat för minsta friktion.

### Steg 1: Verifiera miljön (30 min)

```bash
pnpm test                        # Ska ge 3949 gröna
pnpm aurora:check-deps           # Python-beroenden OK?
psql $DATABASE_URL -c "SELECT COUNT(*) FROM aurora_nodes;"  # DB live?
```

### Steg 2: Fixa B1 i aurora-repot (15 min)

Hitta `server_fastmcp.py` i aurora-repot. Reverta eller uppdatera till MCP 1.26.0+. Kör tester.

### Steg 3: End-to-end ingest-test (20 min)

```bash
pnpm neuron aurora:ingest-video "https://www.youtube.com/watch?v=..."
pnpm neuron aurora:ask "Vad sa talaren om X?"
pnpm neuron aurora:search "nyckelord"
```

### Steg 4: Dagligt workflow (löpande)

```bash
morning-briefing                 # Generera Obsidian-briefing
aurora:ingest <url>              # Mata in nytt material
aurora:ask "<fråga>"             # Fråga om materialet
aurora:gaps                      # Se kunskapsluckor
obsidian-export                  # Synka till Obsidian
```

### Steg 5: Ny Neuron-körning för saknade features

Prioritetsordning:

1. **A2** — DOCX/XLSX-stöd (hög nytta, ~1 körning, ~$40)
2. **A4** — Smart Aurora-till-Neuron-konsolidering (agenterna lär sig av dina anteckningar)
3. **A5** — HyDE-sökning (bättre sökträffar)

### Steg 6: Fas 3 kvarvarande (agent-mognad)

- **3.3** — Research före implementation (Librarian alltid före Implementer)
- **3.4** — Schemalagda agent-samtal
- **3.7** — Tool-call-budgetar + mid-run-varningar
- **3.8** — Retro-pipeline till prompt-förbättring

---

## Bilaga: Filräkningar

| Modul              | Filer        | Rader        |
| ------------------ | ------------ | ------------ |
| `src/aurora/`      | 38 .ts       | 11 358       |
| `src/core/`        | 60 .ts       | 14 380       |
| `src/core/agents/` | 21 .ts       | 9 818        |
| `src/mcp/tools/`   | 36 .ts       | 3 373        |
| `src/commands/`    | 64 .ts       | 6 697        |
| `aurora-workers/`  | 12 .py       | 834          |
| `prompts/`         | 19 .md       | --           |
| `tests/`           | 294 .test.ts | 3 949 tester |
| `migrations/`      | 4 .sql       | --           |

**Total TypeScript-källkod:** ~46 000 rader (src/ inkl agents, aurora, core, mcp, commands)

---

_Rapporten är baserad på faktisk källkodsgranskning 2026-03-26. Inga funktioner har extrapolerads utan källstöd._
