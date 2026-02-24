# Brief — META_ANALYSIS auto-trigger i kod

**Datum:** 2026-02-24
**Target:** neuron-hq
**Estimerad risk:** LOW
**Estimerad storlek:** 30–50 rader

---

## Bakgrund

Körning #28 lade till `⚡ Meta-trigger:` i `prompts/manager.md` — Manager ska trigga
Researcher i META_ANALYSIS-läge var 10:e körning. Men triggern kräver att brifen
innehåller raden `⚡ Meta-trigger:`, och ingen kod lägger dit den automatiskt.

Resultatet: META_ANALYSIS triggas aldrig i praktiken eftersom ingen skriver in raden manuellt.

---

## Mål

Lägg till kod i `src/core/run.ts` som räknar befintliga körningar och automatiskt
injicerar `⚡ Meta-trigger: META_ANALYSIS` i briefen var 10:e körning — innan
Manager tar emot den.

---

## Acceptanskriterier

1. `src/core/run.ts` räknar antal kataloger i `runs/` (exkl. resume-körningar med `-resume`-suffix)
2. Om `runCount % 10 === 0` och `runCount > 0` läggs raden `⚡ Meta-trigger: META_ANALYSIS` till i briefinnehållet
3. Triggern injiceras i `initRun()` eller motsvarande, innan brief skickas till Manager
4. `npm test` → alla tester passerar
5. `npx tsc --noEmit` → 0 errors
6. Ny testfil eller utökad `tests/core/run.test.ts` med ≥3 tester som verifierar:
   - Trigger injiceras vid körning 10, 20, 30
   - Trigger injiceras INTE vid körning 9, 11, 15
   - Resume-körningar räknas inte (kataloger med `-resume` hoppas över)

---

## Berörda filer

**Nya filer:**
- Inga

**Ändrade filer:**
- `src/core/run.ts` — lägg till run-räknare + brief-injektion i initRun()
- `tests/core/run.test.ts` — nya tester för auto-trigger-logiken

---

## Tekniska krav

```typescript
// Räkna körningar i runs/ — exkludera -resume-suffix
function countCompletedRuns(runsDir: string): number {
  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory() && !e.name.endsWith('-resume')).length;
}

// Injicera trigger i briefinnehåll om det är var 10:e körning
function maybeInjectMetaTrigger(briefContent: string, runCount: number): string {
  if (runCount > 0 && runCount % 10 === 0) {
    return briefContent + '\n\n⚡ Meta-trigger: META_ANALYSIS';
  }
  return briefContent;
}
```

- Räkning sker mot `runs/`-katalogen (inte workspace)
- Ny körning som precis initierats räknas INTE (räkna befintliga före start)
- Resume-körningar (suffix `-resume`) exkluderas från räkning

---

## Commit-meddelande

```
feat: auto-inject Meta-trigger in brief every 10th run
```
