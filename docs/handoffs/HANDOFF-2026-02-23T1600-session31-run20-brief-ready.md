# Handoff — Session 31
**Datum:** 2026-02-23T16:00
**Körning:** #19 klar, #20 brief skapad men EJ körd
**Nästa:** Körning #20 — TypeScript-stresstest i `src/core/run.ts`

---

## Status vid avlämning

### Tester
```
npm test → 271/271 gröna (31 testfiler)
npx tsc --noEmit → 0 errors
Öppna ⚠️ i errors.md → 0
```

### Senaste commits
- `281063c` — feat: invariants.md + historian step 5 + patterns metadata + invariants-lint test

---

## Vad session 31 gjordes

### Körning #19 (klar ✅)
- `memory/invariants.md` skapad med INV-001 till INV-003
- `prompts/historian.md` uppdaterad: steg 5 "Check invariants" + `invariants` i Tools-listan
- `memory/patterns.md`: `**Körningar:**`-metadata på alla 16 mönster
- `tests/memory/invariants-lint.test.ts`: 4 tester
- Tester: 267 → 271, tokens: 1,41M

### Brief för körning #20 (skapad, EJ körd)
- Fil: `briefs/2026-02-23-run-orchestrator-refactor.md`
- Uppgift: refaktorera `src/core/run.ts`
- Typ: TypeScript-stresstest — första körningen med `src/`-ändringar

---

## Körning #20 — Vad som ska göras

### Brief-fil
```
briefs/2026-02-23-run-orchestrator-refactor.md
```

### Kör med
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-23-run-orchestrator-refactor.md --hours 1
```

### Vad brieven ber om
Tre förbättringar i `src/core/run.ts` (Researcher avgör prioritet):

1. **DRY-refaktor**: `initRun()` och `resumeRun()` har identisk init-kod (~8 rader) → extrahera till privat `_buildContext()`-metod

2. **`getTimeRemainingMs(ctx)`**: ny metod i RunOrchestrator, `isTimeExpired()` kan delegera till den. Returnerar ms kvar, 0 om tid gått ut.

3. **`COPY_SKIP_DIRS`-konstant**: ersätt hårdkodade if-satser i `copyDirectory()` med en namngiven array

### Begränsningar
- Ändringar BARA i `src/core/run.ts` och `tests/core/run.test.ts`
- `RunContext`-interface och publika metodsignaturer ska INTE ändras
- Acceptanskriterier: 271+ tester gröna, 0 ts-errors, commit

### Varför detta är ett stresstest
- Första körningen med TypeScript-källkod i `src/` (inte bara memory/tests)
- Researcher måste analysera och prioritera — inte bara följa checklista
- Tester behöver uppdateras för ny metod (`getTimeRemainingMs`)
- Reviewer måste bedöma refaktorerings-korrekthet (är _buildContext rätt abstraktionsnivå?)

---

## Viktiga filer att läsa
| Fil | Syfte |
|-----|-------|
| `src/core/run.ts` | Ska refaktoreras — 300 rader |
| `tests/core/run.test.ts` | Befintliga tester — uppdatera + lägg till |
| `src/core/types.ts` | RunContext, RunConfig — ÄNDRA EJ |
| `memory/invariants.md` | 3 invarianter — kolla om #20 avslöjar ny |

---

## Miljöpåminnelser
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm test                          # kör tester
npx tsc --noEmit                  # typkontroll
```
