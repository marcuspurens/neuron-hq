# Aurora #14 — python-dotenv + saknade paket

## Mål

Installera saknade Python-paket och fixa att `.env` inte laddas automatiskt.

## Bakgrund

Aurora läser konfiguration via `os.getenv()` i `app/core/config.py`, men det finns ingen `load_dotenv()`-anrop någonstans. Det innebär att `.env`-filen inte laddas automatiskt när man startar workers — miljövariabler måste sättas manuellt i terminalen (t.ex. `OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest`). Det är skört och felbenäget.

Följande paket är definierade i koden men saknas i `pyproject.toml` och är inte installerade:
- `python-dotenv` — för att ladda `.env`
- `yt-dlp` — för att ladda ner videor/ljud (ingest-pipeline)
- `python-docx` — för att läsa Word-dokument
- `snowflake-connector-python` — för Snowflake-integration (optional)

## Uppgifter

### 1. Lägg till `load_dotenv()` i config.py

I `app/core/config.py`, lägg till i `load_settings()`-funktionen:

```python
from dotenv import load_dotenv

def load_settings() -> Settings:
    load_dotenv()  # ← lägg till överst i funktionen
    artifact_root = Path(os.getenv(...))
    ...
```

### 2. Uppdatera pyproject.toml

Lägg till de saknade paketen under `[project] dependencies`:

```toml
dependencies = [
  "pydantic>=2.5",
  "python-dotenv>=1.0",
  "yt-dlp>=2024.1",
  "python-docx>=1.1",
  "snowflake-connector-python>=3.0; extra == 'snowflake'",
]
```

OBS: `snowflake-connector-python` kan läggas som optional extra om det är lättare.

### 3. Skriv tester

Skapa `tests/test_dotenv_and_packages.py` med tester som:
- Verifierar att `python-dotenv` kan importeras
- Verifierar att `yt_dlp` kan importeras
- Verifierar att `docx` (python-docx) kan importeras
- Verifierar att `load_settings()` anropar `load_dotenv()` (mock-test)

### 4. Installera paketen

Kör i workspace (Aurora-repot):
```bash
.venv/bin/pip install python-dotenv yt-dlp python-docx
```

OBS: Skippa `snowflake-connector-python` om det tar för lång tid eller kräver extra beroenden — det kan göras separat i #14b.

## Verifiering

```bash
.venv/bin/python -m pytest tests/test_dotenv_and_packages.py -v
.venv/bin/python -m pytest tests/ -x -q
```

Förväntat: alla 197+ tester gröna, nya importtester gröna.

## Avgränsningar

- Ändra INTE `.env`-filen
- Ändra INTE befintlig konfig-logik utöver att lägga till `load_dotenv()`
- Skippa `pyannote.audio` (~1 GB, kräver HuggingFace-token) — det är #14b
- Skippa `snowflake-connector-python` om installationen är komplex
