# HANDOFF-2026-03-23T0930 — Session 132

## Gjort

### 1. Fixat 2 kända testfel
- **model-config-policy** — testet förväntade sig Opus-overrides, uppdaterat till tom `agent_models: {}` (S128 Sonnet-for-all)
- **historian-interview-lint** — "max 1 iteration" ersatt med aktuell prompt-text (S116 anti-pattern borttaget)
- Commit: `21a38d5`

### 2. Körning 3.1 — Reviewer severity levels 🟢
- **Run ID:** 20260323-0645-neuron-hq
- **Tokens:** 11.4M ($36.34) — bra! Ner från 20M pre-optimering
- **AC:** 21/21 ✅ | **Tester:** 3814 GREEN
- ReviewFindingSchema med BLOCK/SUGGEST/NOTE
- Reviewer/Implementer/Manager-prompter uppdaterade
- manager.ts: audit-loggning + FINDINGS-injektion
- Bakåtkompatibilitet via `.default([])`
- ROADMAP 3.1 ✅ markerad
- Commit: `c5e2403` + `17eab9f`

### 3. Historian-bugg upptäckt och fixad
- **Problem:** Historian körde ALDRIG i körning 3.1 — Manager glömde delegera
- **Rotorsak:** Manager-prompten hade Historian-instruktioner bara i `<!-- ARCHIVE -->`-block. Ingen explicit instruktion i standardflödet.
- **Fix:** Flyttade Historian från Manager-delegering till **orchestratorn (run.ts)**
  - Historian körs nu automatiskt efter Manager, FÖRE Observer-retro
  - Observer kan intervjua Historian i retro
  - `delegate_to_historian` borttagen från Manager (tool + handler + metod)
  - En ägare, noll risk att glömmas
- Commit: `8badff7`

## Status

| Mått | Värde |
|------|-------|
| Tester | 3814 (alla gröna) |
| Körningar | 178 |
| Branch | swarm/20260322-1724-neuron-hq |
| Commits denna session | 5 |

## Nästa steg

1. **Bolla brief för 3.2 A-MEM** — agentdriven minnesreorganisering
2. Observer-retro-fixen (S131) bör vara committad redan — verifiera
3. Överväg: bör Consolidator också flyttas till orchestratorn? (Samma mönster som Historian)

## Relevanta filer

- `src/commands/run.ts` — Historian-anrop i orchestratorn (rad ~275)
- `src/core/agents/manager.ts` — delegate_to_historian borttagen
- `prompts/manager.md` — Historian-instruktioner borttagna
- `runs/20260323-0645-neuron-hq/` — körning 3.1 artefakter
- `runs/20260323-0645-neuron-hq/prompt-health-2026-03-23T0746.md` — prompt-health (Historian saknas)
