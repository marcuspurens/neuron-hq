# Brief: Tester-felsignal — stack trace vid misslyckade tester
**Datum:** 2026-02-24
**Target:** neuron-hq
**Körning:** #25

---

## Bakgrund

När Tester-agenten rapporterar misslyckade tester idag, ger den Implementer bara testnamn + ett kort felmeddelande. Det räcker inte för att diagnosticera problemet effektivt. Implementer måste själv detektivarbeta — vilket kostar iterationer och tokens.

Samtalet 2026-02-24 identifierade detta som prioritet #1: "Tester berättar att något är rött, men inte var i exekveringen det gick fel."

---

## Uppgift

Uppdatera `prompts/tester.md` så att Tester-agenten vid **testmisslyckanden** inkluderar:
1. Stack trace (de relevanta raderna, inte hela tracet)
2. Exakt felrad i källkoden
3. Tillräcklig kontext för att Implementer ska kunna agera direkt

---

## Exakta ändringar

### 1. `prompts/tester.md` — Steg 2: Kör testerna

Nuvarande instruktion vid misslyckanden:
```
If tests fail, re-run with verbose flags to get failure details only:
- pytest: `python -m pytest tests/ -q --tb=short`
- vitest: `npx vitest run --reporter=verbose`
```

Ersätt med:
```
If tests fail, re-run to capture full failure details:
- pytest: `python -m pytest tests/ -q --tb=short --no-header`
- vitest: `npx vitest run --reporter=verbose 2>&1 | head -80`

Capture the output — it will be used in the Failing Tests section of the report.
```

### 2. `prompts/tester.md` — Steg 4: Format för "Failing Tests"-sektionen

Nuvarande format:
```markdown
## Failing Tests

<If any failures, list them here with test name and error message.>
```

Ersätt med:
```markdown
## Failing Tests

<If any failures, for EACH failing test include:>
<1. Test name (full path, e.g. tests/core/run.test.ts > RunOrchestrator > creates workspace)>
<2. Error message (the actual assertion or exception message)>
<3. Stack trace excerpt — the 3-5 most relevant lines showing WHERE the failure occurred>
<4. File + line number where the failure originated>

<Format per failing test:>

### `<test name>`
**Error:** `<error message>`
**Location:** `<file>:<line>`
**Trace:**
\`\`\`
<3-5 lines of stack trace>
\`\`\`

<If none: "(none)">
```

### 3. `prompts/tester.md` — Steg 5: Return-meddelande till Manager

Nuvarande:
```
- `TESTS FAILING: N failed out of N. Coverage: N%. See test_report.md.`
```

Ersätt med:
```
- `TESTS FAILING: N failed out of N. Coverage: N%. Failing: <comma-separated test names>. See test_report.md for stack traces.`
```

---

## Baseline (verifierad 2026-02-24)

```
npm test → 292 passed (292), 31 test files
npx tsc --noEmit → 0 errors
```

---

## Acceptanskriterier

1. `prompts/tester.md` innehåller `Location:` och `Trace:` i Failing Tests-formatet
2. `prompts/tester.md` innehåller `--tb=short` för pytest och `--reporter=verbose` för vitest vid omkörning
3. Return-meddelandet till Manager inkluderar felaktiga testnamn
4. `npm test` → **292 passed** (ingen produktionskod ändras)
5. `npx tsc --noEmit` → 0 errors
6. `tests/prompts/tester-lint.test.ts` uppdateras med regex-test som verifierar att `Location:` och `Trace:` finns i prompten
7. Git commit: `feat: improve tester failure reporting with stack traces and file locations`

---

## Begränsningar

- Rör bara `prompts/tester.md` och `tests/prompts/tester-lint.test.ts`
- Ingen ändring i `src/core/agents/tester.ts`
- Inga andra prompt-filer rörs
