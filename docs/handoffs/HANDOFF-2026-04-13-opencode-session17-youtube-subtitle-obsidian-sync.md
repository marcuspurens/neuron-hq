# Handoff — Session 17: YouTube Subtitles & Obsidian Sync

**Date:** 2026-04-13
**Session:** OpenCode session 17
**Baseline:** typecheck clean, 4062/4062 tests (start), 4092/4092 (end)

---

## What was delivered

10 features across the YouTube ingest pipeline and Obsidian sync infrastructure.

| # | Deliverable | Files |
|---|-------------|-------|
| 1 | YouTube subtitle download + VTT parser | `extract_video.py` |
| 2 | Rich YouTube metadata (channel, tags, description, chapters) | `extract_video.py` |
| 3 | Obsidian subdirectory routing (`Video/`, `Dokument/`, `Artikel/`, `Koncept/`) | `obsidian-export.ts`, `obsidian-import.ts` |
| 4 | Speaker table in Obsidian body (replaces YAML speakers) | `obsidian-export.ts`, `obsidian-parser.ts`, `obsidian-import.ts` |
| 5 | `cascadeDeleteAuroraNode()` with soft-delete snapshot | `src/aurora/cascade-delete.ts` (NEW) |
| 6 | `aurora_deleted_nodes` table + 30-day retention + restore CLI | `migrations/018_soft_delete.sql` (NEW), `src/aurora/obsidian-restore.ts` (NEW) |
| 7 | Obsidian auto-sync daemon (launchd, WatchPaths) | `src/aurora/obsidian-daemon.ts` (NEW) |
| 8 | `formatFrontmatter()` round-trip fix (id, confidence, exported_at) | `obsidian-export.ts` |
| 9 | Video frontmatter parity (källa, språk, tags, publicerad, confidence, tldr) | `obsidian-export.ts` |
| 10 | Subtitle download isolated from audio pipeline | `extract_video.py` |

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| Manual subs → skip Whisper entirely | Human-edited captions are higher quality than Whisper on most tech content. No point running 85s transcription when ground truth already exists. |
| Auto subs → Whisper runs anyway | Google's ASR is worse than Whisper for most non-English and accented speech. Auto subs saved as reference only. |
| launchd WatchPaths over polling | Zero CPU usage when idle. Native macOS, survives reboot, no daemon process. Polling at any interval is wasteful by comparison. |
| Soft delete with 30-day window | Hard deletes are irreversible. 30 days gives enough time to notice a mistaken sync delete without storing stale data indefinitely. |
| Regex for chunk ID matching | SQL LIKE treats `_` as wildcard (any single character). Chunk IDs contain `_chunk_N` patterns. LIKE match was silently matching wrong nodes. |
| Speaker table in body, not YAML | YAML arrays with multi-field objects are hard to edit in Obsidian. A markdown table with named columns is readable and editable inline. YAML fallback preserved for old exports. |
| Subdirectory routing by node type | Flat `Aurora/` folder becomes unwieldy at scale. Type-based routing makes navigation practical and lets per-folder Obsidian templates work. |

## Open risks

1. **Diarization clips at time boundaries, not sentence boundaries.** When subtitle text is aligned to speaker segments, a single sentence can be split across two speakers ("talk to your" in SPEAKER_01, "existing infrastructure?" in SPEAKER_00). This is a pyannote alignment issue. Subtitle-based transcription doesn't fix it — the segments are correct, but the alignment is arbitrary. Needs sentence-boundary-aware realignment in `video.ts`.
2. **Speaker guesser returning no names.** IBM Technology channel videos returned empty guesses despite providing channel name + description. Prompt likely needs examples of channel-to-person mapping. Current confidence defaults to 0.5 for unguessed speakers.
3. **LLM summary quality for tldr.** Current implementation uses first line of YouTube description. For many tech channels this is a sponsor message or SEO blurb, not a useful summary. Needs LLM-generated summary from the transcript itself.
4. **Daemon not tested under real conditions.** `pnpm neuron daemon install` creates the plist and registers it, but the WatchPaths trigger behavior hasn't been verified with actual Obsidian file edits. Needs manual verification.
5. **Concept explosion risk from previous session** still applies. Session 16 introduced Ollama concept extraction at ingest. Monitor concept count growth.

## Test delta

| Area | Before | After | New |
|------|--------|-------|-----|
| `cascade-delete.test.ts` | 0 | 12 | +12 |
| `obsidian-daemon.test.ts` | 0 | 8 | +8 |
| `obsidian-restore.test.ts` | 0 | 5 | +5 |
| `video.test.ts` (subtitle path) | existing | existing+5 | +5 |
| **Total** | 4062 | 4092 | **+30** |

## Next session priorities

1. **Sentence-boundary-aware speaker alignment** — diarization produces time-boundary splits. Post-process segments to snap to nearest sentence boundary using subtitle cue text. Affects `video.ts` and the diarization result merging logic.
2. **LLM-generated tldr for video nodes** — replace first-line-of-description heuristic with a real Ollama summarization call on the first N transcript chunks. Model: same as `generateMetadata()` (Gemma 3 / local).
3. **Speaker guesser prompt tuning** — IBM Technology videos returned no names. Add few-shot examples showing channel name + description → likely person names. Test against 2-3 known channels.
4. **Daemon verification** — manually install daemon, edit a file in `Aurora/`, confirm import triggers. Document the WatchPaths behavior for macOS Sequoia.

## Files changed (complete list)

| File | Change |
|------|--------|
| `aurora-workers/extract_video.py` | Subtitle download (separate yt-dlp call), VTT parser, rich metadata extraction (channel, tags, description, categories, chapters) |
| `src/aurora/video.ts` | Speaker guesser uses channel + description context; subtitle confidence routing |
| `src/aurora/cascade-delete.ts` | NEW — `cascadeDeleteAuroraNode()`, regex chunk matching, single-transaction cascade |
| `src/aurora/obsidian-daemon.ts` | NEW — launchd plist generation, install/uninstall/status, WatchPaths config |
| `src/aurora/obsidian-restore.ts` | NEW — list + restore from `aurora_deleted_nodes` |
| `src/commands/obsidian-export.ts` | Subdirectory routing, speaker table, video frontmatter parity, `formatFrontmatter()` fix, auto-purge expired deleted nodes |
| `src/commands/obsidian-import.ts` | Recursive scan, speaker table parser, cascade delete on sync |
| `src/aurora/obsidian-parser.ts` | Speaker table extraction, YAML fallback |
| `migrations/018_soft_delete.sql` | NEW — `aurora_deleted_nodes` table |
| `src/cli.ts` | `obsidian-restore`, `daemon` subcommands |
| `src/aurora/index.ts` | New exports |
| `tests/aurora/cascade-delete.test.ts` | NEW — 12 tests |
| `tests/aurora/obsidian-daemon.test.ts` | NEW — 8 tests |
| `tests/aurora/obsidian-restore.test.ts` | NEW — 5 tests |
| `tests/aurora/video.test.ts` | +5 subtitle path tests |
| `tests/commands/obsidian-export.test.ts` | Updated for subdirectory routing, video frontmatter, speaker table |
