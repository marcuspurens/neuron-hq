---
session: 18
date: 2026-04-14
variant: llm
---

# Session 18 — Speaker Alignment + Denoising + Obsidian Fixes

## Changes

| File | Change |
|------|--------|
| `src/aurora/speaker-timeline.ts` | New `splitAtSentenceBoundaries()` — splits WhisperSegments at `.?!` before speaker assignment. Integrated as Step 0 in `buildSpeakerTimeline()`. |
| `aurora-workers/denoise_audio.py` | New worker — DeepFilterNet CLI wrapper with passthrough fallback |
| `aurora-workers/__main__.py` | Registered `denoise_audio` handler |
| `aurora-workers/check_deps.py` | New `_check_cli()` + `deepfilternet` dep check |
| `src/aurora/worker-bridge.ts` | Added `'denoise_audio'` to WorkerRequest action union |
| `src/aurora/video.ts` | `denoise?: boolean` option, `'denoising'` progress step, Step 2b in pipeline, `denoised: boolean` in result, denoised audio path propagated to transcribe+diarize |
| `src/commands/obsidian-export.ts` | `###` → `####` in `buildTimelineSection()` and `buildTimelineSectionWithAnnotations()` |
| `src/aurora/obsidian-parser.ts` | `TIMECODE_HEADER_RE`: `/^###\s+/` → `/^#{3,4}\s+/` |
| `src/commands/obsidian-import.ts` | Speaker rename Path B: position-based matching when Label column edited directly (non-SPEAKER_XX label + empty name) |
| `.venvs/denoise/` | Isolated Python venv (torch 2.2.2, deepfilternet 0.5.6, numpy 1.26.4) |
| `.gitignore` | Added `.venvs/` |

## New/Changed Interfaces

```typescript
// speaker-timeline.ts — new export
export function splitAtSentenceBoundaries(segment: WhisperSegment): WhisperSegment[];

// video.ts — extended options
interface VideoIngestOptions {
  denoise?: boolean;  // NEW — run DeepFilterNet before transcription
  // ... existing fields
}

// video.ts — extended result  
interface VideoIngestResult {
  denoised: boolean;  // NEW — whether audio was denoised
  // ... existing fields
}

// video.ts — new progress step
type ProgressStep = '...' | 'denoising' | '...';

// worker-bridge.ts — new action
type WorkerAction = '...' | 'denoise_audio' | '...';
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Sentence-split at punctuation, not word-timestamps | Word timestamps not yet saved by transcribe_audio.py. Punctuation heuristic is zero-cost and good-enough for now. Session 19 will upgrade to word-level. |
| Isolated venv for DeepFilterNet | deepfilternet requires numpy<2 + torch<2.6; pyannote requires numpy>=2 + torch>=2.8. Cannot coexist. |
| H3→H4 for timeline headers | H3 was visually too dominant in Obsidian. Parser accepts both `#{3,4}` for backward compat. |
| Position-based speaker rename matching | Users edit Label column (not Namn). Voice_prints sorted by first segment time provide stable positional matching when label no longer matches. |
| `STEP_NAMES` includes `denoise` always | When `denoise: false`, step is marked `skipped` in pipeline report. Consistent with how diarize handles its optional step. |

## Test Delta

- `speaker-timeline.test.ts`: 13 → 23 (+10)
- `video.test.ts`: 60 → 64 (+4)
- `obsidian-parser.test.ts`: 67 → 69 (+2)
- `obsidian-import.test.ts`: 21 → 22 (+1)
- **Total**: 4092 → 4109 (+17 new tests)

## Known Issues

- `splitAtSentenceBoundaries` is a punctuation heuristic. Abbreviations ("Dr.", "U.S.A.") may cause false splits. Word-level timestamps will replace this.
- DeepFilterNet 0.5.6 + torchaudio 2.2.2 has deprecation warnings (`torchaudio.backend.common` moved). Works but fragile.
- 2 pre-existing test failures: `auto-cross-ref.test.ts` timeout, `tester.test.ts` bash policy.

## Verification

- typecheck: clean
- tests: 4109/4109 passed (excluding 2 pre-existing)
- E2E denoise: verified with synthetic audio via Python worker
- LSP diagnostics: clean on all changed files
