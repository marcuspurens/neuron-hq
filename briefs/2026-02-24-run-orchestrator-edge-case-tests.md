# Brief: run.ts edge-case tester — generateRunId + resumeRun
**Datum:** 2026-02-24
**Target:** neuron-hq
**Körning:** #23

---

## Bakgrund

`tests/core/run.test.ts` har 11 tester idag — alla för `countMemoryRuns`, `isTimeExpired` och `getTimeRemainingMs`. Tre viktiga delar av `RunOrchestrator` saknar helt testtäckning:

1. `generateRunId()` — ren stränglogik, noll tester
2. `resumeRun()` — kritisk felhantering (kast vid saknat workspace, brief-fallback), noll tester
3. `COPY_SKIP_DIRS` — konstanten är aldrig verifierad i test

---

## Uppgifter

Lägg till **6 nya tester** i `tests/core/run.test.ts`. Inga ändringar i produktionskod.

### describe('RunOrchestrator.generateRunId') — 2 tester

```typescript
it('returns id matching YYYYMMDD-HHMM-slug format')
// Verifiera: /^\d{8}-\d{4}-my-slug$/.test(id) === true

it('includes provided slug in run ID')
// Verifiera: id innehåller den slug som skickas in
```

**Notera:** `new RunOrchestrator(tmpDir, mockPolicy)` — mockPolicy behövs inte för dessa tester,
men konstruktorn kräver båda argumenten. Använd en minimal mock:
```typescript
const mockPolicy = { getLimits: () => ({ verification_timeout_seconds: 30 }) } as unknown as PolicyEnforcer;
```

---

### describe('RunOrchestrator.resumeRun') — 3 tester

```typescript
it('throws descriptive error when old workspace does not exist')
// Setup: tmpDir som baseDir, oldRunId vars workspace INTE finns
// Förväntat: Error med texten "not found" och oldRunId i meddelandet
// OBS: detta kast sker INNAN policy används — mockPolicy behövs ändå för konstruktorn

it('uses oldRunId-based workspace directory path')
// Setup: skapa workspaceDir = tmpDir/workspaces/<oldRunId>/<targetName>/ manuellt
// Kör resumeRun, verifiera att ctx.workspaceDir pekar på oldRunId-katalogen (inte newRunId)

it('falls back to placeholder brief when old brief.md is missing')
// Setup: skapa workspace-katalogen men INTE runs/<oldRunId>/brief.md
// Kör resumeRun, läs runs/<newRunId>/brief.md, verifiera att den innehåller "Resumed from"
```

**För tester som kräver att resumeRun kör klart** behöver workspaceDir vara ett äkta git-repo.
Använd `GitOperations.initWorkspace(workspaceDir, targetName)` i testsetup.

---

### describe('COPY_SKIP_DIRS') — 1 test

```typescript
it('contains expected skip directories')
// Importera COPY_SKIP_DIRS och verifiera att den innehåller: .git, node_modules, workspaces, runs, .venv
```

**OBS:** `COPY_SKIP_DIRS` är inte exporterad idag. Implementer ska lägga till `export` på konstanten
i `src/core/run.ts` (rad 32) för att möjliggöra testet:
```typescript
export const COPY_SKIP_DIRS: ReadonlySet<string> = new Set([...])
```

---

## Baseline (verifierad 2026-02-24)

```
npm test → 280 passed (280), 31 test files
npx tsc --noEmit → 0 errors
```

Nuvarande tester i `tests/core/run.test.ts`: 11 st.

---

## Acceptanskriterier

1. `tests/core/run.test.ts` har **17 tester** (11 befintliga + 6 nya)
2. `npm test` → **286 passed** (280 + 6)
3. `npx tsc --noEmit` → **0 errors**
4. `COPY_SKIP_DIRS` exporteras från `src/core/run.ts`
5. Alla 6 nya tester testar edge cases som inte täcks idag
6. Inga ändringar i andra filer än `tests/core/run.test.ts` och `src/core/run.ts`
7. Git commit: `test: add edge-case tests for generateRunId, resumeRun, and COPY_SKIP_DIRS`

---

## Begränsningar

- Rör **bara** `tests/core/run.test.ts` och `src/core/run.ts` (enbart export av COPY_SKIP_DIRS)
- Ingen refaktorering av befintlig kod
- Inga ändringar i produktionslogik
