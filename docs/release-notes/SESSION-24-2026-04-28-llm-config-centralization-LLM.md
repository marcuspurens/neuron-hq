---
session: 24
date: 2026-04-28
variant: llm
---

# Session 24 — LLM Config Centralization + Prompt Externalization

## Changes

| File | Change |
|---|---|
| `src/aurora/llm-defaults.ts` | NEW — 6 exported `as const` objects: `AURORA_MODELS`, `AURORA_TOKENS`, `AURORA_SIMILARITY`, `AURORA_CONFIDENCE`, `AURORA_FRESHNESS`, `AURORA_LIMITS` |
| `src/aurora/ask.ts` | Model + token refs → llm-defaults; inline prompt → `prompts/aurora-ask.md` |
| `src/aurora/semantic-split.ts` | Model + token refs → llm-defaults; 3 inline prompts → `prompts/semantic-split.md`, `prompts/semantic-chapters.md`, `prompts/semantic-tags.md` |
| `src/aurora/vision.ts` | Model ref → llm-defaults; system + default prompt → `prompts/aurora-vision.md` |
| `src/aurora/intake.ts` | Model + token refs → llm-defaults; metadata-taxonomy prompt → `prompts/aurora-intake.md` |
| `src/aurora/transcript-polish.ts` | Model + token refs → llm-defaults; prompt → `prompts/transcript-polish.md` |
| `src/aurora/transcript-tldr.ts` | Model + token refs → llm-defaults; prompt → `prompts/transcript-tldr.md` |
| `src/aurora/speaker-guesser.ts` | Model + token refs → llm-defaults; prompt → `prompts/speaker-guesser.md` |
| `src/aurora/memory.ts` | Similarity + confidence refs → llm-defaults; contradiction prompt → `prompts/memory-contradiction.md` |
| `src/aurora/auto-cross-ref.ts` | Similarity refs → llm-defaults; prompt → `prompts/auto-cross-ref.md` |
| `src/aurora/consolidation.ts` | Confidence + similarity refs → llm-defaults; prompt → `prompts/consolidation.md` |
| `src/aurora/source-tracker.ts` | Confidence refs → llm-defaults; prompt → `prompts/source-tracker.md` |
| `src/aurora/briefing.ts` | Model + token + freshness refs → llm-defaults; narrative prompt → `prompts/briefing-narrative.md` |
| `src/aurora/gap-brief.ts` | Model + token + similarity refs → llm-defaults |
| `src/aurora/search.ts` | Similarity + limit refs → llm-defaults |
| `src/aurora/ppr.ts` | Similarity refs → llm-defaults |
| `src/aurora/knowledge-gaps.ts` | Similarity + confidence refs → llm-defaults |
| `src/aurora/emergent-gaps.ts` | Similarity + confidence refs → llm-defaults |
| `src/aurora/morning-briefing.ts` | Model + token refs → llm-defaults |
| `src/aurora/ocr.ts` | Prompt → `prompts/ocr-vision.md`; export changed from `PDF_VISION_PROMPT` (string) to `getPdfVisionPrompt()` (async function) |
| `src/aurora/langfuse.ts` | Stale model `'claude-sonnet-4-5-20250929'` → `DEFAULT_MODEL_CONFIG.model` |
| `src/aurora/usage.ts` | Same stale model reference fixed |
| `aurora-workers/diarize_audio.py` | `PYANNOTE_MODEL` reads from env with fallback to `"pyannote/speaker-diarization-3.1"` |
| `src/mcp/tools/pdf-eval-compare.ts` | Updated to call `getPdfVisionPrompt()` instead of `PDF_VISION_PROMPT` const |
| `tests/prompts/prompt-lint.test.ts` | NEW — 17 tests verifying each prompt file exists and is non-empty |
| 4 test files | `gemma3` → `gemma4:26b` model name |
| 3 test files | `.name` → `.displayName` on speaker objects |
| `tests/aurora/pdf-eval-compare.test.ts` | Updated for async `getPdfVisionPrompt()` |
| `tests/aurora/auto-cross-ref.test.ts` | Fetch mock timeout fix |
| `tests/commands/obsidian-export.test.ts` | `.words.json` sidecar + speaker columns updates |
| `prompts/aurora-ask.md` | NEW |
| `prompts/aurora-vision.md` | NEW |
| `prompts/aurora-intake.md` | NEW |
| `prompts/semantic-split.md` | NEW |
| `prompts/semantic-chapters.md` | NEW |
| `prompts/semantic-tags.md` | NEW |
| `prompts/transcript-polish.md` | NEW |
| `prompts/transcript-tldr.md` | NEW |
| `prompts/speaker-guesser.md` | NEW |
| `prompts/memory-contradiction.md` | NEW |
| `prompts/ocr-vision.md` | NEW |
| `prompts/auto-cross-ref.md` | NEW |
| `prompts/consolidation.md` | NEW |
| `prompts/source-tracker.md` | NEW |
| `prompts/briefing-narrative.md` | NEW |

## New/Changed Interfaces

```typescript
// src/aurora/llm-defaults.ts (new file)
export const AURORA_MODELS: {
  fast: 'gemma4:26b';
  quality: 'gemma4:26b';
  vision: 'gemma4:26b';
  embeddings: 'nomic-embed-text';
  claude: 'claude-haiku-4-5';
}

export const AURORA_TOKENS: { short: 256; medium: 1024; long: 4096; extended: 8192 }
export const AURORA_SIMILARITY: { high: 0.85; medium: 0.75; low: 0.65; veryLow: 0.5 }
export const AURORA_CONFIDENCE: { high: 0.8; medium: 0.6; low: 0.4; diarized: 0.7; fallback: 0.5 }
export const AURORA_FRESHNESS: { staleAfterDays: 30; criticalAfterDays: 90; archiveAfterDays: 365 }
export const AURORA_LIMITS: { searchResults: 20; maxRetries: 3; embeddingBatchSize: 10; transcriptTruncateChars: 8000 }

// src/aurora/ocr.ts — export changed
// Before: export const PDF_VISION_PROMPT: string
// After:  export async function getPdfVisionPrompt(): Promise<string>
```

## Design Decisions

| Decision | Rationale |
|---|---|
| TypeScript `as const` over YAML | Zero runtime overhead, full type safety, IDE autocomplete, no new build tooling. YAML left as a future path for GUI-based tuning only. |
| Structured by concern, not by module | `AURORA_TOKENS` not `ASK_TOKENS` + `VISION_TOKENS`. Prevents false duplication and makes tuning easier — one place to change "how long is a medium response?". |
| Per-call-site override preserved | Pattern `options?.maxTokens ?? AURORA_TOKENS.medium` keeps existing override paths working. No breaking changes. |
| ~10 magic numbers intentionally NOT centralized | Formula weights (e.g., `* 0.3` in PPR scoring), computed values, and test-specific values are not semantic config. Centralizing them would obscure intent. |
| Lazy async caching for prompt files | `readFile` on first call, cached in module-scoped var thereafter. Avoids I/O on every LLM call; refreshes on process restart. |
| `{{placeholder}}` substitution | Explicit, readable, no templating library needed. Pattern: `template.replace('{{transcript}}', text)`. |

## Test Delta

Before session: 4230 tests, 24 failures (20 pre-existing + 4 from prompt extraction changes).
After session: 4254 tests (+17 prompt lint tests + 7 other), 0 failures.

New tests:
- `tests/prompts/prompt-lint.test.ts` — 17 tests (one per prompt file: exists + non-empty)

Fixed failures:
- 4 model name tests: `gemma3` → `gemma4:26b`
- 3 speaker display name tests: `.name` → `.displayName`
- 1 pdf-eval-compare: `PDF_VISION_PROMPT` → `getPdfVisionPrompt()`
- 1 auto-cross-ref: fetch mock timeout
- 15 obsidian-export: sidecar + speaker column updates

## Known Issues

- `videoDesc` unused variable at `video.ts:812` — pre-existing, not introduced this session
- Prompt cache is process-scoped — prompt file edits during a running daemon session require restart to take effect
- `AURORA_MODELS.fast` and `AURORA_MODELS.quality` are the same value intentionally — semantic distinction for future routing

## Verification

- `pnpm typecheck`: PASS — 0 errors
- `pnpm lint`: PASS — 0 warnings on changed files
- `pnpm test`: PASS — 319 files, 4254 tests, 0 failures

## Next

1. Create `.claude/skills/transkribera/SKILL.md` — two-pass transcription pipeline as OpenCode skill (primary goal of sessions 23 and 24, both times deferred)
2. Test `extract_entities` against live Ollama with a real transcript
3. Fix `videoDesc` unused variable in `video.ts:812`
4. Begin Tier 2 skills if time permits: `briefing.ts` pipeline, `memory.ts` contradiction prompt
5. Evaluate `config/llm-defaults.yaml` only if GUI-based tuning becomes a requirement

Handoff: `docs/handoffs/HANDOFF-2026-04-28-opencode-session24-llm-config-centralization.md`
