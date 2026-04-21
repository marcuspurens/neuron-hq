# Session 22 — MCP-first WhisperX + Standoff Annotation

## Summary

Replaced the subprocess-per-call Python worker architecture (`worker-bridge.ts`) with a persistent MCP server (`aurora-workers/mcp_server.py`) running WhisperX for transcription. Upgraded Obsidian export from inline HTML spans to clean markdown text with standoff annotation (`.words.json` sidecar files). Fixed daemon double-triggering via idempotent export. Auto-guesses speaker names from video metadata.

## Architecture Changes

### MCP-first Media Pipeline (NEW)
```
Before: video.ts → runWorker() → spawn Python per call → stdin/stdout JSON → exit
After:  video.ts → callMediaTool() → MCP Client → persistent Python MCP server → response
```

**Key files:**
- `aurora-workers/mcp_server.py` — Python MCP server (FastMCP + stdio). 6 tools: `transcribe_audio`, `diarize_audio`, `denoise_audio`, `extract_video`, `extract_video_metadata`, `check_deps`. Models loaded once in lifespan, kept warm between calls.
- `src/aurora/media-client.ts` — TypeScript MCP client. Singleton connection to Python server. `callMediaTool()` returns same `WorkerResponse` shape as old `runWorker()`.

**What changed in callers:**
- `video.ts`: 4× `runWorker()` → `callMediaTool()` (extract, denoise, transcribe, diarize)
- `job-runner.ts`: `extract_video_metadata` → `callMediaTool()`
- `aurora-check-deps.ts`: → `callMediaTool()`

**What didn't change:**
- `worker-bridge.ts` still exists — used by `intake.ts` for URL/PDF extraction (non-media workers)
- `WorkerResponse` interface unchanged — `media-client.ts` returns the same shape

### Standoff Annotation (NEW)
```
Before: <span data-t="2636" data-s="SPEAKER_01" data-src="yt-X">Hi,</span>
After:  Hi, my name is Mario.    (clean text in .md)
        + .words.json sidecar    (full per-word provenance)
```

**Obsidian gets:**
```
Aurora/Video/
  Mario Zechner - Pi.md              ← clean markdown, clickable YouTube timestamps
  Mario Zechner - Pi.words.json      ← 4564 words with {text, start, end, speaker, confidence}
```

### Idempotent Export (FIX)
Export now compares content before writing (ignoring `exported_at` timestamps). Daemon re-triggers don't rewrite identical files → Obsidian doesn't reload → no scroll-to-top.

LLM-based operations (semantic split, chapter titles, topic tags) only run on first export, not on re-exports.

### Speaker Auto-Guess (ENHANCED)
`guessSpeakers()` now runs on ALL video ingests (not just when diarization is active). Results are saved to voice_print nodes in the graph (`guessedName`, `guessedRole`). Obsidian export falls back to guessed names when no confirmed `speaker_identity` exists.

### EBUCore+ Schema Completion
Speaker table now includes `Wikipedia` and `IMDb` columns (were missing from session 21). Full EBUCore+ ec:Person coverage.

## Files Changed

| File | Change |
|------|--------|
| `aurora-workers/mcp_server.py` | NEW — Python MCP server with WhisperX |
| `aurora-workers/test_mcp_server.py` | NEW — Manual test script |
| `aurora-workers/requirements.txt` | +mcp, +whisperx, +torch, +torchaudio |
| `src/aurora/media-client.ts` | NEW — TypeScript MCP client singleton |
| `src/aurora/video.ts` | 4× runWorker → callMediaTool, speaker guess always runs, saves to graph |
| `src/aurora/job-runner.ts` | extract_video_metadata → callMediaTool |
| `src/aurora/speaker-guesser.ts` | +applyGuessesToGraph(), +saveAuroraGraph import |
| `src/commands/obsidian-export.ts` | Standoff annotation, idempotent writes, clickable timestamps, speaker guess fallback, full EBUCore+ table |
| `src/mcp/tools/aurora-check-deps.ts` | runWorker → callMediaTool |
| `mcp-config.example.json` | +aurora-media server entry |
| `.env.example` | +WhisperX config vars |
| 5 test files | Mock migration: worker-bridge → media-client |

## Verification

- **Typecheck**: clean (1 pre-existing in video.ts)
- **Tests**: 4162 pass / 13 fail (all pre-existing)
- **Live test**: Pi video (27 min) transcribed with WhisperX large-v3-turbo, 292 segments, 4564 words, word-level alignment. Full ingest → Obsidian export verified.

## Constraints for Session 23

1. `think: false` — MUST on all new Ollama calls (gemma4:26b)
2. `worker-bridge.ts` still used by `intake.ts` — don't remove yet
3. Diarization pipeline failed to load (`whisperx.DiarizationPipeline` missing in installed version). Pyannote works separately but WhisperX's wrapper may need version pin.
4. `.env` has `WHISPER_MODEL=large` (not `large-v3-turbo`). Server loads whatever env says.
5. `.words.json` sidecar has `version: 1` — maintain backward compat.

## Recommended Next Steps

1. Fix diarization — either pin WhisperX version with working DiarizationPipeline or call pyannote directly
2. Daemon double-trigger — WatchPaths includes Aurora/ which export writes to. Fix: exclude Aurora/ or use temp-dir. Low priority since idempotent export neutralizes it.
3. Test speaker auto-guess on multi-speaker video (A2A video has 2 speakers)
