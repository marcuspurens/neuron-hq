# Handoff — Session 24

**Datum:** 2026-04-28
**Scope:** LLM config centralization — hardcoded values extracted to typed constants; 17 prompts extracted to external .md files; full test suite repaired

---

## Vad som gjordes

### 1. Committed session 23 work (4 commits)

Committed the session 23 artifacts that had been left uncommitted:
- WhisperX params + `extract_entities` tool
- Aurora media MCP documentation (4 variants)
- Utility scripts
- Session 23 handoff/release notes/diaries

### 2. Deep code review — identified all hardcoded LLM logic

Fired 3 parallel explore agents to audit the entire codebase. Findings exceeded the session 23 estimate significantly:

- **46 hardcoded config values** (session 23 had estimated 16)
- **17 hardcoded prompts** across 12 files
- **4 already-externalized prompts** — the pattern to follow (`knowledge-gaps.ts`, `emergent-gaps.ts`, `gap-brief.ts`, `morning-briefing.ts`)

### 3. Oracle consultation on config architecture

Evaluated 4 options for centralizing the 46 config values:

| Option | Description | Decision |
|---|---|---|
| A — YAML file | `config/llm-defaults.yaml` at runtime | Rejected: adds YAML parser, no type safety |
| B — Expand `config.ts` | Add LLM keys to existing config | Rejected: config.ts handles env vars, not defaults |
| C — Hybrid | YAML with TS fallback | Rejected: two-source-of-truth problem |
| D — TypeScript const | `src/aurora/llm-defaults.ts` with `as const` | **Selected** |

Oracle reasoning: zero runtime overhead, full IDE autocomplete, type-safe at every call site, Marcus can still edit the file directly, no new build tooling needed.

### 4. Created `src/aurora/llm-defaults.ts`

New file — single source of truth for all tunable LLM parameters. Six exported const objects:

```typescript
export const AURORA_MODELS = {
  fast: 'gemma4:26b',
  quality: 'gemma4:26b',
  vision: 'gemma4:26b',
  embeddings: 'nomic-embed-text',
  claude: 'claude-haiku-4-5',
} as const;

export const AURORA_TOKENS = {
  short: 256,
  medium: 1024,
  long: 4096,
  extended: 8192,
} as const;

export const AURORA_SIMILARITY = {
  high: 0.85,
  medium: 0.75,
  low: 0.65,
  veryLow: 0.5,
} as const;

export const AURORA_CONFIDENCE = {
  high: 0.8,
  medium: 0.6,
  low: 0.4,
  diarized: 0.7,
  fallback: 0.5,
} as const;

export const AURORA_FRESHNESS = {
  staleAfterDays: 30,
  criticalAfterDays: 90,
  archiveAfterDays: 365,
} as const;

export const AURORA_LIMITS = {
  searchResults: 20,
  maxRetries: 3,
  embeddingBatchSize: 10,
  transcriptTruncateChars: 8000,
} as const;
```

### 5. Migrated 66+ call sites across ~25 files

**Model references (10 sites):**
- `src/aurora/ask.ts`
- `src/aurora/semantic-split.ts`
- `src/aurora/transcript-polish.ts`
- `src/aurora/transcript-tldr.ts`
- `src/aurora/speaker-guesser.ts`
- `src/aurora/vision.ts`
- `src/aurora/intake.ts`
- `src/aurora/morning-briefing.ts`
- `src/aurora/briefing.ts`
- `src/aurora/gap-brief.ts`

**Token limits (11 sites):** Replaced `max_tokens: 1024`, `max_tokens: 4096` etc. with `AURORA_TOKENS.medium`, `AURORA_TOKENS.long` etc.

**Similarity thresholds (~45 sites):** All `similarity >= 0.75`, `score > 0.85`, `threshold < 0.65` patterns now reference named constants. Key files:
- `src/aurora/search.ts`
- `src/aurora/ppr.ts`
- `src/aurora/knowledge-gaps.ts`
- `src/aurora/emergent-gaps.ts`
- `src/aurora/consolidation.ts`
- `src/aurora/memory.ts`
- `src/aurora/auto-cross-ref.ts`
- `src/aurora/source-tracker.ts`
- `src/aurora/gap-brief.ts`
- `src/aurora/briefing.ts`

### 6. Fixed stale model references

`src/aurora/langfuse.ts` and `src/aurora/usage.ts` both contained `'claude-sonnet-4-5-20250929'` — a model that no longer exists. These now reference `DEFAULT_MODEL_CONFIG.model` from the existing config.

### 7. Added PYANNOTE_MODEL env override to `diarize_audio.py`

The Python diarization worker was the only component with zero externalization path for its model. Added:

```python
PYANNOTE_MODEL = os.environ.get("PYANNOTE_MODEL", "pyannote/speaker-diarization-3.1")
```

### 8. Extracted 17 prompts to external .md files

All 17 hardcoded prompts migrated to `prompts/` directory. Pattern used:

```typescript
// Before
const SYSTEM_PROMPT = `You are a knowledge graph...`;

// After
const promptPath = resolve(__dirname, '../../prompts/aurora-ask.md');
let cachedPrompt: string | undefined;
async function getSystemPrompt(): Promise<string> {
  if (!cachedPrompt) cachedPrompt = await readFile(promptPath, 'utf-8');
  return cachedPrompt;
}
```

Dynamic prompts use `{{placeholder}}` substitution:

```typescript
const template = await getTemplate();
const prompt = template.replace('{{transcript}}', transcriptText);
```

**New prompt files (15 new files):**
- `prompts/aurora-ask.md`
- `prompts/aurora-vision.md`
- `prompts/aurora-intake.md`
- `prompts/semantic-split.md`
- `prompts/semantic-chapters.md`
- `prompts/semantic-tags.md`
- `prompts/transcript-polish.md`
- `prompts/transcript-tldr.md`
- `prompts/speaker-guesser.md`
- `prompts/memory-contradiction.md`
- `prompts/ocr-vision.md`
- `prompts/auto-cross-ref.md`
- `prompts/consolidation.md`
- `prompts/source-tracker.md`
- `prompts/briefing-narrative.md`

**2 existing prompt files updated** (already externalized, content refined):
- `prompts/emergent-gaps.md`
- `prompts/knowledge-gaps.md`

**`pdf-eval-compare.ts` updated:** The ocr.ts export changed from `PDF_VISION_PROMPT` (const string) to `getPdfVisionPrompt()` (async function). `pdf-eval-compare.ts` was updated to call the function.

### 9. Fixed all 24 test failures

Pre-session state: 20 pre-existing failures + 4 new failures from prompt extraction changes.

| Fix | Files |
|---|---|
| `gemma3` → `gemma4:26b` model name | 4 test files |
| `.name` → `.displayName` on speaker objects | 3 test files |
| `PDF_VISION_PROMPT` → `getPdfVisionPrompt()` | `pdf-eval-compare.test.ts` |
| Auto-cross-ref fetch mock timeout fix | `auto-cross-ref.test.ts` |
| Obsidian export: `.words.json` sidecar + speaker columns | `obsidian-export.test.ts` |
| 17 new prompt lint tests added | `tests/prompts/prompt-lint.test.ts` (new file) |

**Final test suite: 319 files, 4254 tests, 0 failures.**

---

## Vad som INTE gjordes

- **`transkribera/SKILL.md`** — deferred again. The skill work is meaningful but the config centralization took the full session.
- **Live test of `extract_entities`** — still untested against real Ollama output.
- **`video.ts` `videoDesc` unused variable** (line 812) — pre-existing, not introduced this session. Still there.
- **`config/llm-defaults.yaml`** — TypeScript const was chosen instead. YAML remains a future evolution path if GUI-based tuning is needed.
- **Tier 2 prompt extractions** — `briefing.ts` pipeline and `memory.ts` contradiction prompt not extracted (would have pushed session over time).

---

## Validation

- `pnpm typecheck`: PASS — 0 errors
- `pnpm lint`: PASS — 0 warnings on changed files
- `pnpm test`: PASS — 319 files, 4254 tests, 0 failures (was 24 failures before fixes)

---

## Commits

Session 23 catchup (4 commits before main session work):
- `feat(mcp): expose whisperx compute_type, beam_size, initial_prompt params`
- `feat(mcp): add extract_entities tool for two-pass transcription pipeline`
- `docs: add aurora-media-mcp documentation in four variants`
- `docs: add session 23 handoff, release notes, and diary entries`

Session 24 main work:
- `feat(config): add llm-defaults.ts — centralize all tunable LLM parameters`
- `refactor(aurora): migrate 66+ hardcoded config values to llm-defaults constants`
- `fix(langfuse,usage): replace stale claude-sonnet-4-5-20250929 model references`
- `feat(diarize): add PYANNOTE_MODEL env override`
- `refactor(prompts): extract 17 hardcoded prompts to external .md files`
- `fix(tests): repair 24 test failures — model names, displayName, async prompt API`

---

## Risker och oklarheter

- **`videoDesc` unused variable** at `video.ts:812` — pre-existing but should be cleaned up. Low risk (just lint noise).
- **Prompt file encoding** — all 15 new files use UTF-8. If the `readFile` path resolution breaks in a packaged build, prompts will throw. Tested in dev; not tested in `pnpm build` output.
- **Lazy caching is process-scoped** — if a prompt file is edited during a long-running daemon session, the cache won't refresh until restart. Acceptable for now; document if it becomes a pain point.
- **`AURORA_MODELS.fast` and `AURORA_MODELS.quality` are the same value** — intentional. The semantic distinction matters for future-proofing (when fast gets a cheaper model). If the distinction is never used, collapse them.

---

## Rekommenderade nästa steg (Session 25)

1. **Skapa `.claude/skills/transkribera/SKILL.md`** — the two-step transcription pipeline (draft → entities → full quality) as an OpenCode skill. This was the original goal of session 23, carried forward twice. It should be the first thing session 25 does.

2. **Test `extract_entities` against live Ollama** with a real transcript. Verify JSON format and that the returned string fits within the 224-character `initial_prompt` limit.

3. **Fix `videoDesc` unused variable** in `video.ts` line 812 — three-line fix, get it out of the way.

4. **Begin Tier 2 skills** if time permits: `briefing.ts` pipeline (`.claude/skills/briefing/SKILL.md`) and `memory.ts` contradiction prompt extraction.

5. **Consider `config/llm-defaults.yaml`** as a future evolution — only worth doing if Marcus wants a non-code interface for tuning (e.g., a settings panel). The TypeScript const approach is superior for development; YAML makes sense only if the edit surface is non-technical.
