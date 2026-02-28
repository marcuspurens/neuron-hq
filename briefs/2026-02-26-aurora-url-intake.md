# Aurora — URL-intake fungerar end-to-end (C1)

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-26-aurora-url-intake.md --hours 1
```

## Mål

URL-intake-pipelinen finns redan men är aldrig testad end-to-end. Målet är att
fixa de tre kända bristerna och skriva ett integrationstest som verifierar att
hela flödet fungerar: URL → scrape → text → chunk → embedding-klar.

## Bakgrund

Befintlig pipeline (funkar i isolering):
```
intake_url.enqueue(url)
  → scrape_url.scrape(url)        # HTTP-fetch + optional headless fallback
  → readable_text.extract(html)   # HTML → ren text
  → chunk_text.handle_job()       # text → chunks med text_to_embed
  → embed_chunks.handle_job()     # chunks → embeddings
```

**Kända problem:**
1. `http_client.fetch_text()` skickar ingen `User-Agent` — många sajter blockar
2. `intake_url.enqueue()` validerar inte URL-format — ogiltiga URLs kraschar tyst
3. Playwright (headless fallback) saknas i `pyproject.toml` — kan inte installeras

## Relevanta filer

- `app/clients/http_client.py` — urllib-klient
- `app/modules/intake/intake_url.py` — intake-handler + enqueue
- `app/modules/scrape/scrape_url.py` — scraper (HTTP + headless)
- `app/modules/scrape/readable_text.py` — HTML → text
- `pyproject.toml` — beroenden
- `tests/test_scrape_url.py` — 3 befintliga tester (unit, mock)
- `tests/test_intake_url.py` — 2 befintliga tester (unit, mock)

## Uppgifter

### 1. Lägg till User-Agent i `app/clients/http_client.py`

```python
headers = {
    "User-Agent": "Mozilla/5.0 (compatible; AuroraBot/1.0)"
}
req = urllib.request.Request(url, headers=headers)
```

Utan User-Agent blockar Wikipedia, nyhetsajter och de flesta moderna sajter.

### 2. Lägg till URL-validering i `app/modules/intake/intake_url.py`

I `enqueue()`-funktionen, innan något annat:

```python
from urllib.parse import urlparse

def _is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False
```

Om URL är ogiltig: raise `ValueError(f"Invalid URL: {url}")`.

### 3. Lägg till playwright som optional dependency i `pyproject.toml`

```toml
[project.optional-dependencies]
headless = ["playwright>=1.40"]
```

Installeras med: `pip install "aurora-swarm-lab[headless]"` + `playwright install`

**OBS:** Ändra INTE hur playwright används i koden — det fungerar redan.

### 4. Skriv integrationstest i `tests/test_url_intake_integration.py`

Testa hela pipelinen med mockad HTTP (ingen riktig nätverkstrafik):

```python
def test_full_url_pipeline_produces_chunks():
    """
    Verifierar: enqueue → ingest_url → chunk_text → chunks finns i JSONL.
    """
    # Mock scrape() att returnera känd HTML
    # Kör ingest_url.handle_job()
    # Kör chunk_text.handle_job()
    # Verifiera att chunks.jsonl finns och innehåller text_to_embed
```

Tester att inkludera:
- `test_full_url_pipeline_produces_chunks` — happy path
- `test_enqueue_rejects_invalid_url` — ValueError vid ogiltigt format
- `test_enqueue_rejects_non_http_scheme` — `ftp://` och `file://` kastas
- `test_http_client_sends_user_agent` — User-Agent-headern finns i request
- `test_duplicate_url_is_skipped` — samma URL enqueuas inte två gånger
  (dedup via `compute_source_version` finns redan)

## Verifiering

```bash
python -m pytest tests/test_url_intake_integration.py -v
python -m pytest tests/ -x -q
```

## Avgränsningar

- Testa INTE med riktiga HTTP-anrop mot internet
- Ändra INTE chunking-logiken (den är klar sedan A1)
- Installera INTE playwright-browsers under testerna
- Fixa INTE alla existerande mypy-fel (91 pre-existing, ej vår sak)
- Skriv INTE om scrape_url.py — den funkar, vi lagar bara beroenden
