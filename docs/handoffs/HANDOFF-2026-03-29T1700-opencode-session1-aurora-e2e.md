# HANDOFF-2026-03-29T1700 — OpenCode Session 1: Aurora end-to-end fungerar

## Sammanfattning

Första sessionen med OpenCode + LiteLLM (ersätter VS Code + Opus). Fokus: upprätta dokumentation, verifiera miljö, och bevisa att Aurora-pipelinen fungerar end-to-end. Två bugfixar gjorde att URL-ingest och YouTube-ingest nu fungerar.

## Vad som gjordes

### 1. Dokumentation och infrastruktur (commit 5f69730)

- Tre dagböcker: `docs/dagbocker/DAGBOK-MARCUS.md`, `DAGBOK-DEV.md`, `DAGBOK-LLM.md`
- Komplett kodanalys: `docs/RAPPORT-KODANALYS-2026-03-26.md` (466 rader)
- OpenAPI 3.1 spec: `docs/aurora-api-spec.yaml` (1487 rader, alla 44 MCP-tools)
- Handoff-protokoll: `docs/HANDOFF-OPENCODE.md`

### 2. MARCUS.md — profilfil (commit 0c819da)

- Marcus fyllde i alla sektioner: bakgrund, CGI-roll, vision, teknisk miljö
- 9 sektioner inkl. beslutsprinciper och kommunikationsstil
- Alla framtida agenter läser denna fil vid sessionsstart

### 3. Bugfix: Ollama embedding HTTP 400 (commit 04d0478)

- **Problem:** `autoEmbedAuroraNodes()` skickade `JSON.stringify(properties)` (tusentals tecken) till Ollama. `snowflake-arctic-embed` klarar max 512 tokens, gav HTTP 400.
- **Fix 1:** Använd `properties.text` istället för full JSON, trunkera till 2000 chars
- **Fix 2:** `embedBatch()` faller tillbaka till individuella anrop vid batch-fel
- **Fix 3:** Samma trunkering i `embed-nodes` CLI-kommandot
- **Verifierat:** 3949 tester gröna. Indexerad RAG-artikel sökbar med citations.

### 4. Bugfix: YouTube temp-dir radering (commit dcf34ed)

- **Problem:** `extract_video.py` använde `TemporaryDirectory` (auto-raderar). Audio-filen försvann innan `transcribe_audio` kunde läsa den.
- **Fix:** Bytte till `mkdtemp` (persistent). TS-sidan ansvarar för cleanup.
- **Verifierat:** 3Blue1Brown "But what is a neural network?" (19 min, 3370 ord, 21 chunks) indexerad och sökbar.

### 5. Miljö-setup

- Installerade `openai-whisper` i anaconda
- Installerade `deno` via Homebrew (krävs av yt-dlp 2026+)
- Uppgraderade `yt-dlp` till 2026.3.17
- Identifierade att `AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3` krävs (ej i .env ännu)

## Vad som INTE gjordes

| Sak                             | Varför                              | Nästa steg                    |
| ------------------------------- | ----------------------------------- | ----------------------------- |
| Fixa Aurora-repots tester (B1)  | Separat repo (aurora-swarm-lab)     | Marcus fixar manuellt         |
| Sätt AURORA_PYTHON_PATH i .env  | Ej prioriterat                      | Lägg till i nästa session     |
| Fixa noden vid-4fc93ffbb1cd     | Specialtecken i text ger Ollama 400 | Debug textinnehållet          |
| gemma3-modell saknas för polish | Ollama 404 vid transkript-polering  | Installera eller ändra config |
| Uppdatera ROADMAP.md            | Tid slut                            | Gör i nästa session           |

## Insikter

### OpenCode fungerar bra som utvecklingsmiljö

- Subagenter kan delegeras men timeout:ar på stora uppgifter (30 min limit)
- Kodändringar som kräver testkörning bör göras direkt, inte delegeras
- LiteLLM routar Sonnet för writing-tasks, Opus för deep — sparar pengar

### Aurora pipeline status

- URL-ingest: Fungerar (trafilatura via anaconda)
- YouTube-ingest: Fungerar (yt-dlp + whisper + deno)
- PDF-ingest: Ej testat denna session
- Ask/Search: Fungerar med citations
- Embedding: Fungerar med trunkering (MAX_EMBED_CHARS = 2000)
- Obsidian sync: Verifierat S150
- Morning briefing: Ej testat denna session

### Embedding-bugg var dold länge

Buggen med JSON.stringify(properties) fanns troligen sedan Aurora-noderna fick text-content. Äldre noder med korta properties fungerade. Längre dokument och transkript triggade 400-felet. Nu fixat.

## Filer ändrade/skapade denna session

| Fil                                  | Ändring                                      |
| ------------------------------------ | -------------------------------------------- |
| MARCUS.md                            | Ny, sedan uppdaterad av Marcus               |
| docs/dagbocker/DAGBOK-MARCUS.md      | Ny                                           |
| docs/dagbocker/DAGBOK-DEV.md         | Ny                                           |
| docs/dagbocker/DAGBOK-LLM.md         | Ny, uppdaterad                               |
| docs/RAPPORT-KODANALYS-2026-03-26.md | Ny (466 rader)                               |
| docs/HANDOFF-OPENCODE.md             | Ny                                           |
| docs/aurora-api-spec.yaml            | Ny (1487 rader)                              |
| src/aurora/aurora-graph.ts           | Fix: embedding-text trunkering               |
| src/core/embeddings.ts               | Fix: batch-fallback                          |
| src/commands/embed-nodes.ts          | Fix: samma trunkering                        |
| tests/core/embeddings.test.ts        | Uppdaterad: ny test för fallback             |
| tests/commands/embed-nodes.test.ts   | Uppdaterad: ny förväntan                     |
| aurora-workers/extract_video.py      | Fix: mkdtemp istället för TemporaryDirectory |
| scripts/reembed-aurora.ts            | Ny: utility för att re-embeda aurora-noder   |

### Commits

| Commit  | Beskrivning                                                  |
| ------- | ------------------------------------------------------------ |
| 5f69730 | docs: migrate to OpenCode + establish session infrastructure |
| 0c819da | docs: update MARCUS.md with Marcus's own profile data        |
| 04d0478 | fix: truncate embedding texts and add batch fallback         |
| dcf34ed | fix: use persistent temp dir in extract_video.py             |

Branch main synkad med GitHub (dcf34ed).

### Testresultat vid sessionsslut

Test Files: 294 passed (294)
Tests: 3949 passed (3949)
Duration: 15.76s

### Databas vid sessionsslut

aurora_nodes: 84 (45 start + 14 RAG-artikel + 22 YouTube + 3 metadata)
aurora_nodes utan embedding: 1 (vid-4fc93ffbb1cd, känd trasig nod)
kg_nodes utan embedding: 0

---

## Nästa session

### Prioritetsordning:

1. Lägg till AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3 i .env
2. Testa PDF-ingest end-to-end
3. Testa morning briefing
4. Indexera riktigt material — Marcus väljer URLs, dokument, YouTube-videos
5. Fixa vid-4fc93ffbb1cd — debug specialtecknen
6. Installera gemma3 i Ollama eller ändra polish-modell i config
7. Uppdatera ROADMAP.md med nya status

### Miljökrav för nästa session

```
export PATH="/Users/mpmac/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/bin:$PATH"
corepack enable pnpm
export AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3
```

### Regler

- Kör alltid pnpm test efter kodändringar (3949 tester ska vara gröna)
- Commit och push ofta (Marcus vill ha allt i GitHub)
- Uppdatera DAGBOK-LLM.md vid sessionsslut (lifeline)
- Läs MARCUS.md (kommunikationsstil och beslutsprinciper)

---

## VIKTIGT för nästa chatt

Läs dessa filer i ordning:

1. docs/dagbocker/DAGBOK-LLM.md
2. MARCUS.md
3. AGENTS.md
4. docs/RAPPORT-KODANALYS-2026-03-26.md (om Aurora-arbete)

Aurora fungerar. Fokus nästa session = börja använda den på riktigt.
