# Changelog

All notable changes to Neuron HQ are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Sessions are listed newest-first.

---

## [Session 23] — 2026-04-27

### Added
- Three new MCP parameters on `transcribe_audio`: `compute_type` (float32/float16/int8), `beam_size` (search width), `initial_prompt` (domain terms for decoder guidance). Default compute_type changed from int8 to float32 for maximum quality.
- New MCP tool `extract_entities` — calls Gemma 4 (26B) via Ollama to extract proper nouns, abbreviations, and technical terms from text. Returns a ready-to-use `initial_prompt` string for two-pass transcription.
- Four documentation variants for Aurora Media MCP: LLM reference, developer reference, user guide (Swedish), and workshop explainer with Mermaid diagrams.
- Skills-refactoring audit: identified 16 files with hardcoded LLM prompts/pipelines that should be editable .md skill files. Tiered plan in handoff.

### Changed
- `MediaState` now tracks `whisper_compute_type` — model only reloads when model ID or compute_type actually changes (was reloading on every non-int8 call).
- `media-client.ts` `transcribeAudio()` options extended with `computeType`, `beamSize`, `initialPrompt`. New `extractEntities()` wrapper added.

---

## [Session 22] — 2026-04-21

### Added
- MCP-first media pipeline — new Python MCP server (`aurora-workers/mcp_server.py`) with FastMCP, 6 tools (`transcribe_audio`, `diarize_audio`, `denoise_audio`, `extract_video`, `extract_video_metadata`, `check_deps`). Models loaded once in lifespan, kept warm between calls. TypeScript MCP client (`media-client.ts`) with lazy singleton connection.
- WhisperX transcription — replaces faster-whisper. `large-v3-turbo` model with wav2vec2 word-level alignment. Pi video (27 min) transcribed: 292 segments, 4564 words, per-word confidence scores.
- Standoff annotation — Obsidian export produces clean markdown text (no HTML spans) + `.words.json` sidecar with full per-word provenance (`{text, start, end, speaker, confidence}`). Based on W3C Web Annotation / BRAT standoff pattern.
- Clickable YouTube timestamps — timeline timestamps are `[HH:MM:SS](url?t=N)` links that jump to the video position.
- Speaker auto-guess at ingest — `guessSpeakers()` now runs on all video ingests (not just with diarization). Results saved to voice_print nodes via `applyGuessesToGraph()`.
- `words_file` frontmatter field — links `.md` to its `.words.json` sidecar in YAML frontmatter.
- `Wikipedia` and `IMDb` columns in speaker table — completes EBUCore+ ec:Person coverage.

### Changed
- `video.ts`, `job-runner.ts`, `aurora-check-deps.ts`: `runWorker()` → `callMediaTool()` for all media operations.
- Obsidian export is now idempotent — content compared before writing (ignoring `exported_at`). LLM operations (semantic split, chapter titles, topic tags) only run on first export.
- Speaker guess condition relaxed — no longer requires `options?.diarize` flag.

### Fixed
- Obsidian scroll-to-top — daemon re-exports no longer rewrite unchanged files.
- Timeline text spacing — `join('')` → `join(' ')` between word spans (before standoff migration).
- Timeline paragraph structure — blocks under same chapter merged into flowing paragraphs instead of one-line-per-segment.

---

## [Session 21] — 2026-04-18

### Added
- EBUCore+ speaker identity schema — `givenName`, `familyName`, `displayName`, `role`, `occupation`, `affiliation` (with `organizationName`, `department`), `entityId`, `wikidata`, `wikipedia`, `imdb`, `linkedIn`. Full round-trip through Obsidian export/import, JSON-LD export as `schema:Person`, EBUCore metadata mappings.
- LLM-generated chapter titles — videos without YouTube chapters get auto-generated `###` headings + `## Kapitel` TOC via Ollama gemma4:26b at export time. 3-8 chapters per video based on text length.
- LLM-generated topic tags — videos get 5-10 AI-generated topic tags from title + TL;DR. Merged with YouTube tags, deduplicated, capped at 20. Fixes missing topic coverage.
- Speaker dedup — single-speaker videos suppress redundant `SPEAKER_00` labels. Filters out `UNKNOWN` and ghost speakers (<50 chars total text).
- Compact Copilot-style timeline — `**Speaker Name** HH:MM:SS` with text directly below. Single blank line between blocks. No more blockquote `>` wrapper.
- `resolveSpeakerName()` — timeline renders `displayName` from speaker_identity instead of raw `SPEAKER_XX` labels.
- `buildSpeakerIdentityJsonLd()` — speaker_identity nodes export as `schema:Person` with `schema:affiliation`, `sameAs` links to Wikidata/Wikipedia/IMDB/LinkedIn.
- 26 new tests across semantic-split, obsidian-export, ebucore-metadata, obsidian-parser, obsidian-import.

### Changed
- Speaker table column `Label` → `ID` (read-only). Users set names via `Förnamn`/`Efternamn` columns. Import creates/updates `speaker_identity` nodes instead of renaming voice_print labels.
- `renameSpeaker` removed from import pipeline — voice_print `speakerLabel` is now an immutable technical identifier.
- `think: false` added to all 7 Ollama API calls (6 files). Prevents gemma4:26b from generating hundreds of thinking tokens (10min+ timeouts).
- `WHISPER_MODEL=large` added to `.env` (pending GPU backend migration in session 22).

### Fixed
- Daemon exit 126 — `tsx` shell wrapper fails under launchd when project path contains spaces. Fixed by calling `node --import tsx/esm/index.cjs` directly.
- Speaker dedup false negatives — `countUniqueSpeakers()` now ignores `UNKNOWN` labels and speakers with <50 chars total text (pyannote ghost speakers).
- Obsidian export tests mocked Ollama — prevents real LLM calls during test runs (17ms vs 14s).

### Removed
- `docs/projekt-bifrost/` — 58 files (-10,002 lines), moved to separate repo.

---

## [Session 20] — 2026-04-16

### Added
- `aurora:delete` CLI command — `pnpm neuron aurora:delete <nodeId>` wraps `cascadeDeleteAuroraNode()` with DB guard and formatted output. Enables re-ingestion without manual SQL. 8 new tests.
- `semantic-split.ts` — `semanticSplit()` and `mergeRunts()`. Ollama (gemma4:26b) numbers sentences in each timeline block and returns split-point sentence indices as JSON. Character-position mapping reconstructs sub-blocks. Code-fence stripping handles LLM markdown wrapping. `mergeRunts()` post-processes short blocks with a 10-second gap check to prevent cross-chapter merging. Graceful fallback to unsplit blocks on Ollama failure or invalid JSON.
- Chapter-aware Obsidian timeline — YouTube chapters render as `### Title` H3 headers with `[[#link]]` TOC at top of timeline section. Chapter boundaries are hard breaks in `remergeSameSpeakerBlocks`. Speaker label shown only at chapter start or speaker change (not repeated every block).
- Word-level timecodes in Obsidian timeline — `WhisperWord[]` now propagated through all timeline assign/merge/split operations. Each word rendered as `<span data-t="{ms}">{word}</span>`. Falls back to plain text for VTT subtitle export.
- Pyannote AudioDecoder fix — three-layer: (1) Python `_load_audio()` converts m4a→WAV via ffmpeg, loads with `soundfile`, passes waveform dict to pyannote to bypass `AudioDecoder`; (2) TypeScript try/catch around diarize step, pipeline continues with `speakers=[]` on failure; (3) `check_deps.py` soundfile and torchcodec ABI version checks.
- Gemma4:26b model upgrade — replaces gemma3. MoE architecture (~3.8B active / 26B total parameters). ~58 T/s generation on Apple Silicon. `think:false` required for structured-output tasks.
- AGENTS.md §3.9 "Don't Be a Gatekeeper for Things You Don't Own" — new engineering principle: when structured data exists, default is to preserve and expose it, not discard it.
- 32 new tests across aurora-delete, semantic-split, speaker-timeline, obsidian-export.

### Changed
- `remergeSameSpeakerBlocks` — now respects chapter hard boundaries (10-second gap check). Normalizes speaker label before comparison to handle pyannote trailing-whitespace variants.
- Obsidian timeline export — speaker label suppressed when unchanged from previous block (within same chapter).

### Fixed
- Pyannote crash on torchcodec 0.10.0 + torch 2.11.0 ABI mismatch — `AudioDecoder` no longer used in the audio loading path.
- `mergeRunts` merging across chapter boundaries when last/first blocks shared a speaker — gap threshold check prevents cross-chapter merging.

---

## [Session 19] — 2026-04-15

### Added
- Word-level speaker alignment — `splitAtWordBoundaries()` in `speaker-timeline.ts` splits WhisperSegments at exact diarization speaker-change points using per-word timing from `word_timestamps=True` in faster-whisper. Falls back to sentence-boundary split for segments without words.
- `WhisperWord` interface and optional `words` array on `WhisperSegment`.
- Rich YouTube metadata in Obsidian video frontmatter — `kanal`, `kanalhandle`, `visningar`, `likes`, `prenumeranter`, `thumbnail`.
- `## Beskrivning` and `## Kapitel` sections in Obsidian video export body.
- `extractHashtags()` — prefer hashtags from YouTube description over generic ytTags for Obsidian tags field.
- LLM-generated tldr summary — `transcript-tldr.ts` with `generateTldr()` Ollama/Claude dual backend. Replaces description-first-sentence hack.
- Fallback `Speaker_01` voice_print created when diarization is absent, ensuring Obsidian speaker table always has at least one editable row.
- `view_count`, `like_count`, `channel_follower_count`, `thumbnail` extraction from yt-dlp in `extract_video.py`.
- 8 new tests across speaker-timeline, transcript-tldr, video, obsidian-export.

### Changed
- Obsidian video frontmatter: `källa:` → `videoUrl:` for clarity.
- Removed `källa_typ`/`källa_modell`/`källa_agent` provenance fields from video frontmatter (kept in graph properties).
- `summary` property now generated by LLM from transcript instead of first sentence of description.

### Fixed
- Tags in Obsidian showed generic YouTube internal tags ("youtube.com", "education") instead of meaningful content hashtags.

---

## [Session 18] — 2026-04-14

### Added
- Sentence-boundary speaker alignment — `splitAtSentenceBoundaries()` in `speaker-timeline.ts` splits WhisperSegments at `.?!` before speaker assignment, giving finer granularity at speaker changes.
- Audio denoising pipeline — `denoise_audio` Python worker wraps DeepFilterNet CLI with passthrough fallback. Isolated `.venvs/denoise/` venv (torch 2.2 + deepfilternet 0.5.6) to avoid pyannote conflicts.
- `denoise?: boolean` option in `VideoIngestOptions` — runs DeepFilterNet between download and transcription. Denoised audio path propagated to both transcribe and diarize steps.
- `'denoising'` progress step and `denoised: boolean` result field in video pipeline.
- `_check_cli()` helper in `check_deps.py` for CLI tool availability checks.
- 17 new tests across speaker-timeline, video, obsidian-parser, obsidian-import.

### Changed
- Obsidian timeline headers: `###` (H3) → `####` (H4) for less visual dominance.
- `TIMECODE_HEADER_RE` parser regex accepts both `###` and `####` headers for backward compatibility.
- Speaker rename import: supports Label-column edits (position-based matching) in addition to Namn-column edits (label-based matching).

### Fixed
- Speaker names not updating in Obsidian transcript timeline after editing the speaker table Label column.

---

## [Session 17] — 2026-04-13

### Added
- YouTube subtitle download before Whisper — `extract_video.py` now tries yt-dlp subtitles first. Manual subs used directly (confidence 0.95, Whisper skipped). Auto subs saved as reference, Whisper runs regardless (confidence 0.9). No subs falls back to Whisper only.
- VTT subtitle parser — HTML entity decoding (`&amp;`, `&nbsp;`, etc.), deduplication of repeated cue text, whitespace normalization.
- Rich YouTube metadata extraction — channel name, channel handle, video description, YouTube tags, categories, creators, chapters — all stored on transcript node.
- Auto-generated tags from YouTube metadata — `youtube.com` domain tag + video categories + `ytTags` property.
- Speaker guesser now uses channel name + description as additional context for name inference.
- Obsidian subdirectory routing — export writes to `Aurora/Video/`, `Aurora/Dokument/`, `Aurora/Artikel/`, `Aurora/Koncept/`. Import scans recursively.
- Speaker table in Obsidian body — speakers moved from YAML frontmatter to editable markdown table under `## Talare` (6 columns: Label, Namn, Titel, Organisation, Roll, Konfidenspoäng). Parser reads table format with YAML fallback.
- `cascadeDeleteAuroraNode()` in `src/aurora/cascade-delete.ts` — single SQL transaction: soft-delete snapshot → cleanup cross_refs + confidence_audit → hard-delete nodes (edges auto-cascade). Regex-based chunk ID matching (avoids LIKE `_` wildcard bug).
- `aurora_deleted_nodes` table (migration 018) — soft delete with 30-day retention. Deleted node metadata preserved for restoration.
- `pnpm neuron obsidian-restore` — lists and restores soft-deleted nodes.
- Auto-purge of expired `aurora_deleted_nodes` entries on each export run.
- Obsidian auto-sync daemon — launchd-based (macOS native), WatchPaths on `Aurora/` directory for zero-polling file change detection. `pnpm neuron daemon install/uninstall/status`. Plist stored in `~/Library/LaunchAgents/`. Survives reboot.
- New files: `src/aurora/cascade-delete.ts`, `src/aurora/obsidian-daemon.ts`, `src/aurora/obsidian-restore.ts`, `migrations/018_soft_delete.sql`.

### Changed
- Video frontmatter now includes: `källa`, `språk`, `tags`, `publicerad`, `confidence`, `tldr`.
- `formatFrontmatter()` for non-video nodes now includes `id:`, `confidence:`, `exported_at:` — fixes import round-trip.
- Subtitle download runs as a separate yt-dlp call, isolated from the audio download — failures no longer crash the audio pipeline.

### Fixed
- `formatFrontmatter()` missing `id:`, `confidence:`, `exported_at:` for non-video nodes — broke Obsidian import round-trip.
- LIKE wildcard bug in chunk ID matching — `_` is a wildcard in SQL LIKE; switched to regex match.

---

## [Session 16] — 2026-04-13

### Added
- `compileConceptArticle(conceptId)` in `knowledge-library.ts` — 14-step pipeline: gather sources via concept graph edges → build hierarchy context → LLM compilation → create/update article → link back to ontology → mark concept as compiled
- `ConceptProperties` extended with `compiledArticleId`, `compiledAt`, `compiledStale` fields
- Staleness trigger in `linkArticleToConcepts` — marks compiled concepts stale when new articles link, with circular dependency guard (`concept-compile` articles don't trigger themselves)
- `prompts/concept-compile.md` — LLM prompt with epistemic status marking (facts vs single-source claims vs contradictions vs gaps)
- MCP actions: `compile_concept`, `concept_article` (read cached), `concept_index` (list all concepts with compile status)
- `aurora_ask` gains `saveAsArticle` option — saves answer as article (no extra LLM call), with `learn` option also exposed in MCP
- Concept extraction in intake pipeline via local Ollama LLM — `processExtractedText` now calls `concept-extraction.md` prompt and `linkArticleToConcepts` with structured concepts (facet, hierarchy, standardRefs)
- Depth Protocol reference added as first item in AGENTS.md §7 Step 1: Orient
- 35 new tests across 5 test files

### Changed
- `processExtractedText` pipeline steps: 7 → 8 (concept extraction + linking added after metadata enrichment)
- `ROADMAP-AURORA.md` — WP1-5 all marked complete, summary sludge risk documented

### Fixed
- WP5 upgraded from shallow tags-as-concepts to proper Ollama concept extraction after Depth Protocol caught the easy-path bias

---

## [Session 15] — 2026-04-10

### Added
- Fuzzy scoring utilities in `pdf-eval.ts`: `normalizedValueMatch()`, `fuzzyContains()`, `valueFoundInText()` — handles "61%" vs "61 %" vs "61,0%" vs "0.61", underscore/space, en-dash/hyphen, smart quotes
- 17 new tests for scoring utilities and integration
- `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md` — 5 WP plan for pre-compiled concept articles (inspired by Joel Rangsjö / Karpathy "LLM Knowledge Bases")
- CHANGELOG.md requirement added to AGENTS.md §15 + session close checklist

### Changed
- `ingestPdfRich` now passes `pages: AuroraPageEntry[]` in metadata to `processExtractedText` — page classification persists on document graph nodes
- `scoreText` uses `fuzzyContains()` instead of exact `.includes()` for `should_contain`
- `scoreVision` uses `fuzzyContains()` for page_type and title_contains matching
- `scoreVision` uses `valueFoundInText()` for data_point value matching (numeric-aware)
- `should_not_contain` intentionally kept as exact match
- `ROADMAP-AURORA.md` rewritten with session 15 status, P3 tracking, concept articles plan

### Research
- Joel Rangsjö's `llm-knowledge-base` repo analyzed — compilation model vs Aurora's graph retrieval model
- Karpathy's "LLM Knowledge Bases" concept (April 2026 gist) documented
- Key insight: Aurora has pre-computed structure but on-demand understanding; compilation approach pre-computes understanding

---

## [Session 14] — 2026-04-08

### Added
- `classifyPage()` wired into `ingestPdfRich` — `RichPdfResult` now includes `pages: AuroraPageEntry[]` with digest + understanding per page
- `aurora_pdf_eval` MCP tool — evaluate PDF pipeline output via MCP (not just CLI)
- `aurora:pdf-eval-compare` CLI command — A/B comparison of two vision prompts against the same facit set
- `CompareResult` interface in `pdf-eval-compare.ts`
- `AGENTS.md` §3.8: Resist the Path of Least Resistance — inversion test for priorities and recommendations
- `.claude/rules/depth.md`: Depth Protocol — anti-disclaimer, anti-punchline rules for future sessions
- `CHANGELOG.md` — this file (Keep a Changelog format, sessions 1–14)
- `docs/samtal/samtal-2026-04-09T1200-opencode-session14-en-ny-art.md` — deep conversation summary
- `docs/samtal/linkedin-handen-pa-axeln-fulltext.md` — 15-part LinkedIn series draft (WIP)

### Changed
- `PDF_VISION_PROMPT` exported from `ocr.ts` (was internal `const`)
- `diagnosePdfPage` accepts `visionPrompt` option for prompt A/B testing
- `evalPdfPage` accepts `options?: { visionPrompt?: string }`
- Tool catalog count 44 → 45
- OpenCode config: `reasoningSummary` changed from `"auto"` to `"none"` for all models — full thinking output now persisted

## [Session 13] — 2026-04-08

### Added
- `schema-dts` v2.0.0 devDependency
- `src/aurora/types.ts` — `AuroraDocument`, `AuroraPageEntry`, `PageUnderstanding`, `PageType` (14 variants), `ChartType` (11 variants), `DataPoint`, `PageTypeSignals`, eval types (`Facit`, `EvalResult`)
- `src/aurora/page-classifier.ts` — `classifyPage()` pure sync function, parses vision output into structured understanding
- `src/aurora/pdf-eval.ts` — `parseFacit()`, `evalPdfPage()`, `evalFromPipelineJson()`, `evalDirectory()`, `formatEvalSummary()`
- `aurora:pdf-eval` CLI command — evaluate pipeline output against facit YAML
- 24 new tests (15 classifier, 9 eval)

## [Session 12] — 2026-04-07

### Added
- `AuroraDocument` type design (Schema.org envelope with `aurora` namespace)
- `PageUnderstanding` type design

### Changed
- Architecture decision: Schema.org via `schema-dts` over Dublin Core

### Notes
- Design/research session only — no runtime code changes
- LiteLLM sub-agent routing broken throughout session (`reasoningSummary` param error)

## [Session 11] — 2026-04-05

### Added
- `aurora-workers/docling_extract.py` — Docling PDF worker with per-page markdown, tables, image count
- `ollama/Modelfile.vision-extract` — custom wrapper on `qwen3-vl:8b-instruct-q8_0` (temperature 0, seed 42)
- `VisionDiagnostics` interface (load/eval duration, token counts, image size)
- 5 pipeline JSON fixtures + 5 facit YAML skeletons in `tests/fixtures/pdf-eval/`

### Changed
- `diagnosePdfPage` uses Docling as primary extractor (`PageDigest.method` now includes `'docling'`)
- `src/aurora/vision.ts` rewritten: `/api/chat` endpoint, `think: false`, `num_predict: 800`, `keep_alive`, diagnostics
- `src/core/config.ts` default vision model → `aurora-vision-extract`
- `tests/aurora/vision.test.ts` fully rewritten

## [Session 10] — 2026-04-04

### Added
- `PageDigest` interface — per-page diagnostic data from PDF pipeline
- `diagnosePdfPage()` — side-effect-free single-page diagnostics
- `aurora:pdf-diagnose` CLI command
- `truncateDigestText()` — caps digest text at 2000 chars
- `PDF_VISION_PROMPT` — structured 5-field vision prompt
- `buildPageDigestSection()` — Obsidian callout table for page digests
- AGENTS.md §15: Release Notes convention (three-variant format)
- Retroactive release notes for sessions 1–10 (21 files)

### Changed
- `ingestPdfRich` refactored to build `PageDigest[]` per page
- `RichPdfResult` extended with `pageDigests`, `pageCount`
- Vision API switched from `/api/generate` to `/api/chat` with system message
- `isVisionAvailable()` uses `isModelAvailable()` instead of `ensureOllama()`

## [Session 9] — 2026-04-03

### Added
- `Provenance` interface (`källa_typ`, `källa_agent`, `källa_modell`) — added to all ingest paths
- `updateSpeakerMetadata()` — updates speaker with title + organization from Obsidian import
- `ParsedTimelineBlock` interface + `extractTimelineBlocks()`
- EBUCore fields: `ebucore:personTitle`, `ebucore:organisationName`
- Obsidian import: tag roundtrip, speaker enrichment, segment reassignment (5s tolerance)
- 9 new tests (parser, export, import)

### Changed
- Obsidian export: tag values with spaces now quoted in YAML frontmatter
- Obsidian export: provenance fields added to all exported frontmatter

## [Session 8] — 2026-04-02

### Added
- `AbortSignal.timeout(120_000)` on Ollama vision fetch
- 30-minute SIGKILL timeout for long-running jobs
- `recoverStaleJobs()` — requeues jobs stuck in `running` state

### Fixed
- `tests/mcp/scopes.test.ts` — missing `.tool()` method on `fakeServer` mock

### Notes
- Metadata schema comparison (EBUCore, Schema.org, A-MEM, HippoRAG) documented in plan

## [Session 7] — 2026-04-02

### Added
- `ingestPdfRich()` — multi-stage PDF processing (text → OCR → vision)
- `startPdfIngestJob()` — job queue for rich PDF ingest
- `aurora_ingest_pdf` MCP tool
- `aurora-ingest-media` and `aurora-media` MCP scopes
- `render_pdf_page()` and `get_pdf_page_count()` in Python worker
- PaddleOCR migrated from `ocr()` to `predict()` (v3.x API)
- Hermes cron at 08:00 daily

### Changed
- `job-worker.ts` generalized to dispatch by `job.type`
- `obsidian-export.ts` adds `source_url` to frontmatter

## [Session 6] — 2026-04-01

### Added
- `expandViaPpr()` — Personalized PageRank search expansion (seeds weighted by similarity)
- `evolveRelatedNodes()` — memory evolution at ingest (updates related nodes, resolves knowledge gaps)
- `usePpr` + `pprLimit` options on `SearchOptions`
- `source: 'semantic' | 'ppr'` field on `SearchResult`
- `evolution?: EvolutionResult` on `IngestResult`
- 15 new tests (10 PPR, 5 evolution)

## [Session 5] — 2026-04-01

### Added
- `generateMetadata()` — LLM-enriched metadata via Gemma 3 (tags, language, author, contentType, summary)
- Full text reconstruction from chunks in Obsidian export
- TL;DR in frontmatter + blockquote
- Comma-separated MCP scope support

### Changed
- `extractTags()` replaced by `generateMetadata()`
- `extract_url.py` output format → markdown
- Obsidian export: empty sections hidden, `contentType`/`author`/`language`/`tags` in frontmatter

### Removed
- `extractTags()` heuristic function

## [Session 4] — 2026-04-01

### Added
- `extractTags()` — domain, language, platform, keywords from URL + title
- Obsidian export: chunk filtering (skip `_chunk_` nodes), edge rendering, stale file cleanup

### Fixed
- 3 broken tests in `aurora-decay.test.ts` (session 3 regression)

### Notes
- Hermes v0.5.0 + Telegram bot installed externally
- Code changes were NOT committed at handoff

## [Session 3] — 2026-03-30

### Added
- Structured JSON logging for decay runs (`logs/decay/<timestamp>.json`)
- Aurora fact node creation after each decay run
- `GAMEPLAN-HERMES-AURORA-2026-03-30.md` — Hermes integration plan

### Changed
- `src/commands/aurora-decay.ts` fully rewritten

## [Session 2] — 2026-03-29

### Changed
- `MAX_EMBED_CHARS` reduced 2000 → 1500 (Swedish text tokenization headroom)
- Embedding retry pattern: `i--` index mutation → explicit `currentMaxChars` halving

### Added
- Architecture docs in three variants (LLM, Marcus, Dev)
- AGENTS.md §14: documentation conventions

## [Session 1] — 2026-03-29

### Added
- Batch fallback for embedding calls (individual retry on batch failure)
- `scripts/reembed-aurora.ts` — one-time backfill utility

### Changed
- Embedding source: `JSON.stringify(properties)` → `properties.text`
- `MAX_EMBED_CHARS = 2000` truncation before embedding
- `extract_video.py`: `TemporaryDirectory()` → `mkdtemp()` (async-safe)

### Fixed
- Embeddings contained serialized JSON noise instead of natural language text
- Video transcription race condition (temp dir deleted before Whisper finished)
