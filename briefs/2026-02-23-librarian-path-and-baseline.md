# Brief: Fix Librarian-sökvägsproblem + baseline-rutin i runbook
**Datum:** 2026-02-23
**Target:** neuron-hq
**Verify:** `npm test`

---

## Bakgrund

Läs `memory/errors.md` och `memory/patterns.md` innan du börjar.

Körning #9 har två syften:

1. **Verifiera att runDir-fixar fungerar** — run-artefakter (report.md, questions.md, etc.) ska hamna i `runs/<runid>/`, INTE i workspace. Historian ska kunna läsa dem.

2. **Åtgärda två dokumenterade ⚠️ från errors.md** — Librarian-sökvägsproblem och saknad baseline-rutin.

---

## Uppgifter

### Uppgift 1 — `prompts/manager.md`: Manager vet var Librarian-output hamnar

**Problem (från errors.md):** Manager letade efter `techniques.md` i workspace-katalogen (`workspaces/.../memory/techniques.md`) trots att Librarian korrekt skriver till det **delade** minnet (`memory/techniques.md` i neuron-hq-roten).

**Åtgärd:** Lägg till ett avsnitt i manager.md som förklarar:
- Librarians output finns i `memory/techniques.md` i neuron-hq-roten — INTE i workspace
- Använd `read_file` med absolut sökväg till `memory/techniques.md`, inte workspace-relativ
- Returnera en bekräftelse till Manager om vad Librarian hittade — Manager ska inte leta efter filen i onödan

**Var:** I avsnittet om Librarian-delegation (efter `delegate_to_librarian`-verktyget beskrivs).

---

### Uppgift 2 — `docs/runbook.md`: Baseline-verifiering som del av brief-skapandet

**Problem (från errors.md):** Briefen för körning #7 baserades på inaktuell data (ruff-fel som redan var fixade). Baseline kördes vid körningens start men INTE vid brief-skapandet.

**Åtgärd:** Lägg till ett avsnitt i `docs/runbook.md` under "Skapa en Brief" (eller skapa det avsnittet om det saknas) med:
1. Kör alltid baseline direkt när du ska skriva en brief: `npm test` / `python -m pytest` / `ruff check .`
2. Kopiera faktisk output till briefen — inte cachade resultat
3. Datum-stämpla varje baseline-körning i briefen

**Var:** I befintlig runbook, lägg till `## Baseline-verifiering vid brief-skapande` som nytt avsnitt.

---

### Uppgift 3 — `tests/agents/manager.test.ts`: Test för att runDir exponeras

**Problem:** Det finns inga tester som verifierar att `runDir` faktiskt är tillgänglig i Manager-agentens context. Session 21-fixarna gjordes utan tester.

**Åtgärd:** Skapa eller utöka `tests/agents/manager.test.ts` med tester som verifierar:
- Manager-agentens `buildSystemPrompt()` (eller ekvivalent) inkluderar `runDir` i context
- `runDir` är absolut sökväg (börjar med `/`)
- Om `runDir` inte är satt — ger ett tydligt felmeddelande

Läs den befintliga `src/core/agents/manager.ts` för att förstå hur context byggs.

---

## Acceptanskriterier

- [ ] `prompts/manager.md` har ett avsnitt om Librarian-output i delat minne (inte workspace)
- [ ] `docs/runbook.md` har ett `## Baseline-verifiering vid brief-skapande`-avsnitt
- [ ] `tests/agents/manager.test.ts` finns och har minst 2 tester för runDir-exponering
- [ ] `npm test` passerar — fler tester gröna än 330
- [ ] Inga TypeScript-kompileringsfel

---

## Avgränsning

- Ändra INTE core TypeScript-logik i `src/` utöver vad som krävs för testerna
- Ändra INTE `policy/`, `targets/`, eller promptfiler utöver `prompts/manager.md`
- Inga beroenden får läggas till
- Inga befintliga tester får brytas

---

## Rollfördelning (förslag)

- **Researcher:** Läs errors.md (Librarian-sökvägsproblemet + brief-baseline-felet). Läs manager.ts och manager.md för att förstå context-byggandet. Dokumentera exakt vilka meningar som ska läggas till var.
- **Implementer:** Gör ändringarna i manager.md, runbook.md och manager.test.ts.
- **Tester:** Kör `npm test` och bekräfta att alla tester är gröna.
- **Reviewer:** Verifiera varje acceptanskriterium med grep mot de ändrade filerna.
- **Merger:** Committa med `fix: manager Librarian path, baseline runbook, runDir tests`.
- **Historian:** Uppdatera errors.md — stäng ⚠️ för Librarian-sökvägsproblem och brief-baseline. Skriv körningssammanfattning till runs.md.
