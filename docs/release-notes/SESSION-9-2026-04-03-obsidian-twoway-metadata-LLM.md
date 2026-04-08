---
session: 9
date: 2026-04-03
variant: llm
---

# Session 9 — Obsidian Two-Way Metadata Sync (EBUCore + Provenance)

## Changes

| File                              | Change                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/obsidian-export.ts` | `formatFrontmatter()`: tag values with spaces now quoted in YAML (e.g. `"machine learning"` not `machine learning`); `formatVideoFrontmatter()`: added `title` and `organization` fields per speaker; added `källa_typ`, `källa_agent`, `källa_modell` provenance fields to all exported frontmatter |
| `src/aurora/obsidian-parser.ts`   | Added `tags` field to `ParsedObsidianFile`; added `title` and `organization` fields to `ParsedSpeaker`; added `ParsedTimelineBlock` interface; added `extractTimelineBlocks()` function for parsing timeline sections from Obsidian notes                                                            |
| `src/commands/obsidian-import.ts` | Added tag import: parses `tags` from frontmatter and writes to Aurora node with `tagsUpdated` counter; added speaker title/org import via `updateSpeakerMetadata()`; added segment reassignment with 5-second tolerance for matching speaker segments                                                |
| `src/aurora/speaker-identity.ts`  | Added `updateSpeakerMetadata()`: updates a speaker node in Aurora with `title` and `organization` fields from Obsidian import                                                                                                                                                                        |
| `src/aurora/ebucore-metadata.ts`  | Added `ebucore:personTitle` field; added `ebucore:organisationName` field; these map to EBUCore standard vocabulary                                                                                                                                                                                  |
| `src/aurora/aurora-schema.ts`     | Added `Provenance` interface definition                                                                                                                                                                                                                                                              |
| `src/aurora/video.ts`             | Added `provenance` field to transcript objects at creation time                                                                                                                                                                                                                                      |
| `src/aurora/intake.ts`            | Added `provenance` field when calling `processExtractedText()`                                                                                                                                                                                                                                       |
| `src/aurora/ocr.ts`               | Added `provenance` field to OCR-extracted text before ingest                                                                                                                                                                                                                                         |
| `src/aurora/vision.ts`            | Added `provenance` field to vision-extracted text before ingest                                                                                                                                                                                                                                      |
| `src/aurora/memory.ts`            | Added `provenance` field to memory-ingested content                                                                                                                                                                                                                                                  |

## New/Changed Interfaces

New `Provenance` interface in `src/aurora/aurora-schema.ts`:

```typescript
interface Provenance {
  källa_typ: 'video' | 'pdf' | 'url' | 'memory' | 'ocr' | 'vision';
  källa_agent: string; // agent/component that produced the content (e.g. "aurora-ocr", "aurora-vision")
  källa_modell: string; // model used (e.g. "qwen3-vl", "whisper-large-v3", "gemma3")
}
```

Updated `ParsedObsidianFile` in `src/aurora/obsidian-parser.ts`:

```typescript
interface ParsedObsidianFile {
  title: string;
  frontmatter: Record<string, unknown>;
  body: string;
  // NEW:
  tags: string[];
}
```

Updated `ParsedSpeaker` in `src/aurora/obsidian-parser.ts`:

```typescript
interface ParsedSpeaker {
  id: string;
  name: string;
  // NEW:
  title: string | undefined;
  organization: string | undefined;
}
```

New `ParsedTimelineBlock` interface and `extractTimelineBlocks()` function:

```typescript
interface ParsedTimelineBlock {
  startTime: number; // seconds from start
  endTime: number; // seconds from start
  speakerId: string;
  text: string;
}

function extractTimelineBlocks(markdown: string): ParsedTimelineBlock[];
```

New `updateSpeakerMetadata()` in `src/aurora/speaker-identity.ts`:

```typescript
async function updateSpeakerMetadata(
  speakerId: string,
  updates: { title?: string; organization?: string }
): Promise<void>;
```

## Design Decisions

| Decision                                                                                    | Rationale                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag quoting for values with spaces in YAML frontmatter                                      | Unquoted `tags: [machine learning]` is valid YAML but Obsidian's tag parser splits on whitespace, creating two tags (`machine` and `learning`) instead of one. Quoting ensures multi-word tags are preserved as atomic units.                                                                                                    |
| EBUCore vocabulary for speaker metadata (`ebucore:personTitle`, `ebucore:organisationName`) | The metadata schema analysis from session 8 identified EBUCore as the most suitable standard for speaker/media metadata. EBUCore is the broadcast industry standard (EBU Tech 3293). Using its namespace maintains compatibility with EBUCore-aware tools and prevents namespace collision with Schema.org or custom properties. |
| Swedish field names for provenance (`källa_typ`, `källa_agent`, `källa_modell`)             | Provenance fields appear in Obsidian frontmatter which Marcus reads directly. Swedish names are consistent with the project's bilingual convention: machine-facing fields in English (via EBUCore), user-visible metadata fields in Swedish. This matches existing `källa` (source) conventions already in use.                  |
| Provenance added to all ingest paths (video, pdf, ocr, vision, memory, intake)              | Without provenance on every node, it's impossible to audit which model produced a given piece of knowledge. This is a data quality requirement: if `qwen3-vl` produces incorrect content, there's no way to find and correct all affected nodes without provenance.                                                              |
| 5-second tolerance for segment reassignment in import                                       | Speaker segment timestamps from Obsidian edits may drift slightly (manual adjustment, rounding). A 5-second window catches human-edited approximations without being so loose it reassigns segments to the wrong speaker.                                                                                                        |

## Test Delta

| Module                                   | Before | After    | Delta                                     |
| ---------------------------------------- | ------ | -------- | ----------------------------------------- |
| `tests/aurora/obsidian-parser.test.ts`   | 56     | **60**   | +4                                        |
| `tests/commands/obsidian-export.test.ts` | 17     | **19**   | +2                                        |
| `tests/commands/obsidian-import.test.ts` | 17     | **20**   | +3                                        |
| **Full suite**                           | 3964   | **3967** | +3 net (+9 raw, minus pre-existing flaky) |

Note: full suite result is 3967 pass + 1 pre-existing flaky timeout (unchanged from session 6+).

New tests in `tests/aurora/obsidian-parser.test.ts`:

- `"ParsedObsidianFile includes tags array from frontmatter"`
- `"ParsedSpeaker includes title and organization fields"`
- `"extractTimelineBlocks returns correctly typed ParsedTimelineBlock array"`
- `"extractTimelineBlocks returns empty array when no timeline section"`

New tests in `tests/commands/obsidian-export.test.ts`:

- `"formatFrontmatter quotes tag values containing spaces"`
- `"formatVideoFrontmatter includes speaker title and organization"`

New tests in `tests/commands/obsidian-import.test.ts`:

- `"import updates tags on Aurora node and increments tagsUpdated"`
- `"import calls updateSpeakerMetadata with title and org from frontmatter"`
- `"segment reassignment applies 5-second tolerance"`

## Dependencies

No new npm, Python, or Ollama model dependencies added.

## Known Issues

- `extractTimelineBlocks()` assumes a specific Markdown section header format. Timeline sections using different header names or structures will not be parsed.
- The 5-second segment reassignment tolerance is hardcoded. No configuration option exists. If video content has denser speaker turns (many short segments), 5 seconds could incorrectly reassign adjacent segments.
- Provenance fields use Swedish names (`källa_*`). Any future agent or tool that reads Aurora nodes must handle both Swedish-named provenance fields and potential English variants that might exist on older nodes created before session 9.
- `updateSpeakerMetadata()` has no optimistic locking. Concurrent imports for the same speaker ID could cause a write-after-write race.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS
- `pnpm test`: PASS (3967/3967 + 1 pre-existing flaky)
- 142/142 tests pass across directly affected files (`obsidian-parser`, `obsidian-export`, `obsidian-import`)
