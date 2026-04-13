---
session: 17
date: 2026-04-13
variant: llm
---

# Session 17 — YouTube Subtitles & Obsidian Sync

## Changes

| File | Change |
|------|--------|
| `aurora-workers/extract_video.py` | Subtitle download (separate yt-dlp call), VTT parser with HTML entity decode + dedup + whitespace normalization, rich metadata extraction: channelName, channelHandle, description, ytTags, categories, creators, chapters |
| `src/aurora/video.ts` | Speaker guesser receives channelName + description context; subtitle confidence routing (manual 0.95, auto 0.9, none → Whisper) |
| `src/aurora/cascade-delete.ts` | NEW — `cascadeDeleteAuroraNode()`: single transaction, soft-delete snapshot, cleanup cross_refs + confidence_audit, hard-delete nodes (edges auto-cascade), regex chunk ID match |
| `src/aurora/obsidian-daemon.ts` | NEW — launchd plist generation, `install/uninstall/status` commands, WatchPaths on `Aurora/` |
| `src/aurora/obsidian-restore.ts` | NEW — list + restore from `aurora_deleted_nodes` |
| `src/commands/obsidian-export.ts` | Subdirectory routing (Video/Dokument/Artikel/Koncept), speaker table generation, video frontmatter parity (källa/språk/tags/publicerad/confidence/tldr), `formatFrontmatter()` fix (id/confidence/exported_at), auto-purge expired deleted nodes on export |
| `src/commands/obsidian-import.ts` | Recursive scan, speaker table parser, cascade delete on sync, `exported_at` guard (skip nodes never exported) |
| `src/aurora/obsidian-parser.ts` | `## Talare` table extraction, 6-column parser, YAML fallback |
| `migrations/018_soft_delete.sql` | NEW — `aurora_deleted_nodes(id, node_id, node_type, properties, deleted_at, expires_at)` |
| `src/cli.ts` | +`obsidian-restore` and `daemon` subcommands |
| `src/aurora/index.ts` | New exports: cascadeDeleteAuroraNode, installDaemon, uninstallDaemon, getDaemonStatus, listDeletedNodes, restoreDeletedNode |
| `tests/aurora/cascade-delete.test.ts` | NEW — 12 tests |
| `tests/aurora/obsidian-daemon.test.ts` | NEW — 8 tests |
| `tests/aurora/obsidian-restore.test.ts` | NEW — 5 tests |
| `tests/aurora/video.test.ts` | +5 subtitle path tests |
| `tests/commands/obsidian-export.test.ts` | Updated: subdirectory routing, speaker table, video frontmatter fields |

## New/Changed Interfaces

```typescript
// cascade-delete.ts
async function cascadeDeleteAuroraNode(nodeId: string): Promise<void>

// obsidian-daemon.ts
async function installDaemon(): Promise<void>
async function uninstallDaemon(): Promise<void>
async function getDaemonStatus(): Promise<'running' | 'stopped' | 'not_installed'>

// obsidian-restore.ts
interface DeletedNodeRecord {
  id: string;
  nodeId: string;
  nodeType: string;
  properties: Record<string, unknown>;
  deletedAt: string;
  expiresAt: string;
}
async function listDeletedNodes(): Promise<DeletedNodeRecord[]>
async function restoreDeletedNode(nodeId: string): Promise<void>

// obsidian-export.ts — subdirectory routing
function getSubdirectory(nodeType: string): 'Video' | 'Dokument' | 'Artikel' | 'Koncept'

// obsidian-parser.ts — speaker table
interface ParsedSpeakerRow {
  label: string;
  name: string | null;
  title: string | null;
  organization: string | null;
  role: string | null;
  confidence: number | null;
}
function parseSpeakerTable(body: string): ParsedSpeakerRow[]
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Manual subs skip Whisper | Human-edited captions are authoritative. confidence: 0.95. Whisper takes ~85s and adds noise for high-quality sources. |
| Auto subs: Whisper runs anyway | Google ASR is consistently weaker than Whisper on technical/non-English content. Auto subs saved as reference property only. |
| Separate yt-dlp call for subtitles | Subtitle download failure (404, region block) must not crash audio download. Two independent calls, each can fail independently. |
| Regex for chunk ID matching | `LIKE 'node_abc%_chunk_%'` in SQL treats `_` as wildcard (any char). Fixed by switching to regex-based string comparison. |
| launchd WatchPaths | Zero resource usage when no file changes. Native macOS (no dependencies). Survives reboot. Compared to: polling (wasteful), FSEvents daemon (requires separate process). |
| Soft delete 30-day window | Sync deletes can be accidental. Recovery window balances recoverability vs storage. `expires_at` set at delete time, auto-purge on each export. |
| `exported_at` guard in import | Prevents import from deleting a freshly ingested node that hasn't been exported yet. Without this, the first sync after ingest would delete the node (not in Obsidian = deleted). |
| Speaker table in body | Markdown table with named columns is more editable in Obsidian than YAML array. YAML fallback ensures backward compatibility with exported files from previous sessions. |

## Test Delta

| File | Before | After | New |
|------|--------|-------|-----|
| `cascade-delete.test.ts` | 0 | 12 | +12 |
| `obsidian-daemon.test.ts` | 0 | 8 | +8 |
| `obsidian-restore.test.ts` | 0 | 5 | +5 |
| `video.test.ts` | existing | existing+5 | +5 |
| **Total** | 4062 | 4092 | **+30** |

## Known Issues

- **Diarization alignment**: speaker segments split at time boundaries, not sentence boundaries. "talk to your" → SPEAKER_01, "existing infrastructure?" → SPEAKER_00. Pyannote produces correct segments, but sentence-boundary alignment not implemented. Next session item.
- **Speaker guesser quality**: IBM Technology videos returned no guesses despite channel + description context. Prompt needs few-shot examples mapping channel names to known persons.
- **tldr heuristic**: video tldr = first line of YouTube description. Often a sponsor or SEO blurb, not a summary. Should be LLM-generated from transcript chunks.
- **Daemon not E2E verified**: plist install path tested, but WatchPaths trigger behavior under real Obsidian save not confirmed.

## Verification

typecheck: clean
tests: 4092/4092 (+30 new)
pre-existing flaky: `auto-cross-ref.test.ts` timeout (unchanged, intermittent)
