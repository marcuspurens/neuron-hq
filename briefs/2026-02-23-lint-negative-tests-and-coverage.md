# Brief: Neuron HQ — Negativa lint-tester + prompt-täckningsrapport
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #18
**Estimerad tid:** 1 timme

---

## Bakgrund

Neuron HQ har nu 7 prompt-lint-testfiler (en per agent). De bekräftar att kritiska nyckelord
*finns* i promptarna — men ingen test verifierar att regressioner *faktiskt detekteras*.
Om en regex är för bred (t.ex. `/.*/`) skulle den vara grön även om nyckelordet togs bort.

Dessutom: om en ny agent läggs till utan lint-test syns det inte förrän det är för sent.

**Två konkreta fixar:**
1. Lägg till ett *negativt* regressionstest i var och en av de 7 lint-testfilerna
2. Skapa en ny meta-testfil `tests/prompts/coverage.test.ts` som vaktar att alla
   `prompts/*.md` har en motsvarande `*-lint.test.ts`

**Baseline (2026-02-23):**
```
npm test               → 251/251 gröna (28 testfiler)
npx tsc --noEmit       → 0 errors
errors.md öppna ⚠️     → 0
```

**Hälsokontroll:** Verifiera dessa tre värden INNAN arbetet börjar. Om något avviker
— stoppa och rapportera i `questions.md`.

---

## Uppgift 1 — Implementer: Lägg till negativt regressionstest i varje lint-testfil

Lägg till ett `it`-block i slutet av varje befintlig `describe`-block i dessa 7 filer:

- `tests/prompts/researcher-lint.test.ts`
- `tests/prompts/reviewer-lint.test.ts`
- `tests/prompts/tester-lint.test.ts`
- `tests/prompts/implementer-lint.test.ts`
- `tests/prompts/merger-lint.test.ts`
- `tests/prompts/historian-lint.test.ts`
- `tests/prompts/manager-lint.test.ts`

**Mönster att följa** (välj ett nyckelord som redan testas i filen):

```typescript
it('regression guard: test would fail if critical keyword removed', () => {
  // Replace a critical keyword — the regex should NOT match anymore
  const modified = prompt.replace('<critical_keyword>', 'REMOVED');
  expect(modified).not.toMatch(/<regex_for_that_keyword>/);
});
```

Välj det mest kritiska nyckelordet per fil. Exempel:
- `researcher-lint.test.ts` → ta bort `ideas.md`, verifiera `expect(modified).not.toMatch(/ideas\.md/)`
- `reviewer-lint.test.ts` → ta bort `STOPLIGHT`, verifiera `expect(modified).not.toMatch(/STOPLIGHT/)`
- `tester-lint.test.ts` → ta bort `test_report.md`, verifiera `expect(modified).not.toMatch(/test_report\.md/)`
- `implementer-lint.test.ts` → ta bort `git status`, verifiera `expect(modified).not.toMatch(/git status/i)`
- `merger-lint.test.ts` → ta bort `APPROVED`, verifiera `expect(modified).not.toMatch(/APPROVED/)`
- `historian-lint.test.ts` → ta bort `errors.md`, verifiera `expect(modified).not.toMatch(/errors\.md/)`
- `manager-lint.test.ts` → ta bort `STOPLIGHT`, verifiera `expect(modified).not.toMatch(/STOPLIGHT/)`

**OBS:** Läs varje lint-testfil FÖRST och kontrollera att det valda nyckelordet faktiskt
förekommer i promptfilen — annars välj ett annat som verkligen finns där.

---

## Uppgift 2 — Implementer: Skapa tests/prompts/coverage.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const promptsDir = join(__dirname, '../../prompts');
const testsDir = __dirname;

describe('prompt lint coverage', () => {
  it('every prompts/*.md has a corresponding *-lint.test.ts', () => {
    const promptFiles = readdirSync(promptsDir).filter(f => f.endsWith('.md'));
    const missing: string[] = [];

    for (const promptFile of promptFiles) {
      const base = promptFile.replace('.md', '');
      const lintTestFile = join(testsDir, `${base}-lint.test.ts`);
      if (!existsSync(lintTestFile)) {
        missing.push(promptFile);
      }
    }

    expect(missing, `These prompts lack lint tests: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('has at least 7 prompt files guarded', () => {
    const promptFiles = readdirSync(promptsDir).filter(f => f.endsWith('.md'));
    expect(promptFiles.length).toBeGreaterThanOrEqual(7);
  });

  it('has at least 7 lint test files', () => {
    const lintTests = readdirSync(testsDir).filter(f => f.endsWith('-lint.test.ts'));
    expect(lintTests.length).toBeGreaterThanOrEqual(7);
  });
});
```

---

## Uppgift 3 — Verifiering

```bash
npm test
npx tsc --noEmit
```

Förväntad utdata:
- `npm test` → **261+ tester** (7 nya negativa tester + 3 nya coverage-tester = +10)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 4 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ Negativt regressionstest tillagt i `researcher-lint.test.ts`
2. ✅ Negativt regressionstest tillagt i `reviewer-lint.test.ts`
3. ✅ Negativt regressionstest tillagt i `tester-lint.test.ts`
4. ✅ Negativt regressionstest tillagt i `implementer-lint.test.ts`
5. ✅ Negativt regressionstest tillagt i `merger-lint.test.ts`
6. ✅ Negativt regressionstest tillagt i `historian-lint.test.ts`
7. ✅ Negativt regressionstest tillagt i `manager-lint.test.ts`
8. ✅ `tests/prompts/coverage.test.ts` skapad med 3 tester
9. ✅ `npm test` → alla tester gröna (261+)
10. ✅ `npx tsc --noEmit` → 0 errors
11. ✅ Git commit med alla ändringar

---

## Uppgift 5 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Researcher behövs inte — detta är en prescriptive brief
- Inga ändringar i promptfilerna själva — bara testfilerna
- De negativa testerna ska använda `.replace()` på den inlästa promptsträngen, inte skriva till disk
- `coverage.test.ts` ska ligga i `tests/prompts/` (samma katalog som övriga lint-tester)
- Historian ska logga: "negativa regressionstest + prompt-täckningsrapport tillagda"
