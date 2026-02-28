# Aurora — YouTube-intake fungerar end-to-end (C2)

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-26-aurora-youtube-intake.md --hours 1
```

## Mål

YouTube-intake-pipelinen finns redan och är väl byggd men har fyra kända brister.
Målet är att fixa dem och skriva ett integrationstest som verifierar hela flödet:
URL → ladda ner ljud → transkribera (Whisper) → chunk → embedding-klar.

## Bakgrund

Befintlig pipeline (funkar i isolering, 28 tester):
```
intake_youtube.enqueue(url)
  → youtube_client.get_video_info(url)    # yt-dlp, metadata
  → youtube_client.extract_audio(url)     # yt-dlp, laddar ner m4a
  → denoise_audio.handle_job()            # optional, DeepFilterNet
  → transcribe_whisper_cli.handle_job()   # Whisper CLI eller faster-whisper
  → chunk_transcript.handle_job()         # segments → chunks
  → embed_chunks.handle_job()             # chunks → embeddings
```

**Kända problem:**

1. **`enqueue()` validerar inte YouTube-URL** — `https://vimeo.com/...` eller
   `not-a-url` skickas vidare och kraschar tyst inne i yt-dlp

2. **`enqueue()` saknar dedup-kontroll** — samma video startas om igen även om
   manifest + audio redan finns

3. **`compute_source_version()` laddar ner hela ljudfilen** bara för att räkna
   ut en SHA256-hash för dedup. Det tar 30–120 sekunder i onödan — video_id +
   upload_date räcker för dedup.

4. **Whisper saknas i `pyproject.toml`** — användaren måste installera manuellt,
   ingen version är pinnad, kan orsaka kompatibilitetsproblem

## Relevanta filer

- `app/clients/youtube_client.py` — yt-dlp wrapper
- `app/modules/intake/intake_youtube.py` — enqueue + ingest_youtube()
- `app/clients/whisper_client.py` — CLI + faster-whisper backends
- `app/modules/transcribe/transcribe_whisper_cli.py` — transkriberings-handler
- `pyproject.toml` — beroenden
- `tests/test_intake_youtube.py` — 1 befintligt test
- `tests/test_whisper_client.py` — 7 befintliga tester

## Relevanta filer (uppdaterad)

- `app/modules/intake/intake_youtube.py` — enqueue + ingest_youtube + handle_job
- `app/clients/youtube_client.py` — get_video_info, extract_audio, cookie-hantering
- `app/clients/whisper_client.py` — CLI + faster-whisper backends
- `app/modules/transcribe/transcribe_whisper_cli.py` — transkriberings-handler
- `pyproject.toml` — beroenden
- `tests/test_intake_youtube.py` — 1 befintligt test (unit, mock)
- `tests/test_youtube_cookies.py` — 14 befintliga tester (rör ej)
- `tests/test_whisper_client.py` — 7 befintliga tester

## Uppgifter

### 1. Lägg till YouTube URL-validering i `enqueue()`

Lägg till validering *som allra första sak* i `enqueue()`:

```python
from urllib.parse import urlparse

def _is_youtube_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and any(
            host in (parsed.netloc or "")
            for host in ("youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com")
        )
    except Exception:
        return False
```

I `enqueue()`, första raden:
```python
if not _is_youtube_url(url):
    raise ValueError(f"Not a YouTube URL: {url}")
```

### 2. Lägg till dedup-kontroll i `enqueue()`

Efter att `source_version` beräknats, hoppa över om videon redan är inläst:

```python
existing = get_manifest(source_id, source_version)
if existing:
    audio_path = artifact_path(source_id, source_version, AUDIO_REL_PATH)
    if audio_path.exists():
        return source_id  # redan klar, inget nytt jobb
```

`get_manifest` och `artifact_path` importeras redan i filen.

### 3. Lägg till Whisper som optional dependency i `pyproject.toml`

```toml
[project.optional-dependencies]
transcribe = [
    "faster-whisper>=1.0",
]
```

Installeras med: `pip install "aurora-swarm-lab[transcribe]"`

**OBS:** `openai-whisper` (CLI-backenden) installeras separat av användaren om de
vill — den kräver FFmpeg och är svårare att pinna. Lägg bara till `faster-whisper`.

### 4. Fixa `compute_source_version()` i `app/modules/intake/intake_youtube.py`

Idag laddar funktionen ner hela ljudfilen (30–120s) bara för att hasha den.
Ersätt med video_id + upload_date från metadata:

```python
def compute_source_version(url: str) -> str:
    """Compute a stable version string from video metadata (fast, no download)."""
    info = get_video_info(url)
    video_id = info.get("id", "")
    upload_date = info.get("upload_date", "")  # "YYYYMMDD"
    raw = f"{video_id}:{upload_date}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]
```

Deduplication fungerar fortfarande — samma video har alltid samma id + datum.

### 5. Skriv integrationstest i `tests/test_youtube_intake_integration.py`

Testa hela pipelinen med mockad yt-dlp och mockad Whisper (ingen riktig
nätverkstrafik, ingen GPU behövs):

```python
def test_full_youtube_pipeline_produces_chunks():
    """
    Verifierar: enqueue → ingest_youtube → transcribe → chunk_transcript
    → chunks.jsonl finns med text_to_embed.
    """
    # Mock get_video_info() → {id, title, uploader, upload_date}
    # Mock extract_audio() → skriv fake m4a-bytes
    # Mock run_whisper_backend() → returnera fake SRT-innehåll
    # Kör ingest_youtube.handle_job()
    # Kör transcribe_whisper_cli.handle_job()
    # Kör chunk_transcript.handle_job()
    # Verifiera att chunks/chunks.jsonl finns och innehåller text_to_embed
```

Tester att inkludera:
- `test_full_youtube_pipeline_produces_chunks` — happy path
- `test_enqueue_rejects_non_youtube_url` — `ValueError` vid `https://vimeo.com/...`
- `test_enqueue_rejects_invalid_url` — `ValueError` vid `not-a-url`
- `test_enqueue_skips_duplicate_video` — samma video enqueuas inte igen om
  manifest + audio redan finns
- `test_compute_source_version_is_fast` — anropar INTE extract_audio (verifiera
  med mock att extract_audio aldrig kallas)
- `test_compute_source_version_is_stable` — samma URL → samma version
- `test_ingest_youtube_stores_audio_artifact` — audio/source.m4a finns i manifest
- `test_transcribe_stores_segments_jsonl` — transcript/segments.jsonl finns

## Verifiering

```bash
cd "/Users/mpmac/Documents/VS Code/aurora-swarm-lab"
OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest \
  "/Users/mpmac/Documents/VS Code/aurora-swarm-lab/.venv/bin/python3" \
  -m pytest tests/test_youtube_intake_integration.py -v
OLLAMA_MODEL_EMBED=snowflake-arctic-embed:latest \
  "/Users/mpmac/Documents/VS Code/aurora-swarm-lab/.venv/bin/python3" \
  -m pytest tests/ -x -q
```

Alla 222 befintliga tester ska fortfarande passera.

## Avgränsningar

- Testa INTE med riktiga HTTP-anrop mot YouTube
- Kör INTE Whisper på riktigt i tester — mocka run_whisper_backend()
- Fixa INTE speaker diarization (det är en separat brief)
- Lägg INTE till openai-whisper i pyproject.toml (bara faster-whisper)
- Ändra INTE chunk_transcript-logiken (den är klar sedan A1)
- Ändra INTE `youtube_client.py` (cookie-logiken är klar, rör den inte)
- Ändra INTE `test_youtube_cookies.py` (14 tester, rör dem inte)
- Fixa INTE befintliga mypy-fel (pre-existing, ej vår sak)
