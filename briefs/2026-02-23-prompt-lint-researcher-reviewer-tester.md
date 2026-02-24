# Brief: Neuron HQ — Prompt-lint för researcher, reviewer och tester
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #17
**Estimerad tid:** 1 timme

---

## Bakgrund

Neuron HQ har nu prompt-lint-tester för `implementer.md`, `merger.md`, `historian.md` och
`manager.md`. Tre kritiska promptfiler saknar fortfarande skydd:

- `prompts/researcher.md` — om Required Outputs-sektionen raderas syns det bara som
  saknade artefakter i produktion
- `prompts/reviewer.md` — om STOPLIGHT-format eller Swedish summary-kravet raderas
  producerar Reviewer felformaterade rapporter tyst
- `prompts/tester.md` — om test_report.md-kravet eller "Never modify code"-regeln raderas
  kan Tester börja ändra kod utan att någon märker det

**En konkret fix:** Skapa tre nya lint-testfiler med 5 tester vardera.

**Baseline (2026-02-23):**
```
npm test               → 236/236 gröna (25 testfiler)
npx tsc --noEmit       → 0 errors
errors.md öppna ⚠️     → 0
```

**Hälsokontroll:** Verifiera dessa tre värden INNAN arbetet börjar. Om något avviker
— stoppa och rapportera i `questions.md`.

---

## Uppgift 1 — Implementer: Skapa tests/prompts/researcher-lint.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/researcher.md'), 'utf-8');

describe('researcher.md — critical instructions', () => {
  it('documents three mandatory output files', () => {
    expect(prompt).toMatch(/ideas\.md/);
    expect(prompt).toMatch(/knowledge\.md/);
    expect(prompt).toMatch(/sources\.md/);
  });

  it('requires Impact/Effort/Risk framework', () => {
    expect(prompt).toMatch(/\*\*Impact\*\*/);
    expect(prompt).toMatch(/\*\*Effort\*\*/);
    expect(prompt).toMatch(/\*\*Risk\*\*/);
  });

  it('specifies max constraints for searches and ideas', () => {
    expect(prompt).toMatch(/[Mm]ax\s+\d+\s+web\s+search/);
    expect(prompt).toMatch(/[Mm]ax\s+\d+\s+ideas/);
  });

  it('instructs to prefer recent sources', () => {
    expect(prompt).toMatch(/2024|recent/i);
  });

  it('marks all three outputs as mandatory', () => {
    expect(prompt).toMatch(/mandatory|MANDATORY/);
  });
});
```

---

## Uppgift 2 — Implementer: Skapa tests/prompts/reviewer-lint.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/reviewer.md'), 'utf-8');

describe('reviewer.md — critical instructions', () => {
  it('requires Swedish summary table (Vad svärmen levererade)', () => {
    expect(prompt).toMatch(/Vad sv[äa]rmen levererade/i);
  });

  it('requires Planerat vs Levererat section', () => {
    expect(prompt).toMatch(/Planerat vs Levererat/i);
  });

  it('requires STOPLIGHT format in report', () => {
    expect(prompt).toMatch(/STOPLIGHT/);
  });

  it('must block on static analysis failure (ruff/mypy/tsc)', () => {
    expect(prompt).toMatch(/BLOCK/i);
    expect(prompt).toMatch(/static analysis/i);
  });

  it('forbids claiming something is done without running a command', () => {
    expect(prompt).toMatch(/NEVER claim|never.*claim|without.*command|run.*command/i);
  });
});
```

---

## Uppgift 3 — Implementer: Skapa tests/prompts/tester-lint.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/tester.md'), 'utf-8');

describe('tester.md — critical instructions', () => {
  it('requires writing test_report.md', () => {
    expect(prompt).toMatch(/test_report\.md/);
  });

  it('forbids modifying code', () => {
    expect(prompt).toMatch(/[Nn]ever modify code/);
  });

  it('requires truncating output to max 30 lines', () => {
    expect(prompt).toMatch(/30\s+lines/);
  });

  it('requires one-line verdict format (TESTS PASS / TESTS FAILING)', () => {
    expect(prompt).toMatch(/TESTS PASS/);
    expect(prompt).toMatch(/TESTS FAILING/);
  });

  it('instructs to discover test framework automatically', () => {
    expect(prompt).toMatch(/[Dd]iscover|detect/);
    expect(prompt).toMatch(/vitest|pytest/);
  });
});
```

---

## Uppgift 4 — Verifiering

```bash
npm test
npx tsc --noEmit
```

Förväntad utdata:
- `npm test` → **251+ tester** (15 nya: 5 per ny lint-testfil)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 5 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `tests/prompts/researcher-lint.test.ts` skapad med 5 tester
2. ✅ `tests/prompts/reviewer-lint.test.ts` skapad med 5 tester
3. ✅ `tests/prompts/tester-lint.test.ts` skapad med 5 tester
4. ✅ Alla 15 nya tester passerar
5. ✅ `npm test` → alla tester gröna (236+)
6. ✅ `npx tsc --noEmit` → 0 errors
7. ✅ Git commit med alla 3 nya testfiler

---

## Uppgift 6 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Researcher behövs inte — detta är en prescriptive brief
- Inga ändringar i promptfilerna själva — bara nya testfiler
- Varje test ska matcha det promptfilen faktiskt innehåller (verifiera mot filerna i prompts/)
- Historian ska logga: "prompt-lint-tester tillagda för researcher, reviewer och tester"
