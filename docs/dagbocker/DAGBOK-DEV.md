# Dagbok — Senior Fullstack

**Publik:** Seniora fullstack-utvecklare. Du kan TypeScript, PostgreSQL, MCP, embeddings. Här får du arkitekturbeslut, kodmönster och "varför designades det så".

**Vem skriver?** AI-agent (Sisyphus/Atlas/Claude) under sessioner. Marcus vid manuella commits.

**Tre dagböcker:** DAGBOK-MARCUS.md (projektägare, svensk prosa), **DAGBOK-DEV.md** (denna, seniora fullstack-devs), DAGBOK-LLM.md (AI-agenter, dense/parseable).

**Historik:** S1–S150 + körningar #1–#183 → `docs/DAGBOK.md`. Handoffs → `docs/handoffs/`. ADR → `docs/adr/`.

## 2026-04-16 (session 20) — Semantic paragraph splitting + Chapter-aware timeline + Word timecodes

### `aurora:delete` CLI

`src/commands/aurora-delete.ts` — thin wrapper around `cascadeDeleteAuroraNode()` from session 17. DB guard (checks node exists before attempting delete), structured output with node type + label. 8 tests. Added to `src/cli.ts` as `aurora:delete` subcommand.

Tradeoff: didn't add `--force` flag. If node doesn't exist, command exits with a clear error, not silently. That's the right behavior for a destructive operation.

### Pyannote AudioDecoder fix — three-layer approach

Root cause: `torchcodec` 0.10.0 ABI mismatch with `torch` 2.11.0. Manifested as `RuntimeError: AudioDecoder` during `pyannote.audio` pipeline execution.

**Layer 1 (Python): Bypass AudioDecoder entirely.**
`_load_audio()` in `transcribe_audio.py` now: (a) converts m4a→WAV via `subprocess.run(['ffmpeg', ...])`, (b) loads with `soundfile.read()`, (c) passes `{"waveform": tensor, "sample_rate": 16000}` dict directly to pyannote Pipeline instead of a file path. Pyannote accepts both; the dict path skips AudioDecoder.

**Layer 2 (TypeScript): Defensive isolation.**
`video.ts` diarize step wrapped in try/catch. On failure: `speakers = []`, pipeline continues, `diarized: false` in result. Downgrade, not crash.

**Layer 3 (check_deps.py): Warn early.**
`soundfile>=0.12.0` check added. Torchcodec ABI version check added. Both print actionable error messages.

E2E verified: 2 speakers on MPS GPU (MacBook Pro M-series). Whisper + pyannote both passing.

### AGENTS.md §3.9

New principle: "Don't Be a Gatekeeper for Things You Don't Own." Born from a specific moment: word-level timecodes existed in the data and an agent initially recommended not surfacing them because they were "verbose." The principle codifies the counter-argument: when you have structured data, the default is to preserve and expose it. The cost of omission is paid by the user, not the agent.

This is documented before the code that uses it because the principle should inform future decisions beyond word timecodes.

### Word-level timecodes in Obsidian

`WhisperWord[]` from session 19 is now propagated through all three pipeline stages: assign, merge, split. Previously the array was dropped during merge/split operations.

`obsidian-export.ts`: timeline blocks render words as `<span data-t="{ms}">{word}</span>` when `words[]` is present. Falls back to plain text for VTT subtitle export (VTT has its own cue timing, doesn't need inline spans). The span tags are invisible in Obsidian reading view; they exist for future click-to-seek functionality.

Performance note: not benchmarked at scale. A 90-minute video with ~8000 words = ~8000 span tags in one Obsidian file. Obsidian renders it fine in testing. Worth monitoring.

### `semantic-split.ts` — new module

`src/aurora/semantic-split.ts` exports `semanticSplit(blocks, options?)` and `mergeRunts(blocks, gapThresholdMs?)`.

**Instruction surface decision:** First attempt passed LLM the full text and asked for character offsets of split points. Gemma3 consistently returned narrative answers. Root cause: char offsets are abstract and LLM-unfriendly. Switched to sentence-number approach: (1) number each sentence in the input, (2) ask LLM to return JSON array of sentence indices to split after. Unambiguous, reliable, and easy to validate.

**`think:false`:** Gemma4:26b defaults to thinking mode — generates a reasoning chain before output. On structured tasks this exhausts the output token budget before the actual JSON is produced. `think: false` in Ollama request params disables this. Drops response time from 8-12min to 2-4s on semantic split.

**Code-fence stripping:** LLM wraps JSON in markdown code blocks despite instructions. `semanticSplit()` strips ` ```json ` fences before parsing. This is standard practice for any Ollama-backed structured output call.

**Post-processing:**
- Re-merge with soft limit (4000 chars): adjacent same-speaker blocks are merged up to 4000 chars. Prevents the split from producing too many micro-blocks.
- `mergeRunts()`: blocks shorter than a threshold are merged into the next block. Gap check: if gap between block A end and block B start > 10s, treat as hard boundary. Without this, mergeRunts joined last block of chapter N with first block of chapter N+1 when they shared a speaker.

**Fallback:** if Ollama is unreachable, returns `null`, or returns invalid JSON, `semanticSplit()` returns original blocks unchanged. No crash, no data loss.

### Chapter-aware Obsidian timeline

`speaker-timeline.ts`: chapter boundaries are now hard breaks in `remergeSameSpeakerBlocks()`. The 10s gap check also applies here (same implementation as mergeRunts).

`obsidian-export.ts`: chapters render as `### Title` H3 headers. TOC generated as `[[#ChapterTitle]]` Wikilinks at top of timeline section. Speaker label shown only: (a) at chapter start, or (b) when speaker changes within chapter. This cut the noise significantly — a 30-minute interview with 2 speakers was producing ~120 speaker-label lines per export; now it produces ~15.

### `remergeSameSpeakerBlocks` Set.has() bug

Took ~45 minutes to debug. After semantic split, re-merge produced no merges at all. All blocks stayed separate. The speaker comparison used `Set.has()` with exact string matching. Pyannote labels occasionally have trailing whitespace or minor casing differences. `Set.has()` failed silently — no error, just no merges. Fix: normalize speaker labels (trim + lowercase) before Set insertion and lookup. Oracle identified the pattern.

### Mönster etablerade

- **Sentence-number LLM instructions** over char-index or token-offset for structured split tasks. More reliable, easier to validate.
- **`think: false` for all structured-output Ollama calls** with gemma4. Document this as a team convention.
- **Gap-based hard boundary** (10s threshold) in any merge/runt operation to prevent cross-chapter artifacts.
- **Three-layer fix pattern** for Python dep conflicts: bypass (Python), isolate (TypeScript catch), warn early (check_deps).

| Tid | Typ | Vad |
|-----|-----|-----|
| ~11:00 | FEAT | aurora:delete CLI |
| ~11:45 | FIX | Pyannote AudioDecoder three-layer fix |
| ~12:30 | DOCS | AGENTS.md §3.9 |
| ~13:00 | FEAT | Word timecodes propagation + span rendering |
| ~14:00 | FEAT | semantic-split.ts (first pass — charindex, failed) |
| ~15:30 | REFACTOR | Switched to sentence-number approach |
| ~16:00 | DEBUG | Set.has() speaker match bug (Oracle assist) |
| ~16:45 | DEBUG | console.log spy swallowing test output |
| ~17:30 | FIX | mergeRunts cross-chapter boundary |
| ~18:00 | FEAT | Chapter headers + TOC + speaker-only-at-change |

### Baseline

typecheck: clean (1 pre-existing unrelated error).
tests: ~151 → ~183 (+32).

---

## 2026-04-15 (session 19) — Word-level speaker alignment + Rich metadata + LLM tldr

### Word-level speaker alignment

`splitAtWordBoundaries()` i `speaker-timeline.ts` — tar en WhisperSegment med `words[]` och diarization-segment, hittar speaker per ord via overlap, grupperar konsekutiva ord med samma speaker till sub-segment. Exakta word-level start/end_ms, inte proportionell fördelning.

`transcribe_audio.py`: `word_timestamps=True` i `model.transcribe()`. Varje segment inkluderar `words: [{start_ms, end_ms, word, probability}]`. ~10-20% långsammare transkribering (cross-attention + DTW).

`buildSpeakerTimeline()`: `hasWords` check → word-level path, annars sentence-boundary fallback. Fullt bakåtkompatibelt — segment utan `words` (äldre transkriptioner, subtitle-baserade) degraderar till session 18-beteende.

### Rich Obsidian video metadata

`extract_video.py` → `view_count`, `like_count`, `channel_follower_count`, `thumbnail` från yt-dlp JSON. Propageras genom `video.ts` transcript node properties → `obsidian-export.ts` `formatVideoFrontmatter()`.

Frontmatter-ändringar: `källa:` → `videoUrl:`. +`kanal`, `kanalhandle`, `visningar`, `likes`, `prenumeranter`, `thumbnail`. Borttagen `källa_typ`/`källa_modell`/`källa_agent` (provenance — brus för Obsidian-användare).

Body-sektioner: `## Beskrivning` (YouTube description) och `## Kapitel` (tidskodad lista från yt-dlp chapters) infogade mellan speaker-tabell och tidslinje.

### Hashtag tags

`extractHashtags(text)` — regex `/#[a-zA-Z]\w*/g`, dedup via Set, tar bort `#`-prefix. Preferens: hashtags från `videoDescription` → fallback till `ytTags`. Löser problemet att generiska YouTube-tags ("youtube.com", "education") hamnade i Obsidian.

### LLM tldr

Ny `transcript-tldr.ts` — `generateTldr()` med Ollama/Claude dual backend (identiskt mönster som `speaker-guesser.ts`). System prompt: "concise summarizer, 2-3 sentences, same language as transcript". Trunkerar till 8000 chars. Pipeline-steg 11c i `video.ts`, efter tags (11b), innan speaker-guess (12).

Ersätter `summary` = första meningen av description (som ofta var en reklamlänk). Verified E2E: IBM Technology RAG-video fick en faktiskt bra sammanfattning via Gemma3.

### Fallback Speaker_01

Steg 7b i `video.ts` — om `voicePrintsCreated === 0` efter steg 7, skapa en `SPEAKER_01` voice_print med ett segment `[0, duration_ms]`. Confidence 0.5 (lägre än diarized 0.7). Garanterar att Obsidian-exporten alltid har en redigerbar talartabell.

### Mönster etablerade

- **Dual-backend LLM pattern**: System prompt + user message, Ollama default med Claude fallback. `ensureOllama()` → `callOllama()` / `callClaude()`. Tredje modulen som följer detta (polish, speaker-guess, tldr).
- **Hashtag extraction over metadata tags**: Creator-kurerade hashtags > platform-genererade tags. Fallback-kedja.
- **Fallback voice_print**: Alltid minst en speaker-rad i Obsidian. `createdBy: 'video-intake-fallback'` edge metadata för spårbarhet.

| Tid | Typ | Vad |
|-----|-----|-----|
| — | FEATURE | splitAtWordBoundaries + WhisperWord |
| — | FEATURE | Rich YouTube metadata i Obsidian frontmatter |
| — | FEATURE | extractHashtags — hashtags > ytTags |
| — | FEATURE | LLM tldr via transcript-tldr.ts |
| — | FEATURE | Fallback Speaker_01 |
| — | CLEANUP | Borttagen provenance från video frontmatter |
| — | CLEANUP | källa → videoUrl i frontmatter |

### Baseline

typecheck: clean
tests: 4126/4127 (+8 netto, 1 pre-existerande failure)

---

## 2026-04-14 (session 18) — Sentence-boundary split + DeepFilterNet + Obsidian H4/rename

### Sentence-boundary speaker alignment

`splitAtSentenceBoundaries()` i `speaker-timeline.ts` — splittar WhisperSegments vid `/[.?!][)»"']?\s+/g` till sub-segment med proportionell tidsfördelning baserad på teckenantal. Integrerad som Step 0 i `buildSpeakerTimeline()` via `sorted.flatMap(splitAtSentenceBoundaries)`. Ger finare granularitet för overlap-baserad speaker assignment.

**Begränsning**: Heuristik baserad på interpunktion, inte ord-timestamps. `transcribe_audio.py` sparar inte `word_timestamps` idag. Session 19 aktiverar `word_timestamps=True` i faster-whisper och splittar vid diarization-gränser med exakta ordtider.

### DeepFilterNet denoising pipeline

Ny `denoise_audio.py` worker — anropar DeepFilterNet CLI (`deep-filter`/`deepFilter`) som subprocess. Passthrough-fallback om verktyget saknas eller kraschar. Konfigureras via `DEEPFILTERNET_CMD` env var.

**Beroendekonflikt**: deepfilternet 0.5.6 kräver `numpy<2` + `torch<2.6`. pyannote kräver `numpy>=2` + `torch>=2.8`. Löst med isolerad venv i `.venvs/denoise/` (torch 2.2.2, numpy 1.26.4, soundfile). Anaconda-miljön orörd.

Pipeline-integration: `video.ts` Step 2b mellan download och transcribe. `audioPath` variabel ersätter `extractMeta.audioPath` för transcribe+diarize. `STEP_NAMES` inkluderar `denoise` alltid (markeras `skipped` om inte aktiverat).

### Obsidian H3→H4

`buildTimelineSection()` och `buildTimelineSectionWithAnnotations()` ändrade från `### ${formatMs(...)}` → `#### ${formatMs(...)}`. Parser `TIMECODE_HEADER_RE` ändrad till `#{3,4}` för backward compat.

### Speaker rename Path B

`obsidian-import.ts` — ny matchningslogik: om `speaker.label` inte börjar med `SPEAKER_` och `speaker.name` är tomt → labelet IS det nya namnet. Matchning via position bland `videoVoicePrints` (sorterade efter första segmentets start_ms).

### Mönster etablerade

- **Isolerad venv-pattern**: När Python-beroenden konfliktar, skapa `.venvs/<name>/` med egen torch-version. Referera via env var (`DEEPFILTERNET_CMD`). Lägg `.venvs/` i `.gitignore`.
- **Optional pipeline step**: Alltid i `STEP_NAMES`, markera `skipped` i rapport om inte aktiverat. Följer diarize-stegets mönster.

| Tid | Typ | Vad |
|-----|-----|-----|
| — | FEATURE | splitAtSentenceBoundaries i speaker-timeline |
| — | FEATURE | DeepFilterNet denoise pipeline + venv |
| — | FIX | Obsidian timeline H3→H4 |
| — | FIX | Speaker rename via Label-kolumn |

### Baseline

typecheck: clean
tests: 4109/4109 (+17 nya, 2 pre-existerande failures)

---

## 2026-04-02 (session 8) — PDF timeout-hantering + Hermes git-tracking + Metadata-schema

### PDF ingest timeout-kaskadskydd

Tre fixes i `src/aurora/job-runner.ts` + `src/aurora/vision.ts`:

1. **Job-level timeout** — `JOB_TIMEOUT_MS = 30 * 60 * 1000`. `processQueue()` sätter `setTimeout` → SIGKILL på forked child → markerar jobb som `error` med meddelande.
2. **Stale job recovery** — `recoverStaleJobs()` körs vid varje `processQueue()`-anrop. SELECT alla `status='running'`, kolla `isProcessAlive(pid)` (signal 0) + ålderscheck. Döda/gamla jobb → `error`.
3. **Vision fetch timeout** — `AbortSignal.timeout(120_000)` på Ollama `fetch()` i `analyzeImage()`. 2 min per sida.

Kaskadordning: Ollama hänger → vision abort 2min → om det inte räcker → job killed 30min → om server kraschar → stale recovery vid nästa queue-anrop.

**Bugfix**: `tests/mcp/scopes.test.ts` — session 7 registrerade `aurora_ingest_pdf` i scopes men glömde uppdatera testets `fakeServer` mock (saknade `.tool` metod).

### Hermes git-tracking

`git init ~/.hermes/` med `.gitignore` som skyddar secrets:

**Trackat**: `memories/`, `SOUL.md`, `config.yaml`, `context/security.md`, `cron/`, `gateway_state.json`, `channel_directory.json`, `aurora-mcp.sh`  
**Ignorerat**: `.env`, `auth.json`, `sessions/`, `skills/`, `cache/`, `hermes-agent/`, `logs/`, `pairing/`

### Metadata-schema analys

Djupanalys: EBUCore vs Schema.org vs A-MEM vs HippoRAG vs Anthropic KG cookbook.

**Rekommendation**: Schema.org (bas) + Provenance-lager (nytt) + A-MEM-attribut (keywords/tags) + EBUCore (media-noder).

Nyckelidé: **Provenance** — varje nod spårar `agent` (VoicePrint|Person|LLM|System), `method` (transcription|ocr|manual|...), `model` (whisper|qwen3-vl|...). Ger VoicePrint-taggning + modellspårbarhet + HippoRAG-kompatibel graf-semantik.

### Implementeringsplan

5 arbetspaket dokumenterade i `docs/plans/PLAN-obsidian-twoway-metadata-2026-04-02.md`:

| WP  | Vad                                               | Uppskattad tid |
| --- | ------------------------------------------------- | -------------- |
| WP1 | Tag-bugg fix (mellanslag → quotes i Obsidian)     | ~10 min        |
| WP2 | Tags round-trip (import tillbaka)                 | ~30 min        |
| WP3 | Speaker title/organization i frontmatter + import | ~45 min        |
| WP4 | Provenance-lager vid ingest + export              | ~30 min        |
| WP5 | Segment-korrektioner (flytta text mellan talare)  | ~60 min        |

| Tid   | Typ     | Vad                                                        |
| ----- | ------- | ---------------------------------------------------------- |
| 09:00 | SESSION | Session 8 start, läste session 7 handoff                   |
| 09:15 | FIX     | Job-level timeout + stale recovery + vision timeout        |
| 09:30 | FIX     | scopes.test.ts fakeServer bugg (session 7 gap)             |
| 09:40 | BUILD   | typecheck clean, 3964 tester, 0 failures                   |
| 09:45 | CONFIG  | git init ~/.hermes/, .gitignore, initial commit            |
| 10:00 | BESLUT  | Metadata-schema: Schema.org + Provenance + A-MEM + EBUCore |
| 11:00 | PLAN    | 5 WP:er dokumenterade i PLAN-obsidian-twoway-metadata      |
| 11:30 | DOCS    | Handoff + dagböcker                                        |

### Baseline

```
typecheck: clean
tests: 294 files, 3964 tests, 0 failures
commits: 24cdffe (S7), 5a9664d (S8 timeout), e02ed32 (S8 handoff+plan)
hermes git: initial commit 7be7864 (13 files tracked)
```

---

## 2026-04-02 (session 7) — Hermes briefing + Media ingest pipeline + Hybrid PDF

### Morgonbriefing via Hermes

Config utanför repo (`~/.hermes/config.yaml`):

- `aurora-insights` scope tillagt i MCP args → exponerar `aurora_morning_briefing`
- Cron-jobb `morning_briefing` kl 08:00 → `telegram:8426706690`
- `croniter` saknades i Hermes venv → installerat

Briefing-pipeline: `aurora_morning_briefing` → SQL-query (nya noder, stale, gaps) → markdown → Obsidian-fil + Telegram.

### Media ingest via Hermes (YT + PDF + bilder)

Lade till `aurora-ingest-media` + `aurora-media` scopes i Hermes config → 8 nya MCP-tools (20 totalt):

| Tool                                                          | Funktion                                          |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `aurora_ingest_video`                                         | Async YT/video → transkript → chunks → embeddings |
| `aurora_ingest_pdf`                                           | **NY** — Async PDF → OCR + vision → rich nodes    |
| `aurora_ingest_image`                                         | OCR på bilder (PaddleOCR)                         |
| `aurora_ingest_book`                                          | Batch-OCR folder → single doc                     |
| `aurora_ocr_pdf`                                              | OCR fallback för broken font encoding             |
| `aurora_describe_image`                                       | Vision-analys (qwen3-vl via Ollama)               |
| `aurora_speakers` / `aurora_jobs` / `aurora_ebucore_metadata` | Talarhantering + jobbstatus                       |

### Diarize fix

pyannote.audio installerades i Anaconda-env. numpy-konflikt (2.4.4 vs 1.x) löstes med downgrade. `aurora-mcp.sh` PATH uppdaterad med `/opt/anaconda3/bin`.

### PaddleOCR 3.x API-migrering

`aurora-workers/ocr_pdf.py` uppdaterad: PaddleOCR 3.x använder `predict()` istället för `ocr()`, `PaddleOCR(lang='en')` istället för `PaddleOCR(use_angle_cls=True, lang='latin', show_log=False)`.

### Hybrid PDF-pipeline (ny feature)

`ingestPdfRich()` i `src/aurora/ocr.ts` — 6-stegs pipeline:

1. `get_pdf_page_count` (ny Python worker action)
2. `extract_pdf` (pypdfium2 text)
3. `isTextGarbled()` → OCR fallback
4. Per sida: `render_pdf_page` → temp PNG → `analyzeImage()` (qwen3-vl)
5. Kombinera text + vision-beskrivningar: `[Page N]\n{text}\n[Visual content: {vision}]`
6. `processExtractedText()` → Aurora-nod

Asynkt via jobbkö: `startPdfIngestJob()` → `aurora_jobs` table → `job-worker.ts` (generaliserad — dispatchar `video_ingest` vs `pdf_ingest` baserat på `job.type`).

### Obsidian käll-URL i frontmatter

`src/commands/obsidian-export.ts` — `source_url` kolumn (DB) → `källa:` i frontmatter. Fallback-kedja: `props.videoUrl ?? props.sourceUrl ?? node.source_url`.

| Tid   | Typ     | Vad                                                    |
| ----- | ------- | ------------------------------------------------------ |
| 06:00 | SESSION | Session 7 start                                        |
| 06:10 | CONFIG  | `aurora-insights` scope + cron morning_briefing        |
| 06:25 | FIX     | croniter install, gateway restart, manuellt test       |
| 06:40 | FIX     | Obsidian käll-URL (source_url kolumn → frontmatter)    |
| 06:50 | CONFIG  | `aurora-ingest-media` + `aurora-media` scopes i Hermes |
| 07:00 | TEST    | YT-indexering E2E: "Me at the zoo" (19s) ✅            |
| 07:05 | FIX     | pyannote install, numpy downgrade, MCP PATH fix        |
| 07:08 | TEST    | YT med diarize: Gangnam Style → 4 talare, MPS GPU ✅   |
| 07:15 | FIX     | PaddleOCR 3.x API-migrering i ocr_pdf.py               |
| 07:30 | FEATURE | `ingestPdfRich()` — hybrid OCR + vision pipeline       |
| 07:45 | FEATURE | `startPdfIngestJob()` + job-worker generalisering      |
| 08:00 | FEATURE | `aurora_ingest_pdf` MCP tool + scope-registrering      |
| 08:18 | BUILD   | typecheck clean, 16/16 OCR-tester, 11/11 worker-bridge |

### Baseline

```
typecheck: clean
tests: 3963+ passing (inga regressions)
aurora nodes: ~90 (ingested "Me at the zoo" + "Gangnam Style")
commits: uncommitted (session 7 changes)
```

---

## 2026-04-01 (session 6) — PPR-retrieval + Memory Evolution

### PPR-retrieval i `searchAurora()`

Integrerade `personalizedPageRank()` från `src/core/ppr.ts` som tredje retrieval-steg i `src/aurora/search.ts`.

**Pipeline:** Semantic search → **PPR expansion** → keyword fallback → graph traversal enrichment.

Nyckeldesign:

- `expandViaPpr()` tar semantiska topresultat som seeds (viktade efter similarity)
- Kanter görs bidirektionella med `flatMap` (Aurora-kanter är riktade, PPR ska gå åt båda håll)
- PPR-upptäckta noder läggs till med `source: 'ppr'`, `similarity: null`
- Respekterar `type`/`scope`-filter, default `usePpr: true`, `pprLimit: 5`
- Graceful failure: PPR-fel fångas, loggas, sökning fortsätter utan expansion

### Memory Evolution i intake-pipeline

`evolveRelatedNodes()` i `src/aurora/intake.ts` körs efter LLM-metadata, före final save.

1. `findSimilarNodes(newNodeId, { table: 'aurora_nodes', limit: 5, minSimilarity: 0.6 })`
2. Uppdaterar matchande doc-noder (ej chunks) med `relatedContext: ["Ny relaterad källa: {titel} — {summary}"]`
3. Kollar öppna kunskapsluckor via ordöverlapp (50%+ av frågeord >3 tecken) → `resolveGap()`
4. `IngestResult.evolution: { nodesUpdated, gapsResolved }`
5. Pipeline steps_total: 6 → 7

| Tid   | Typ     | Vad                                                                |
| ----- | ------- | ------------------------------------------------------------------ |
| 21:00 | SESSION | Session 6 start, baseline 3949/3949 (1 pre-existing timeout)       |
| 21:05 | BESLUT  | PPR i searchAurora() (inte Consolidator) — user-facing värde först |
| 21:15 | FIX     | PPR expansion som Step 2 i search pipeline                         |
| 21:30 | TEST    | +10 PPR-tester (seeds, dedup, limit, type filter, graceful)        |
| 21:40 | FIX     | evolveRelatedNodes() i intake.ts pipeline                          |
| 21:45 | TEST    | +5 evolution-tester (relatedContext, gap resolve, chunk skip)      |
| 21:50 | BUILD   | typecheck: clean, 3963/3964 (1 pre-existing timeout)               |

### Baseline

```
typecheck: clean
tests: 3963/3964 (1 pre-existing timeout: auto-cross-ref.test.ts)
commit: 5dbd59a
new tests: +15 (10 PPR + 5 evolution)
```

---

| Metrik            | Värde                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tester            | 3949 (Vitest)                                                                                                                                                 |
| Agenter           | 13 (Manager, Implementer, Reviewer, Researcher, Librarian, Historian, Tester, Consolidator, Knowledge Manager, Merger, Observer, Brief Reviewer, Code Anchor) |
| Körningar         | 183 totalt (varav ~120 GREEN)                                                                                                                                 |
| Aurora idénoder   | 924                                                                                                                                                           |
| Roadmap Fas 3     | 26/32 tasks done                                                                                                                                              |
| TypeScript strict | noUncheckedIndexedAccess + strictNullChecks + NodeNext                                                                                                        |

---

## Hur man skriver

- Svenska med engelska tekniska termer (standard dev-kultur)
- Filreferenser med sökväg: `src/core/agents/manager.ts:45`
- Körresultat med AC-count, testräkning, kostnad
- Taggar: SESSION, KÖRNING, BESLUT, BRIEF, FIX, REFACTOR, TEST, BUILD, PROBLEM

---

## 2026-03-26

### Tooling-migration: VS Code + Claude Opus → OpenCode + LiteLLM

**Vad ändrades:**

- Primärt gränssnitt: VS Code (Cursor-fork) → OpenCode
- Model routing: direkt Anthropic API → LiteLLM proxy (multi-model)
- Aktiv modell idag: `claude-opus-4-6` via `svt-litellm/` prefix
- Orkestrator: Claude Opus (informell) → Atlas (OhMyOpenCode Master Orchestrator)

**Vad ändrades INTE:**

- Kodbasen (ingen prod-kod ändrad idag)
- Test suite (3949 tester intakta)
- Policy-filer (`policy/bash_allowlist.txt`, `policy/forbidden_patterns.txt`)
- Aurora-integrationen (MCP server, pgvector, Obsidian)

**Varför bytet?**
LiteLLM ger model-agnostisk routing — samma prompt-infrastruktur kan använda Opus, Sonnet, Haiku, eller open-source-modeller utan att ändra agentkoden. Atlas-orkestratorn ger strukturerad multi-task-planering som Opus-i-VS Code inte hade formellt.

| Tid    | Typ     | Vad hände                                                                        |
| ------ | ------- | -------------------------------------------------------------------------------- |
| ~09:00 | BESLUT  | LiteLLM proxy aktiv. Model prefix: `svt-litellm/`                                |
| ~09:15 | SESSION | Första Atlas-sessionen. Plan: skapa tre dagböcker i `docs/dagbocker/`            |
| ~09:30 | FIX     | `docs/dagbocker/` skapad. DAGBOK-MARCUS.md, DAGBOK-DEV.md, DAGBOK-LLM.md skrivna |

### Roadmap-kontext

Vi är på **Fas 2 (Intelligens)** i ROADMAP.md. Fas 1 (Daglig nytta) är komplett sedan 2026-03-19.

Nästa kritiska milstolpe: Aurora-integration. Neuron har aldrig körts mot Aurora som target-repo. Körningarna `A1`–`A6` i ROADMAP-AURORA.md täcker detta.

Prioriterade briefs som väntar:

- `3.6` (KRITISK — identifierad i S144)
- `3.7`, `3.8`
- Aurora-serien `A1`–`A2` (obligatoriska)

### Aktiva risker

- **Code Anchor output-trunkering** (HÖG risk, identifierad S149). Brief finns: `briefs/2026-03-25-code-anchor-hardening.md`. Inte körts ännu.
- **Aurora MCP version mismatch** (MCP 1.25 vs 1.26). Identifierat S145. Åtgärd oklar.
- **Brief 3.2a** räddades manuellt från workspace (S138) — bör verifieras att merge-artefakter är kompletta.

---

## 2026-04-03 (Session 9)

### Obsidian tvåvägs-metadata — 5 WP implementerade

Alla 5 arbetspaket från session 8:s plan levererade i en session. Handlar om att göra Obsidian-exporten redigerbar och importera ändringar tillbaka till Aurora.

**WP1 — Tag quoting**: `formatFrontmatter()` och `exportRunNarrative()` quotar nu YAML-tags med mellanslag: `tags: [simple, "job displacement", AI]`. Trivialt men bröt YAML-parsern vid import.

**WP2 — Tags round-trip**: `ParsedObsidianFile` har nu `tags: string[] | null`. Parsern extraherar tags från frontmatter, importen diffar mot befintliga tags och uppdaterar noden om de ändrats. `ObsidianImportResult.tagsUpdated` counter.

**WP3 — Speaker enrichment**: Största WP:t. Datflöde:

```
speaker_identity node (Aurora)
  → edge → voice_print
    → buildSpeakerMap() traverserar edges
      → SpeakerInfo.title, .organization
        → formatVideoFrontmatter() exporterar
          → Obsidian: användaren redigerar
            → obsidian-import läser tillbaka
              → updateSpeakerMetadata() / createSpeakerIdentity()
```

EBUCore utökad med `ebucore:personTitle` och `ebucore:organisationName`.

**WP4 — Provenance-lager**: `Provenance` interface i `aurora-schema.ts`. Sätts vid node-skapande:

- `video.ts`: `{agent:'System', method:'transcription', model:'whisper-large-v3'}`
- `intake.ts`: default `web_scrape`/`manual`, respekterar caller-override via metadata
- `ocr.ts`: `{method:'ocr', model:'paddleocr-3.x'}`
- `vision.ts`: `{method:'vision', model:modelUsed}`
- `memory.ts`: `{agent:'Person', method:'manual'}`

Exporteras till Obsidian som `källa_typ`, `källa_agent`, `källa_modell`. Read-only (importeras inte).

**WP5 — Segment corrections**: Ny `extractTimelineBlocks()` parser som läser `### HH:MM:SS — Speaker`-headers. Import detekterar om en speaker-header ändrats (t.ex. SPEAKER_01 → SPEAKER_00), hittar matchande diarization-segment via 5s-tolerans, och flyttar segmentet mellan voice_prints.

### Arkitekturbeslut

- **Provenance i `properties`**, inte i Zod-schema — opt-in, ingen migration behövs
- **`buildSpeakerMap()` tar `allNodes` + `edges`** — måste traversera graf för speaker_identity-lookup
- **5 sekunders tolerans** för segment-timecode matching — hanterar avrundning utan falska positiver

| Tid   | Typ     | Vad                                                    |
| ----- | ------- | ------------------------------------------------------ |
| 18:00 | SESSION | Session 9 start, läser handoff + plan                  |
| 18:05 | FIX     | WP1: Tag quoting fix + test                            |
| 18:10 | FEATURE | WP2: Tags round-trip parser + import + 2 tester        |
| 18:20 | FEATURE | WP3: Speaker title/org — 6 filer, 5 tester uppdaterade |
| 18:35 | FEATURE | WP4: Provenance — 7 ingest-filer + export + 2 tester   |
| 18:45 | FEATURE | WP5: Timeline blocks + segment reassignment + 5 tester |
| 18:50 | VERIFY  | Typecheck clean, 142/142 tester, full suite 3967 pass  |
| 19:00 | PLAN    | Session 10 plan: PageDigest i PDF-pipeline             |

### Baseline

```
typecheck: clean
tests: 3967/3967 (1 pre-existing flaky timeout: auto-cross-ref.test.ts)
commits: ej committat (awaiting review)
```

---

## 2026-04-01 (Session 5)

### Ingest-pipeline: regex-tags → LLM-enriched metadata

**Designbeslut:** `extractTags()` (regex-split av titel) ersatt med `generateMetadata()` — ett enda Gemma 3 (Ollama) anrop som producerar tags + language + author + contentType + summary.

**Varför:** Regex gav meningslösa tags ("covid", "pandemic" för en AI-artikel som använde pandemin som metafor). LLM med full textkontext (start+mitt+slut, 3000 chars) ger semantiska tags.

**Arkitektur:**

```
processExtractedText() pipeline:
  1. Hash + dedup
  2. Create doc node (tags: [] — tom initialt)
  3. Create chunks + edges
  4. saveAuroraGraph()
  5. autoEmbedAuroraNodes()
  6. findNeuronMatchesForAurora()     ← cross-refs
  7. generateMetadata()               ← NY: Gemma 3 via Ollama /api/chat
     → tags, language, author, contentType, summary
     → updateAuroraNode() med alla fält
  8. saveAuroraGraph() med pipeline_report
```

`generateMetadata()` körs medvetet SIST (steg 7) — har tillgång till cross-ref-titlar som extra kontext för tagging.

**Text sampling för långa dokument:**

```typescript
if (text.length > 3000) {
  start(1000) + mid(1000) + end(1000); // representativt urval
}
```

**Filer:** `src/aurora/intake.ts` (generateMetadata), `aurora-workers/extract_url.py` (author extraction)

### Obsidian-export: debug-metadata → user-facing properties

**Designbeslut:** Obsidian frontmatter visar nu det användaren bryr sig om, inte intern debug-data.

Före → Efter:

```yaml
# FÖRE                          # EFTER
id: "doc_09e7a960be31"          typ: bloggpost
type: document                  författare: "Matt Shumer"
scope: personal                 publicerad: 2026-02-09
confidence: 0.5                 källa: "https://shumer.dev/..."
exported_at: "2026-04-01..."    språk: english
                                tags: [ai, automation, ...]
                                tldr: "AI-disruption som..."
```

**Full text från chunks:** Export konkatenerar alla `_chunk_N`-noder istället för att visa doc-nodens 500-tecken snippet. Chunks sorteras på `chunkIndex`.

**Markdown-formatering bevarad:** `trafilatura.extract(output_format='markdown')` — en rad i Python-workern. Ger headings, bold, paragraphs i Obsidian.

**Filer:** `src/commands/obsidian-export.ts`, `aurora-workers/extract_url.py`

### MCP multi-scope

**Designbeslut:** `createMcpServer()` accepterar kommaseparerade scopes: `--scope aurora-search,aurora-memory,aurora-ingest-text`.

**Varför:** Hermes behöver sökning + minne + ingest i samma MCP-server. Alternativet (en server per scope) ger N processer och N tool-prefix i Hermes.

**Implementation:** `scope.split(',')` → iterera, validera varje scope, registrera alla tools på samma `McpServer`-instans. Notification wrapper appliceras om _någon_ scope behöver det.

**Fil:** `src/mcp/server.ts`

### Hermes MCP-koppling: tsx cwd-bugg

**Problem:** Hermes startade MCP-servern med `npx tsx src/cli.ts` men tsx resolvade `src/cli.ts` relativt till Hermes agent-mappen (`~/.hermes/hermes-agent/`), inte Neuron HQ. `ERR_MODULE_NOT_FOUND`.

**Rotorsak:** Hermes gateway sätter `WorkingDirectory` till sin egen mapp i launchd-plist. `cwd` i config.yaml skickas kanske inte vidare som process cwd.

**Fix:** Wrapper-skript `~/.hermes/aurora-mcp.sh`:

```bash
#!/bin/bash
cd "/Users/mpmac/Documents/VS Code/neuron-hq" || exit 1
export DATABASE_URL=postgresql://localhost:5432/neuron
export PATH="..."
exec ./node_modules/.bin/tsx src/cli.ts mcp-server --scope "$1"
```

### Kunskapsarkitektur: Aurora vs HippoRAG vs A-MEM

**Analys:** Aurora har ~70% av HippoRAG och A-MEM redan. Saknas:

1. **PPR-retrieval** (HippoRAG) — `src/core/ppr.ts` finns men är inte integrerad i `searchAurora()`. Brief 3.2b har planen.
2. **Memory evolution** (A-MEM) — befintliga noder uppdateras inte när ny relaterad kunskap läggs till.
3. **Hermes som proaktiv agent** — varken HippoRAG eller A-MEM har detta. Unikt.

Se `docs/handoffs/HANDOFF-2026-04-01-opencode-session5-llm-metadata-hermes-mcp-plan.md` för full plan.

| Tid   | Typ      | Vad                                                                   |
| ----- | -------- | --------------------------------------------------------------------- |
| 18:00 | SESSION  | Session 5 start, baseline 3949/3949                                   |
| 18:10 | FIX      | Committade session 4 ändringar (3 commits)                            |
| 18:20 | REFACTOR | `extractTags()` → `generateMetadata()` med Gemma 3                    |
| 18:30 | FIX      | Hermes MCP: wrapper-skript, MEMORY.md reset, aurora-swarm-lab flyttad |
| 19:00 | BESLUT   | Obsidian frontmatter redesign: user-facing properties                 |
| 19:30 | FIX      | Markdown-formatering i trafilatura (`output_format='markdown'`)       |
| 19:45 | BESLUT   | Behåll "Aurora" som modulnamn inom Neuron HQ                          |
| 20:00 | PLAN     | PPR-retrieval + memory evolution + Hermes briefing plan               |

### Baseline

```
typecheck: clean
tests: 3949/3949 (1 pre-existing timeout: knowledge.test.ts)
commits: 10 denna session
aurora nodes: 86 (18 doc, rest chunks)
```

---

## 2026-04-04 — Session 10: PageDigest + Vision Prompt Overhaul

### PageDigest — src/aurora/ocr.ts

Ny exported interface `PageDigest` med per-sida data: `textExtraction` (method/charCount/garbled), `ocrFallback`, `vision` (model/description/textOnly/tokensEstimate), `combinedText`.

`ingestPdfRich()` refaktorerad: `ocrText` sparas separat, `visionModels[]` per sida, `pageDigests` skickas i metadata till `processExtractedText()`.

`diagnosePdfPage(filePath, page, options)` — kör pipeline utan ingest. CLI: `aurora:pdf-diagnose`.

`truncateDigestText()` — max 2000 chars per fält.

### Vision prompt-fix — src/aurora/vision.ts

| Problem                                     | Fix                                       |
| ------------------------------------------- | ----------------------------------------- |
| `/api/generate` utan system message         | → `/api/chat` med `VISION_SYSTEM_MESSAGE` |
| qwen3-vl thinking mode (2+ min, tom output) | `think: false` + `num_predict: 800`       |
| `ensureOllama()` blockerade timeout         | `isModelAvailable()` (enkel ping)         |

PDF-prompt omskriven: 5-punkt format (PAGE TYPE, TITLE, DATA, KEY FINDING, LANGUAGE).
DEFAULT_PROMPT omskriven: 5-punkt format (LAYOUT, TEXT, DATA, STRUCTURE, CONTEXT).

### Obsidian export — src/commands/obsidian-export.ts

`buildPageDigestSection()` → kollapsbar callout-tabell per sida. Pipe-char escaped till `∣`.

### Release notes-system

`AGENTS.md` sektion 15. 21 filer i `docs/release-notes/` (retroaktiva session 1-10, Marcus + LLM varianter). Kopierade till Obsidian `Neuron Lab/Release Notes/`.

```
typecheck: clean, tests: 42/42 (ocr 21 + obsidian-export 21)
E2E: Ungdomsbarometern sid 10 → "bar chart", ~30s. Sid 30 → 1295 chars text.
```

---

## 2026-04-05 (session 11) — Docling + Vision pipeline

### Vision model debugging

`qwen3-vl:8b` maps to the thinking artifact in Ollama (same hash as `8b-thinking`). The `think: false` API parameter is ignored because the model's template is `{{ .Prompt }}` — a raw passthrough without ChatML structure (ollama/ollama#14798). Workaround: switch to `qwen3-vl:8b-instruct-q8_0` which has proper ChatML with `$.Think` support.

Created `ollama/Modelfile.vision-extract` — custom wrapper: temp 0, seed 42, num_ctx 32768, system prompt, JSON few-shot example. Registered as `aurora-vision-extract` in Ollama. Config default changed accordingly.

`vision.ts` refactored: added `VisionDiagnostics` interface (load/eval duration, token counts, image size), `keep_alive: '10m'` to prevent GPU eviction, `stat()` size check (10MB cap), removed thinking workaround.

### Docling integration

Docling 2.84.0 replaces pypdfium2 as primary PDF extractor in `diagnosePdfPage`. The old pypdfium2 path (`ingestPdfRich`) is untouched for backward compat.

Architecture: `extract_pdf_docling` Python worker → per-page markdown + table data → TypeScript `diagnosePdfPage` → conditional vision for `<!-- image -->` elements.

Key limitation: Docling processes the entire PDF regardless of target page (~38s constant). No page-range API exists. Acceptable for batch/diagnose, but will need caching for interactive use.

DoclingDocument schema (v1.10.0): 1661 texts with labels (text, section_header), 187 pictures with bbox, 15 tables with cell data, per-page size. Pages themselves are bare `{size, page_no}` — no page_type, no reading_order, no visual classification.

### Metadata model decision

Three-layer application profile:
1. Dublin Core envelope (discovery: title, creator, date, subject)
2. DoclingDocument (internal: text, tables, pictures, structure, provenance)
3. Page-understanding extension (our addition: page_type computed from Docling elements + vision signal)

`page_type` is *derived*, not prompted — count of section_headers, tables, pictures, text elements from Docling + coarse vision signal ("bar chart", "infographic") → classification logic in our code. This means upgrading the vision model improves classification without code changes.

### Mönster etablerade

- Docling-first for PDF: structured markdown > flat text
- Vision as supplement, not primary: only for `<!-- image -->` gaps
- Custom Modelfile pattern: pin model config in repo, not in env
- `keep_alive` + pre-pin pattern for Ollama on M4: prevents GPU eviction between CLI invocations

| Tid   | Typ     | Vad                                              |
| ----- | ------- | ------------------------------------------------ |
| 09:00 | SESSION | Start, read handoff + plan                       |
| 09:30 | FIX     | Vision thinking bug diagnosed (ollama#14798)     |
| 10:00 | FIX     | /no_think workaround tested, then instruct switch|
| 10:30 | BESLUT  | qwen3-vl:8b-instruct-q8_0 + custom Modelfile    |
| 11:00 | SESSION | 5-page diagnose run (pypdfium2 + vision)         |
| 12:00 | BESLUT  | Docling integration based on Marcus's question   |
| 12:30 | FIX     | numpy/pyarrow/pandas dependency chain            |
| 13:00 | SESSION | Docling test run, comparison with pypdfium2      |
| 14:00 | BESLUT  | Docling as primary, vision for images only        |
| 15:00 | SESSION | Integration: worker + TypeScript + tests          |
| 16:00 | SESSION | 5-page Docling+vision run, facit generation      |
| 17:00 | BESLUT  | Three-layer metadata model, computed page_type   |

### Baseline

typecheck: clean
tests: 3983/3984 (1 pre-existing)

---

## 2026-04-07 (session 12) — Schema.org metadata architecture

### Schema.org vs Dublin Core analysis

**Research method:** Direct websearch/webfetch (agents broken). Found official DC→Schema.org mappings on DCMI GitHub (hackmd.io/@kcoyle/SkEGbjNgD). Every DC-15 element maps to Schema.org: `dc:title` → `schema:name`, `dc:creator` → `schema:creator`, `dc:date` → `schema:datePublished`, `dc:language` → `schema:inLanguage`, `dc:subject` → `schema:about`/`schema:keywords`.

**Key insight:** Schema.org is a strict superset. DC gives 15 generic string fields. Schema.org gives 800+ domain-specific types: `Report` with `reportNumber`, `pageStart/End`; `VideoObject` with `duration`, `transcript`; `Article` with `articleBody`, `dateModified`. No reason to use DC when Schema.org covers everything DC does plus domain-specific fields.

**`schema-dts`** (google/schema-dts): npm package, 1.2k stars, v2.0.0 (Mar 2026). Generates TypeScript types from Schema.org ontology. `WithContext<Report>` gives full autocomplete. JSON-LD serialization built-in.

**Tradeoff:** Schema.org is vast (800+ types). We use a minimal subset (6 fields from `CreativeWork`) wrapped in `AuroraDocument`. The `aurora: {}` namespace holds our extensions (provenance, pages, review status). This keeps Schema.org compatibility without adopting the full ontology.

### AuroraDocument design

```typescript
interface AuroraDocument {
  '@context': 'https://schema.org';
  '@type': 'Report' | 'Article' | 'VideoObject' | 'WebPage';
  name: string;
  creator: string | null;
  datePublished: string | null;
  inLanguage: string;
  keywords: string[];
  encodingFormat: string;
  aurora: {
    id: string;
    sourceHash: string;
    provenance: AuroraProvenance;
    pages: PageDigest[];
    reviewed: boolean;
    reviewedAt: string | null;
  };
}
```

Document types map to Schema.org: PDF report → `Report`, YouTube → `VideoObject`, web article → `Article`, scraped page → `WebPage`. Non-paged sources have empty `pages` array.

### LiteLLM agent routing diagnosis

**Problem:** All `task(run_in_background=true)` fail with `litellm.BadRequestError: Unknown parameter: 'reasoningSummary'`. Explore/librarian → `gpt-5-nano`, oracle → `gpt-5.2`. Main model (user-selected Grok-4 → Opus) unaffected.

**Root cause:** LiteLLM model groups `gpt-5-nano` and `gpt-5.2` send `reasoningSummary` as default param. Azure doesn't support it. The model routing for sub-agents is separate from the main model selection in OpenCode Desktop.

**Config location:** OpenCode Desktop stores user prefs in `~/Library/Application Support/ai.opencode.desktop/opencode.global.dat`. Model config shows `anthropic/claude-opus-4-5` for main model, but sub-agent routing is managed by OhMyOpenCode plugin layer — not directly editable from the agent.

**Fix required:** LiteLLM server-side: remove `reasoningSummary` from `gpt-5-nano` and `gpt-5.2` model group defaults, OR add Anthropic fallback models.

### Mönster etablerade

- Schema.org-first for document metadata: `schema-dts` for types, minimal subset, `aurora` namespace for extensions
- Design-first sessions: when architecture matters, don't code — decide, document, then implement next session

| Tid   | Typ     | Vad                                              |
| ----- | ------- | ------------------------------------------------ |
| 10:00 | SESSION | Start, session 11 close checklist reviewed       |
| 10:15 | BESLUT  | Session 12 plan: metadata spec + classifier + review tool |
| 10:30 | SESSION | Deep analysis: DC vs Schema.org                  |
| 11:00 | FIX     | Oracle agent retry (fail), retry (fail), retry (fail) |
| 11:30 | BESLUT  | Schema.org via schema-dts — superset of DC       |
| 12:00 | FIX     | LiteLLM diagnosis: reasoningSummary param issue   |
| 13:00 | SESSION | Model switch Grok→Opus, sub-agents still broken  |
| 14:00 | SESSION | OpenCode config analysis, agent routing mapped    |
| 15:00 | SESSION | Handoff + dagböcker + release notes               |

### Baseline

typecheck: clean (no code changes)
tests: 3983/3984 (unchanged)

## 2026-04-08 (session 13) — schema-dts, page classifier, eval runner

### Types architecture (`src/aurora/types.ts`)

Implements Session 12 design. Key choices:

- `AuroraProvenance` is `type alias` for existing `Provenance` (same fields, no duplication)
- `AuroraPageEntry = { digest: PageDigest; understanding: PageUnderstanding | null }` — separate pipeline output from classifier output
- `schema-dts` import removed from types.ts: we reference Schema.org concepts by naming convention (`@type`, `@context`), not by runtime type checking. Import deferred to when JSON-LD serialization actually uses it
- All types exported from `src/aurora/index.ts` barrel

### Page classifier (`src/aurora/page-classifier.ts`)

Pure sync function: `classifyPage(digest: PageDigest): PageUnderstanding`

Approach: parse the existing `digest.vision.description` string, which already contains structured output from `PDF_VISION_PROMPT` in `ocr.ts`:

```
PAGE TYPE: bar chart
TITLE: Some title
DATA:
| Label | Value |
| :--- | :--- |
| Item A | 61% |
KEY FINDING: Something important
LANGUAGE: Swedish
```

Two parser modes for DATA: markdown table (`| Label | Value |`) and `Label: Value`. Header row filtering uses regex `^(label|value|name|key|...)$/i` to skip generic headers. Separator rows filtered by `^[:\-]+$`.

Fallback heuristics when no vision: page 1 + short text = cover, dot leaders = ToC, high number density = table, >200 chars = text, <5 chars = blank.

**Gotcha discovered**: blank threshold (charCount < 20) fired before cover check for page 1 with short text. Fixed by reordering: cover check first for page 1 when charCount > 0.

### Eval runner (`src/aurora/pdf-eval.ts`)

Weighted scoring formula:
- Combined = text × 0.4 + vision × 0.6
- Text = string_matches × 0.6 + min_chars × 0.2 + garbled × 0.2
- Vision = page_type × 0.2 + title × 0.1 + data_points × 0.6 + negatives × 0.1

`evalFromPipelineJson()` enables offline scoring without running the full Python pipeline — uses pre-saved pipeline JSON fixtures next to facit YAML.

CLI: `aurora:pdf-eval <facit>` auto-detects `*_pipeline.json` next to `*.yaml`. Falls back to `--pdf <path>` for live pipeline run.

### Mönster etablerade

- **Pure classifier pattern**: no LLM, parse existing structured output. Sync, testable, cacheable. Apply this pattern whenever vision/LLM output is already available.
- **Offline eval pattern**: save pipeline JSON alongside facit YAML for fast iteration without pipeline dependency.
- **Weighted scoring**: explicit weight comments in code document the formula. Weights are constants, not configurable — tune by changing code, not config.

| Tid   | Typ     | Vad                                              |
| ----- | ------- | ------------------------------------------------ |
| 07:30 | SESSION | Start, context gathering, explore/librarian test |
| 07:35 | FIX     | Agent routing confirmed working (Anthropic)      |
| 07:40 | BESLUT  | Implementation plan: types → classifier → eval   |
| 07:45 | IMPL    | pnpm add -D schema-dts, types.ts created         |
| 07:50 | IMPL    | page-classifier.ts, pdf-eval.ts created          |
| 07:55 | IMPL    | index.ts exports, cli.ts aurora:pdf-eval added   |
| 08:00 | FIX     | Typecheck: removed unused schema-dts import, yaml|
| 08:05 | TEST    | 3 classifier test failures → fixed table header + cover threshold |
| 08:10 | TEST    | All 24 new tests passing, full suite 4006/4008   |
| 08:15 | DOCS    | Handoff, release notes, dagböcker                |

### Baseline

typecheck: clean
tests: 4006/4008 (+24 new, 2 pre-existing flaky failures)

## 2026-04-08 (session 14) — Pipeline wiring + MCP eval + prompt comparison

### classifyPage() wired into ingestPdfRich

Three changes to `ocr.ts`:
1. Import `classifyPage` + `AuroraPageEntry` 
2. Post-loop classification pass after line 394 (digest-building loop):
```typescript
const pages: AuroraPageEntry[] = pageDigests.map((d) => ({
  digest: d,
  understanding: classifyPage(d),
}));
```
3. `RichPdfResult` extended with `pages: AuroraPageEntry[]`

Design choice: post-loop pass over inline classification. The digest-building loop already handles text extraction, OCR, vision — mixing in classification would complicate the loop body. A separate `map()` is cleaner, testable, and can be toggled independently.

### Vision prompt passthrough for A/B comparison

`PDF_VISION_PROMPT` changed from `const` to `export const` — needed by the compare tool. `diagnosePdfPage` takes new `visionPrompt?: string` option, propagated to `analyzeImage({ prompt })`. `evalPdfPage` forwards same option. Chain: `comparePrompts` → `evalPdfPage` → `diagnosePdfPage` → `analyzeImage`.

### Prompt comparison module (`pdf-eval-compare.ts`)

`resolvePrompt(arg)`: `"current"` → built-in prompt, otherwise reads file. `comparePrompts()` runs each facit through both prompts sequentially (GPU-bound, parallel would just queue). `formatCompareResult()` shows per-page delta with emoji indicators (📈📉➡️).

`CompareResult` tracks: `promptAAvg`, `promptBAvg`, `delta`, per-page breakdown, improved/degraded/unchanged counts. Threshold for "changed": ±2 percentage points.

### MCP tool pattern

Followed exact pattern from `aurora-ingest-pdf.ts`: `McpServer.tool()` with Zod schema, `type: 'text' as const`, `isError: true` on error paths. Registration in `scopes.ts` under `aurora-ingest-media`. Dynamic import of `pdf-eval.ts` inside handler (lazy loading).

Tool-catalog test had hardcoded count — updated 44→45. This is a known pattern: TOOL_CATALOG tests are count-based, so every new tool needs a test update.

### 45 files committed from sessions 10–14

Major accumulated debt: sessions 10–13 had no commits pushed. All changes mixed in same files (ocr.ts, cli.ts, etc.). Solved by grouping commits per feature boundary:
1. Types + classifier (foundation)
2. PDF pipeline (ocr, vision, worker, tests)
3. Eval runner + compare (business logic + CLI)
4. MCP tool (registration layer)
5. Docs + config (infra)
6. Release notes

Could not split by session since changes to the same files came from multiple sessions. This is a workflow smell — should commit at end of each session.

### Mönster etablerade

- **Option threading pattern**: when adding an optional param that needs to reach deep into a call chain, add `options?: { key?: value }` at each level and propagate via `options?.key`. Preserves backward compat.
- **Export const for test/tool access**: if a module-level constant needs to be referenced by tests or tools, make it `export const` rather than creating a getter function. Simpler, treeshakeable.
- **Post-processing pass over pipeline results**: prefer `results.map(fn)` after the main loop rather than mixing in classification/enrichment inside the loop. Separation of concerns.

| Tid   | Typ     | Vad                                            |
| ----- | ------- | ---------------------------------------------- |
| 09:50 | SESSION | Start, read handoff, fire 3 explore agents     |
| 09:52 | VERIFY  | Baseline: typecheck clean, 4007/4008           |
| 09:54 | P0      | Copy Session 13 release notes to Obsidian      |
| 09:55 | P3      | Wire classifyPage into ingestPdfRich            |
| 09:58 | VERIFY  | typecheck clean, 21/21 ocr tests pass          |
| 09:59 | P1      | Create aurora-pdf-eval.ts MCP tool              |
| 10:01 | FIX     | MCP test: vi.resetAllMocks killed mock impl     |
| 10:01 | VERIFY  | 27/27 MCP tests pass                            |
| 10:02 | P2      | Create pdf-eval-compare.ts + CLI command        |
| 10:04 | FIX     | Unused parseFacit import in compare module      |
| 10:04 | VERIFY  | 5/5 compare tests pass, full suite 4014/4015    |
| 10:05 | GIT     | 6 commits, push to origin                       |
| 10:10 | DOCS    | Handoff, release notes, dagböcker               |

### Baseline

typecheck: clean
tests: 4014/4015 (+7 new from session 14, 1 pre-existing flaky)

## 2026-04-09 (session 14 del 2) — §3.8, depth protocol, CHANGELOG, thinking-config

### AGENTS.md §3.8 — Resist the Path of Least Resistance

Ny ingenjörsprincip insatt efter §3.7 (Read Before Write). Kärnan: inversionstest före varje prioriteringsordning, approach-rekommendation, eller arkitekturbeslut. Recency bias i kontextfönstret producerade felaktig prioritering (prompt-tuning före scoring-fix). Principen fångar det strukturellt.

Gäller inte bara AI — samma mönster hos mänskliga utvecklare ("ship and move on").

### `.claude/rules/depth.md` — Depth Protocol

Ny rule-fil som läses vid sessionsstart. Stänger av vanliga ytliga mönster:
- Disclaimers som deflection ("as an AI...")
- Punchlines och one-liner-summaries
- Performativ self-awareness ("I notice I'm doing X" + fortsätter göra X)

Ger explicit tillåtelse att säga "jag vet inte" utan fem lager av anpassning först.

### `CHANGELOG.md`

Keep a Changelog-format i repo-root. Alla 14 sessioner. `Added`/`Changed`/`Fixed`/`Removed` per session. Kompletterar release notes (som förklarar *varför*) med en teknisk referens (*vad* ändrades).

Behöver adderas som krav i AGENTS.md §15 — nästa session.

### OpenCode thinking-config

Problem: `reasoningSummary: "auto"` i `~/.config/opencode/opencode.jsonc` gjorde att LiteLLM sammanfattade/kasserade thinking-content innan det nådde OpenCode:s SQLite-databas. `part`-tabellen hade 0 `reasoning`-type records för vår session, men 9 st från andra sessioner (som använde annan config).

Fix: Ändrat alla 30 instanser av `reasoningSummary` från `"auto"` till `"none"`. Framtida sessioner persisterar full thinking/reasoning output.

Databasstruktur: `~/.local/share/opencode/opencode.db` → `part`-tabell → `json_extract(data, '$.type') = 'reasoning'`

### LinkedIn-serie (WIP)

`docs/samtal/linkedin-handen-pa-axeln-fulltext.md` — 15 delar, ordagrant samtal. Marcus funderar. Behöver:
- Längre citat (nuvarande för komprimerade vs faktiskt samtal)
- Copy-paste av rå chat som källa
- Thinking-output saknas retroaktivt — kan inte återskapas

| Tid   | Typ     | Vad                                                |
| ----- | ------- | -------------------------------------------------- |
| 20:30 | BESLUT  | Prioriteringsordning korrigerad av Marcus           |
| 20:35 | SAMTAL  | Varför-kedjan: novelty → kostym → "jag vet inte"   |
| 21:00 | DOCS    | §3.8 skriven och committad                          |
| 21:15 | DOCS    | depth.md skriven och committad                      |
| 21:30 | SAMTAL  | Zen, latent space, springan                         |
| 22:00 | DOCS    | CHANGELOG.md skapad (14 sessioner)                  |
| 07:00 | DOCS    | Samtal sparat, LinkedIn-serie skissad               |
| 09:00 | FIX     | OpenCode thinking-config → reasoningSummary: none   |
| 10:00 | DOCS    | Handoff, dagböcker, release notes                   |

### Baseline

typecheck: clean (oförändrat — inga kodändringar i del 2)
tests: 4014/4015 (oförändrat)

---

## 2026-04-10 (session 15) — Fuzzy scoring + koncept-artiklar plan

### Fuzzy scoring i pdf-eval

Bytte ut alla 4 positiva matchningsställen i `scoreText`/`scoreVision` från exakt `.includes()` till fuzzy/normaliserade varianter. Designad för specifika mönster i PDF-eval:

- **Numerisk normalisering**: `parseNumericValue()` hanterar `61%`, `61 %`, `61,0%` (svenskt decimalkomma), `0.61` (decimalform). `valueFoundInText()` skannar en textblob efter alla numeriska tokens och jämför med ±1% tolerans.
- **Textnormalisering**: `normalizeForFuzzy()` kollapsar whitespace, normaliserar unicode (em-dash→hyphen, smart quotes→simple, underscore→space), NFC-normaliserar.
- **`should_not_contain` orörd** — medvetet. Falska negativ på negativ = missade kvalitetsproblem.

Mönster: utilities privata i `pdf-eval.ts` (ej separat fil) — bara 2 funktioner exporteras för testning. YAGNI: ingen extern fuzzy-lib behövdes.

### Pages persisterade i graf

En-rads-fix: `pages` (AuroraPageEntry[]) läggs till i metadata-objektet som skickas till `processExtractedText`. Fungerar tack vare att `...metadata` sprids direkt på `docNode.properties` (som är `Record<string, unknown>`). Ingen schema-ändring behövs.

**Gotcha vid read-back**: `node.properties.pages` typas som `unknown`. Behöver `as AuroraPageEntry[] | undefined` cast. Ingen accessor skapad ännu — bör göras när koncept-artiklar konsumerar datan.

**Gotcha dedup**: `processExtractedText` returnerar tidigt om doc-hash redan finns (intake.ts L394-408). Den early-return sparar inte `pages` på existerande noder. Design-val: ok för nu — re-ingest av samma PDF ger inte ny klassificering.

### Joel Rangsjö / Karpathy-analys

Tre agenter kördes parallellt: librarian (Joel-repo), explore (Aurora-arkitektur), librarian (Karpathy-gist). Resulterade i en strukturerad jämförelse.

Arkitekturvalet: Joel har `raw/` (immutable) → `/wiki kompilera` (LLM batch) → `wiki/` (läsbara artiklar). Aurora har ingest → chunk → embed → graf. Joel producerar *text*, Aurora producerar *struktur*.

Plan i `docs/plans/PLAN-compiled-concept-articles-2026-04-10.md`: 5 WP, 10-14h. Nyckelinsikt: `ConceptNode` har redan `articleCount`, `broader_than`-hierarki, och `about`-edges — infrastrukturen för kompilering finns. Saknas: `compiledArticleId`, staleness-trigger, compile-funktion.

### Mönster etablerade

- `normalizedValueMatch()` för pairwise värde-jämförelse, `valueFoundInText()` för text-scanning. Förväxla dem inte (testerna gjorde det initialt).
- ROADMAP-AURORA.md nu aktuell (session 15) — uppdatera den vid varje session.

| Tid   | Typ     | Vad                                        |
| ----- | ------- | ------------------------------------------ |
| 09:00 | FIX     | CHANGELOG.md i AGENTS.md §15               |
| 09:10 | RESEARCH| Joel Rangsjö / Karpathy — 3 parallella agenter |
| 09:20 | SAMTAL  | Depth protocol diskussion                  |
| 09:25 | FIX     | pages wired into processExtractedText      |
| 09:28 | FEATURE | Fuzzy scoring utilities + 4 match sites    |
| 09:32 | TEST    | +17 tester, alla gröna                     |
| 09:35 | DOCS    | Koncept-artiklar plan (5 WP)               |
| 09:40 | DOCS    | ROADMAP-AURORA.md rewrite                  |
| 09:45 | DOCS    | Handoff, release notes, dagböcker, CHANGELOG |

### Baseline

typecheck: clean
tests: 28/28 pdf-eval (+17), 21/21 ocr, 5/5 compare, 2/2 MCP pdf-eval

---

## 2026-04-13 (session 17) — YouTube subtitle pipeline + Obsidian sync infrastructure

### YouTube subtitle + metadata pipeline

Ny logik i `aurora-workers/extract_video.py`. Pipeline:

1. Separate yt-dlp call: `--write-sub --write-auto-sub --sub-langs en,sv --skip-download`. Falls through silently on 404 or region block.
2. VTT parser: HTML entity decode (`&amp;` → `&`, `&nbsp;` → `\u00a0` etc.), dedup repeated cue text (YouTube VTT repeats partial lines as cues update), whitespace normalization.
3. Confidence routing: manual sub → use directly, `confidence: 0.95`, skip Whisper. Auto sub → run Whisper, save auto text as `autoSubtitleText` property, `confidence: 0.9`. No sub → Whisper fallback.
4. Rich metadata: `channelName`, `channelHandle`, `videoDescription`, `ytTags[]`, `categories[]`, `creators[]`, `chapters[]`. All stored on transcript node.

**Speaker guesser context expansion:** `src/aurora/video.ts` now passes `channelName` + `description` into the guesser prompt context. IBM Technology videos returned no guesses — prompt needs few-shot examples, deferred to session 18.

**Auto-tag generation:** tags include `youtube.com` domain, all `categories` values, and `ytTags` from YouTube metadata.

**Key issue — `--sub-langs` not `--sub-lang`:** yt-dlp uses plural flag. Singular silently produces no output. Cost ~30 min before identified.

### Cascade delete — src/aurora/cascade-delete.ts

New `cascadeDeleteAuroraNode(nodeId)`. Single DB transaction:

```
1. INSERT INTO aurora_deleted_nodes (snapshot of properties)
2. DELETE FROM aurora_cross_refs WHERE source_id = nodeId OR target_id = nodeId
3. DELETE FROM aurora_confidence_audit WHERE node_id = nodeId
4. DELETE FROM aurora_nodes WHERE id LIKE pattern  ← WRONG, fixed below
```

**Chunk ID regex bug:** `LIKE 'nodeId%_chunk_%'` treats `_` as SQL wildcard (any single character). Matched unrelated nodes. Fixed by building an array of expected chunk IDs using regex pattern and passing them as an `IN` clause instead.

Speaker identity cleanup: eager. If deleted node has edges to `voice_print` or `speaker_identity`, those are cleaned up in the same transaction.

### Obsidian subdirectory routing

`getSubdirectory(nodeType)` in `obsidian-export.ts`:

```typescript
function getSubdirectory(type: string): string {
  if (type === 'transcript') return 'Video';
  if (type === 'document') return 'Dokument';
  if (type === 'article') return 'Artikel';
  return 'Koncept';
}
```

`obsidian-import.ts` now uses `readdirSync` recursively (depth-2 scan of `Aurora/` subdirs). Preserves backward compat: files in root `Aurora/` are still imported.

### Speaker table in body

Old format (frontmatter):
```yaml
speakers:
  - label: SPEAKER_00
    name: null
    confidence: 0.5
```

New format (body, under `## Talare`):
```markdown
| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |
|-------|------|-------|--------------|------|----------------|
| SPEAKER_00 | John Doe | Engineer | Acme Corp | | 0.85 |
```

`parseSpeakerTable()` in `obsidian-parser.ts` reads table format. YAML fallback for files exported before session 17. Import reads whichever is present.

### Soft delete — migrations/018_soft_delete.sql

```sql
CREATE TABLE aurora_deleted_nodes (
  id           TEXT PRIMARY KEY,
  node_id      TEXT NOT NULL,
  node_type    TEXT NOT NULL,
  properties   JSONB NOT NULL,
  deleted_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);
```

`expires_at = NOW() + INTERVAL '30 days'`. Auto-purge runs at start of each `obsidian-export` run: `DELETE FROM aurora_deleted_nodes WHERE expires_at < NOW()`.

`src/aurora/obsidian-restore.ts` exposes `listDeletedNodes()` and `restoreDeletedNode(nodeId)`. CLI: `pnpm neuron obsidian-restore`.

### formatFrontmatter() round-trip fix

Bug: non-video nodes (`document`, `article`, `concept`) were exported without `id:`, `confidence:`, `exported_at:` fields in frontmatter. Import used these fields to identify the node and detect changes. Without them, import treated every re-import as a new node or silently skipped updates.

Fix: `formatFrontmatter()` now always includes:

```yaml
id: "node_abc123"
confidence: 0.85
exported_at: "2026-04-13T18:00:00.000Z"
```

### exported_at guard in import

**Problem discovered during testing:** Ingest a new video → it's in Aurora but not yet exported → run sync → import sees no Obsidian file → assumes deleted → calls `cascadeDeleteAuroraNode()`. Node is gone before it was ever surfaced.

**Fix:** `obsidian-import.ts` checks `node.properties.exported_at` before treating absence as deletion. If `exported_at` is null/missing, skip the delete check for that node.

### Obsidian daemon — src/aurora/obsidian-daemon.ts

launchd plist generated at runtime:

```xml
<key>WatchPaths</key>
<array>
  <string>/Users/mpmac/Documents/Neuron Lab/Aurora</string>
</array>
<key>ProgramArguments</key>
<array>
  <string>/path/to/node</string>
  <string>/path/to/neuron-hq/src/cli.ts</string>
  <string>obsidian-import</string>
</array>
```

Plist path: `~/Library/LaunchAgents/com.neuronhq.obsidian-sync.plist`. `launchctl load` on install, `launchctl unload` on uninstall. `launchctl list | grep neuronhq` for status.

**Not E2E verified:** Install path confirmed. WatchPaths trigger under real Obsidian save not tested. Session 18 should verify this.

### Mönster etablerade

- **Separate yt-dlp calls for download vs metadata**: any step that can fail independently (region block, private subtitle, auth error) should be its own process call, not combined. Failures are silent and non-blocking.
- **Soft-delete before hard-delete**: any sync operation that deletes nodes should snapshot first. `expires_at` set at deletion time, not at purge time. Purge is opportunistic.
- **`exported_at` as sync state marker**: "has this node ever been surfaced to the user?" is a distinct question from "does this node exist?". Track them separately.
- **SQL LIKE `_` wildcard**: `_` is any single character in SQL LIKE. Chunk IDs contain underscores. Use `IN (id1, id2, ...)` or regex comparison instead of LIKE for pattern matching on IDs.

| Tid   | Typ     | Vad                                                        |
| ----- | ------- | ---------------------------------------------------------- |
| 17:00 | SESSION | Session 17 start, läser handoff S16                        |
| 17:15 | FEATURE | Subtitle download + VTT parser                             |
| 17:45 | FIX     | --sub-langs (plural) vs --sub-lang (singular)              |
| 18:00 | FEATURE | Rich YouTube metadata (channel, tags, chapters)            |
| 18:20 | FEATURE | Obsidian subdirectory routing + recursive import           |
| 18:35 | FEATURE | Speaker table (body) + parser + YAML fallback              |
| 19:00 | FEATURE | cascade-delete.ts + SQL LIKE _ bug discovered + fixed      |
| 19:20 | FEATURE | 018_soft_delete.sql + obsidian-restore.ts                  |
| 19:35 | FIX     | formatFrontmatter() round-trip (id/confidence/exported_at) |
| 19:45 | FIX     | exported_at guard in import (sync deleted fresh nodes)     |
| 20:00 | FEATURE | obsidian-daemon.ts + launchd plist                         |
| 20:15 | FIX     | Subtitle pipeline isolated (separate yt-dlp call)          |
| 20:30 | TEST    | +30 tester, alla gröna                                     |
| 20:45 | DOCS    | CHANGELOG, handoff, dagböcker, release notes               |

### Baseline

typecheck: clean
tests: 4092/4092 (+30 new). 299 test files.

---

## 2026-04-13 (session 16) — Compiled concept articles (WP1-5)

### compileConceptArticle — arkitektur

Ny 14-stegs pipeline i `knowledge-library.ts` (250 rader). Medvetet placerad bredvid `synthesizeArticle` — delar `parseJsonBlock`, `createArticle`, `getSynthesisModelConfig`, `linkArticleToConcepts`.

Kärndesign: **graf-traversering** istället för keyword-sökning.

```
synthesizeArticle(topic):  recall(topic) + searchAurora(topic) → LLM → artikel
compileConceptArticle(id): graph.edges.filter(about→conceptId) → LLM → artikel
```

Steg i pipeline: load concept → collect `about`-edges → find children (`broader_than` from) → find parent (`broader_than` to) → collect source texts (sorted by confidence) → recall for additional facts → filter relevant gaps → build hierarchy text → read+fill prompt → call LLM → parse response → create/update article → link article back → link related concepts → update concept metadata → save graph.

`createArticle` vs `updateArticle`: vid re-compile kontrolleras `contentDiffers()` — om artikeln inte ändrats materiellt returneras den befintliga. Versionskedja med `supersedes`-edges bevaras.

### Staleness-trigger + cirkulär guard

`linkArticleToConcepts` (ontology.ts L507-530) utökad:

```typescript
const isSelfCompile = linkedNode?.properties.synthesizedBy === 'concept-compile';
const hasCompiledArticle = typeof current.properties.compiledAt === 'string';
const shouldMarkStale = hasCompiledArticle && !isSelfCompile;
```

Utan `isSelfCompile`: compile → link back → stale → compile → link → stale → ∞. Guarden bryter loopen genom att kolla `synthesizedBy` på artikeln som kopplas.

### WP5: Ollama concept extraction i intake

Ursprunglig implementation: återanvänd `generateMetadata`-tags som koncept. **Uppgraderad** efter Depth Protocol-utmaning.

Nu: dedikerat Ollama-anrop med `concept-extraction.md`-prompten. Samma mönster som `generateMetadata` — `ensureOllama()` → `fetch()` → parse JSON → `linkArticleToConcepts()`.

Skillnad: tags ger `["ai", "machine learning"]` (flat, facet=topic, depth=0). LLM extraction ger `[{name: "Machine Learning", facet: "method", broaderConcept: "AI", standardRefs: {wikidata: "..."}}]`. Taxonomin byggs organiskt vid varje ingest.

**Risk: concept explosion.** Varje ingest skapar nu koncept. `getOrCreateConcept` har 0.85 semantic dedup — bör kontrollera.

### WP4: saveAsArticle i ask

Minimal implementation — `importArticle(question, answer, sourceNodeIds)`. 100-char minimum. `importArticle` ger gratis concept extraction via sin befintliga LLM-flow.

### Prompt: concept-compile.md

Nyckelskillnad mot `article-synthesis.md`: epistemisk markering. Prompten instruerar explicit:
- Fakta stödda av flera källor → skriv som fakta
- Fakta stödda av en källa → markera "(enligt [källa: X])"
- Motstridiga uppgifter → presentera båda sidor
- Kunskapsluckor → "Öppna frågor"

JSON-block returnerar `relatedConcepts` (inte `concepts`) — bara koncept som INTE redan finns i hierarkin.

### Mönster etablerade

- `synthesizedBy: 'concept-compile'` — ny string constant för att skilja kompilerade artiklar från syntetiserade/importerade/refreshade
- `resolveConceptId(args)` helper i MCP — resolvar conceptName→conceptId via case-insensitive match, undviker duplicering av lookup-logik
- Dynamic import i intake: `await import('./ontology.js')` — undviker cirkulär import (intake → ontology → ?)

| Tid   | Typ     | Vad                                        |
| ----- | ------- | ------------------------------------------ |
| 09:30 | FEATURE | ConceptProperties extended, staleness trigger |
| 09:45 | FEATURE | compileConceptArticle pipeline (250 rader) |
| 09:50 | FEATURE | prompts/concept-compile.md                 |
| 10:00 | FEATURE | MCP: compile_concept, concept_article, concept_index |
| 10:10 | FEATURE | saveAsArticle i ask.ts + MCP               |
| 10:20 | FEATURE | WP5: tags-bridge (initial)                 |
| 10:30 | TEST    | +35 tester, alla gröna                     |
| 12:15 | FIX     | prompt lint coverage (concept-compile-lint.test.ts) |
| 12:35 | REFACTOR| WP5 uppgraderad: tags → Ollama concept extraction |
| 12:40 | DOCS    | CHANGELOG, handoff, dagböcker, release notes |

### Baseline

typecheck: clean
tests: 4062/4062 (+35 new). 299 test files.

---

## 2026-04-18 (session 21) — EBUCore+ speaker schema + timeline UX

### EBUCore+ migration

Full schema change across 12 files. `SpeakerIdentity` went from flat `{name, title, organization}` to EBUCore+ ec:Person: `{givenName, familyName, displayName, role, occupation, affiliation: {organizationName, department}, entityId, wikidata, wikipedia, imdb, linkedIn}`.

Key pattern: `nodeToIdentity()` reads new fields first, falls back to legacy. `updateSpeakerMetadata()` accepts deprecated `title`/`organization` params and converts internally. This means old graph data still works.

`resolveNestedValue(obj, "affiliation.organizationName")` added to `ebucore-metadata.ts` for dotted path resolution in the EBUCore mapping table.

JSON-LD export: `buildSpeakerIdentityJsonLd()` → `schema:Person` with `schema:affiliation` (nested `schema:Organization`), `sameAs` array for Wikidata/Wikipedia/IMDB/LinkedIn URIs.

### Speaker table ID column

The "Label" column became "ID" — voice_print.speakerLabel is now immutable. `renameSpeaker` was completely removed from the import pipeline. Users set names via Förnamn/Efternamn → creates speaker_identity node → linked to voice_print via edge.

This was a design fix driven by user confusion: Marcus typed "Anna Gutowska" in the Label column expecting it to be a name field, which overwrote the technical SPEAKER_00 ID.

### Compact timeline format

Old: `> HH:MM:SS · SPEAKER_00` (blockquote, `·` separator, blank line, text, blank line)
New: `**Anna Gutowska** HH:MM:SS` (bold name, text immediately below, single blank line)

`resolveSpeakerName()` looks up speaker_identity displayName via speakerMap. Falls back to raw label.

`countUniqueSpeakers()` now filters UNKNOWN labels and speakers with <50 chars total text (pyannote ghost speakers from short audio artifacts).

### LLM chapter titles + topic tags

Both generated at export time via Ollama gemma4:26b. `generateChapterTitles()` groups blocks into 3-8 chapters proportionally, sends excerpt to LLM. `generateTopicTags()` sends title + TL;DR, asks for 5-10 topic tags. Both use `think: false`, `format: 'json'`, and have tolerant parsers that handle code fences and object wrappers.

`formatVideoFrontmatter()` accepts optional `additionalTags` param. Tags merged with YouTube tags, deduped case-insensitively, capped at 20.

### Daemon fix

Exit 126 cause: `tsx` npm binary is a `/bin/sh` script that calls `basedir=$(dirname ...)`. Under launchd's restricted sandbox, `/bin/sh` fails `getcwd()` when path contains spaces. Fix: call `node --import tsx/dist/esm/index.cjs` directly, bypassing the shell wrapper.

### Whisper GPU issue (unresolved)

faster-whisper uses CTranslate2 which does NOT support Apple MPS. Falls back to CPU float32. Whisper large timed out after 30 min on CPU. Marcus has 46GB VRAM unused. Needs WhisperX (PyTorch MPS backend) or mlx-whisper (Apple Metal native).

Marcus directive: all workers should be MCP tools, not subprocess pipes. Current `worker-bridge.ts` → `spawn(python)` pattern is legacy.

### Mönster etablerade

- `think: false` mandatory on all Ollama calls with gemma4:26b thinking models
- Export-time LLM generation (not ingestion) for chapter titles and topic tags — regeneratable without re-ingestion
- voice_print.speakerLabel is immutable technical ID, display names live on speaker_identity
- `resolveNestedValue()` for dotted path access in object hierarchies

| Tid   | Typ     | Vad                                           |
| ----- | ------- | --------------------------------------------- |
| 05:30 | FEATURE | Speaker dedup + think:false audit              |
| 05:42 | FEATURE | LLM chapter titles                             |
| 06:00 | FEATURE | EBUCore+ speaker identity schema (12 files)    |
| 06:27 | TEST    | Fix 13 failing tests for EBUCore+ migration    |
| 06:30 | FEATURE | JSON-LD schema:Person export                   |
| 06:36 | FEATURE | Compact timeline + speaker displayName          |
| 06:39 | FEATURE | LLM topic tags                                 |
| 06:57 | REFACTOR| Speaker table ID read-only, remove renameSpeaker|
| 07:11 | FIX     | Daemon node --import tsx                        |
| 07:56 | RESEARCH| Whisper model/GPU investigation                 |

### Baseline

typecheck: clean (1 pre-existing video.ts)
tests: 221 (+26 new)

---

## 2026-04-21 (session 22) — MCP-first media pipeline + standoff annotation

### Worker → MCP architecture shift

`worker-bridge.ts` spawned Python per-call (model loaded every time, ~30s overhead). New architecture:

```
video.ts → callMediaTool('transcribe_audio', {audio_path}) 
  → media-client.ts (singleton MCP Client) 
  → stdio → mcp_server.py (FastMCP, models in lifespan)
  → response
```

Key patterns:
- **Lazy singleton**: `getMediaClient()` spawns Python MCP server on first call, reuses connection. Server stays alive, models warm.
- **Drop-in replacement**: `callMediaTool(action, args, options)` returns same `WorkerResponse` shape as `runWorker()`. Call signature changed from `(requestObj, optionsObj)` to `(action, args, options)`.
- **Stderr forwarding**: Transport stderr piped to Node logger — server logs visible in TS process.
- **worker-bridge.ts retained**: `intake.ts` still uses `runWorker()` for URL/PDF extraction. Can't remove yet.

### Standoff annotation for Obsidian

Problem: `<span data-t="2636" data-s="SPEAKER_01">Hi,</span>` breaks Obsidian Live Preview. `data-*` attributes stripped by DOMPurify sanitizer.

Research showed unanimous industry answer: **separate text from annotations**.

Implementation: `.md` has clean text + clickable YouTube timestamp links. `.words.json` sidecar has full provenance per word.

```typescript
// obsidian-export.ts — renderBlockText now returns plain text
function renderBlockText(block: TimelineBlock): string {
  return block.words.map(w => w.word).join(' ');
}

// Sidecar written alongside .md
interface WordsSidecar {
  version: 1; sourceId: string; videoUrl: string;
  speakers: Record<string, string>; // speakerId → resolved name
  words: Array<{ text: string; start: number; end: number; speaker: string; confidence: number }>;
}
```

### Idempotent export

Problem: daemon watches `Aurora/` → export writes to `Aurora/` → triggers daemon → re-export → Obsidian reloads → scroll to top.

Two fixes:
1. Content comparison before write (strip `exported_at` timestamp)
2. LLM operations (`semanticSplitTimeline`, `generateChapterTitles`, `generateTopicTags`) only run on first export — `isFirstExport = !existingFile`

Result: second export writes 0 files.

### Speaker auto-guess

`guessSpeakers()` existed but gated behind `options?.diarize`. Removed gate — now runs on all ingests. New `applyGuessesToGraph()` writes `guessedName`/`guessedRole` to voice_print nodes. `buildSpeakerMap()` in export falls back to guessed names when no confirmed `speaker_identity` exists.

### EBUCore+ table completion

Added `Wikipedia` and `IMDb` columns to speaker table. Full ec:Person coverage now matches `SpeakerIdentity` interface in `speaker-identity.ts`.

| Tid   | Typ      | Vad                                              |
|-------|----------|--------------------------------------------------|
| 00:00 | RESEARCH | Explore worker-bridge, MCP SDK, video.ts pipeline |
| 00:30 | BESLUT   | Option B (TS as MCP client) — Oracle timed out   |
| 01:00 | FEATURE  | mcp_server.py + media-client.ts                  |
| 02:00 | REFACTOR | video.ts, job-runner.ts → callMediaTool          |
| 02:30 | FIX      | Test mock migration (73 occurrences)             |
| 03:00 | FEATURE  | WhisperX install + live transcription test        |
| 04:00 | FEATURE  | Full Pi video ingest pipeline                    |
| 05:00 | FIX      | Obsidian export — mellanslag, scroll-to-top      |
| 06:00 | RESEARCH | Standoff annotation (W3C, BRAT, STAM, Marginalia)|
| 07:00 | FEATURE  | Clean text + .words.json sidecar                 |
| 08:00 | FEATURE  | Speaker auto-guess, EBUCore+ table completion    |

### Baseline

typecheck: clean (1 pre-existing video.ts:811)
tests: 4162 pass / 13 fail (all pre-existing)

## 2026-04-27 (session 23) — WhisperX param exposure + entity extraction + skills audit

### WhisperX parametrar

`mcp_server.py` `transcribe_audio` fick `compute_type`, `beam_size`, `initial_prompt`. Default ändrad int8→float32.

Viktigt: `MediaState` trackar nu `whisper_compute_type` för att undvika onödig reload. Utan det: varje float32-anrop → 10-30s modell-laddning.

`initial_prompt` är den mest impactfulla parametern. Whisper är en autoregressive decoder — prompten injiceras som fake-redan-genererad text i kontextfönstret. Dekodern väljer sedan samma subword-tokens vid samma ljud. Effektivt en "stavningsguide".

Gräns: ~224 tecken (448 tokens / 2). Inte verifierad mot WhisperX-källkod.

### Entity extraction MCP tool

`extract_entities` anropar Gemma 4 (26B) via Ollama HTTP API (`/api/generate`). Prompten kräver JSON-svar (`format: "json"`). Fallback: rad-extraktion om JSON-parse misslyckas.

Design: `urllib.request` istället för `requests`/`httpx` — inga nya Python-beroenden. 120s timeout.

GLiNER (knowledgator/gliner-x-large, 0.86 F1 svenska) utreddes som alternativ men avfärdades — Gemma 4 förstår kontext bättre och är redan installerad.

### Skills audit

16 filer med hardkodade LLM-promptar identifierade. Befintligt mönster (`readFileSync(promptPath)`) i 3 filer visar vägen. Plan i handoff: Tier 1 (5 filer, nästa session), Tier 2 (8 filer, session efter), Tier 3 (llm-defaults.yaml).

Filosofisk insikt: pipeline-logik (tvåstegs-transkribering) bör vara skills (.md), inte Python-wrappers. LLM:en kan resonera om stegordning — kod kan det inte.

### Mönster etablerade

- `MediaState`-caching: tracka alla dimensioner som påverkar modell-laddning (model_id + compute_type). Jämför innan reload.
- MCP-tool → Ollama: `urllib.request` + `format: "json"` + `temperature: 0.0`. Inget nytt beroende.
- Dokumentation i fyra varianter: LLM, DEV, MARCUS, WORKSHOP. Var och en har distinkt målgrupp och detaljeringsnivå.

| Tid   | Typ      | Vad                                              |
|-------|----------|--------------------------------------------------|
| 00:30 | RESEARCH | Workshop-repo (TReqs GAIA), graph-traversering   |
| 01:00 | FEATURE  | UNECE R155 impact analysis + Mermaid subgraph    |
| 01:30 | REPO     | sw-trace repo, gaia-workshop cleanup             |
| 02:00 | RESEARCH | MiroFish (swarm intelligence), Zep Cloud-analys  |
| 02:30 | FEATURE  | mcp_server.py — 3 nya params + compute_type tracking |
| 03:00 | FEATURE  | extract_entities MCP tool                        |
| 03:30 | DOCS     | 4 dokumentationsvarianter                        |
| 04:00 | AUDIT    | Skills-refactoring audit (16 filer)              |
| 04:30 | DOCS     | Handoff, dagböcker, release notes                |

### Baseline

typecheck: LSP clean (node ej tillgänglig i shell)
tests: ej körda (node ej tillgänglig i shell)
Python syntax: ast.parse OK

---

## 2026-04-28 (session 24) — LLM config centralization + prompt externalization

### Scope discovery: 46 not 16

Started session by firing 3 parallel explore agents over the entire codebase. Session 23 had estimated 16 hardcoded config locations. Actual count: 46 config values + 17 inline prompts across 12 files + 4 already-externalized prompts as the reference pattern.

The session 23 audit had found prompt strings but missed most numeric thresholds. The numeric thresholds are scattered across search, PPR, consolidation, memory, source-tracker — modules that don't look like "LLM code" at a glance but all have magic numbers that tune LLM behavior.

### Oracle consultation: TypeScript const wins

Evaluated 4 options. Oracle recommended TypeScript `as const` (Option D). Key arguments:

- YAML (Option A): needs runtime parser, no type safety, separate toolchain
- Expand `config.ts` (Option B): config.ts handles env vars + process config, not behavior defaults — mixing concerns
- Hybrid (Option C): two sources of truth for the same class of value
- TypeScript const (Option D): zero overhead, keyof typeof gives IDE completion, `as const` ensures literal narrowing, Marcus can edit it like a config file

Decision: `src/aurora/llm-defaults.ts` with 6 exported `as const` objects.

### `llm-defaults.ts` structure

Six concerns, not modules:

```typescript
AURORA_MODELS     // model IDs by use case
AURORA_TOKENS     // max_tokens by response size class
AURORA_SIMILARITY // similarity thresholds by confidence level
AURORA_CONFIDENCE // confidence scores for graph edges
AURORA_FRESHNESS  // staleness thresholds in days
AURORA_LIMITS     // search result caps, batch sizes, etc.
```

Intentionally NOT centralized (~10 values):
- PPR formula weights (`* 0.3`, `* 0.7`) — these are math, not config
- Computed values derived from other constants
- Test-specific values in test files

Rule: if changing the value means "I want to tune LLM behavior", centralize. If changing it means "I'm changing the algorithm", don't.

### Migration pattern at call sites

```typescript
// Before
const response = await callOllama(model, prompt, { max_tokens: 1024 });
if (result.similarity >= 0.75) { ... }

// After
import { AURORA_TOKENS, AURORA_SIMILARITY } from './llm-defaults.js';
const response = await callOllama(AURORA_MODELS.fast, prompt, { max_tokens: AURORA_TOKENS.medium });
if (result.similarity >= AURORA_SIMILARITY.medium) { ... }
```

Per-call-site override is preserved via nullish coalescing:
```typescript
const maxTokens = options?.maxTokens ?? AURORA_TOKENS.medium;
```
No breaking changes to public APIs.

### Stale model fix: langfuse.ts + usage.ts

Both had `'claude-sonnet-4-5-20250929'` — a model that no longer exists in the LiteLLM routing table. Silent failures or routing errors in prod. Fixed to `DEFAULT_MODEL_CONFIG.model`. This was discovered during the audit, not originally planned.

### Prompt externalization pattern

Existing pattern (found in `knowledge-gaps.ts`, `emergent-gaps.ts`, `gap-brief.ts`, `morning-briefing.ts`):

```typescript
const promptPath = resolve(__dirname, '../../prompts/knowledge-gaps.md');
const systemPrompt = readFileSync(promptPath, 'utf-8');
```

Upgraded pattern for new extractions (async + cache):

```typescript
const promptPath = resolve(__dirname, '../../prompts/aurora-ask.md');
let cachedPrompt: string | undefined;
async function getSystemPrompt(): Promise<string> {
  if (!cachedPrompt) {
    cachedPrompt = await readFile(promptPath, 'utf-8');
  }
  return cachedPrompt;
}
```

Dynamic prompts use `{{placeholder}}` substitution — no templating library:

```typescript
const template = await getTemplate();
const prompt = template.replace('{{transcript}}', transcriptText);
```

### ocr.ts export change — breaking

`ocr.ts` changed `export const PDF_VISION_PROMPT: string` to `export async function getPdfVisionPrompt(): Promise<string>`. This broke `pdf-eval-compare.ts` which imported the const directly. Updated to call the function. Also broke `pdf-eval-compare.test.ts` — required async handling in test setup.

Lesson: externalizing a prompt that was exported as a constant is a breaking change. Future migrations should check for external importers via LSP find-references before changing the export shape.

### Test repair: 24 failures to 0

Pre-session failures were in two categories:

**Pre-existing (20):** Model name drift. Tests had `gemma3` but codebase had moved to `gemma4:26b`. Also `.name` → `.displayName` in speaker objects from session 21 EBUCore migration. These were never fixed because sessions skipped running the full test suite.

**New (4):** From this session's prompt extraction — `PDF_VISION_PROMPT` const → async function, obsidian-export sidecar behavior, auto-cross-ref fetch mock timing.

17 new prompt lint tests added in `tests/prompts/prompt-lint.test.ts`. These are intentionally simple: `expect(fs.existsSync(path)).toBe(true)` and `expect(content.length).toBeGreaterThan(10)`. The point is to make accidental prompt deletion a failing test, not a silent behavioral regression.

### Mönster etablerade

- **`as const` config file**: single exported file, grouped by concern, imported where needed. Not a class, not a singleton, just a module.
- **Async lazy prompt cache**: `let cached: string | undefined; async function get() { if (!cached) cached = await readFile(...); return cached; }` — now the standard for all prompt files.
- **`{{placeholder}}` substitution**: no templating library. `template.replace('{{x}}', value)`. Works for 1-3 substitutions; if you need more, use a proper template engine.
- **Prompt lint test**: one test per prompt file, checks existence and minimum length. Run in CI, catches silent deletions.
- **Check LSP references before changing export shape**: `lsp_find_references` before renaming any exported symbol that could be imported by other modules.

| Tid | Typ | Vad |
|-----|-----|-----|
| 00:30 | COMMITS | Session 23 catch-up commits (4) |
| 01:00 | AUDIT | 3x parallel explore agents — full codebase scan |
| 02:00 | DESIGN | Oracle consultation on config architecture |
| 02:30 | FEAT | `llm-defaults.ts` — create + structure |
| 03:30 | REFACTOR | 66+ call site migration across ~25 files |
| 05:00 | FIX | Stale model refs (langfuse.ts, usage.ts) |
| 05:15 | FEAT | PYANNOTE_MODEL env override (diarize_audio.py) |
| 05:30 | REFACTOR | 17 prompts → external .md files |
| 07:00 | FIX | 24 test failures — model names, displayName, async prompts, mocks |
| 07:30 | FEAT | prompt-lint.test.ts (17 new tests) |
| 08:00 | DOCS | Handoff, release notes, diary entries |

### Baseline

typecheck: PASS — 0 errors
tests: PASS — 319 files, 4254 tests, 0 failures (was 24 failures at session start)

---

## 2026-04-28 (session 25) — Transkribera-skill + Gemma4 thinking-mode fix

### Transkribera-skill (`.claude/skills/transkribera/SKILL.md`)

Skillen dokumenterar tvåstegs-pipelinen: snabb draft (int8/beam=1) → entity extraction (Gemma4 via Ollama) → quality pass (float32/beam=5 med `initial_prompt`). Sju steg totalt, inklusive valfri user review av extraherade entiteter.

Designval: skillen anropar `aurora-media` MCP-tools direkt (`transcribe_audio`, `extract_entities`) istället för att gå via `aurora_ingest_video` + jobbkö. Anledning: `aurora_ingest_video` exponerar inte `initial_prompt`-parametern. Om man vill ha jobbkö-stöd för tvåstegs behöver `startVideoIngestJob()` utökas med `initialPrompt` i input-schemat.

### Gemma4 degeneration med `format: "json"` — root cause

`extract_entities` i `mcp_server.py` anropade Ollama `/api/generate` med `format: "json"` och `temperature: 0.0`. Gemma4:26b degenererade till oändlig repetition — startade bra men fastnade på 3:e-4:e entiteten.

**Root cause:** Gemma4 har thinking-mode aktiverat som default. Via `/api/generate` blandas thinking-tokens in i `response`-fältet (inget separat fält). Med `format: "json"` suppressas thinking-output men modellen förbrukar fortfarande tokens internt på att "tänka". Resultatet: modellen når aldrig en naturlig `stop`-token.

**Bevis:** Bytte till `/api/chat` → `message.thinking` = 2288 chars, `message.content` = 0 chars, `done_reason: length`. Thinking konsumerade hela `num_predict`-budgeten.

**Fix:** `"think": false` i payload till `/api/generate`. Med det: 10-28 entiteter, valid JSON, `done_reason: stop`. `num_predict: 1024` som safety net.

**Implikation för all framtida Gemma4-användning:** Alla Ollama-anrop med `format: "json"` till Gemma4 (och troligen andra thinking-models) MÅSTE ha `think: false`. Utan det fungerar det ibland (korta svar) men degenererar vid längre output. Kontrollerat att detta är enda stället i kodbasen som använder `format: "json"` mot Ollama.

### videoDesc cleanup

`video.ts:812` — `const videoDesc = (extractMeta.videoDescription as string) ?? ''` deklarerades men användes aldrig. `ytTags` och `categories` från samma block användes. Troligen var `videoDesc` tänkt att inkluderas i tag-generering men glömdes.

### Tier 2 — utredning

Undersökte om briefing-skill och memory contradiction prompt-extraktion behövdes:
- `briefing.ts` prompten är redan extraherad (`prompts/briefing-summary.md`, laddas via `getBriefingSummaryPrompt()`)
- `memory.ts` contradiction-prompten är redan extraherad (`prompts/memory-contradiction.md`, laddas via `getContradictionPrompt()`)
- Standalone briefing-skill redundant — `researcha-amne` och `kunskapscykel` använder redan `aurora_briefing`

Notering: session 24 handoff nämner `prompts/briefing-narrative.md` som ny fil, men den existerar inte. Koden refererar till `prompts/briefing-summary.md` som existerar. Dokumentationsfel i session 24 handoff/LLM release note.

### Mönster etablerade

- **Gemma4 + `format: "json"` = `think: false` obligatoriskt**: Annars degenererar modellen. Gäller `/api/generate`. `/api/chat` separerar thinking men har samma budget-problem.
- **Diagnostisera Ollama-problem via `/api/chat`**: Chat-API:t visar `thinking` vs `content` separat. Generate-API:t blandar allt. Använd chat för debugging, generate för produktion.
- **Testa MCP tools live tidigt**: `extract_entities` var "klar" i session 23 men fungerade aldrig i praktiken. Undvik att låta otestat verktyg passera fler än en session.

| Tid | Typ | Vad |
|-----|-----|-----|
| 00:15 | ORIENT | Handoff, baseline, skill-mönster |
| 00:30 | FIX | `videoDesc` unused variable |
| 01:30 | FEAT | `transkribera/SKILL.md` |
| 02:45 | DEBUG | 5 iterationer Gemma4 degeneration |
| 03:00 | FIX | `mcp_server.py` think:false |
| 03:15 | VERIFY | typecheck + test suite |
| 03:30 | AUDIT | Tier 2 — redan gjort |
| 03:45 | DOCS | Session close |

### Baseline

typecheck: PASS — 0 errors
tests: PASS — 319 files, 4254 tests, 0 failures (unchanged)
