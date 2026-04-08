# Changelog

All notable changes to Neuron HQ are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Sessions are listed newest-first.

---

## [Session 14] — 2026-04-08

### Added
- `classifyPage()` wired into `ingestPdfRich` — `RichPdfResult` now includes `pages: AuroraPageEntry[]` with digest + understanding per page
- `aurora_pdf_eval` MCP tool — evaluate PDF pipeline output via MCP (not just CLI)
- `aurora:pdf-eval-compare` CLI command — A/B comparison of two vision prompts against the same facit set
- `CompareResult` interface in `pdf-eval-compare.ts`

### Changed
- `PDF_VISION_PROMPT` exported from `ocr.ts` (was internal `const`)
- `diagnosePdfPage` accepts `visionPrompt` option for prompt A/B testing
- `evalPdfPage` accepts `options?: { visionPrompt?: string }`
- Tool catalog count 44 → 45

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
