# Handoff — Session 38

**Datum:** 2026-02-24 23:00
**Nästa session:** 39

---

## Vad gjordes i session 38

### Steg 1 — Aurora #12 merge (manuell)
Manager nådde gränsen på 50 iterationer två gånger utan att nå Merger.
Lösning: manuellt applicerade diff från workspace-branchen och mergade direkt.
- Commit `750a6c5`: `--max-idle` drain-flagga till worker.py + cli/main.py + 3 tester
- Aurora tester: 187 → 190 gröna

### Steg 2 — Embedding-fix (direkt i terminalen)
Root cause för "No information found":
- `.env` laddas INTE automatiskt i Aurora (ingen `load_dotenv`)
- Config defaultar till `nomic-embed-text` (ej installerat) → 404
- Fix: köra workers med `OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest`

Genomförande:
1. DELETE FROM embeddings/jobs/manifests (gamla bge-m3-embeddings rensades)
2. `enqueue-url https://peps.python.org/pep-0703/`
3. `io worker --max-idle 5` → ingest_url done
4. Manuellt: `enqueue_job("embed_chunks", ...)` (chunk_text returnerade tidigt — chunks-fil redan på disk)
5. `oss20b worker --max-idle 5` → 65/68 chunks inbäddade

Kvarstående 3 chunks (66-68): långa GitHub-URL:ar spränger snowflake-arctic-embeds tokenizer → HTTP 500. Dessa är referenslistor/fotnoter — ej kritiska för RAG.

Verifiering: `ask "What does PEP 703 say about GIL?"` → korrekt svar med citations ✅

### Steg 3 — Aurora #13: Knowledge hygiene
Körning ID: `20260224-2155-aurora-swarm-lab`
Commit: `32c2670` (full pipeline: Researcher → Implementer → Tester → Reviewer → Merger → Historian)
Aurora tester: 190 → 197 gröna

Implementerat:
- `aurora library` — listar alla inmatade sources med datum, chunks, embeddings, status
- `aurora delete-source <source_id>` — cascade delete: embeddings + jobs + manifests (DB) + artifact-filer (disk)
- `app/modules/library/list_sources.py` (119 rader)
- `app/modules/library/delete_source.py` (45 rader)
- `tests/test_library.py` (7 tester)

---

## Exakt status just nu

### aurora-swarm-lab main
Senaste commits:
```
32c2670 feat: add aurora library and delete-source CLI commands
750a6c5 feat: add max_idle_polls drain mode to run_worker and --max-idle CLI flag
7df784b fix: add type: ignore[no-redef] comments (mypy)
```
197 tester gröna.

### Kunskapsbas (Aurora DB)
- 65 embeddings (snowflake-arctic-embed, PEP-703)
- `aurora library` visar: status "failed" (embed_chunks-jobbet failade delvis men 65 embeddings finns)
- `ask` fungerar med citations ✅

---

## Viktiga tekniska insikter

### .env laddas inte i Aurora
```python
# app/core/config.py
ollama_model_embed=os.getenv("OLLAMA_MODEL_EMBED", "nomic-embed-text")
```
Ingen `load_dotenv` någonstans. Alltid exportera env-var manuellt:
```bash
OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest .venv/bin/python -m app.cli.main worker ...
```
Permanent fix: `pip install python-dotenv` + lägg till i main.py → körning #14 eller #15.

### chunk_text hoppar över om fil finns
```python
# chunk_text.py:60-62
existing = artifact_path(...)
if existing.exists():
    return  # ← UTAN att köa embed_chunks!
```
Om DB rensas men disk-artefakter finns kvar → chunk_text returnerar tidigt → embed_chunks köas aldrig.
Fix: köa embed_chunks manuellt OR rensa disk-artefakter också.

### Manager når sällan Merger
Återkommande problem: Manager kör slut på 50 iterationer utan att delegera till Merger.
Orsak: Managers system-prompt prioriterar thoroughness, djupgående felsökning tar många iterationer.
Möjlig lösning: öka max_iterations ELLER explicit instruktion i Manager-prompt om att prioritera delegation.

---

## Nästa steg

| Körning | Uppgift |
|---------|---------|
| #14 | Installera saknade paket: `yt-dlp`, `python-docx`, `snowflake-connector-python` |
| #14b | `pyannote.audio` (~1 GB) — kräver HuggingFace-token (finns i .env) |
| #15 | Dropbox-watcher DELETE-events → cascade cleanup via delete-source |
| #16+ | Testa MCP-server mot Claude Desktop |
| Fas 3 | Monitor-agent i Neuron HQ — läser `data/health.json` från Aurora |
| Fas 4 | Docker-container för Aurora |

---

## Dokument skapade i session 38

- `docs/HANDOFF-2026-02-24T2300-session38-library-embedding-fix.md` (denna fil)
- `briefs/2026-02-24-aurora-knowledge-hygiene.md`
