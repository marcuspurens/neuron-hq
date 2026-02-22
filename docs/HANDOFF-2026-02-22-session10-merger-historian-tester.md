# Handoff — Session 10: Merger, Historian, Tester

**Datum:** 2026-02-22
**Branch:** swarm/20260222-0032-aurora-swarm-lab (neuron-hq, ej mergad)

---

## Vad gjordes i session 10

Alla tre prioriteringar från session 9 implementerades:

### 1. Merger-agent
- `prompts/merger.md` + `src/core/agents/merger.ts`
- Tvåfas-logik: PLAN (skriver merge_plan.md, väntar på godkännande) och EXECUTE (kopierar + committar)
- Fas detekteras automatiskt via `runs/<runid>/answers.md` (APPROVED → execute)
- Verktyg: `bash_exec`, `bash_exec_in_target`, `read_file`, `write_file`, `copy_to_target`
- 16 tester i `tests/agents/merger.test.ts`

### 2. Historian-agent
- `prompts/historian.md` + `src/core/agents/historian.ts`
- Körs sist, läser run-artefakter, skriver summering till `memory/swarm-log.md`
- Specialverktyg: `append_to_swarm_log` — hanterar append-logiken i TypeScript
- Skapar swarm-log.md med header om filen saknas
- 8 tester i `tests/agents/historian.test.ts`

### 3. Tester-agent
- `prompts/tester.md` + `src/core/agents/tester.ts`
- Oberoende av Implementer — vet ingenting om vad Implementer gjorde
- Identifierar testramverk (pytest, vitest, jest, make), kör hela sviten, skriver `test_report.md`
- Inkluderar stderr i output (test runners skriver ofta dit)
- 10 tester i `tests/agents/tester.test.ts`
- Tillägg: `python -m pytest` lades till i `policy/bash_allowlist.txt`

### 4. Manager uppdaterad
- `delegate_to_merger`, `delegate_to_historian`, `delegate_to_tester` tillagda
- Totalt 6 delegation-verktyg

### Status
- 13 testfiler, 97 tester — alla gröna
- Inga TypeScript-fel

---

## Kodkvalité — öppen fråga

Användaren frågade: *"Hur kan Neuron HQ skriva toppkvalité kod?"*

**Nuläge:**
- Implementer-prompten säger "readable over clever" men inga konkreta krav
- Reviewer verifierar att filer *finns* och tester *passerar* — men inte kodkvalité
- Tester rapporterar pass/fail men inte täckningsgrad

**Identifierade förbättringar (ej implementerade ännu):**

### A. Implementer-prompt: explicit kvalitetskrav
Lägg till en obligatorisk checklista:
- Typannoteringar på alla funktioner (Python: type hints, TS: explicit types)
- Docstrings på publika funktioner/klasser
- Funktioner max ~40 rader
- Tester *skrivs* för ny funktionalitet (TDD-anda om möjligt)
- Kör `ruff check .` / `mypy` / `tsc --noEmit` och fixa innan du är klar

### B. Reviewer: statisk analys som blockerande krav
Reviewer kör redan `bash_exec` — lägg till:
```
Criterion: ruff lint passes
Command: ruff check .
Output: All checks passed
Status: ✅ VERIFIED
```
Om ruff/mypy failar → ❌ BLOCK, be Implementer fixa.

### C. Tester: täckningsrapport
```
python -m pytest tests/ --cov=app --cov-report=term-missing
npx vitest run --coverage
```
Rapportera täckning i `test_report.md`. Flagga om < 80%.

**Prioritetsordning (förslag):**
1. Uppdatera `prompts/implementer.md` med explicit kvalitetslista (låg insats, stor effekt)
2. Lägg till statisk analys i `prompts/reviewer.md` (medel insats, hög effekt)
3. Täckningsrapport i Tester (låg insats, informativ)

---

## Vad nästa session ska fokusera på

### Alternativ A: Kodkvalité (rekommenderat om nästa körning ska producera bra kod)
1. Uppdatera `prompts/implementer.md` — explicit kvalitetslista
2. Uppdatera `prompts/reviewer.md` — statisk analys som blockerande krav
3. Uppdatera `prompts/tester.md` + `src/core/agents/tester.ts` — täckningsrapport

### Alternativ B: Göra en riktig swarm-körning
Testa alla nya agenter i en faktisk körning mot aurora-swarm-lab.
- Skapa en brief för något konkret (vad?)
- Kör: `npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/2026-02-22-xxx.md --hours 2`
- Observera hur Merger, Historian och Tester beter sig i verkligheten

### Alternativ C: Merga session 10-branchen
Branch `swarm/20260222-0032-aurora-swarm-lab` är ej mergad. Merga till main.

---

## Miljö-påminnelse

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test                    # 97 tester ska vara gröna
```

---

## Nästa session startar med

1. Läs denna handoff
2. Fråga användaren: Alternativ A (kvalité), B (körning), eller C (merge)?
3. Läs relevanta prompts innan du ändrar dem
