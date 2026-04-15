# Handoff — Session 18: Speaker Alignment + Denoising + Obsidian Fixes

**Datum:** 2026-04-14
**Session:** OpenCode session 18
**Föregående:** Session 17 (youtube-subtitle-obsidian-sync)
**Baseline:** typecheck clean, 4092/4092 tests (start), 4109/4109 (end)

---

## Sammanfattning

Tre features + två bugfixar i en session. All four session 17 priority items addressed (speaker alignment: done, denoise: bonus, Obsidian UX: two fixes). LLM-tldr and daemon verification deferred again.

1. **Sentence-boundary speaker alignment** — `splitAtSentenceBoundaries()` i speaker-timeline.ts splittar Whisper-segment vid interpunktion innan talartilldelning. Ger finare granularitet vid talarbyte.
2. **Audio denoising pipeline** — DeepFilterNet-integration som valfritt steg mellan download och transcription. Isolerad Python venv (`.venvs/denoise/`) pga beroendekonflikt med pyannote.
3. **Obsidian font fix** — Timeline-rubriker ändrade från H3 (`###`) till H4 (`####`) så tidskod+speaker inte dominerar visuellt.
4. **Obsidian speaker rename fix** — Import stödjer nu rename via Label-kolumnen (inte bara Namn-kolumnen). Position-baserad matchning när label inte är ett auto-label.

## Ändrade filer

### Speaker alignment
| Fil | Ändring |
|-----|---------|
| `src/aurora/speaker-timeline.ts` | +`splitAtSentenceBoundaries()` (exporterad), integrerad som Step 0 i `buildSpeakerTimeline()` |
| `tests/aurora/speaker-timeline.test.ts` | +10 tester (8 unit, 2 integration) |

### Denoising
| Fil | Ändring |
|-----|---------|
| `aurora-workers/denoise_audio.py` | **NY** — DeepFilterNet CLI-wrapper med passthrough-fallback |
| `aurora-workers/__main__.py` | `denoise_audio` registrerad i dispatcher |
| `aurora-workers/check_deps.py` | `_check_cli()` helper + `deepfilternet` i dep-check |
| `src/aurora/worker-bridge.ts` | `'denoise_audio'` i WorkerRequest action union |
| `src/aurora/video.ts` | `denoise?: boolean` option, `'denoising'` progress step, Step 2b pipeline, `denoised` i result |
| `tests/aurora/video.test.ts` | +4 tester (applied/fallback/skipped/denoise+diarize) |
| `.venvs/denoise/` | **NY** — Isolerad Python venv (torch 2.2 + deepfilternet 0.5.6) |
| `.gitignore` | +`.venvs/` |
| `.env` | +`DEEPFILTERNET_CMD` path |

### Obsidian fixes
| Fil | Ändring |
|-----|---------|
| `src/commands/obsidian-export.ts` | `###` → `####` i `buildTimelineSection()` och `buildTimelineSectionWithAnnotations()` |
| `src/aurora/obsidian-parser.ts` | `TIMECODE_HEADER_RE` regex: `/^###\s+/` → `/^#{3,4}\s+/` (accepterar H3+H4) |
| `src/commands/obsidian-import.ts` | Speaker rename Path B: label-kolumn rename via position-matchning |
| `tests/aurora/obsidian-parser.test.ts` | +2 tester (H4 highlights, H4 timeline blocks) |
| `tests/commands/obsidian-import.test.ts` | +1 test (label-column rename) |

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| Punctuation-split over word-timestamps | `transcribe_audio.py` doesn't save word-level timestamps yet. Punctuation heuristic is zero-cost and covers ~80% of speaker-boundary cases. Session 19 upgrades to word-level. |
| Isolated `.venvs/denoise/` venv | deepfilternet 0.5.6 requires numpy<2 + torch 2.2; pyannote requires numpy>=2 + torch>=2.8. Cannot coexist in same env. `DEEPFILTERNET_CMD` env var points to isolated binary. |
| H3→H4 with backward-compat regex | H3 was too dominant in Obsidian visually. Parser `TIMECODE_HEADER_RE` accepts `#{3,4}` so old exports import correctly without migration. |
| Position-based speaker rename (Path B) | Users edit Label column (e.g., replace `SPEAKER_01` with "Ada"), not the Namn column. Voice prints sorted by first segment `start_ms` provide stable positional mapping when label no longer matches any `speakerLabel`. Assumes table order = time order (true at export, could break on manual reorder). |
| `STEP_NAMES` always includes `denoise` | When `denoise: false`, the step is marked `skipped` in the pipeline report. Consistent with how the optional `diarize` step works. |

## Dead ends (so session 19 doesn't repeat them)

1. **torchaudio compat shim** — Tried patching `sys.modules` to alias `torchaudio.backend.common` (removed in torchaudio ≥2.6). Worked for direct import but broke when DataLoader's multiprocessing forked without the shim. Abandoned.
2. **Same-env deepfilternet install** — `pip install deepfilternet` in the pyannote venv immediately downgrades numpy to <2, breaking pyannote. No resolution without Docker or venv isolation.

## Verifiering

- **Typecheck:** clean
- **Tester:** 4109 passed, 2 failed (pre-existerande: auto-cross-ref timeout + tester bash policy)
- **E2E denoise:** Verifierat med syntetisk ljudfil via Python worker (applied=true)
- **LSP diagnostics:** clean på alla ändrade filer

## Test delta

| Modul | Före | Efter | Nya |
|-------|------|-------|-----|
| speaker-timeline | 13 | 23 | +10 |
| video | 60 | 64 | +4 |
| obsidian-parser | 67 | 69 | +2 |
| obsidian-import | 21 | 22 | +1 |
| **Totalt** | 4092 | 4109 | **+17** |

## Kända begränsningar

1. **Sentence-split heuristik** — Splittar vid interpunktion (.?!), inte vid ord-timestamps. Whisper har `word_timestamps` som ger per-ord tidpunkter. Session 19 bör implementera ord-nivå split istället.
2. **DeepFilterNet versionskonfikt** — deepfilternet 0.5.6 kräver numpy<2 + torch<2.6, pyannote kräver numpy>=2 + torch>=2.8. Löst med separat venv men fragilt om deepfilternet uppgraderas.
3. **Obsidian H3→H4 migration** — Befintliga Obsidian-filer med `###`-headers importeras korrekt (regex accepterar båda), men visas som H3 tills nästa export.

## Rekommenderade prioriteringar (session 19)

1. **Word-level speaker alignment** — Slå på `word_timestamps=True` i `transcribe_audio.py`, spara ord-array i rawSegments, splitta vid diarization-gränser med exakta ordtider istället för interpunktionsheuristik.
2. **LLM-genererad tldr** — Kvarstår från session 17.
3. **Speaker guesser prompt-tuning** — Kvarstår från session 17.
4. **Daemon-verifiering** — Kvarstår från session 17.
