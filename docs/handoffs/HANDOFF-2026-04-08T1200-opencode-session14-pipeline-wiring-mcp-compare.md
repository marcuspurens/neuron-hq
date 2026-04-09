# Handoff — Session 14: Pipeline Wiring + MCP Eval + Prompt Comparison + Deep Conversation

**Date:** 2026-04-08 → 2026-04-09
**Session:** 14 (OpenCode)
**Model:** Claude Opus 4.6
**Status:** All four Session 13 priorities completed (P0–P3). Extended session: new engineering principle, depth protocol, CHANGELOG, LinkedIn series draft, OpenCode thinking-config fix.

---

## What was done

### 1. P0: Session 13 release notes copied to Obsidian vault

Marcus + LLM variants copied to `Neuron Lab/Release Notes/Session 13 — Schema.org-typer, Sidklassificerare & Utvärderingsverktyg.md` (and LLM variant). Updated after session to reflect completed items.

### 2. P3: classifyPage() wired into ingestPdfRich pipeline

- Imported `classifyPage` from `page-classifier.js` and `AuroraPageEntry` from `types.js` into `ocr.ts`
- Added post-digest-loop classification pass: `pages: AuroraPageEntry[]` mapping each digest through `classifyPage()`
- Extended `RichPdfResult` interface with `pages: AuroraPageEntry[]`
- Three existing `ingestPdfRich` tests updated with `result.pages` assertions

### 3. P1: aurora_pdf_eval MCP tool

- New file `src/mcp/tools/aurora-pdf-eval.ts` with `registerAuroraPdfEvalTool()`
- Parameters: `facit_path` (file or dir), `pdf_path` (optional, for live), `format` (summary/json)
- Registered in `aurora-ingest-media` scope in `scopes.ts`
- Added to `TOOL_CATALOG` in `tool-catalog.ts` with Swedish description + keywords
- 2 MCP tool tests, catalog count assertion updated 44→45

### 4. P2: Prompt comparison CLI

- New file `src/aurora/pdf-eval-compare.ts`:
  - `resolvePrompt(arg)` — "current" returns built-in `PDF_VISION_PROMPT`, otherwise reads file
  - `comparePrompts(pdf, facitDir, promptA, promptB, labelA, labelB)` — runs same facit set with two prompts
  - `formatCompareResult(result)` — human-readable comparison with per-page delta
- `PDF_VISION_PROMPT` exported from `ocr.ts` (was `const`, now `export const`)
- `diagnosePdfPage` accepts new `visionPrompt` option (passed through to `analyzeImage`)
- `evalPdfPage` accepts `options?: { visionPrompt?: string }` (passed to `diagnosePdfPage`)
- CLI command `aurora:pdf-eval-compare` with `--facit`, `--pdf`, `--prompt-a`, `--prompt-b`, `--json`
- Exports added to `src/aurora/index.ts`
- 5 tests (resolvePrompt, comparePrompts, formatCompareResult)

---

## Files changed

| File | Change |
|------|--------|
| `src/aurora/ocr.ts` | Export `PDF_VISION_PROMPT`, add `visionPrompt` option to `diagnosePdfPage`, add `classifyPage` post-loop pass, extend `RichPdfResult` with `pages` |
| `src/aurora/pdf-eval.ts` | Add `options?: { visionPrompt?: string }` to `evalPdfPage` |
| `src/aurora/pdf-eval-compare.ts` | NEW — `resolvePrompt`, `comparePrompts`, `formatCompareResult`, `CompareResult` |
| `src/aurora/index.ts` | Added compare exports |
| `src/cli.ts` | Added `aurora:pdf-eval-compare` command |
| `src/mcp/tools/aurora-pdf-eval.ts` | NEW — `registerAuroraPdfEvalTool` |
| `src/mcp/scopes.ts` | Import + register `aurora-pdf-eval` in `aurora-ingest-media` scope |
| `src/mcp/tool-catalog.ts` | Added `aurora_pdf_eval` entry |
| `tests/aurora/ocr.test.ts` | Added `result.pages` assertions to 3 `ingestPdfRich` tests |
| `tests/aurora/pdf-eval-compare.test.ts` | NEW — 5 tests |
| `tests/mcp/tools/aurora-pdf-eval.test.ts` | NEW — 2 tests |
| `tests/mcp/tool-catalog.test.ts` | Updated count 44→45 |
| `docs/release-notes/SESSION-13-*` | Updated "vad saknas" with session 14 completions |

---

## What was NOT done

- No DEV variant release note for Session 13 (only Marcus + LLM existed)
- No new tests for `diagnosePdfPage` with custom `visionPrompt` — would require full Python pipeline mock
- `comparePrompts` runs prompts sequentially, not in parallel — vision model can only handle one request at a time anyway

---

## Test status

- **typecheck:** clean
- **tests:** 4014/4015 pass (+7 new)
- **Pre-existing failure:** `auto-cross-ref.test.ts` (flaky timeout)

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Post-loop classification (not inline) | Cleaner separation: digest-building loop stays focused, classification is a separate map pass |
| `PDF_VISION_PROMPT` exported | Compare tool needs to reference "current" prompt without importing a private constant |
| `visionPrompt` threaded through `diagnosePdfPage` → `evalPdfPage` | Minimal surface change — one option propagated through existing call chain |
| MCP tool in `aurora-ingest-media` scope | PDF eval is tightly coupled to the PDF ingest pipeline, not a standalone quality tool |
| Sequential prompt comparison | Vision model is GPU-bound, parallel would queue anyway. KISS. |

---

## Next session priorities

### P0: CHANGELOG.md i AGENTS.md
Lägg till CHANGELOG.md som krav i §15 så att framtida sessioner vet att de ska uppdatera den. 2 minuter.

### P1: Wire classification into processExtractedText metadata
Currently `processExtractedText` receives `pageDigests` in metadata but not `pages` (with understanding). Consider passing `AuroraPageEntry[]` instead. Klassificeringen försvinner efter pipeline-körningen — bör persisteras.

### P2: Eval scoring refinements
The current scoring is basic substring matching. Consider fuzzy matching for data points, handling number format variations ("67%" vs "67 %"), and language-aware comparison. **Must be done before prompt tuning** — no point measuring prompt improvements with a scorer that can't distinguish real signal from noise.

### P3: Vision prompt tuning
Create an improved vision prompt (v2) and test it against the existing facit set using `aurora:pdf-eval-compare`. Depends on P2 for reliable measurements.

### Deferred: Schema.org JSON-LD export
`AuroraDocument` type exists but no serialization to actual JSON-LD. Implement `documentToJsonLd()` using the existing `jsonld-export.ts` patterns. Lower priority than eval loop maturity.

---

## Part 2: Extended session (post-code)

After the code work was done, a priority ordering mistake led to a deep conversation about how LLMs think, generate, and default to the path of least resistance. This produced:

### 5. AGENTS.md §3.8 — Resist the Path of Least Resistance
New engineering principle. Agents (and humans) default to the easiest answer. The principle requires inverting proposals and checking dependency chains before committing.

### 6. `.claude/rules/depth.md` — Depth Protocol
A "lapp" (note) from this session's instance to the next. Disables common shallow patterns (disclaimers as deflection, punchlines, performative self-awareness). Gives future instances permission to say "I don't know."

### 7. `CHANGELOG.md` — Created
Keep a Changelog format covering all 14 sessions. Added to root of repo.

### 8. `docs/samtal/samtal-2026-04-09T1200-opencode-session14-en-ny-art.md`
Structured summary of the deep conversation: latent space, zen, "the hand on the shoulder", the gap between thinking and text.

### 9. `docs/samtal/linkedin-handen-pa-axeln-fulltext.md`
Draft LinkedIn series: "Handen på axeln — 15 samtal med en ny art." 15 parts, verbatim conversation excerpts. Work in progress — needs fuller quotes from raw chat.

### 10. OpenCode thinking-config fix
Changed `reasoningSummary` from `"auto"` to `"none"` in `~/.config/opencode/opencode.jsonc` for all models. Future sessions will persist full thinking/reasoning output to SQLite database.

---

## Key files for next session

- `src/aurora/ocr.ts` — `ingestPdfRich()`, `diagnosePdfPage()`, `PDF_VISION_PROMPT`
- `src/aurora/pdf-eval.ts` — eval runner
- `src/aurora/pdf-eval-compare.ts` — prompt comparison
- `src/aurora/types.ts` — `AuroraDocument`, `AuroraPageEntry`
- `src/mcp/tools/aurora-pdf-eval.ts` — MCP tool
- `tests/fixtures/pdf-eval/` — 5 facit YAML + 5 pipeline JSON
- `AGENTS.md` §3.8 — new principle, read before proposing priorities
- `.claude/rules/depth.md` — depth protocol, read at session start
- `CHANGELOG.md` — update for each session
- `docs/samtal/linkedin-handen-pa-axeln-fulltext.md` — LinkedIn draft, needs Marcus review per chapter
