# Brief — Körning #22: Uppdatera merger-lint.test.ts

**Datum:** 2026-02-23
**Target:** neuron-hq
**Kategori:** Testkvalitet (prompt-lint)

---

## Bakgrund

`prompts/merger.md` uppdaterades i körning #21 och direktfixar (commits `9f68e1e`, `6c6b2a5`):

- PLAN-fasen har nu **7 steg** (tidigare 6) — steg 4 "List changed files" lades till
- Steg 3 ändrades: `diff` är nu det rekommenderade verifieringsverktyget (tillåtet sedan #21)
- Steg 2 specificerar `git diff HEAD~1` för workspace-inspektion
- Steg 7 returnerar `MERGER_PLAN_READY`

`tests/prompts/merger-lint.test.ts` har 6 tester — men **ingen** testar det nya steg-innehållet. De befintliga testerna skyddar bara `PLAN/EXECUTE`, `APPROVED`, `copy_to_target`, `force push`. Om steg 2–3 raderades skulle testerna inte reagera.

---

## Uppgift

Lägg till 3 nya tester i `tests/prompts/merger-lint.test.ts` som vaktar det nya innehållet:

1. **`uses diff for base-file verification`** — kontrollerar att `diff` finns i prompten som verifieringskommando (inte bara som git diff)
2. **`uses git diff HEAD~1 for workspace inspection`** — kontrollerar att `git diff HEAD~1` finns
3. **`returns MERGER_PLAN_READY signal`** — kontrollerar att `MERGER_PLAN_READY` finns (steg 7)

Befintliga 6 tester ska vara **oförändrade**.

---

## Acceptanskriterier

1. `tests/prompts/merger-lint.test.ts` har 9 tester (6 befintliga + 3 nya)
2. Alla 3 nya tester använder `.toMatch()` mot `prompt`-variabeln
3. `npm test` → alla 280 tester gröna (277 + 3 nya)
4. `npx tsc --noEmit` → 0 errors
5. Git commit

---

## Begränsningar

- Ändringar **bara** i `tests/prompts/merger-lint.test.ts`
- Inga ändringar i `prompts/merger.md` eller andra filer
- Researcher behöver bara läsa `tests/prompts/merger-lint.test.ts` och `prompts/merger.md`

---

## Filer att läsa

| Fil | Vad du letar efter |
|-----|-------------------|
| `tests/prompts/merger-lint.test.ts` | Befintlig teststruktur |
| `prompts/merger.md` | Exakt text att matcha i de nya testerna |
