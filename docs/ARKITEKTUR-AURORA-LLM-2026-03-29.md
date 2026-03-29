# Aurora — Teknisk komponentkarta

> **Scope:** Scope 2 — hur delarna hänger ihop. För vem: framtida agenter och Marcus som referens.
> **Senast uppdaterad:** 2026-03-29 · OpenCode Session 2
> **Genererad av:** Atlas (OpenCode) baserat på kodanalys av `src/aurora/` (38 filer, ~11 000 rader)

---

## 1. Vad Aurora är i ett diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INDATA                                   │
│   URL      YouTube     PDF/DOCX     Anteckning     Röst/Audio   │
└────┬──────────┬───────────┬────────────┬──────────────┬─────────┘
     │          │           │            │              │
     ▼          ▼           ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PYTHON WORKERS (aurora-workers/)             │
│  trafilatura   yt-dlp + whisper   pdfminer/OCR   --            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ JSON (titel, text, metadata)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   INTAKE PIPELINE (TypeScript)                  │
│   intake.ts / video.ts                                          │
│   1. Hash + dedup-check                                         │
│   2. Skapa AuroraNode (document/transcript)                     │
│   3. Chunking (200 ord, 20 ords överlapp)                       │
│   4. Skapa chunk-noder + derived_from-kanter                    │
│   5. Dual-write: fil + PostgreSQL                               │
│   6. Embedding via Ollama (snowflake-arctic-embed, 1024-dim)    │
│   7. Auto cross-ref mot Neuron KG                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌──────────────────────┐   ┌────────────────────────────────────┐
│  aurora_nodes (DB)   │   │  aurora-graph.json (fil-backup)    │
│  + pgvector embed.   │   │  AuroraGraph: {nodes[], edges[]}   │
└──────────┬───────────┘   └────────────────────────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌──────────┐
│ SEARCH  │  │   ASK    │
│search.ts│  │  ask.ts  │
└─────────┘  └──────────┘
     │            │
     │       Claude (Haiku/Researcher-modell)
     │            │
     └────────────┘
           │
           ▼
     Svar + citeringar till användaren / MCP-klient
```

---

## 2. De två kunskapsstrukturerna

Aurora har **två separata kunskapsgrafar** som lever sida vid sida och kopplas ihop via cross-references:

|           | **Aurora KG**                                                                                            | **Neuron KG**                                   |
| --------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Tabell    | `aurora_nodes`                                                                                           | `kg_nodes`                                      |
| Schema    | `aurora-schema.ts` (Zod)                                                                                 | `src/core/knowledge-graph.ts`                   |
| Typ       | Dokumentbaserad (vad du indexerat)                                                                       | Idébaserad (vad agenterna lärt sig)             |
| Skapad av | Intake-pipeline, Memory, Morning briefing                                                                | Agenter (Manager, Historian, Librarian)         |
| Nodes     | document, transcript, fact, preference, research, voice_print, speaker_identity, article, concept        | idea, pattern, error, technique                 |
| Edges     | derived_from, related_to, references, contradicts, supports, summarizes, supersedes, broader_than, about | enriches, contradicts, supports, discovered_via |
| Sökning   | `aurora_nodes` pgvector + graph-traversal                                                                | `kg_nodes` pgvector                             |
| Koppling  | `aurora_cross_refs`-tabell + `cross-ref.ts`                                                              | —                                               |

**Varför två grafar?** Aurora är ditt personliga kunskapslager (vad _du_ har läst och indexerat). Neuron KG är agenternas operativa minne (vad _systemet_ har lärt sig om kod, patterns och fel). De befruktar varandra via cross-references men hålls separata för att undvika att agent-lärande kontaminerar dina källor.

---

## 3. Modulkarta — `src/aurora/` (38 filer)

### 3.1 Schema och grundstruktur

| Fil                | Ansvar                                                              | Nyckeltyper                                                                                       |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `aurora-schema.ts` | Zod-scheman för alla Aurora-typer                                   | `AuroraNode`, `AuroraEdge`, `AuroraGraph`, `AuroraNodeType` (9 typer), `AuroraEdgeType` (9 typer) |
| `aurora-graph.ts`  | DB-operationer och graföverlevnad (1 395 rader, den centrala filen) | `loadAuroraGraph()`, `saveAuroraGraph()`, `addAuroraNode()`, `autoEmbedAuroraNodes()`             |
| `index.ts`         | Barrel-export av hela Aurora-API:et                                 | Re-exporterar allt publikt                                                                        |

**`aurora-graph.ts` är navet** — alla andra moduler importerar härifrån. Dual-write (fil + DB), embedding, node-CRUD, graph-traversal och sökning sitter här.

### 3.2 Ingest-pipeline

| Fil                  | Ansvar                                             | Anropar                                                                                                                |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `intake.ts`          | URL + dokument-ingest (orkestrator)                | `worker-bridge.ts`, `chunker.ts`, `aurora-graph.ts`, `cross-ref.ts`, `bayesian-confidence.ts`                          |
| `video.ts`           | YouTube/video-ingest (673 rader, komplex pipeline) | `worker-bridge.ts`, `chunker.ts`, `transcript-polish.ts`, `speaker-guesser.ts`, `speaker-identity.ts`, `voiceprint.ts` |
| `worker-bridge.ts`   | TypeScript→Python-gräns (JSON over stdin/stdout)   | `aurora-workers/__main__.py` via `child_process.spawn`                                                                 |
| `chunker.ts`         | Ren TS-modul, delar text i överlappande chunks     | Ingen Aurora-import — helt isolerad                                                                                    |
| `ocr.ts`             | OCR-fallback för garblad PDF-text                  | `worker-bridge.ts` (action: `extract_ocr`, `ocr_pdf`)                                                                  |
| `pipeline-errors.ts` | Svenska felmeddelanden + pipeline-rapport          | Används av `intake.ts` och `video.ts`                                                                                  |

**Viktigt designval:** Python-workers kommunicerar via JSON på stdin/stdout, inte HTTP. Det gör dem lätta att testa men begränsar till en worker per anrop.

### 3.3 Sök och fråga

| Fil                    | Ansvar                                          | Nyckellogik                                                                                                                |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `search.ts`            | Semantisk sökning med graph-traversal-anrikning | 1. pgvector semantic search → 2. keyword-fallback → 3. traversal-anrikning → 4. dedup → 5. sort                            |
| `ask.ts`               | RAG: search → kontext → Claude → svar           | Använder `formatContext()` för numbered sources, `recordGap()` om inga träffar, optional `learn` för auto-fakta-extraktion |
| `knowledge-gaps.ts`    | Sparar frågor utan svar som gap-noder           | Anropas av `ask.ts` när inga källor hittas                                                                                 |
| `knowledge-library.ts` | Hög-nivå CRUD för kunskapsnoder                 | `addKnowledge()`, `searchKnowledge()`, `linkKnowledge()`                                                                   |
| `memory.ts`            | Spara och hämta fakta/preferenser               | `remember()`, `recall()` — sparar som `fact`/`preference`-noder med embedding-dedup (≥0.95 = duplikat)                     |

**Sökning är hybrid:** Semantic search (pgvector cosine similarity) är primär. Om Ollama/DB inte svarar faller den tillbaka på keyword-matchning i den JSON-baserade grafen. Resultaten anrikas sedan med graph-traversal (1 kant djup default).

### 3.4 Video-pipeline (specialfall)

Video-ingesten är separat från URL-ingesten och har fler steg:

```
YouTube-URL
    │
    ▼ worker-bridge → yt-dlp (Python)
Audio-fil (MP3/WAV) — sparas i persistent tmpdir
    │
    ▼ worker-bridge → whisper (Python, auto-modellval sv→KBLab)
Råtranskript (text + segment-timestamps)
    │
    ▼ transcript-polish.ts → Ollama gemma3 (eller Claude Haiku)
Korrigerat transkript (stavning, egennamn, skiljetecken)
    │
    ▼ speaker-guesser.ts → Ollama gemma3 (LLM-gissning av talarnamn)
    │
    ▼ speaker-identity.ts → voiceprint.ts (DB-matchning mot kända röster)
Taggade segment med talarnnamn
    │
    ▼ chunker.ts → aurora-graph.ts → aurora_nodes (transcript + chunks)
    │
    ▼ autoEmbedAuroraNodes() → pgvector
    │
    ▼ cross-ref.ts → kopplingar till Neuron KG
```

**Nyckelfiler för video:**

| Fil                    | Ansvar                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `transcript-polish.ts` | LLM-korrekturläsning av Whisper-transkript (batch 8 segment, Ollama gemma3 default) |
| `speaker-guesser.ts`   | Gissar talarnamn från transkriptkontext via LLM                                     |
| `speaker-identity.ts`  | Matchar LLM-gissningar mot DB:ns kända voiceprints                                  |
| `speaker-timeline.ts`  | Bygger talarlinje (vem sa vad när)                                                  |
| `voiceprint.ts`        | CRUD för voice_print-noder (röstprofiler)                                           |

### 3.5 Kunskapshälsa och minne

| Fil                      | Ansvar                                                                      |
| ------------------------ | --------------------------------------------------------------------------- |
| `bayesian-confidence.ts` | Bayesiansk konfidensuppdatering per nod (supports/contradicts/challenges)   |
| `freshness.ts`           | Freshness-scoring: dagar sedan verifiering × källtyp-vikt                   |
| `conversation.ts`        | Sparar konversationshistorik som `research`-noder                           |
| `cross-ref.ts`           | `aurora_cross_refs`-tabell: kopplar Aurora-noder ↔ Neuron KG-noder          |
| `crossref.ts`            | Äldre cross-ref-kod (trolig kandidat för sammanslagning med `cross-ref.ts`) |
| `gap-brief.ts`           | Konverterar knowledge-gaps till briefs för Neuron-körningar                 |
| `timeline.ts`            | Kronologisk vy av noder (laddar hela grafen i minnet — känd TD-1)           |

### 3.6 Output-kanaler

| Fil                   | Ansvar                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| `morning-briefing.ts` | Genererar `briefing-YYYY-MM-DD.md` i Obsidian vault (577 rader)             |
| `briefing.ts`         | Samlad kunskapsrapport (äldre, används av MCP-tool `aurora_briefing`)       |
| `obsidian-parser.ts`  | Parsar Obsidian-markdown: frontmatter, taggar, HTML-kommentarer, highlights |
| `jsonld-export.ts`    | Exporterar noder som JSON-LD (semantisk webb-format)                        |
| `ebucore-metadata.ts` | EBUCore-metadataformat för media (SVT/public media standard)                |

### 3.7 Övrigt

| Fil                               | Ansvar                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `web-search.ts`                   | Websökning som Aurora-funktion                                 |
| `vision.ts`                       | Bildanalys via Ollama qwen3-vl:8b                              |
| `ontology.ts`                     | Ontologi-hantering för kunskapsklassificering                  |
| `external-ids.ts`                 | Hantering av externa ID:n (ISBN, DOI, ISRC m.fl.)              |
| `km-log.ts`                       | Knowledge Manager-loggning                                     |
| `job-runner.ts` / `job-worker.ts` | Asynkront job-system (bakgrundsjobb för långsamma operationer) |

---

## 4. Python-workers (`aurora-workers/`)

TypeScript-koden kan inte göra allt — tunga medieoperationer delegeras till Python:

| Worker                | Python-bibliotek | Vad det gör                                                           |
| --------------------- | ---------------- | --------------------------------------------------------------------- |
| `extract_url.py`      | trafilatura      | Extraherar text från webbsidor (bättre än beautifulsoup för artiklar) |
| `extract_pdf.py`      | pdfminer.six     | Text-extraktion från PDF                                              |
| `extract_text.py`     | —                | Läser .txt/.md-filer                                                  |
| `extract_video.py`    | yt-dlp + deno    | Laddar ned video/audio (persistent tmpdir sedan commit dcf34ed)       |
| `transcribe_audio.py` | openai-whisper   | Transkriberar audio (auto-modellval: sv→KBLab, en→base)               |
| `diarize_audio.py`    | pyannote.audio   | Talaridentifiering (kräver PYANNOTE_TOKEN)                            |
| `extract_ocr.py`      | PaddleOCR        | OCR för bilder och garblad PDF                                        |
| `ocr_pdf.py`          | PaddleOCR        | OCR på hela PDF-dokument                                              |

**Kommunikationsprotokoll:**

```
TS → Python: JSON på stdin: { action: "extract_url", source: "https://...", options: {} }
Python → TS: JSON på stdout: { ok: true, title: "...", text: "...", metadata: {...} }
             eller:          { ok: false, error: "..." }
```

Timeout: 60 sekunder default (konfigurerbart per anrop).

---

## 5. Dataflöde — URL-ingest end-to-end

```
pnpm aurora ingest-url "https://example.com/article"
    │
    ▼ intake.ts: ingestUrl()
    │
    ├─ isVideoUrl()? → Nej → processExtractedText()
    │
    ▼ worker-bridge: runWorker({ action: 'extract_url', source: url })
    │   Python: trafilatura.fetch_url() + extract()
    │   → { ok: true, title, text, metadata }
    │
    ▼ hash = SHA256(text).slice(0,12) → docId = "doc_<hash>"
    │
    ▼ loadAuroraGraph() → kolla om docId redan finns (dedup)
    │
    ▼ Skapa AuroraNode: { id: docId, type: 'document', title, properties: { text: text.slice(0,500), ...metadata } }
    │
    ▼ chunkText(text, { maxWords: 200, overlap: 20 })
    │   → 1–100 Chunk-objekt med text + offsets
    │
    ▼ För varje chunk: Skapa AuroraNode (type='document') + AuroraEdge (derived_from)
    │
    ▼ saveAuroraGraph() — dual-write: fil + PostgreSQL
    │
    ▼ autoEmbedAuroraNodes([docId, ...chunkIds])
    │   → buildTexts(1500): "document: <titel>. <text[:1500]>"
    │   → Ollama /api/embed (snowflake-arctic-embed, 1024-dim)
    │   → UPDATE aurora_nodes SET embedding = $1::vector WHERE id = $2
    │
    ▼ findNeuronMatchesForAurora(docId, { limit: 5, minSimilarity: 0.5 })
    │   → semanticSearch('kg_nodes') → top-5 matches
    │   → similarity ≥ 0.7: createCrossRef() + updateConfidence()
    │
    ▼ { documentNodeId, chunkNodeIds, title, wordCount, chunkCount, crossRefsCreated }
```

---

## 6. Dataflöde — fråga/svar end-to-end

```
pnpm aurora ask "Vad sa Dario Amodei om säkerhet?"
    │
    ▼ ask.ts: ask(question)
    │
    ▼ searchAurora(question, { limit: 10, minSimilarity: 0.3 })
    │   │
    │   ▼ semanticSearch('aurora_nodes')
    │   │   → Ollama embed(question) → pgvector cosine similarity
    │   │   → SELECT id, title, type, similarity FROM aurora_nodes
    │   │     ORDER BY embedding <=> $query_vector LIMIT 10
    │   │
    │   ▼ Om semantic misslyckas: keyword-fallback i JSON-graf
    │   │
    │   ▼ graph traversal: traverseAurora() 1 kant djup → lägg till related[]
    │   │
    │   ▼ addParentDocuments(): chunk → parent doc i related[]
    │   │
    │   ▼ dedup + sort (similarity desc, confidence desc)
    │
    ▼ Om inga resultat: recordGap(question) → return "Inga källor hittade"
    │
    ▼ formatContext(results) → "[Source 1: "Titel" (document, similarity: 0.87)]\n<text>"
    │
    ▼ Claude API (resolveModelConfig('researcher') eller Haiku fallback)
    │   system: "Du är Aurora... basera svar ENBART på källorna... [Source N]..."
    │   user: "## Källor\n<context>\n\n## Fråga\n<question>"
    │   max_tokens: 1024
    │
    ▼ { answer, citations: [{ nodeId, title, type, similarity }], sourcesUsed }
```

---

## 7. Databas-schema

Tre relevanta tabeller i PostgreSQL (`neuron`-databasen):

```sql
-- Aurora-noder (dokument, transkript, fakta, etc.)
aurora_nodes (
  id          TEXT PRIMARY KEY,         -- "doc_abc123", "vid-4fc93ffbb1cd"
  type        TEXT,                     -- AuroraNodeType enum
  title       TEXT,
  properties  JSONB,                    -- { text, chunkIndex, platform, rawSegments, ... }
  confidence  FLOAT,                    -- 0.0–1.0 (Bayesiansk)
  scope       TEXT DEFAULT 'personal',  -- personal | shared | project
  source_url  TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  embedding   vector(1024)              -- snowflake-arctic-embed, NULL om ej embeddat
)

-- Neuron-noder (agenternas kunskapsgraf)
kg_nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT,                     -- idea | pattern | error | technique
  title       TEXT,
  content     TEXT,
  properties  JSONB,
  confidence  FLOAT,
  embedding   vector(1024)
)

-- Korsreferenser mellan de två grafarna
aurora_cross_refs (
  id              SERIAL PRIMARY KEY,
  neuron_node_id  TEXT REFERENCES kg_nodes(id),
  aurora_node_id  TEXT REFERENCES aurora_nodes(id),
  relationship    TEXT,                 -- supports | contradicts | enriches | discovered_via
  similarity      FLOAT,
  metadata        JSONB,
  context         TEXT,
  strength        FLOAT,
  created_at      TIMESTAMPTZ
)
```

**Viktigt:** `aurora_nodes.properties` är schemaless JSONB — det är avsiktligt. Olika node-typer har helt olika properties (en `transcript`-nod har `rawSegments`, en `document`-nod har `chunkIndex`, en `voice_print`-nod har speaker-metadata). Zod-schemat i `aurora-schema.ts` validerar `properties: z.record(z.unknown())`.

---

## 8. Konfiguration och modeller

Alla konfigurerbara värden via `src/core/config.ts` (Zod-validerat från `process.env`):

| Env-variabel          | Default                              | Vad det styr                                 |
| --------------------- | ------------------------------------ | -------------------------------------------- |
| `DATABASE_URL`        | `postgresql://localhost:5432/neuron` | PostgreSQL                                   |
| `OLLAMA_URL`          | `http://localhost:11434`             | Ollama API                                   |
| `OLLAMA_MODEL_EMBED`  | `snowflake-arctic-embed`             | Embedding-modell (1024-dim, max ~512 tokens) |
| `OLLAMA_MODEL_VISION` | `qwen3-vl:8b`                        | Bildanalys                                   |
| `OLLAMA_MODEL_POLISH` | `gemma3`                             | Transkript-polering (installerad 2026-03-29) |
| `AURORA_PYTHON_PATH`  | `python3`                            | Python-interpreter för workers               |
| `PYANNOTE_TOKEN`      | —                                    | HuggingFace-token för talaridentifiering     |

**Installerade Ollama-modeller:**

| Modell                 | Storlek | Används till                    |
| ---------------------- | ------- | ------------------------------- |
| snowflake-arctic-embed | 669 MB  | Embeddings (default)            |
| gemma3                 | 3.3 GB  | Polish + speaker-gissning       |
| qwen3-vl:8b            | 6.1 GB  | Bildanalys                      |
| bge-m3                 | 1.2 GB  | Alternativ embedding (ej aktiv) |
| nemotron-3-nano:30b    | 24 GB   | Generell LLM                    |
| gpt-oss:20b            | 13 GB   | Generell LLM                    |
| deepseek-r1:1.5b       | 1.1 GB  | Liten reasoning-modell          |

---

## 9. MCP-server (44 tools)

Aurora är exponerat via en MCP-server (`src/mcp/server.ts`) med 44 tools fördelade i kategorier:

| Kategori   | Antal | Exempel                                                              |
| ---------- | ----- | -------------------------------------------------------------------- |
| Ingest     | 5     | `aurora_ingest_url`, `aurora_ingest_document`, `aurora_ingest_video` |
| Search/Ask | 4     | `aurora_search`, `aurora_ask`, `aurora_unified_search`               |
| Memory     | 4     | `aurora_remember`, `aurora_recall`, `aurora_forget`                  |
| Graph      | 8     | `aurora_show`, `aurora_graph_stats`, `graph_ppr`                     |
| Obsidian   | 4     | `aurora_obsidian_export`, `aurora_obsidian_import`                   |
| Briefing   | 3     | `aurora_morning_briefing`, `aurora_briefing`                         |
| Media      | 4     | `aurora_identify_speakers`, `aurora_polish`, `aurora_describe_image` |
| Neuron KG  | 6     | `kg_add`, `kg_search`, `kg_timeline`                                 |
| Cross-ref  | 4     | `aurora_cross_refs`, `create_cross_ref`                              |
| Misc       | 6     | `aurora_gaps`, `aurora_decay`, `neuron_help`                         |

MCP-servern är registrerad i Claude Desktop via `aurora-swarm-lab`-repot, **inte** direkt från neuron-hq.

---

## 10. Kända svagheter (teknisk skuld)

| #    | Var                                        | Problem                                              | Konsekvens                                               |
| ---- | ------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------- |
| TD-1 | `timeline.ts`, `search.ts`                 | `loadAuroraGraph()` laddar hela JSON-grafen i minnet | Minnesläcka vid >1000 noder                              |
| TD-4 | `aurora-graph.ts`: `saveAuroraGraphToDb()` | N+1 DB-writes (en INSERT per nod, inte bulk)         | Långsam vid stora ingest-batchar                         |
| TD-9 | `aurora-workers/requirements.txt`          | Saknar några beroenden                               | Ny maskin kan misslyckas med Python-setup                |
| —    | `cross-ref.ts` + `crossref.ts`             | Dubbla filer med överlappande ansvar                 | Förvirrande — kandidat för sammanslagning                |
| —    | `aurora_nodes.properties`                  | Schemaless JSONB                                     | Ingen compile-time garanti för node-specifika properties |
| —    | `worker-bridge.ts`                         | En Python-process per anrop, ingen pooling           | Långsam vid hög frekvens                                 |

---

## 11. Var börja om du vill ändra något

| Du vill...                            | Börja i...                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Lägga till ny ingest-typ (t.ex. DOCX) | `intake.ts` + ny Python-worker                                                               |
| Förbättra sökkvalitet                 | `search.ts`: `minSimilarity`, `traversalDepth`, PPR-integration                              |
| Byta embedding-modell                 | `config.ts` → `OLLAMA_MODEL_EMBED`, verifiera dimension i `embeddings.ts`                    |
| Ändra chunk-storlek                   | `intake.ts`/`video.ts` → `chunkMaxWords`/`chunkOverlap` options, eller `chunker.ts` defaults |
| Lägga till nytt node-type             | `aurora-schema.ts` → `AuroraNodeTypeSchema` (en rad)                                         |
| Ändra ask-prompt                      | `ask.ts` → `SYSTEM_PROMPT` konstant                                                          |
| Debugga ett embedding-fel             | `aurora-graph.ts` → `autoEmbedAuroraNodes()` (rad ~324)                                      |
| Förstå ett specifikt nod-id           | `aurora-graph.ts` → `loadAuroraGraphFromDb()` eller direkt psql                              |

---

_Uppdatera detta dokument när modulansvar, DB-schema eller dataflöden ändras._
_Detaljerad kodanalys: `docs/RAPPORT-KODANALYS-2026-03-26.md` (466 rader)_
_Teknisk roadmap: `ROADMAP-AURORA.md`_
