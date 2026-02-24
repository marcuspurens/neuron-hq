# Brief: Aurora Knowledge Hygiene — library + delete-source

**Datum:** 2026-02-24
**Target:** aurora-swarm-lab
**Körning:** #13

## Bakgrund

Aurora har nu ett fungerande RAG-flöde (URL → chunk → embed → ask). Men utan verktyg
för att se och rensa inmatad data växer kunskapsbasen okontrollerat med inaktuell eller
felaktig information. För en "digital tvilling" är hygien avgörande.

## Mål

Implementera två CLI-kommandon:

### 1. `aurora library`
Visa alla inmatade sources med:
- `source_id` (t.ex. `url:https://...`)
- Datum för inmatning
- Antal chunks
- Antal embeddings
- Status (ingest done / chunks done / embeddings done / partial)

### 2. `aurora delete-source <source_id>`
Ta bort en källa komplett:
- DELETE FROM embeddings WHERE source_id = ?
- DELETE FROM jobs WHERE source_id = ?
- DELETE FROM manifests WHERE source_id = ?
- Ta bort artifact-filer från disk (chunks/, text/, raw/)
- Skriv ut bekräftelse med vad som togs bort

## Tekniska detaljer

Filer att röra:
- `app/cli/main.py` — lägg till `library` och `delete-source` subkommandon
- `app/modules/library/` — ny mapp med `list_sources.py` och `delete_source.py`
- `tests/test_library.py` — tester för båda kommandona

Befintliga tabeller:
- `jobs` (job_id, job_type, lane, status, source_id, source_version, ...)
- `manifests` (source_id, source_version, manifest_json, updated_at)
- `embeddings` (se embedding_store.py för exakt schema)

## Verifiering
```bash
.venv/bin/python -m app.cli.main library
.venv/bin/python -m app.cli.main delete-source "url:https://peps.python.org/pep-0703/"
.venv/bin/python -m app.cli.main library  # ska visa tomt nu
.venv/bin/python -m pytest tests/ -x -q
```

## Avgränsning
- Ingen Dropbox-watcher i denna körning (separat brief)
- Ingen cascade till graph-tabeller om sådana finns (lägg till om de existerar)
- Enkelt textutskrift (ej JSON) för library-kommandot
