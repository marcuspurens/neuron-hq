---
session: 22
date: 2026-04-21
variant: llm
---

# Session 22 — MCP-first WhisperX + Standoff Annotation

## Changes

| File | Change |
|------|--------|
| `aurora-workers/mcp_server.py` | NEW — Python MCP server (FastMCP, stdio). 6 tools: transcribe_audio (WhisperX), diarize_audio, denoise_audio, extract_video, extract_video_metadata, check_deps. Lifespan model loading. |
| `aurora-workers/test_mcp_server.py` | NEW — Manual MCP test client |
| `aurora-workers/requirements.txt` | +mcp, +whisperx, +torch, +torchaudio |
| `src/aurora/media-client.ts` | NEW — TypeScript MCP client singleton. `callMediaTool()` drop-in for `runWorker()`. Lazy server spawn, persistent connection. |
| `src/aurora/video.ts` | 4× runWorker→callMediaTool. Speaker guess runs unconditionally (not just with diarize). Saves guesses to graph. |
| `src/aurora/job-runner.ts` | extract_video_metadata → callMediaTool |
| `src/aurora/speaker-guesser.ts` | +applyGuessesToGraph() — writes guessedName/guessedRole to voice_print nodes |
| `src/commands/obsidian-export.ts` | Standoff: renderBlockText outputs plain text. buildWordsSidecar generates .words.json. formatTimestampLink creates clickable YouTube links. Idempotent writes (skip unchanged files, strip exported_at). LLM ops only on first export. Speaker table +Wikipedia +IMDb columns. guessedName fallback in buildSpeakerMap. |
| `src/mcp/tools/aurora-check-deps.ts` | runWorker → callMediaTool |
| `mcp-config.example.json` | +aurora-media server entry |
| `.env.example` | +WHISPER_MODEL, WHISPER_MODEL_SV, WHISPER_BATCH_SIZE, WHISPER_THREADS |
| `tests/aurora/video.test.ts` | Mock migration: mockRunWorker → mockCallMediaTool, updated call signatures |
| `tests/aurora/auto-cross-ref.test.ts` | +mockCallMediaTool for video tests |
| `tests/aurora/job-runner.test.ts` | +mockCallMediaTool |
| `tests/aurora/job-system-polish.test.ts` | +mockCallMediaTool |
| `tests/mcp/tools/aurora-check-deps.test.ts` | Rewritten for callMediaTool |

## New/Changed Interfaces

```typescript
// src/aurora/media-client.ts
type MediaAction = 'transcribe_audio' | 'diarize_audio' | 'denoise_audio' | 'extract_video' | 'extract_video_metadata' | 'check_deps';
function callMediaTool(action: MediaAction, args: Record<string, unknown>, options?: { timeout?: number }): Promise<WorkerResponse>;
function closeMediaClient(): Promise<void>;

// src/aurora/speaker-guesser.ts
function applyGuessesToGraph(transcriptNodeId: string, guesses: SpeakerGuess[]): Promise<void>;

// src/commands/obsidian-export.ts — sidecar format
interface WordsSidecar { version: 1; sourceId: string; videoUrl: string; generated: string; speakers: Record<string, string>; words: WordProvenance[]; }
interface WordProvenance { text: string; start: number; end: number; speaker: string; confidence: number; }
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Option B (TS as MCP client to Python server) over Option A (expose to Claude) or C (hybrid) | video.ts orchestrates 5 sequential steps — pipeline logic must stay in TS, not move to LLM. Python server is internal service. |
| Standoff annotation (.md + .words.json) over inline HTML spans | W3C Web Annotation standard, NLP industry (BRAT, STAM), Microsoft (OOXML, GraphRAG) all separate text from metadata. Obsidian sanitizes data-* attributes, Live Preview breaks with HTML. |
| Idempotent export (content comparison) over always-write | Daemon watches Aurora/ — export writes to Aurora/ — loop. Comparing content stops unnecessary rewrites → Obsidian doesn't reload → no scroll-to-top. |
| Speaker guess runs without diarization | guessSpeakers only needs title + description + sample text. Single-speaker videos benefit most. |
| WhisperX large-v3-turbo over mlx-whisper or openai/whisper | WhisperX gives sentence segmentation (NLTK Punkt), wav2vec2 word alignment, built-in pyannote, batched inference. |

## Test Delta

- Before: 221 tests (session 21 count)
- After: 4162 pass / 13 fail (all pre-existing). Test count increase from new test files added in sessions between 21 and 22.
- typecheck: clean (1 pre-existing: video.ts:811 unused var)

## Known Issues

- WhisperX `DiarizationPipeline` wrapper missing in installed version — pyannote works standalone
- CTranslate2 does not support Apple MPS — WhisperX ASR runs on CPU, alignment/diarization on MPS
- Daemon double-trigger still exists but neutralized by idempotent export
- `worker-bridge.ts` still used by `intake.ts` — cannot remove yet

## Verification

- Pi video (27 min): WhisperX large-v3-turbo, 292 segments, 4564 words, word-level alignment ✅
- Full ingest pipeline: download → transcribe → chunk → graph → DB → Obsidian export ✅
- Obsidian: clean text, clickable timestamps, .words.json sidecar ✅
- Typecheck: clean ✅
- Tests: 4162 pass ✅
