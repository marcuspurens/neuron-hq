# Handoff: Session 75 — STT-förbättringar + Aurora-vision

**Datum:** 2026-03-10 13:00
**Commit:** `03cdbde` (STT språkdetektering)
**Tester:** 1510 ✅ (+8)
**Körningar:** 110

## Gjort

### STT-förbättringar (körning 110, brief → Neuron)
- **Brief skriven** → Neuron implementerade → 🟢 GREEN (1510/1510)
- `WorkerRequest.options` — generellt options-fält för att skicka data till Python-workers
- Python `__main__.py` — `inspect.signature`-baserad dispatch (vidarebefordrar options till handlers som accepterar dem)
- `transcribe_audio.py` — omskriven med 3-tier modelval:
  1. Explicit `whisper_model` i options → använd rakt av
  2. Explicit `language` → välj modell ur `LANG_MODEL_MAP`
  3. Inget angivet → `tiny`-modell detekterar språk → väljer modell (sv → KBLab/kb-whisper-large)
- `--language` CLI-flagga + MCP language-parameter
- `modelUsed` i `VideoIngestResult` + CLI-output

### Aurora-vision omdefinierad
- Roadmap uppdaterad: Aurora = **personligt forskningscenter** (inte bara "kunskapsbas")
- Tar in: webb, PDF, Word, video, ljud, röster, bilder, konversationer, live-inspelningar
- MEMORY_AURORA.md helt omskriven

### Python-beroenden verifierade
Alla 5 Aurora-beroenden installerade i Anaconda:
- ✅ faster-whisper 1.2.1
- ✅ pyannote.audio
- ✅ yt-dlp 2026.3.3
- ✅ pypdfium2
- ✅ trafilatura

### Briefs skrivna (ej körda)
1. `briefs/2026-03-10-stt-deps-check.md` — `aurora:check-deps` CLI-kommando

## Ändrade filer (av Neuron-körning 110)
- `src/aurora/worker-bridge.ts` — `options?` i WorkerRequest
- `aurora-workers/__main__.py` — inspect-baserad options dispatch
- `aurora-workers/transcribe_audio.py` — språkdetektering + modelval
- `src/aurora/video.ts` — `language` i options, `modelUsed` i result, options-passthrough
- `src/commands/aurora-ingest-video.ts` — `--language`, modelUsed output
- `src/mcp/tools/aurora-ingest-video.ts` — language parameter
- `src/cli.ts` — `--language` option
- Tester: +8 nya (5 video, 2 CLI, 1 MCP)

## Env-variabler (STT)
```
WHISPER_MODEL=small          # default modell
WHISPER_MODEL_SV=KBLab/kb-whisper-large  # svensk modell
WHISPER_MODEL_DETECT=tiny    # modell för språkdetektering
```

## Nästa session

### Prioritet 1: Testa STT på riktigt
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx src/cli.ts aurora:ingest-video "https://www.svt.se/nyheter/..." --diarize
```
Förväntat: detekterar "sv" → laddar KBLab/kb-whisper-large (~3 GB första gången) → bättre svensk transkribering.

### Prioritet 2: Kör check-deps brief
```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-10-stt-deps-check.md --hours 1
```

### Prioritet 3: C2 Voiceprint-redigering
Skriv brief för rename/merge/suggest speakers.

### Idéer
- Live-röstinspelning från Mac (mikrofon → WAV → Whisper)
- Word-dokument via python-docx worker
- `aurora:check-deps --preload-models` för att förladda Whisper-modeller
