---
session: 22
datum: 2026-04-21
---

# Session 22 — Dev Notes

## Ändringar

| Fil | Ändring |
|-----|---------|
| `aurora-workers/mcp_server.py` | NEW — Python MCP server (FastMCP + stdio). 6 tools. Lifespan loads WhisperX model + pyannote pipeline. All blocking work via `run_in_executor`. |
| `aurora-workers/requirements.txt` | +mcp, +whisperx (git), +torch, +torchaudio |
| `aurora-workers/test_mcp_server.py` | NEW — Manual MCP client test script (not committed) |
| `src/aurora/media-client.ts` | NEW — Singleton MCP client. `callMediaTool(action, args, opts)` replaces `runWorker()`. Lazy server spawn on first call. Stderr forwarded to logger. |
| `src/aurora/video.ts` | 4× `runWorker()` → `callMediaTool()`. Speaker guess gate removed (`options?.diarize` no longer required). Guess results saved via `applyGuessesToGraph()`. |
| `src/aurora/job-runner.ts` | `extract_video_metadata` → `callMediaTool()`. Kept `runWorker` import for `get_pdf_page_count`. |
| `src/aurora/speaker-guesser.ts` | +`saveAuroraGraph` import. +`applyGuessesToGraph()` — writes `guessedName`/`guessedRole`/`guessConfidence` to voice_print nodes, `speakerGuesses` array to transcript node. |
| `src/commands/obsidian-export.ts` | `renderBlockText()` returns plain text (no HTML). +`WordsSidecar`/`WordProvenance` interfaces. +`buildWordsSidecar()`. +`formatTimestampLink()` for clickable YouTube URLs. `buildTimelineSection()` merges blocks into flowing paragraphs with single timestamp. Idempotent writes: content comparison ignoring `exported_at`/`generated`. `isFirstExport` gate on LLM ops. `buildSpeakerMap()` fallback to `guessedName` from voice_print. Speaker table +Wikipedia +IMDb columns. `words_file` in frontmatter. |
| `src/mcp/tools/aurora-check-deps.ts` | `runWorker` → `callMediaTool` |
| `mcp-config.example.json` | +`aurora-media` server entry |
| `.env.example` | +WHISPER_MODEL, WHISPER_MODEL_SV, WHISPER_MODEL_DETECT, WHISPER_BATCH_SIZE, WHISPER_THREADS |
| `tests/aurora/video.test.ts` | `mockRunWorker` → `mockCallMediaTool`. All 73 occurrences. Call signature: `(action, {args}, {timeout})` instead of `({action, source, options}, {timeout})`. |
| `tests/aurora/auto-cross-ref.test.ts` | +`mockCallMediaTool` mock for `media-client.js`. `ingestVideo` tests use new mock. |
| `tests/aurora/job-runner.test.ts` | +`mockCallMediaTool` mock |
| `tests/aurora/job-system-polish.test.ts` | +`mockCallMediaTool` mock, video mock responses moved to new mock |
| `tests/mcp/tools/aurora-check-deps.test.ts` | Rewritten: `worker-bridge` → `media-client` mock |

## Beslut och tradeoffs

| Beslut | Rationale | Alternativ som förkastades |
|--------|-----------|---------------------------|
| Option B: TS som MCP-klient till Python-server | video.ts orkestrerar 5 sekventiella steg (download→denoise→transcribe→diarize→process). Kan inte flytta pipeline-logik till LLM. | Option A (expose till Claude direkt) — bryter pipeline. Option C (hybrid) — kräver SSE-transport, overengineered. |
| Standoff annotation (.md + .words.json) | Obsidian saniterar `data-*` attribut via DOMPurify. Live Preview bryter med inline HTML. W3C, BRAT, STAM, OOXML, GraphRAG — alla separerar text från metadata. | Inline `%%`-kommentarer — fungerar i Reading view men inte Live Preview. Dataview inline fields — för granulära, buggiga med många fält per rad. |
| Idempotent export (content comparison) | Daemon bevakar Aurora/ → export skriver till Aurora/ → trigger-loop → Obsidian reloads → scroll till toppen. `stripVolatile()` tar bort `exported_at`/`generated` före jämförelse. | Exkludera Aurora/ från WatchPaths — kräver plist-ändring, löser inte grundproblemet. |
| WhisperX large-v3-turbo | Sentence segmentering (NLTK Punkt), wav2vec2 word alignment, batched inference. faster-whisper saknar alignment. mlx-whisper saknar diarization. openai/whisper saknar sentence segmentering. | mlx-whisper — smalare community, ingen diarization. openai/whisper med MPS — saknar forced alignment. |
| Speaker guess unconditional | `guessSpeakers()` behöver bara titel + beskrivning + sample text. Ingen diarization krävs. Single-speaker-videor har mest nytta. | Behålla `options?.diarize` gate — onödigt restriktivt, Pi-videon fick aldrig guess. |

## Testdelta

| Modul | Före | Efter | Diff |
|-------|------|-------|------|
| video.test.ts | 66 | 66 | mocks uppdaterade |
| aurora-check-deps.test.ts | 5 | 5 | rewritten |
| auto-cross-ref.test.ts | — | — | +mock, ingestVideo tests updated |
| job-runner.test.ts | — | — | +mock |
| job-system-polish.test.ts | — | — | +mock |
| **Totalt** | 221 (s21) | 4162 pass / 13 fail | alla 13 pre-existing |

## Kända risker

- `worker-bridge.ts` fortfarande i bruk av `intake.ts` — dubbla worker-system under övergångsperiod
- WhisperX `DiarizationPipeline` wrapper saknas i installerad version — pyannote fungerar separat men WhisperX:s convenience-API:er kraschar
- CTranslate2 stödjer inte Apple MPS — WhisperX ASR kör på CPU float32/int8, alignment/diarization på MPS
- `.words.json` sidecar-filer inte gitignored — de kan bli stora (634KB för 27 min video)
- `applyGuessesToGraph()` skriver till `graph.json` som sedan måste synkas till PostgreSQL — `saveAuroraGraph()` hanterar synken men timing kan vara off vid concurrent access
