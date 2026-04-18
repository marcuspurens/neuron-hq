# Handoff — Session 21: EBUCore+ Speaker Schema, Timeline UX, Daemon Fix

**Date:** 2026-04-18
**Commits:** f566694, 4a2fa50, dbd6c21, 40e7b15, d2fef84, 4e6cf3b (6 commits)
**Files changed:** ~30 source + test files
**Tests:** 195 → 221 (+26 new)
**Typecheck:** clean (1 pre-existing in video.ts)

---

## What Session 21 Delivered

### 1. EBUCore+ Speaker Identity Schema
Full migration from flat `name/title/organization` to EBUCore+ `ec:Person`:
- `givenName`, `familyName`, `displayName`, `role`, `occupation`
- `affiliation: { organizationName, department }`
- `entityId`, `wikidata`, `wikipedia`, `imdb`, `linkedIn`
- Backward compat: `nodeToIdentity()` reads legacy fields as fallback
- JSON-LD export: `speaker_identity` → `schema:Person` with `schema:affiliation`, `sameAs` links
- EBUCore metadata mappings updated with dotted path support (`affiliation.organizationName`)

**Files:** `speaker-identity.ts`, `ebucore-metadata.ts`, `obsidian-export.ts`, `obsidian-import.ts`, `obsidian-parser.ts`, `aurora-confirm-speaker.ts`, `aurora-speaker-identities.ts`, `aurora-speakers.ts` (MCP), `jsonld-export.ts`

### 2. Speaker Dedup
Single-speaker videos no longer show redundant `SPEAKER_00` labels. Logic:
- `countUniqueSpeakers()` filters out `UNKNOWN` and ghost speakers with <50 chars total text
- If only 1 substantive speaker → suppress all speaker labels in timeline

### 3. `think: false` Audit
Added `think: false` to all 7 Ollama API calls across 6 files. Without it, gemma4:26b generates hundreds of thinking tokens → 10min+ timeouts.

**Files:** `semantic-split.ts` (already had it), `transcript-tldr.ts`, `speaker-guesser.ts`, `intake.ts` (×2), `vision.ts`, `transcript-polish.ts`

### 4. LLM-Generated Chapter Titles
Videos without YouTube chapters get auto-generated `###` headings + `## Kapitel` TOC:
- `generateChapterTitles()` groups blocks into 3-8 chapters, sends excerpt to gemma4
- `groupBlocksIntoChapters()` proportional split by text length
- `parseChapterTitles()` tolerant JSON parsing with code-fence stripping
- Done at export time, not ingestion

### 5. Compact Timeline Format
Replaced blockquote `> HH:MM:SS · SPEAKER` with Copilot-style dense layout:
- `**Speaker Name** HH:MM:SS` (bold, same line as timestamp)
- Text immediately below (no blank line between timestamp and text)
- Single blank line between blocks
- `resolveSpeakerName()` maps raw label → displayName from speaker_identity

### 6. LLM-Generated Topic Tags
Videos get 5-10 AI-generated topic tags from title + TL;DR:
- `generateTopicTags()` in semantic-split.ts
- Merged with YouTube tags, deduplicated, capped at 20
- Written to frontmatter `tags:` field
- Fixes missing topic coverage (e.g. "MCP" missing from A2A video)

### 7. Speaker Table: Label → ID (Read-Only)
- Column renamed from `Label` to `ID`
- ID column is now immutable — edits ignored by import
- Users set speaker names via `Förnamn`/`Efternamn` columns
- Import creates/updates `speaker_identity` nodes (not rename voice_print)
- `renameSpeaker` removed from import pipeline entirely

### 8. Daemon Fix
- launchd daemon failed with exit 126 — `tsx` shell wrapper can't resolve `getcwd` when path contains spaces
- Fix: `buildPlist()` now calls `node --import tsx/esm/index.cjs` directly
- Daemon now watches Obsidian vault and auto-syncs on file changes

### 9. Bifrost Cleanup
- Removed 58 `docs/projekt-bifrost/` files (-10,002 lines)

---

## What Session 22 Must Do

### CRITICAL: MCP-First Architecture for Workers
Marcus's directive: **"allt som kan vara MCP ska vara MCP"**. Current workers (Whisper, pyannote, vision) run as subprocess pipes via `worker-bridge.ts`. They should be MCP tools.

Architecture shift:
- Current: `video.ts` → `runWorker()` → `spawn(python, [__main__.py])` → JSON stdin/stdout
- Target: `video.ts` → MCP tool call → Python MCP server → response

This enables:
- Any MCP client (agents, Obsidian, CLI) can call `transcribe_audio` directly
- Workers become independently deployable services
- GPU/model management centralized in the MCP server

### CRITICAL: Whisper on Apple MPS (GPU)
- Current: faster-whisper uses CTranslate2 which does NOT support Apple MPS → falls back to CPU float32
- Marcus has 46GB VRAM on Apple Silicon
- Options: `mlx-whisper` (Apple-native Metal), `openai/whisper` with `device="mps"`, or WhisperX with PyTorch MPS backend
- `WHISPER_MODEL=large` added to `.env` but doesn't help while CTranslate2 is the backend
- WhisperX recommended: sentence-level segmentation (NLTK Punkt), wav2vec2 word alignment, pyannote integration, faster-whisper batched inference

### Recommended: WhisperX Migration
Replace `transcribe_audio.py` (faster-whisper) with WhisperX pipeline:
1. `pip install whisperx` in conda env
2. Use `large-v3-turbo` (809M params, 8x faster than large-v3)
3. WhisperX does: VAD → transcription → forced alignment → diarization → sentence segmentation
4. Eliminates fragmented 1-word blocks at source
5. Expose as MCP tool

### Short Transcript Blocks
Even with better transcription, a remerge step for blocks <30 chars would help edge cases:
- stable-ts `merge_by_gap(0.3, max_words=3)` does exactly this
- Or implement minimal version in `semantic-split.ts`

---

## Known Issues

1. **`video.ts:816` unused variable** — `videoDesc` declared but never read. Pre-existing.
2. **`torchcodec_abi: false`** in check_deps — pyannote soundfile bypass works, but the ABI mismatch persists.
3. **Daemon re-export triggers self** — WatchPaths includes `Aurora/` which the export writes to. ThrottleInterval (10s) prevents infinite loop, but the daemon always runs twice per user edit.
4. **Old speaker names stuck in existing videos** — Videos ingested before session 21 have `SPEAKER_00`/`SPEAKER_01` as voice_print labels. Users must fill in Förnamn/Efternamn in Obsidian to get display names. No automatic backfill.

---

## Test Delta

| File | Before | After | New |
|------|--------|-------|-----|
| `obsidian-export.test.ts` | 32 | 34 | +2 |
| `semantic-split.test.ts` | 8 | 32 | +24 |
| `ebucore-metadata.test.ts` | updated | updated | 0 |
| `obsidian-parser.test.ts` | updated | updated | 0 |
| `obsidian-import.test.ts` | updated | updated | 0 |
| **Total** | 195 | 221 | **+26** |
