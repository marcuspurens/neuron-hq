# Brief: initRun + finalizeRun tester
**Datum:** 2026-02-24
**Target:** neuron-hq
**Körning:** #24

---

## Bakgrund

`tests/core/run.test.ts` har 17 tester idag. De täcker `countMemoryRuns`, `isTimeExpired`,
`getTimeRemainingMs`, `generateRunId`, `resumeRun` och `COPY_SKIP_DIRS`.

**Otestade:** `initRun` och `finalizeRun` — de viktigaste metoderna i hela orchestratorn.
Det är dem som skapar workspace, kopierar repot, skriver artefakter och stänger körningen.

---

## Uppgifter

Lägg till **6 nya tester** i `tests/core/run.test.ts`. Inga ändringar i produktionskod.

---

### describe('RunOrchestrator.initRun') — 3 tester

Använd ett lokalt source-dir (tmpDir med en fil) som `target.path`.
Testa med `target.path` som lokal katalog (inte URL) — `prepareWorkspace` kör då
`copyDirectory` + `GitOperations.initWorkspace`.

```typescript
it('creates workspace directory at correct path')
// ctx.workspaceDir === path.join(baseDir, 'workspaces', runid, targetName)
// Verifiera att katalogen existerar: await fs.access(ctx.workspaceDir)

it('creates run directory at correct path')
// ctx.runDir === path.join(baseDir, 'runs', runid)
// Verifiera att katalogen existerar: await fs.access(ctx.runDir)

it('sets endTime to approximately hours from now')
// ctx.endTime ≈ Date.now() + hours * 3600 * 1000
// Verifiera: Math.abs(ctx.endTime.getTime() - (Date.now() + 1 * 3600_000)) < 5000
```

**Setup-mönster för initRun-tester:**
```typescript
const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-source-'));
await fs.writeFile(path.join(sourceDir, 'README.md'), '# test source');
const briefFile = path.join(baseDir, 'brief.md');
await fs.writeFile(briefFile, '# Test Brief\n\nTest content.');

const orch = new RunOrchestrator(baseDir, mockPolicy);
const runid = '20260101-0000-test' as RunId;
const config: RunConfig = {
  runid,
  target: { name: 'test-target', path: sourceDir, default_branch: 'main' },
  hours: 1,
  brief_path: briefFile,
};
const ctx = await orch.initRun(config);
```

---

### describe('RunOrchestrator.finalizeRun') — 3 tester

Kör `initRun` för att få ett riktigt `RunContext`, sedan `finalizeRun`, sedan verifiera artefakter.

```typescript
const stoplight: StoplightStatus = {
  baseline_verify: 'PASS',
  after_change_verify: 'PASS',
  diff_size: 'OK',
  risk: 'LOW',
  artifacts: 'COMPLETE',
};

it('writes report.md to runDir')
// Kör finalizeRun(ctx, stoplight, '# Test Report')
// Verifiera: report.md finns i ctx.runDir och innehåller '# Test Report'

it('writes usage.json to runDir')
// Kör finalizeRun(ctx, stoplight, '')
// Verifiera: usage.json finns i ctx.runDir

it('writes redaction_report.md to runDir')
// Kör finalizeRun(ctx, stoplight, '')
// Verifiera: redaction_report.md finns i ctx.runDir
```

---

## Imports att lägga till

```typescript
import { type RunConfig, type StoplightStatus } from '../../src/core/types.js';
```

---

## Baseline (verifierad 2026-02-24)

```
npm test → 286 passed (286), 31 test files
npx tsc --noEmit → 0 errors
```

Nuvarande tester i `tests/core/run.test.ts`: 17 st.

---

## Acceptanskriterier

1. `tests/core/run.test.ts` har **23 tester** (17 befintliga + 6 nya)
2. `npm test` → **292 passed** (286 + 6)
3. `npx tsc --noEmit` → **0 errors**
4. 3 tester för `initRun` verifierar: workspace-sökväg, run-sökväg, endTime
5. 3 tester för `finalizeRun` verifierar: report.md, usage.json, redaction_report.md
6. Bara `tests/core/run.test.ts` ändras — ingen produktionskod rörs
7. Git commit: `test: add initRun and finalizeRun integration tests`

---

## Begränsningar

- Rör **bara** `tests/core/run.test.ts`
- Ingen refaktorering av befintlig kod
- Inga ändringar i produktionslogik
