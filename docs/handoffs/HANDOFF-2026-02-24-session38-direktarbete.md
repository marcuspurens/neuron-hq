# Session 38 — Direktarbete (utanför körningar)

**Datum:** 2026-02-24
**Utfört av:** Claude (Sonnet 4.6)

---

## Vad gjordes direkt (ej via körningar)

### 1. Aurora #12 — manuell merge av --drain-flagga
**Varför manuellt:** Manager nådde 50-iterationsgränsen två gånger utan att delegera till Merger.

**Vad applicerades:**
- `app/queue/worker.py`: lade till `max_idle_polls`-parameter + idle-räknare
- `app/cli/main.py`: passade `max_idle_polls=args.max_idle` + `--max-idle` argument
- `tests/test_worker_drain.py`: 3 nya tester (kopierades från workspace)

**Verifiering:** `pytest tests/test_worker_drain.py` → 3/3 gröna, `pytest tests/` → 190/190 gröna
**Commit:** `750a6c5` direkt på aurora main

---

### 2. Embedding-pipeline fix
**Problem:** `ask` returnerade "No information found" — 73 gamla bge-m3-embeddings i DB men fel modell

**Root cause hittad av Manager (iteration 37–40 i resumekörning):**
- `app/core/config.py` defaultar till `nomic-embed-text` (ej installerat)
- `.env` laddas aldrig → env-var ignoreras → 404 från Ollama

**Åtgärder:**
1. `DELETE FROM embeddings; DELETE FROM jobs; DELETE FROM manifests` — rensade DB
2. `enqueue-url https://peps.python.org/pep-0703/` — enquelade om
3. `io worker --max-idle 5` → ingest_url done
4. `enqueue_job("embed_chunks", "oss20b", ...)` manuellt (chunk_text returnerade tidigt — chunks-fil redan på disk)
5. `OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest oss20b worker --max-idle 5` → 65/68 chunks inbäddade

**Kvarstående:** 3 chunks (66-68) ger HTTP 500 — långa GitHub-URL:ar, referenslistor, ej kritiska
**Verifiering:** `ask "What does PEP 703 say about GIL?"` → korrekt svar med citations ✅

---

### 3. Memory-struktur omorganiserad
**Varför:** MEMORY.md växte sig stor (184 rader), svårt att veta vilket projekt en uppdatering gäller

**Nytt upplägg:**
- `MEMORY.md` (~60 rader) — alltid auto-lastat, kompakt index + snabbkommandon + nästa steg
- `MEMORY_AURORA.md` — allt Aurora-specifikt (körningslogg, insikter, DB-status, Fas 0)
- `MEMORY_NEURON.md` — allt Neuron HQ-specifikt (körningslogg, agent-arkitektur, testsvit)

---

## Insikter från sessionens direktarbete

1. **Manager når ofta inte Merger** — 50-it gräns räcker inte för djup felsökning + implementation + review + merge
2. **`.env` laddas aldrig i Aurora** — kritisk bugg, fixas i körning #14 med `python-dotenv`
3. **chunk_text early-return** — om disk-fil finns returnerar funktionen utan att köa embed_chunks. Rensa disk OM du rensar DB.
4. **Splitting MEMORY är rätt** — ett projekt per fil gör uppdateringar tydligare och håller MEMORY.md under 200-radersgränsen
