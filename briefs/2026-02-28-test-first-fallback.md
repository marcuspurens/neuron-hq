# Brief: Test-first fallback — Hantera projekt utan tester

## Bakgrund

Neuron HQ:s verifieringsmodell bygger på att target-repot har tester. Baseline-steget
kör `pnpm test` / `pytest` och förväntar sig gröna resultat. Reviewer verifierar att
testerna fortfarande passerar efter ändringar.

**Problem:** Om target-repot saknar tester kollapsar hela verifieringskedjan.
Baseline blir meningslöst. Reviewer har inget att jämföra mot. Merger mergar kod
som aldrig verifierats.

**Källa:** Djupsamtal session 50 — "Projekt utan tester: Neuron har inget säkerhetsnät."

## Scope

**Implementer skriver tester som del av varje uppgift. Reviewer verifierar via
alternativa metoder när befintliga tester saknas.**

## Uppgifter

### 1. Detektera test-status i baseline (`src/core/baseline.ts`)

Utöka baseline-verifieringen med en ny fältstatus:

```typescript
export interface BaselineResult {
  testsExist: boolean;       // true om test-suite hittades
  testsPass: boolean;        // true om de kördes och gick igenom
  testFramework: string | null;  // 'vitest' | 'pytest' | 'jest' | null
  lintPass: boolean;
  typecheckPass: boolean;
}
```

**Detekteringslogik:**
- Kolla `package.json` → `scripts.test` finns → TypeScript/JS
- Kolla `pyproject.toml` → `[tool.pytest]` finns → Python
- Kolla `tests/` katalog finns
- Om inget av ovanstående → `testsExist: false`

### 2. Uppdatera Manager-prompten

Lägg till i `prompts/manager.md`:

```markdown
### When target has no tests

If baseline reports `testsExist: false`:
1. Instruct Implementer to write tests for ALL new code as part of the task
2. Instruct Implementer to also write at least 3 tests for existing critical code paths
3. After Implementer finishes, verify that a test suite now exists and passes
4. Reviewer should use static analysis + manual code review as additional verification
```

### 3. Uppdatera Implementer-prompten

Lägg till i `prompts/implementer.md`:

```markdown
### When no test suite exists

If the target project has no tests:
1. Set up a test framework first (vitest for TypeScript, pytest for Python)
2. Write tests for your new code (minimum: 1 test per public function)
3. Write at least 3 smoke tests for existing critical code paths
4. Ensure all tests pass before marking done
```

### 4. Uppdatera Reviewer-prompten

Lägg till i `prompts/reviewer.md`:

```markdown
### Verification without existing tests

When baseline had no tests:
- Run the NEW tests that Implementer added — they must all pass
- Run static analysis: `pnpm typecheck` and `pnpm lint` (or equivalents)
- Verify code changes manually: read diffs line by line
- Check for common issues: unhandled errors, missing null checks, security concerns
- If Implementer did NOT add tests: verdict is YELLOW at best, RED if changes are non-trivial
```

### 5. Injicera test-status i agentkontext

I `RunOrchestrator` eller `ManagerAgent`, gör `baselineResult.testsExist` tillgänglig
i systempromptens kontext så att Manager kan agera på det:

```typescript
const contextInfo = `
...existing context...
Test status: ${baseline.testsExist ? 'Tests exist and pass' : 'NO TESTS FOUND — Implementer must create test suite'}
`;
```

### 6. Tester

Skriv tester i `tests/core/baseline-test-detection.test.ts`:

1. Baseline detekterar vitest i `package.json`
2. Baseline detekterar pytest i `pyproject.toml`
3. Baseline sätter `testsExist: false` när ingen test-suite finns
4. Baseline sätter korrekt `testFramework`
5. Manager-prompten inkluderar test-status-kontext
6. Baseline hanterar tomt repo (inga config-filer alls)

## Acceptanskriterier

- [ ] `BaselineResult` har `testsExist`, `testFramework` fält
- [ ] Manager-prompten instruerar Implementer att skapa tester vid `testsExist: false`
- [ ] Implementer-prompten har "When no test suite exists"-sektion
- [ ] Reviewer-prompten har "Verification without existing tests"-sektion
- [ ] Test-status injiceras i Manager-kontexten
- [ ] 5+ tester i `tests/core/baseline-test-detection.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Ändrar främst prompt-filer och baseline-modulen. Inga befintliga flöden ändras —
det här är ett *tillägg* för fallet "inga tester finns". Projekt som redan har tester påverkas inte.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 443 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-test-first-fallback.md --hours 1
```
