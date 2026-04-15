---
session: 18
datum: 2026-04-14
---

# Session 18 — Dev Notes

## Ändringar

| Fil | Ändring |
|-----|---------|
| `src/aurora/speaker-timeline.ts` | `splitAtSentenceBoundaries()` + Step 0 i `buildSpeakerTimeline()` |
| `aurora-workers/denoise_audio.py` | DeepFilterNet CLI-wrapper, passthrough fallback |
| `aurora-workers/__main__.py` | `denoise_audio` handler |
| `aurora-workers/check_deps.py` | `_check_cli()` + deepfilternet dep |
| `src/aurora/worker-bridge.ts` | `'denoise_audio'` action type |
| `src/aurora/video.ts` | `denoise` option, denoising step, denoised path propagation |
| `src/commands/obsidian-export.ts` | `###` → `####` timeline headers |
| `src/aurora/obsidian-parser.ts` | `TIMECODE_HEADER_RE` → `#{3,4}` |
| `src/commands/obsidian-import.ts` | Speaker rename Path B (label-column) |
| `.venvs/denoise/` | Isolerad venv för deepfilternet |

## Beslut och tradeoffs

**Interpunktionssplit vs word-timestamps**: Whisper kan ge per-ord timestamps (`word_timestamps=True`) men vi sparar inte dem idag. Interpunktionssplit är en zero-cost heuristik som ger 80% av nyttan. Session 19 uppgraderar till word-level.

**Separat venv för DeepFilterNet**: deepfilternet 0.5.6 kräver numpy<2 + torch 2.2. pyannote kräver numpy>=2 + torch>=2.8. Enda lösningen utan Docker var isolerad venv. Sökväg konfigureras via `DEEPFILTERNET_CMD` env var.

**Position-baserad speaker-matchning**: Vid label-kolumn-rename (användaren skriver "Ada" istället för "SPEAKER_01") finns ingen label att matcha mot. Voice_prints sorteras efter första segmentets starttid — tabelradsposition mappar till voice_print-position. Förutsätter att tabellordningen matchar tidsordningen, vilket är sant vid export.

**H3→H4 backward compat**: Parsern accepterar `#{3,4}` i TIMECODE_HEADER_RE. Gamla Obsidian-filer med H3 importeras korrekt. Nya exporteras som H4. Ingen migration behövs.

## Testdelta

| Modul | Före | Efter | Nya |
|-------|------|-------|-----|
| speaker-timeline | 13 | 23 | +10 |
| video | 60 | 64 | +4 |
| obsidian-parser | 67 | 69 | +2 |
| obsidian-import | 21 | 22 | +1 |
| **Totalt** | 4092 | 4109 | **+17** |

## Kända risker

- Interpunktionssplit kan ge false positives vid förkortningar ("Dr. Smith" → split)
- DeepFilterNet venv är fragil — deepfilternet 0.5.6 underhålls inte aktivt
- Position-baserad speaker-matchning antar att tabellordning = tidsordning (sant vid export, kan bli fel vid manuell omsortering)
