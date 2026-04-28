---
session: 25
datum: 2026-04-28
---

# Session 25 — Dev Notes

## Ändringar

| Fil | Ändring |
|---|---|
| `.claude/skills/transkribera/SKILL.md` | NY — 7-stegs skill för tvåstegs-transkribering (draft→entities→re-transcribe) |
| `aurora-workers/mcp_server.py` | FIX — `extract_entities` Ollama-anrop: `"think": False` + `"num_predict": 1024` |
| `src/aurora/video.ts` | FIX — oanvänd `videoDesc` variabel borttagen (rad 812) |

## Beslut och tradeoffs

| Beslut | Varför |
|---|---|
| `think: false` för Gemma4 entity extraction | Thinking-mode i Gemma4 konsumerar `num_predict`-budget internt. Med `format: "json"` leder det till oändliga repetitionsloopar. Thinking tillför inget för strukturerad JSON-extraktion. |
| `num_predict: 1024` | Entity-output är ~200-500 chars. 1024 tokens ger 4x marginal och förhindrar runaway om `think: false` slutar fungera. |
| Skill kallar `aurora-media` MCP-tools direkt | `aurora_ingest_video` exponerar inte `initial_prompt`. Skillen måste anropa `transcribe_audio` direkt för att skicka entitets-derived prompt i andra passet. |
| Ingen standalone briefing-skill | `researcha-amne` och `kunskapscykel` använder redan `aurora_briefing`. En wrapper hade inte tillfört något. |

## Testdelta

Ingen ändring: 319 filer, 4254 tester, 0 fel.
Inga nya tester (skill = .md-fil, Python-fix utanför TS test scope).

## Kända risker

- `think: false` är Ollama-specifikt — kan behöva justeras om Ollama ändrar API
- 224-char initial_prompt-gräns ej verifierad mot WhisperX-källa
- Gemma4 entity-kvalitet ej perfekt ("ISO 2626,2" istf "ISO 26262") — mitigeras av steg 4 (user review)

## Mönster etablerade

- **Gemma4 + `format: "json"` kräver `think: false`**: Utan det fastnar modellen i repetitionsloop. Gäller `/api/generate`-endpointen. `/api/chat` separerar thinking i ett eget fält men har samma budget-problem.
- **Skill-filformat**: YAML frontmatter (`name`, `description`), sedan sektioner: "När ska denna skill användas?", "Steg" (numrerade), "Input", "Output", "Mönster", "MCP-servrar som används". Se `indexera-youtube/SKILL.md` som referens.
- **Diagnostik av Ollama-problem**: Testa via `/api/chat` (visar `thinking` vs `content` separat) för att förstå var tokens går. `/api/generate` blandar allt i `response`.

| Tid | Typ | Vad |
|-----|-----|-----|
| 00:15 | ORIENT | Läs handoff, baseline, utforska befintliga skills |
| 00:30 | FIX | `videoDesc` unused variable |
| 00:45 | EXPLORE | 2x parallel explore agents (extract_entities, transcription pipeline) |
| 01:30 | FEAT | Skriv `.claude/skills/transkribera/SKILL.md` |
| 02:00 | TEST | `extract_entities` mot live Ollama — upptäckt degeneration |
| 02:45 | DEBUG | 5 iterationer: num_predict, repeat_penalty, chat API, think:false |
| 03:00 | FIX | `mcp_server.py` — `think: false` + `num_predict: 1024` |
| 03:15 | VERIFY | Typecheck + full test suite (4254/4254) |
| 03:30 | AUDIT | Tier 2 — utredning visade att briefing/contradiction redan gjorda |
| 03:45 | DOCS | Handoff, release notes, dagböcker, changelog |

### Baseline

typecheck: PASS — 0 errors
tests: PASS — 319 files, 4254 tests, 0 failures (unchanged from session start)
