# Aurora #15 — Dropbox-watcher: rensa vid radering

## Mål

När en fil raderas från en bevakad Dropbox-mapp ska Aurora automatiskt rensa bort
alla dess data: embeddings, jobb, manifest och artefakter på disk.

## Bakgrund

`app/modules/intake/intake_dropbox.py` hanterar `on_created`, `on_modified` och
`on_moved` — men **inte `on_deleted`**. Om användaren raderar en fil händer ingenting.
Gamla embeddings ligger kvar i databasen och tar plats.

`delete_source(source_id)` i `app/modules/library/delete_source.py` gör redan exakt
det vi behöver: cascade delete mot embeddings, jobs, manifests + rensning av disk.

## Uppgift

### 1. Lägg till `on_deleted` i `_DropboxHandler`

I `app/modules/intake/intake_dropbox.py`:

```python
def on_deleted(self, event):  # type: ignore[override]
    if event.is_directory:
        return
    path = Path(event.src_path).expanduser().resolve()
    # Filen finns inte längre — hoppa över _should_skip och ensure_ingest_path_allowed
    # source_id beräknas enbart från sökvägen (ingen fil-läsning behövs)
    try:
        source_id = make_source_id("file", str(path))
        delete_source(source_id)
    except Exception:
        return
```

Importera `delete_source` överst i filen:
```python
from app.modules.library.delete_source import delete_source
```

**OBS:** Använd INTE `_should_skip(path)` här — den returnerar alltid `True` för
raderade filer eftersom `path.exists()` är `False`. Använd heller inte
`ensure_ingest_path_allowed` — filen existerar inte och kan inte valideras.
Vi beräknar bara `source_id` från sökvägen och kallar `delete_source`.

### 2. Skriv tester

Lägg till tester i `tests/test_intake_dropbox.py` (eller skapa filen om den saknas):

- `test_on_deleted_calls_delete_source` — mocka `delete_source`, verifiera att den
  anropas med rätt `source_id` när `on_deleted` triggas
- `test_on_deleted_skips_directory` — verifiera att `on_deleted` ignorerar
  katalog-händelser (`event.is_directory = True`)
- `test_on_deleted_handles_exception_gracefully` — verifiera att undantag i
  `delete_source` inte propagerar upp (tyst felhantering)

## Verifiering

```bash
.venv/bin/python -m pytest tests/test_intake_dropbox.py -v
.venv/bin/python -m pytest tests/ -x -q
```

Förväntat: alla 201+ tester gröna, nya tester gröna.

## Avgränsningar

- Ändra INTE befintlig logik för `on_created`, `on_modified`, `on_moved`
- Ändra INTE `delete_source.py`
- Ändra INTE `_should_skip` eller `enqueue_file_if_needed`
- Lägg INTE till loggning eller felrapportering — tyst felhantering räcker (som i `_handle_path`)
