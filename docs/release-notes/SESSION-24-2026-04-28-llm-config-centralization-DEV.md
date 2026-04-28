---
session: 24
datum: 2026-04-28
---

# Session 24 — Dev Notes

## Ändringar

| Fil | Ändring |
|---|---|
| `src/aurora/llm-defaults.ts` | NY — 6 `as const`-objekt med alla justerbara LLM-parametrar |
| `src/aurora/ask.ts` | Model + tokens → llm-defaults; prompt → `prompts/aurora-ask.md` |
| `src/aurora/semantic-split.ts` | Model + tokens → llm-defaults; 3 prompts → separata .md-filer |
| `src/aurora/vision.ts` | Model → llm-defaults; prompt → `prompts/aurora-vision.md` |
| `src/aurora/intake.ts` | Model + tokens → llm-defaults; prompt → `prompts/aurora-intake.md` |
| `src/aurora/transcript-polish.ts` | Model + tokens → llm-defaults; prompt → `prompts/transcript-polish.md` |
| `src/aurora/transcript-tldr.ts` | Model + tokens → llm-defaults; prompt → `prompts/transcript-tldr.md` |
| `src/aurora/speaker-guesser.ts` | Model + tokens → llm-defaults; prompt → `prompts/speaker-guesser.md` |
| `src/aurora/memory.ts` | Similarity + confidence → llm-defaults; prompt → `prompts/memory-contradiction.md` |
| `src/aurora/auto-cross-ref.ts` | Similarity → llm-defaults; prompt → `prompts/auto-cross-ref.md` |
| `src/aurora/consolidation.ts` | Confidence + similarity → llm-defaults; prompt → `prompts/consolidation.md` |
| `src/aurora/source-tracker.ts` | Confidence → llm-defaults; prompt → `prompts/source-tracker.md` |
| `src/aurora/briefing.ts` | Model + tokens + freshness → llm-defaults; prompt → `prompts/briefing-narrative.md` |
| `src/aurora/gap-brief.ts` | Model + tokens + similarity → llm-defaults |
| `src/aurora/search.ts`, `ppr.ts`, `knowledge-gaps.ts`, `emergent-gaps.ts`, `morning-briefing.ts` | Threshold/limit refs → llm-defaults |
| `src/aurora/ocr.ts` | Prompt → `prompts/ocr-vision.md`; `PDF_VISION_PROMPT` const → `getPdfVisionPrompt()` async fn |
| `src/aurora/langfuse.ts`, `usage.ts` | Stale `'claude-sonnet-4-5-20250929'` → `DEFAULT_MODEL_CONFIG.model` |
| `aurora-workers/diarize_audio.py` | `PYANNOTE_MODEL` env override |
| `src/mcp/tools/pdf-eval-compare.ts` | Updated for async `getPdfVisionPrompt()` |
| `tests/prompts/prompt-lint.test.ts` | NY — 17 tester (existens + icke-tom per promptfil) |
| 15 nya filer i `prompts/` | Se LLM-variant för fullständig lista |

## Beslut och tradeoffs

| Beslut | Varför |
|---|---|
| `as const` TypeScript istället för YAML | Noll runtime overhead, full typ-säkerhet, IDE-autocomplete, inget nytt build-verktyg. YAML kvarstår som framtida evolution om GUI-tuning behövs. |
| Grupperat per concern, inte per modul | `AURORA_TOKENS` inte `ASK_TOKENS` + `VISION_TOKENS`. Ett ställe att ändra vad "medium svar" innebär för hela systemet. |
| Per-call-site override bevarad | `options?.x ?? AURORA_TOKENS.medium` — inga breaking changes mot existerande call sites. |
| ~10 magic numbers avsiktligt INTE centraliserade | Formelkoefficienter (PPR-vikter), beräknade värden och testspecifika värden är inte semantisk config. Centralisering skulle dölja intention. |
| Lazy async cache för promptfiler | `readFile` första anropet, cachat i module-scoped var. Uppdateras vid process-restart. |

## Testdelta

Före: 4230 tester, 24 fel (20 pre-existing + 4 nya från prompt-extraktion).
Efter: 4254 tester, 0 fel.

Nya tester: 17 prompt-lint-tester + 7 övriga.

Fixade: gemma3→gemma4 (×4), `.name`→`.displayName` (×3), async getPdfVisionPrompt (×1), auto-cross-ref fetch mock (×1), obsidian-export sidecar/speaker columns (×15).

## Kända risker

- `videoDesc` oanvänd variabel i `video.ts:812` — pre-existing, lätt att fixa
- Prompt-cache är process-scoped — redigering av promptfil under körande daemon kräver restart
- `AURORA_MODELS.fast === AURORA_MODELS.quality` — avsiktligt men kan förvirra

## Mönster etablerade

- **`as const` typed config:** Exportera konstant objekt med `as const`, importera och destructura vid behov. Inte en klass, inte en singleton, bara en fil.
- **Async lazy prompt cache:** `let cached: string | undefined; async function get() { if (!cached) cached = await readFile(...); return cached; }` — standardmönster nu för alla prompts.
- **`{{placeholder}}` substitution:** `template.replace('{{transcript}}', text)` — inga beroenden, läsbart, enkelt att testa.
- **Prompt lint tests:** `tests/prompts/prompt-lint.test.ts` verifierar att varje promptfil existerar och är icke-tom. Skyddar mot oavsiktlig radering.
