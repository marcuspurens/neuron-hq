# Brief: E-stop polish — resume.ts + STOP-check vid start

## Bakgrund

E-stop implementerades i körning `20260227-0923-neuron-hq` (commit `36af36c`). Det finns
två kvarvarande luckor som idé #2 och #8 i ideas.md identifierade:

1. **`resume.ts` hanterar inte `EstopError`** — om STOP triggas under en resumed körning
   faller det igenom till generisk felhanterare istället för att visa ⛔-meddelandet.
2. **Ingen STOP-kontroll vid körningsstart** — om användaren glömt ta bort STOP-filen
   från förra körningen startar nästa körning och stoppar omedelbart utan tydlig varning.

## Uppgift

### Del 1: EstopError i resume.ts

Lägg till EstopError-hantering i `src/commands/resume.ts` — kopiera mönstret från
`src/commands/run.ts` (rad 95–106).

```typescript
// I resume.ts, runt manager.run()-anropet:
try {
  await manager.run();
} catch (runError) {
  if (runError instanceof EstopError) {
    console.log(chalk.red('\n⛔ Run stopped by user (STOP file detected). Run ID: ' + newRunId));
    const reportPath = path.join(ctx.runDir, 'report.md');
    try { await fs.access(reportPath); } catch {
      await fs.writeFile(reportPath, '# STOPPED BY USER\n\nRun was stopped via STOP file.\n');
    }
    process.exit(1);
  }
  throw runError;
}
```

### Del 2: STOP-kontroll vid körningsstart

Lägg till en kontroll i `src/commands/run.ts` (i `runCommand`, innan körning startar)
som varnar om STOP-filen redan finns:

```
⚠️  STOP file exists from a previous session.
    Remove it before starting a new run:
    rm /path/to/neuron-hq/STOP
```

Körningen ska **avbrytas** om STOP-filen finns — inte ignoreras.

### Del 3 (valfri, trivial): Kommentar i forbidden_patterns.txt

Lägg till en kommentarsrad som dokumenterar att STOP-filen är read-only för orchestratorn:

```
# STOP file (e-stop): orchestrator only READS this file — users create/remove it manually.
# See docs/runbook.md for e-stop usage.
```

## Acceptanskriterier

- [ ] `src/commands/resume.ts`: Fångar `EstopError`, visar ⛔-meddelande identiskt med `run.ts`
- [ ] `src/commands/run.ts`: Kontrollerar om `STOP` finns innan körning startar, avbryter med tydligt felmeddelande
- [ ] `tests/commands/resume.test.ts` eller `tests/core/run.test.ts`: Test för EstopError i resume
- [ ] Test för STOP-kontroll vid start
- [ ] (Valfri) `policy/forbidden_patterns.txt`: Kommentarsrad tillagd

## Vad som INTE ska ändras

- `src/core/run.ts` — `checkEstop()` och `EstopError` är redan korrekt implementerade
- `src/core/agents/manager.ts` — redan korrekt
- `docs/runbook.md` — redan uppdaterad

## Risk

Low — inga strukturella ändringar. Kopierar bevisat mönster från `run.ts`. Rollback:
`git revert <hash>` om något är fel.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 373 passed.
