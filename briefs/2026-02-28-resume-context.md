# Brief: Resume-kontext — Bevara tillstånd vid e-stop och resume

## Bakgrund

E-stop (session 47) och resume fungerar, men det finns tre problem:

1. **Meddelandehistorik försvinner.** När Manager startar om vid resume börjar den med tom
   konversation. Den vet inte vad den gjorde innan e-stop.

2. **STOP-filen raderas inte automatiskt.** Användaren måste köra `rm STOP` manuellt.
   Om hen glömmer misslyckas nästa körning direkt.

3. **Ingen handoff vid e-stop.** Manager har ingen chans att skriva en sammanfattning av
   var den befinner sig — den kastas ut abrupt.

**Problem:** Resume-körningar saknar kontext och riskerar att upprepa arbete eller missa halvfärdiga steg.

## Scope

Tre förbättringar: STOP-fil auto-radering, handoff vid e-stop, och kontextladdning vid resume.

## Uppgifter

### 1. Auto-radera STOP-filen vid resume

I `src/commands/resume.ts`, innan Manager startar:

```typescript
const stopPath = path.join(baseDir, 'STOP');
try {
    await fs.unlink(stopPath);
    console.log(chalk.yellow('Removed STOP file from previous e-stop.'));
} catch {
    // STOP file doesn't exist — that's fine
}
```

### 2. Skriv handoff vid e-stop

I `src/commands/run.ts`, i EstopError-catchblocket (rad ~145–156), skriv en minimal handoff:

```typescript
if (runError instanceof EstopError) {
    // Write e-stop handoff
    const handoffPath = path.join(ctx.runDir, 'estop_handoff.md');
    await fs.writeFile(handoffPath, [
        '# E-Stop Handoff',
        '',
        `**Run ID:** ${runid}`,
        `**Stopped at:** ${new Date().toISOString()}`,
        `**Target:** ${target.name}`,
        '',
        '## State at stop',
        '- Workspace changes are preserved (uncommitted)',
        '- Check `git diff` in workspace for current state',
        '- Check `audit.jsonl` for last completed action',
        '',
    ].join('\n'));
    // ... existing console.log and exit
}
```

### 3. Ladda föregående kontextfiler vid resume

I `src/commands/resume.ts`, innan Manager startar, läs och injicera föregående runs artefakter
som kontext. Uppdatera `ctx` med:

```typescript
// Load previous run context
const prevRunDir = path.join(baseDir, 'runs', oldRunId);
const contextParts: string[] = ['# Previous Run Context\n'];

// Read estop handoff if exists
const estopHandoff = await tryRead(path.join(prevRunDir, 'estop_handoff.md'));
if (estopHandoff) contextParts.push('## E-Stop Handoff\n' + estopHandoff);

// Read implementer handoff if exists
const implHandoff = await tryRead(path.join(prevRunDir, 'implementer_handoff.md'));
if (implHandoff) contextParts.push('## Implementer Progress\n' + implHandoff);

// Read reviewer handoff if exists
const revHandoff = await tryRead(path.join(prevRunDir, 'reviewer_handoff.md'));
if (revHandoff) contextParts.push('## Reviewer Feedback\n' + revHandoff);

// Inject as additional context for Manager
ctx.previousRunContext = contextParts.join('\n---\n');
```

Och i `src/core/agents/manager.ts`, inkludera `ctx.previousRunContext` i system-prompten
om den finns.

### 4. Tester

Skriv tester i `tests/commands/resume-context.test.ts`:

1. STOP-fil raderas vid resume-start
2. `estop_handoff.md` skrivs vid e-stop
3. Handoff innehåller run ID och timestamp
4. Resume läser föregående `estop_handoff.md`
5. Resume läser föregående `implementer_handoff.md` (om den finns)
6. Resume utan STOP-fil kastar inte fel
7. Resume utan föregående handoffs fungerar (tom kontext)

## Acceptanskriterier

- [ ] STOP-fil raderas automatiskt vid resume
- [ ] `estop_handoff.md` skrivs vid e-stop
- [ ] Resume laddar kontext från föregående körning
- [ ] Manager-prompten inkluderar `previousRunContext` om den finns
- [ ] 6+ tester i `tests/commands/resume-context.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Ändrar resume-flödet och lägger till ny kontextinjicering i Manager. Men alla
ändringar är additiva — befintligt beteende ändras inte om filer saknas (graceful fallback).

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 474 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-resume-context.md --hours 1
```
