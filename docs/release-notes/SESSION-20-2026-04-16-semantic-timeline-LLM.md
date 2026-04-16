---
session: 20
date: 2026-04-16
variant: llm
---

# Session 20 — Semantic Timeline, Chapter Headers, Word Timecodes

## Changes

| File | Change |
|------|--------|
| `src/cli.ts` | +`aurora:delete` subcommand |
| `src/commands/aurora-delete.ts` | NEW — DB guard, `cascadeDeleteAuroraNode()` wrapper, formatted output |
| `aurora-workers/transcribe_audio.py` | `_load_audio()` m4a→WAV ffmpeg conversion, soundfile loader, passes waveform dict to pyannote (bypasses AudioDecoder) |
| `src/aurora/video.ts` | try/catch around diarize step — continues with `speakers=[]` on failure |
| `aurora-workers/check_deps.py` | +soundfile>=0.12.0 check, torchcodec ABI version check |
| `AGENTS.md` | §3.9 "Don't Be a Gatekeeper" engineering principle |
| `src/aurora/speaker-timeline.ts` | `WhisperWord[]` propagated through assign/merge/split; chapter-aware merge (10s gap check); speaker shown only at change |
| `src/commands/obsidian-export.ts` | `<span data-t="ms">word</span>` per-word rendering; `### Title` chapter headers; `[[#link]]` TOC; VTT fallback to plain text |
| `src/aurora/semantic-split.ts` | NEW — `semanticSplit()`, sentence-number LLM instructions, char-position mapping, code-fence stripping, `mergeRunts()`, fallback |
| `tests/commands/aurora-delete.test.ts` | NEW — 8 tests |
| `tests/aurora/semantic-split.test.ts` | NEW — 14 tests |
| `tests/aurora/speaker-timeline.test.ts` | +6 chapter-aware merge tests |
| `tests/commands/obsidian-export.test.ts` | +4 span rendering + chapter header tests |

## New/Changed Interfaces

```typescript
// semantic-split.ts
interface SplitOptions {
  model?: string;        // default: 'gemma4:26b'
  softLimit?: number;    // default: 4000 chars
  think?: boolean;       // default: false
}
function semanticSplit(blocks: TimelineBlock[], options?: SplitOptions): Promise<TimelineBlock[]>
function mergeRunts(blocks: TimelineBlock[], gapThresholdMs?: number): TimelineBlock[]

// speaker-timeline.ts (extended)
// WhisperWord already existed from S19; now propagated through merge/split ops
// chapter boundary = hard break in remergeSameSpeakerBlocks regardless of speaker match
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Sentence-number LLM instructions | Gemma3 failed to follow char-index instructions reliably. Sentence numbers (count sentences, return split-after indices as JSON array) are unambiguous. |
| `think:false` for Gemma4 structured tasks | Default thinking mode caused 8-12min timeouts on semantic split — model exhausted output budget on reasoning chain. `think:false` drops to 2-4s. |
| Export-time split, not ingestion-time | DB stays raw. Split parameters change without requiring re-ingestion. |
| 10s gap threshold for mergeRunts hard break | Prevents cross-chapter runt-merging. Gap > 10s = different chapter, even if same speaker. |
| Speaker label only at change or chapter start | Repeating speaker per-block adds noise. Chapter header resets visual context. |
| Fallback to unsplit blocks | If Ollama down or returns invalid JSON, export completes with raw blocks. No silent failure. |

## Test Delta

| Module | Before | After | Net |
|--------|--------|-------|-----|
| `aurora-delete` | 0 | 8 | +8 |
| `semantic-split` | 0 | 14 | +14 |
| `speaker-timeline` | existing | existing+6 | +6 |
| `obsidian-export` | existing | existing+4 | +4 |
| **Total** | ~151 | ~183 | **+32** |

## Known Issues

- Word-level span rendering untested at scale (90+ min videos). File size impact not benchmarked.
- Gemma4:26b requires Ollama v0.20+. `check_deps.py` does not verify Ollama binary version.
- Speaker guesser still untuned (deferred S17-S19-S20).
- Daemon real-world verification still pending (deferred S17).
- No LLM-generated chapter titles when YouTube chapters absent.

## Verification

typecheck: clean (1 pre-existing unrelated error unchanged).
Tests: 151+ → 183+ (all pass).
E2E: pyannote fix verified — 2 speakers detected on MPS GPU. Semantic split verified on IBM Technology RAG video.

## Next

Session 21: LLM chapter title generation; speaker guesser prompt-tuning; daemon verification; word-span rendering optimization (optional).

Handoff: `docs/handoffs/HANDOFF-2026-04-16-opencode-session20-semantic-timeline.md`
