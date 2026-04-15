# Changelog

All notable changes to Neuron HQ are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Sessions are listed newest-first.

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
