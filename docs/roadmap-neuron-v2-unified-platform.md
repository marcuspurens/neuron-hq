# Neuron HQ v2: Unified Platform — Roadmap

## Vision

Neuron HQ blir **en plattform med två hjärnor:**
- **Neuron-hjärnan** (överjaget) — vet hur man bygger mjukvara, lär sig av sina egna körningar, förbättrar sig själv
- **Aurora-hjärnan** (forskningscentret) — ett **personligt forskningscenter** som kan ta in, analysera och koppla samman kunskap från alla tänkbara källor:
  - **Webb:** artiklar, bloggar, dokumentation (URL → text → chunks)
  - **Dokument:** PDF, Word, textfiler (lokalt eller via URL)
  - **Video & ljud:** YouTube, SVT, Vimeo, TV4, lokala inspelningar — transkribering med språkmedveten modellval (KBLab/kb-whisper-large för svenska)
  - **Röster:** röstidentifiering via pyannote, voice gallery, voiceprint-hantering
  - **Bilder:** OCR (PaddleOCR), Claude Vision för diagram och tabeller
  - **Konversationer:** heuristisk extraktion av fakta, preferenser och beslut
  - **Live:** Mac-röstinspelning → transkribering → kunskapsnoder (planerat)

Samma arkitektur, separata minnen. En MCP-server, en kodbas. Python-arbetare för multimedia.

**Det eleganta: Neuron bygger Aurora åt sig själv.** Varje fas i roadmapen blir en brief som Neurons agent-svärm implementerar.

---

## Arkitektur

```
┌─────────────────────────────────────────────────────────┐
│                    NEURON HQ v2                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              Delad infrastruktur                  │    │
│  │  PostgreSQL · pgvector · Ollama · MCP-server     │    │
│  │  Embeddings · Confidence decay · Semantic search │    │
│  │  Audit · Policy · Agent-loop                     │    │
│  └──────────────────────────────────────────────────┘    │
│          │                           │                   │
│  ┌───────▼────────┐         ┌───────▼────────┐          │
│  │ Neuron-minne   │         │ Aurora-minne   │          │
│  │ (kg_nodes)     │         │ (aurora_nodes) │          │
│  │                │         │                │          │
│  │ pattern        │         │ document       │          │
│  │ error          │         │ transcript     │          │
│  │ technique      │         │ fact           │          │
│  │ run            │         │ preference     │          │
│  │ agent          │         │ research       │          │
│  │                │         │ voice_print    │          │
│  │ Skrivs av:     │         │ Skrivs av:     │          │
│  │ Historian      │         │ IntakeAgent    │          │
│  │ Librarian      │         │ ResearchAgent  │          │
│  │ Consolidator   │         │ Du (via MCP)   │          │
│  └────────────────┘         └───────┬────────┘          │
│                                     │                    │
│  ┌──────────────────────────────────▼───────────────┐   │
│  │              Python Workers (subprocess)          │   │
│  │  yt-dlp · faster-whisper · pyannote · OCR        │   │
│  │  ~430 rader Python, resten TypeScript             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  MCP-server: neuron_* + aurora_* tools (en server)      │
└─────────────────────────────────────────────────────────┘
```

### Separata tabeller, samma databas

- **Samma Postgres**, samma pgvector, samma embedding-modell
- **Olika tabeller**: `kg_nodes`/`kg_edges` (Neuron) vs `aurora_nodes`/`aurora_edges` (Aurora)
- **Samma kod**: `semanticSearch()`, `autoEmbedNodes()`, `applyConfidenceDecay()` generaliserade med tabellnamn som parameter

### Python-arbetare

5 Python-bibliotek som måste vara Python:
- `faster-whisper` (transkribering)
- `pyannote.audio` (röstidentifiering)
- `yt-dlp` (YouTube-nedladdning)
- `pypdfium2` (PDF-extrahering)
- `PaddleOCR` (bildtext)

Anropas via `child_process.spawn()` — samma mönster som git-kommandon.

---

## Faser

### A1: Aurora-skelett och delad infrastruktur
- `aurora_nodes` + `aurora_edges` tabeller (migration 003)
- Nodtyper: document, transcript, fact, preference, research, voice_print
- Kanttyper: related_to, derived_from, references, contradicts, supports
- Generalisera semanticSearch, autoEmbedNodes, applyConfidenceDecay
- CLI: `aurora:status`

### A2: Python workers + intake-pipeline
- `aurora-workers/` Python-paket (~430 rader, 5 moduler)
- `src/aurora/worker-bridge.ts` (subprocess)
- `src/aurora/intake.ts` (URL → text → chunks → embeddings → aurora_nodes)
- CLI: `aurora:ingest`, MCP: `aurora_ingest_url`, `aurora_ingest_doc`

### A3: Sökning + ask-pipeline 🟢
- `src/aurora/search.ts` (semantisk sökning + graftraversering)
- `src/aurora/ask.ts` (fråga → sök → kontext → Claude → svar med citeringar)
- CLI: `aurora:ask`, MCP: `aurora_ask`
- `aurora_search` uppdaterad med `searchAurora()` + graftraversering
- *Commit: `aed7487` (+35 tester, körning 99)*

### A4: Minne — preferences, fakta, context 🟢
- `src/aurora/memory.ts` — `remember()`, `recall()`, `memoryStats()` med semantisk dedup
- CLI: `aurora:remember`, `aurora:recall`, `aurora:memory-stats`
- MCP: `aurora_remember`, `aurora_recall`, `aurora_memory_stats`
- *Commit: `f5e23ce` (+44 tester, körning 100)*

### A5: YouTube + röst 🟢
- `src/aurora/youtube.ts` — YouTube intake: yt-dlp → whisper → pyannote → chunks → noder
- 3 Python workers: `extract_youtube`, `transcribe_audio`, `diarize_audio`
- CLI: `aurora:ingest-youtube`, MCP: `aurora_ingest_youtube`, `aurora_voice_gallery`
- `intake.ts` uppdaterad med automatisk YouTube URL-routing
- *Commit: `d81b261` (+33 tester, körning 101)*

### A6: Smart minne — auto-lärande, motsägelser, tidslinje, kunskapsluckor 🟢
- **Auto-lärande:** `ask()` med `learn: true` extraherar fakta → `remember()` automatiskt
- **Motsägelsedetektering:** `remember()` detekterar motsägelser → `contradicts`-kanter
- **Tidslinjevy:** `aurora:timeline` — kronologisk vy av inlärda kunskaper
- **Kunskapsluckor:** `aurora:gaps` — frågor som saknar källor, frekvens-spårning
- CLI: `aurora:timeline`, `aurora:gaps`
- MCP: `aurora_timeline`, `aurora_gaps`
- *Commit: `df28eff` (+54 tester, körning 102)*

### A7: Cross-referens — unified search + Historian-koppling 🟢
- `cross_refs` Postgres-tabell (migration 005) — kopplar kg_nodes ↔ aurora_nodes
- `unifiedSearch()` — söker båda graferna parallellt
- `findAuroraMatchesForNeuron()` / `findNeuronMatchesForAurora()` — embedding-baserad matchning
- `graph_cross_ref` Historian-tool — auto-skapar cross-refs vid similarity >= 0.7
- CLI: `aurora:cross-ref`, MCP: `neuron_cross_ref`
- *Commit: `0ce6e0d` (+38 tester, körning 103)*

### ~~A8: Migration + städning~~ — STRUKEN
- Inget att migrera från Aurora SQLite — all ny funktionalitet byggs direkt i Neuron HQ
- Aurora-repot (`aurora-swarm-lab`) arkiveras separat

---

## Beroenden och ordning

```
A1 → A2 → A3 → A4 → A5 → A6 → A7  ✅ KOMPLETT
           │                 │
           └── A5 ───────────┘
```

**MVP:** A1 → A2 → A3 → A4 (alla klara)
**Full pipeline:** A1–A7 (alla klara)

## Självbyggande

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/aurora-a1-skeleton.md --hours 2
```

Neuron bygger Aurora åt sig själv. Undantag: A2 Python-paket kräver manuell setup.

---

---

## Känd teknisk skuld

| ID | Beskrivning | Var | Prioritet | När |
|----|-------------|-----|-----------|-----|
| TD-1 | `timeline()` laddar hela grafen i minnet via `loadAuroraGraph()` och filtrerar i JS. Fungerar med ~100 noder men skalar inte till tusentals. Bör bli en Postgres-query med `ORDER BY created DESC`, `WHERE`-filter och `LIMIT`. | `src/aurora/timeline.ts` (A6) | Medium | När aurora_nodes > ~500 |

---

---

## Spår B: Aurora Intelligence

**Mål:** Gör Aurora smartare — bättre rapporter, automatisk koppling, tidsbunden tillit, och självlärande.

### B1: Briefing — samlad kunskapsrapport 🟢
- `src/aurora/briefing.ts` — `briefing(topic)` samlar recall + timeline + gaps + cross-refs
- Formaterar en strukturerad rapport med sektioner: Sammanfattning, Fakta, Tidslinje, Luckor, Kopplingar
- CLI: `aurora:briefing <topic>`, MCP: `aurora_briefing`
- Bygger på befintlig kod: `recall()`, `timeline()`, `getGaps()`, `unifiedSearch()`
- *Commit: körning 104, +23 tester*

### B2: Auto cross-ref vid ingest 🟢
- `intake.ts` + `youtube.ts` utökade: efter ingest → `findNeuronMatchesForAurora()` → auto-skapa cross-refs
- Tröskel: similarity >= 0.7, max 5 matcher, relationship `'enriches'`
- Try/catch — ingest bryts aldrig av cross-ref-fel
- CLI visar cross-ref-info, MCP inkluderar automatiskt via JSON
- Bygger på A7-koden (`cross-ref.ts`)
- *Commit: `d6952f1` (+12 tester, körning 105)*

### B3: Source freshness scoring 🟢
- Migration 006: `last_verified`-kolumn på `aurora_nodes`
- `freshness.ts` — `calculateFreshnessScore()`, `verifySource()`, `getFreshnessReport()`
- Freshness score: 1.0 (verifierad idag) → 0.0 (90+ dagar)
- Status: fresh / aging / stale / unverified
- `briefing()` berikar fakta med freshness-info och varningar
- CLI: `aurora:verify` + `aurora:freshness`, MCP: `aurora_verify_source` + `aurora_freshness_report`
- *Commit: `6554b10` (+25 tester, körning 106)*

### B4: Cross-ref-integritet
Tre förbättringar i ett:
- **Confidence-koppling:** När Neuron-nod tappar confidence under 0.5 → flaggar kopplade Aurora-noder
- **Consolidator awareness:** När Consolidator mergar noder → överför deras cross-refs till överlevande noden
- **Bidirectional enrichment:** Cross-refs sparar `context` (varför kopplingen finns) + `strength` (similarity score)
- Migration 007: `context` + `strength` kolumner på cross_refs

### B5: Conversation-level learning 🟢
- `src/aurora/conversation.ts` — heuristisk extraktion (inga LLM-anrop)
- Extraherar fakta, preferenser, beslut, insikter från konversationshistorik
- Deduplicerar mot befintliga minnen, dry-run-läge
- CLI: `aurora:learn-conversation`, MCP: `aurora_learn_conversation`
- decision/insight mappas till `fact` (AuroraNodeTypeSchema har inte dessa typer)
- *Commit: `a556fbd` (+15 tester, körning 108)*

### B6: Gap → Brief pipeline 🟢
- `src/aurora/gap-brief.ts` (~270 rader) — `suggestResearch()` + `suggestResearchBatch()`
- Samlar relaterade gaps → grupperar i teman via embedding-similarity
- Genererar brief med: Bakgrund (vad vi vet), Lucka (vad vi inte vet), Förslag (hur vi tar reda på det)
- CLI: `aurora:suggest-research`, MCP: `aurora_suggest_research`
- *Commit: `430f622` (+16 tester, körning 109)*

### Beroenden och ordning (Spår B)

```
B1 (briefing) ─────────────────────┐
B2 (auto cross-ref) ──┐            │
B3 (freshness) ────────┤            ├── B6 (gap → brief)
B4 (cross-ref-integritet) ─────────┤
B5 (conversation learning) ────────┘
```

B1–B5 kan göras i valfri ordning. B6 bör vara sist (bygger på B1+B3).

---

## Spår C: Multimedia & Röster

**Mål:** Testa och utöka Auroras multimedia-pipeline — YouTube med riktig data, redigerbara voiceprints, OCR, och Claude Vision.

### C1: Video-pipeline generalisering + realtestning 🟢
- Generaliserade från YouTube-only till alla yt-dlp-sajter (SVT, Vimeo, TV4, TikTok, etc.)
- Timeout-fix (60s → 10 min), publishedDate metadata
- Realtestning: YouTube ✅ + SVT ✅
- STT-förbättringar: språkdetektering + automatiskt modelval (tiny → detect → KBLab/kb-whisper-large för svenska)
- `WorkerRequest.options` — generellt options-fält för Python-workers
- `--language` CLI-flagga + MCP language-parameter + modelUsed i output
- *Commit: `1a69b24` (+17 tester, körning 110: STT +8 tester)*

### C2: Voiceprint-redigering 🟢
- `aurora_rename_speaker` — byt namn på voice_print-nod (SPEAKER_1 → "Marcus")
- `aurora_merge_speakers` — slå ihop voice_prints från olika videos (samma person)
- `aurora_suggest_speaker_matches` — föreslår matchningar baserat på embedding-similarity
- CLI: `aurora:rename-speaker`, `aurora:merge-speakers`, `aurora:suggest-speakers`
- *Commit: `592360c` (+31 tester, körning 112)*

### C2.1: Voiceprint confidence-loop 🟢
- Iterativ bekräftelse av speaker-matchningar med confidence-score
- *Commit: `2c2d7f2` (+32 tester, körning 113)*

### C3: OCR-worker (PaddleOCR) 🟢
- `aurora-workers/extract_ocr.py` — PaddleOCR Python-worker för bilder
- `aurora-workers/ocr_pdf.py` — PDF OCR-fallback (renderar sidor → OCR)
- `isTextGarbled()` — heuristik för trasig fontkodning, auto-fallback i intake
- CLI: `aurora:ingest-image`, `aurora:ocr-pdf`
- MCP: `aurora_ingest_image`, `aurora_ocr_pdf`
- *Commit: `8bee851` (+25 tester, körning 114)*

### C3.1: Batch-OCR (skannad bok → markdown) 🟢
- `aurora-workers/batch_ocr.py` — processar hel mapp med bilder i en PaddleOCR-instans
- Naturlig sortering (page1, page2, page10), sidmarkeringar i markdown
- Sparar .md-fil till disk (valfritt) + ingestar i Aurora-grafen
- CLI: `aurora:ingest-book`, MCP: `aurora_ingest_book`
- 10 min timeout för stora böcker
- *Körning 115, +15 tester*

### C4: Lokal vision (Ollama) 🟢
- **Körning 117** (`9c2344d`, +22 tester, 1652→1673)
- `src/aurora/vision.ts` — TypeScript → Ollama HTTP API (base64-bild → `/api/generate`)
- Modell: `qwen3-vl:8b` (konfigurerbart via `OLLAMA_MODEL_VISION`)
- `analyzeImage()`, `isVisionAvailable()`, `ingestImage()` — samma mönster som `embeddings.ts`
- CLI: `aurora:describe-image` (med `--describe-only`) · MCP: `aurora_describe_image`
- Ingen Python-worker — direkt fetch mot Ollama
- Mac M4 48 GB: embedding + vision samtidigt (~11 GB, gott om headroom)

#### Idéer (från körning 117)
- **C4.1** Batch vision — analysera flera bilder parallellt
- **C4.2** URL-bilder — ladda ner → analysera
- **C4.3** Vision + OCR fusion — kombinera bildförståelse med textextraktion för rikare indexering

### Beroenden och ordning (Spår C)

```
C1 (video pipeline) 🟢 ──┐
                          ├── C2 (voiceprint) 🟢 ── C2.1 (confidence) 🟢
                          │
C3 (OCR) 🟢 ── C3.1 (batch-OCR) 🟢
                          │
C4 (lokal vision) 🟢 ───┘
```

**Spår C KOMPLETT** ✅ (C1–C4 alla 🟢).

---

## Spår E: Autonom kunskapscykel

**Mål:** Stäng cirkeln — Aurora identifierar luckor, föreslår forskning, Neuron utför den, Aurora lär sig. Plus en 11:e agent: Knowledge Manager.

### E1: Knowledge Manager-agent (#11)
- Ny agentroll: `knowledge-manager` — koordinerar kunskapscykeln
- Skiljer sig från Manager (kodutveckling) — denna koordinerar *lärande*
- Ansvar: prioritera gaps, schemalägga research, godkänna/avvisa förslag
- Prompt: `prompts/knowledge-manager.md`
- Agent: `src/core/agents/knowledge-manager.ts`

### E2: Auto-research execution
- `suggestResearch()` → `executeResearch()` — utför föreslagna åtgärder
- Web-sökning, URL-ingest, YouTube-ingest baserat på B6-förslag
- Knowledge Manager godkänner varje steg
- Resultat lagras tillbaka i Aurora-grafen

### E3: Scheduled re-ingestion
- Periodisk omläsning av källor med utgånget freshness-score
- Jämför ny version med cached version → uppdatera noder vid ändringar
- Knowledge Manager bestämmer prioritet baserat på freshness + frequency

### E4: Neuron som rådgivare
- Ny CLI/MCP: `neuron:advise <topic>` — samlad kunskapsrapport
- Kombinerar Aurora-kunskap + Neuron-erfarenhet + freshness + cross-refs
- Paketerar befintliga tools (briefing + recall + unifiedSearch) i ett flöde
- Output: strukturerad rapport med rekommendationer

### Beroenden och ordning (Spår E)

```
E1 (Knowledge Manager) → E2 (auto-research) → E3 (scheduled re-ingest)
                                              → E4 (rådgivare)
```

E1 är grunden. E2–E4 bygger på E1.

---

## Spår F: Bayesiskt medvetande

**Mål:** Ge Neuron probabilistisk självkännedom — systemet bygger upp övertygelser om sin egen förmåga, kodens tillstånd och briefs kvalitet, och uppdaterar dem bayesiskt med varje körning.

**Inspiration:** Googles forskning om Bayesian Teaching (feb 2026) — LLM:er som finjusterats att resonera bayesiskt presterar ~80% bättre på adaptiva uppgifter.

### F0: Bayesisk confidence i Aurora (kunskap) 🟢
- **Körning 116** (`29e5d22`, +23 tester, 1629→1652)
- Logistisk bayesisk uppdatering: `bayesianUpdate()` via logit-transform
- Källvikter: academic (0.25) > encyclopedia (0.20) > official (0.18) > news (0.12) > blog (0.06) > anecdotal (0.03)
- `classifySource(url)` — heuristisk URL-klassificering
- Migrering 008: `confidence_audit`-tabell (append-only)
- Integrerat i `processExtractedText()` cross-ref-steget
- CLI: `aurora:confidence <nodeId>` · MCP: `aurora_confidence_history`

#### Idéer (från körning 116)
- **F0.1** Retroaktiv backfill — batch-uppdatera befintliga 122 noder baserat på URL
- **F0.2** Motsägelse-detektion — automatiskt hitta "contradicts" (idag bara "supports")
- **F0.3** Multi-source aggregering — bättre audit vid flera cross-refs i en ingest
- **F0.4** Confidence decay — koppla freshness + bayesisk confidence (gammal källa → sjunker)

### F1: Neuron körningsstatistik
- Samla bayesisk statistik per modul, agentroll och brief-typ
- "Implementer klarar TypeScript-uppgifter: 0.82 confidence (12/15 GREEN)"
- "Briefs med >5 uppgifter: 0.75 risk (8/10 YELLOW/RED)"
- Lagras i Postgres, uppdateras efter varje körning

### F2: Adaptiv Manager
- Manager använder F1-statistiken för att anpassa planer
- Hög risk-modul → striktare review, mer tid
- Svag agent-prestanda på viss typ → dela upp annorlunda
- Brief-komplexitet → automatisk uppdelning vid hög risk-prognos

### F3: Självreflektion
- Neuron genererar en periodisk "self-assessment" baserat på alla bayesiska övertygelser
- "Jag är bra på X, svag på Y, osäker om Z"
- Visualisering: MCP-tool `neuron_self_assessment`

### Beroenden och ordning (Spår F)

```
F0 (Aurora confidence) → F1 (körningsstatistik) → F2 (adaptiv Manager)
                                                 → F3 (självreflektion)
```

F0 🟢 (klar). F1–F3 bygger på varandra.

---

## Framtida idéer (post Spår C/E/F)

| Idé | Beskrivning | Källa |
|-----|-------------|-------|
| Contradiction graph visualization | Visuell karta av motsägande noder (kräver UI-beslut) | S69 |
| Hybrid search (BM25 + semantic) | Kombination av nyckelordssökning och embedding-sökning | Aurora roadmap |
| Export/reporting | Exportera kunskap till markdown, PDF, eller andra format | — |
| Distribuerat Neuron | Köra på server (Hetzner), SSH + tmux, kontinuerlig indexering | S72 |

---

*Skapad: 2026-03-08 | Uppdaterad: 2026-03-12 | Status: SPÅR A KOMPLETT · SPÅR B KOMPLETT · SPÅR C KOMPLETT · SPÅR D KOMPLETT · SPÅR S KOMPLETT · F0 🟢 · E+F1–F3 PLANERADE*
