# Handoff — Session 20: Semantic Timeline

**Date:** 2026-04-16
**Session:** OpenCode session 20
**Baseline:** typecheck clean (1 pre-existing unrelated error), 151+ tests pass

---

## What was delivered

7 commits across 4 major features and 3 supporting changes.

| # | Deliverable | Files |
|---|-------------|-------|
| 1 | `aurora:delete` CLI command | `src/cli.ts`, `src/commands/aurora-delete.ts` (NEW) |
| 2 | Pyannote AudioDecoder fix (three-layer) | `aurora-workers/transcribe_audio.py`, `src/aurora/video.ts`, `aurora-workers/check_deps.py` |
| 3 | AGENTS.md §3.9 "Don't Be a Gatekeeper" principle | `AGENTS.md` |
| 4 | Word-level timecodes in Obsidian timeline | `src/aurora/speaker-timeline.ts`, `src/commands/obsidian-export.ts` |
| 5 | Semantic paragraph splitting | `src/aurora/semantic-split.ts` (NEW) |
| 6 | Chapter-aware Obsidian timeline | `src/aurora/speaker-timeline.ts`, `src/commands/obsidian-export.ts` |
| 7 | Gemma4:26b model upgrade | `src/aurora/semantic-split.ts`, config references |

---

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| Semantic split at export time, not ingestion | Keeps the DB raw. Split parameters may change; re-splitting from stored text is trivial. Re-ingesting 2-minute audio is not. |
| Sentence-number approach for LLM split points | Gemma3 couldn't reliably follow char-index instructions. Sentence numbers are unambiguous. The model counts sentences, returns JSON array of split-point sentence indices. |
| Re-merge with soft limit (4000 chars) + chapter breaks | Pure sentence-split produces too many micro-blocks. Soft limit merges same-speaker adjacent blocks up to 4000 chars. Chapter boundaries are hard breaks — never merge across them. |
| `mergeRunts` with 10-second gap check | Without the gap check, mergeRunts joined the last block of one chapter with the first of the next if they were the same speaker. Gap > 10s = hard break. |
| Fallback to unsplit on LLM failure | Semantic split is best-effort. If Ollama returns garbled JSON or times out, the pipeline continues with the original block. No silent data loss. |
| `think:false` for Gemma4 structured tasks | Gemma4 in thinking mode consumed the entire output budget on internal reasoning before producing output, causing 10+ minute timeouts on semantic split. `think:false` drops generation to ~3s. |
| Speaker shown only at chapter start or speaker change | Repeating the speaker name every block adds noise. Chapter header resets the displayed speaker, so you know context from the heading. |

---

## Open risks

1. **Word-level span rendering at scale.** Every word becomes a `<span data-t="ms">` tag. A 90-minute video transcript produces hundreds of thousands of tags. Obsidian handles it, but the file size grows significantly. No rendering problems observed yet, but not tested with very long recordings.
2. **Semantic split quality depends on Gemma4 availability.** If Ollama is not running or gemma4:26b is not pulled, export falls back to raw blocks. The fallback is safe but the output is less readable.
3. **Speaker guesser prompt-tuning still deferred.** IBM Technology and other tech channels still return generic speaker labels. Carries over from sessions 17-19.
4. **Daemon verification still pending.** `pnpm neuron daemon install` was implemented in session 17 but not tested under real Obsidian edit conditions. Still deferred.
5. **Gemma4 requires Ollama v0.20+.** Older Ollama installations will fail silently on `gemma4:26b` model load. `check_deps.py` does not yet verify Ollama version.

---

## Key struggles

1. **gemma3 char-index approach.** The first implementation passed LLM the full text and asked it to return character offsets for split points. Gemma3 consistently misunderstood the instructions, returning narrative answers instead of JSON arrays. Switching to sentence-numbering (count sentences, return which sentence numbers to split after) fixed this completely. Lesson: simpler instruction surface beats more precise instruction.

2. **Gemma4 thinking mode timeouts.** Gemma4:26b in default mode ran thinking chains that took 8-12 minutes before producing output. Not a bug in our code, just a model behavior. `think:false` in the Ollama request payload drops this to 2-4 seconds. Critical flag for any structured-output task.

3. **`remergeSameSpeakerBlocks` Set.has() vs tolerance-based matching.** After semantic split, a re-merge pass tried to join same-speaker adjacent blocks. The speaker lookup used `Set.has()` with exact string matching. But speaker labels from pyannote sometimes carry slight formatting differences (trailing space, case). Oracle helped identify that the comparison needed tolerance-based matching. Took ~45 minutes to debug because the failure was silent (blocks just didn't merge).

4. **Test console.log spy swallowing debug output.** One test file set up a `jest.spyOn(console, 'log')` that wasn't properly restored between tests. All `console.log` calls in the module under test produced no output during debugging. Spent ~30 minutes wondering why debug statements weren't printing before isolating the issue to the test setup. Fixed with proper `afterEach` cleanup.

5. **`mergeRunts` cross-chapter merge bug.** After mergeRunts post-processing, short blocks at chapter ends were joined to the first block of the next chapter (same speaker). The fix was a gap check: if the time gap between the last word of block A and the first word of block B exceeds 10 seconds, treat it as a hard boundary regardless of speaker match.

---

## Test delta

| Area | Before | After | New |
|------|--------|-------|-----|
| `aurora-delete.test.ts` | 0 | 8 | +8 |
| `semantic-split.test.ts` | 0 | 14 | +14 |
| `speaker-timeline.test.ts` | existing | existing+6 | +6 |
| `obsidian-export.test.ts` | existing | existing+4 | +4 |
| **Total** | 151 | 183 | **+32** |

---

## Commits

1. `feat: aurora:delete CLI command wrapping cascadeDeleteAuroraNode`
2. `fix: pyannote AudioDecoder — m4a→WAV ffmpeg conversion + soundfile loader`
3. `fix: TypeScript diarize try/catch — pipeline continues with speakers=[] on failure`
4. `docs: AGENTS.md §3.9 Don't Be a Gatekeeper principle`
5. `feat: word-level timecodes propagated through timeline — <span data-t="ms"> in Obsidian`
6. `feat: semantic-split.ts — Ollama sentence-number split with mergeRunts and chapter-aware merge`
7. `feat: chapter-aware timeline — ### chapter headers, TOC, speaker shown at change only + gemma4:26b`

---

## Files changed (complete list)

| File | Change |
|------|--------|
| `src/cli.ts` | +`aurora:delete` subcommand |
| `src/commands/aurora-delete.ts` | NEW — DB guard, `cascadeDeleteAuroraNode()`, formatted output |
| `aurora-workers/transcribe_audio.py` | `_load_audio()` m4a→WAV via ffmpeg, soundfile loader, pyannote bypass |
| `src/aurora/video.ts` | try/catch around diarize step, continues with `speakers=[]` on failure |
| `aurora-workers/check_deps.py` | +soundfile check, torchcodec ABI version check |
| `AGENTS.md` | §3.9 "Don't Be a Gatekeeper" principle |
| `src/aurora/speaker-timeline.ts` | `WhisperWord[]` propagated through assign/merge/split; chapter-aware merge |
| `src/commands/obsidian-export.ts` | `<span data-t="ms">word</span>` rendering; chapter `###` headers + TOC; speaker shown at change only |
| `src/aurora/semantic-split.ts` | NEW — `semanticSplit()`, sentence-number LLM, char-position mapping, code-fence strip, mergeRunts, fallback |
| `tests/commands/aurora-delete.test.ts` | NEW — 8 tests |
| `tests/aurora/semantic-split.test.ts` | NEW — 14 tests |
| `tests/aurora/speaker-timeline.test.ts` | +6 chapter-aware merge tests |
| `tests/commands/obsidian-export.test.ts` | +4 span rendering + chapter header tests |

---

## Next session priorities

1. **LLM-generated chapter titles** when no YouTube chapters exist — synthesize from transcript content. Most recordings don't have pre-baked chapters.
2. **Speaker guesser prompt-tuning** (deferred from sessions 17-19). Add few-shot examples. Test against IBM Technology and similar channels.
3. **Daemon verification** (deferred from session 17). Manually install daemon, edit file in `Aurora/`, confirm import triggers. Document WatchPaths behavior.
4. **Word-level span optimization** — consider batching spans or lazy rendering for very long transcripts. Current: every word = one span tag.
5. **Ollama version check in `check_deps.py`** — gemma4:26b requires v0.20+. Fail fast with a clear message instead of silent load failure.
