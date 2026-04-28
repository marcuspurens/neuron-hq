---
session: 25
date: 2026-04-28
variant: llm
---

# Session 25 — Transkribera Skill + extract_entities Gemma4 Fix

## Changes

| File | Change |
|---|---|
| `.claude/skills/transkribera/SKILL.md` | NEW — 7-step two-pass transcription pipeline skill (draft→entities→re-transcribe) |
| `aurora-workers/mcp_server.py` | FIX — `extract_entities` Ollama call: added `"think": False` + `"num_predict": 1024` to prevent Gemma4 degeneration |
| `src/aurora/video.ts` | FIX — removed unused `videoDesc` variable at line 812 |

## New/Changed Interfaces

No TypeScript interface changes. The Python MCP tool `extract_entities` has the same external interface — only internal Ollama call parameters changed.

## Design Decisions

| Decision | Rationale |
|---|---|
| `think: false` on Gemma4 generate calls | Gemma4's thinking mode consumes `num_predict` budget internally, causing infinite repetition with `format: "json"`. Disabling thinking for structured extraction tasks is the correct fix — thinking adds no value for JSON entity extraction. |
| `num_predict: 1024` as safety cap | Entity extraction output is ~200-500 chars. 1024 tokens provides 4x headroom while preventing runaway generation if `think: false` ever stops working. |
| Skill uses `aurora-media` MCP tools directly, not `aurora_ingest_video` | `aurora_ingest_video` goes through the job queue and doesn't expose `initial_prompt`. The skill must call `transcribe_audio` directly to pass entity-derived `initial_prompt` for the second pass. |
| Optional user review step (step 4) | LLM entity extraction is imperfect (e.g., "ISO 2626,2" instead of "ISO 26262"). User review mitigates hallucination risk without blocking the pipeline. |
| Standalone briefing skill NOT created | `researcha-amne` and `kunskapscykel` already use `aurora_briefing` as their final step. A standalone wrapper would add no value. |
| Memory contradiction prompt extraction NOT done | Already completed in session 24 — `prompts/memory-contradiction.md` exists, `memory.ts:30` loads it. |

## Test Delta

Before: 319 files, 4254 tests, 0 failures.
After: 319 files, 4254 tests, 0 failures.
No new tests added (skill is a .md file, Python change is in worker process outside TS test scope).

## Known Issues

- 224-char `initial_prompt` limit not verified against WhisperX source code — works in practice, based on estimate
- Gemma4 entity extraction quality is imperfect — "ISO 2626,2 standarden" instead of "ISO 26262" observed in testing. Step 4 (user review) mitigates.
- `think: false` is Ollama-specific — if Ollama API changes, this parameter may need updating
- Two-pass pipeline not tested end-to-end on a real video yet — each component verified separately

## Verification

- `pnpm typecheck`: PASS — 0 errors
- `pnpm test`: PASS — 319 files, 4254 tests, 0 failures
- `extract_entities` tested live against Ollama gemma4:26b — 10 entities (short), 28 entities (long), valid JSON, ≤224 chars, `done_reason: stop`

## Next

1. End-to-end test of the two-pass pipeline on a real video
2. Copy release notes to Obsidian vault `Neuron Lab/Release Notes/`
3. Verify 224-char limit against WhisperX source code
4. Consider skill-lint tests (`.claude/skills/*/SKILL.md` existence + YAML frontmatter)

Handoff: `docs/handoffs/HANDOFF-2026-04-28-opencode-session25-transkribera-skill.md`
