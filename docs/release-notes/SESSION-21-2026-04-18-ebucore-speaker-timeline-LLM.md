---
session: 21
datum: 2026-04-18
variant: llm
---

# Session 21 — EBUCore+ Speaker Schema, Timeline UX, Daemon Fix

## Changes

| File | Change |
|------|--------|
| `speaker-identity.ts` | `SpeakerIdentity` interface → EBUCore+ ec:Person fields. `SpeakerAffiliation` interface. `SpeakerMetadataUpdate` with deprecated compat. `nodeToIdentity()` reads legacy fields as fallback. |
| `ebucore-metadata.ts` | Speaker mappings expanded (12 fields). `resolveNestedValue()` for dotted paths like `affiliation.organizationName`. |
| `jsonld-export.ts` | `buildSpeakerIdentityJsonLd()` → `schema:Person` with `schema:affiliation`, `sameAs` array. |
| `obsidian-export.ts` | `SpeakerInfo` → EBUCore+ fields. `buildSpeakerTable` Label→ID. `resolveSpeakerName()`. Compact timeline format. `countUniqueSpeakers()` filters UNKNOWN/<50chars. `generateTopicTags` integration. `formatVideoFrontmatter` accepts `additionalTags`. |
| `obsidian-import.ts` | Removed `renameSpeaker` from pipeline. `PendingSpeakerMetadata` with EBUCore+ fields. Förnamn/Efternamn → speaker_identity (not voice_print rename). |
| `obsidian-parser.ts` | `ParsedSpeaker` → EBUCore+ fields. `extractSpeakersFromTable` reads `id`/`label` column. Legacy `namn` fallback. |
| `semantic-split.ts` | `generateChapterTitles()`, `groupBlocksIntoChapters()`, `parseChapterTitles()`. `generateTopicTags()`, `parseTopicTags()`, `mergeTopicTags()`. |
| `obsidian-daemon.ts` | `buildPlist()` uses `node --import tsx/esm/index.cjs` instead of tsx shell wrapper. |
| `transcript-tldr.ts`, `speaker-guesser.ts`, `intake.ts`, `vision.ts`, `transcript-polish.ts` | Added `think: false` to Ollama calls. |
| `aurora-confirm-speaker.ts`, `aurora-speaker-identities.ts`, `aurora-speakers.ts` | `.name` → `.displayName` |

## New/Changed Interfaces

```typescript
interface SpeakerIdentity {
  id: string;
  givenName: string;
  familyName: string;
  displayName: string;
  role: string;
  occupation: string;
  affiliation: SpeakerAffiliation | null;
  entityId: string;
  wikidata: string;
  wikipedia: string;
  imdb: string;
  linkedIn: string;
  confirmations: number;
  confidence: number;
  autoTagThreshold: number;
  confirmedVoicePrints: string[];
  created: string;
  updated: string;
}

interface SpeakerAffiliation {
  organizationName: string;
  organizationId?: string;
  department?: string;
  role?: string;
  periodStart?: string;
  periodEnd?: string;
}

interface GeneratedChapter {
  start_time: number;
  title: string;
}
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| EBUCore+ fields on speaker_identity, not ad-hoc schema | Marcus worked in media systems — wants industry standard from start |
| Label → ID (read-only) | Prevents users accidentally renaming voice_print technical ID |
| renameSpeaker removed from import | voice_print.speakerLabel is immutable technical ID, not display name |
| Chapter titles at export time, not ingestion | Avoids storing LLM output in DB; can regenerate with better models |
| Topic tags at export time | Same reasoning; YouTube tags in DB, LLM tags generated fresh |
| `think: false` on all Ollama calls | gemma4:26b thinking mode generates 100s of tokens → 10min timeouts |
| Daemon: node --import tsx instead of tsx wrapper | tsx shell wrapper fails under launchd getcwd with spaces in path |
| MIN_SPEAKER_CHARS = 50 | Filters pyannote ghost speakers (1-2 word fragments) from dedup count |

## Test Delta

| Module | Before → After |
|--------|---------------|
| obsidian-export | 32 → 34 (+2) |
| semantic-split | 8 → 32 (+24) |
| ebucore-metadata | updated expectations |
| obsidian-parser | updated expectations |
| obsidian-import | updated expectations |
| **Total** | 195 → 221 (+26) |

## Known Issues

- `video.ts:816` unused `videoDesc` variable (pre-existing)
- `torchcodec_abi: false` in check_deps (pyannote soundfile bypass works)
- Daemon fires twice per edit (WatchPaths includes export target dir)
- faster-whisper CTranslate2 cannot use Apple MPS → CPU float32 fallback

## Verification

- typecheck: clean (1 pre-existing)
- tests: 221 pass
- E2E: exported 2 videos (A2A with YouTube subs, Pi with Whisper), verified chapters, speaker dedup, tags, EBUCore table, daemon auto-sync
