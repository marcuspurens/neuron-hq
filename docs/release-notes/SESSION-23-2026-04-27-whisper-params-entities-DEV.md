---
session: 23
datum: 2026-04-27
---

# Session 23 — Dev Notes

## Ändringar

| Fil | Ändring |
|---|---|
| `aurora-workers/mcp_server.py` | 3 nya params på `transcribe_audio`, default float32, compute_type-tracking i MediaState, nytt `extract_entities` tool |
| `src/aurora/media-client.ts` | Wrapper uppdaterad med nya params, `extractEntities()` tillagd |
| `docs/aurora-media-mcp-*.md` (×4) | Ny dokumentation i fyra varianter |

## Beslut och tradeoffs

| Beslut | Varför |
|---|---|
| float32 som default | Marcus vill ha kvalitet. Whisper tränades i float16, float32 är marginallt bättre men Marcus var explicit. |
| Gemma 4 istället för GLiNER | Redan installerad, förstår kontext, inget nytt beroende. GLiNER (0.86 F1 på svenska) övervägdes men avfärdades. |
| Ingen smart-wrapper | Filosofisk ändring: pipeline-logik ska vara skills (.md), inte kod. Skill skapas i nästa session. |
| MediaState.whisper_compute_type | Utan detta laddades modellen om vid varje float32-anrop (10-30s overhead). |

## Testdelta

Inga nya tester. Syntax + LSP OK.

## Kända risker

- `extract_entities` ej livetestat — Ollama JSON-format kan ge oväntade svar
- 224-teckens initial_prompt-gräns är en uppskattning
- Skills-audit identifierade 16 filer med hardkodad LLM-logik — teknisk skuld som växer
