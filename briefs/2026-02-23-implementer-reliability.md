# Brief: Implementer-tillförlitlighet
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #14
**Estimerad tid:** 1 timme

---

## Bakgrund

I körning #13 observerades två tillförlitlighetsproblem i Implementer-agenten:

1. **Partial commit** — Implementer committade bara testfilen (`tests/agents/historian.test.ts`)
   utan de faktiska implementeringsfilerna (`src/core/agents/historian.ts`, `prompts/historian.md`).
   Reviewer fångade detta och Merger fixade det — men felet borde aldrig ha skett.

2. **Max iterationer** — Implementer nådde 50/50 iterationer (max) på första delegationen.
   Det finns ingen instruktion om vad man ska göra när man närmar sig gränsen.

**Rot-orsak:**
- `prompts/implementer.md` saknar explicit instruktion om att verifiera `git status` _innan_ commit.
- Det finns ingen fallback-strategi för när max-iterationer närmar sig.

**Lösning:** Uppdatera `prompts/implementer.md` med två förbättringar:
1. Explicit `git status`-kontroll som obligatoriskt steg innan `git commit`
2. Nödbroms-instruktion: committa partiellt och stoppa om >40 iterationer förbrukats

**Baseline (2026-02-23):**
```
npm test               → 189/189 gröna (19 testfiler)
npx tsc --noEmit       → 0 errors
errors.md öppna ⚠️     → 0
```

**Hälsokontroll:** Swärmen ska verifiera dessa tre värden INNAN den börjar jobba.
Om något avviker — stoppa och rapportera i `questions.md` istället för att fortsätta.

---

## Uppgift 1 — Implementer: Uppdatera `prompts/implementer.md`

### 1a. Ändra "After You Code" steg 3

Nuvarande text (rad ~33):
```
3. After tests pass and lint is clean: run `git add -A && git commit -m '<type>: <description>'` with a conventional-commit message
```

Ersätt med:
```
3. After tests pass and lint is clean:
   - Run `git add -A` to stage ALL changed files (never add individual files by name)
   - Run `git status` and verify that ALL changed files appear under "Changes to be committed"
   - Only proceed to commit when all implementation files AND test files are staged
   - Run `git commit -m '<type>: <description>'` with a conventional-commit message
```

### 1b. Lägg till nytt steg i "After You Code" (efter steg 7)

Lägg till som steg 8:
```
8. **Iteration budget**: If you have used >40 of your iteration budget, commit what you have
   immediately (even if partial), document what remains in knowledge.md, and stop. Do not
   continue past 45 iterations — a partial commit is better than hitting the limit with nothing committed.
```

### 1c. Lägg till punkt i Quality Checklist under "All languages"

Direkt efter raden `- [ ] Changes committed with 'git commit'...`, lägg till:
```
- [ ] Before committing: ran `git status` and confirmed ALL changed files (not just tests) are staged
```

---

## Uppgift 2 — Tester

Det finns ingen testfil för `prompts/implementer.md` direkt (det är en textfil, inte kod).
Men vi kan lägga till ett lint-test som verifierar att de kritiska instruktionerna finns i filen.

### 2a. Skapa `tests/prompts/implementer-lint.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/implementer.md'), 'utf-8');

describe('implementer.md — reliability guardrails', () => {
  it('instructs to run git status before commit', () => {
    expect(prompt).toMatch(/git status/i);
  });

  it('instructs to use git add -A (not individual files)', () => {
    expect(prompt).toMatch(/git add -A/);
  });

  it('has iteration budget warning', () => {
    expect(prompt).toMatch(/40.*iteration|iteration.*40/i);
  });

  it('mentions partial commit as fallback strategy', () => {
    expect(prompt).toMatch(/partial commit|commit what you have/i);
  });

  it('checklist item: verify all changed files staged before commit', () => {
    expect(prompt).toMatch(/ALL changed files.*staged|staged.*ALL changed files/i);
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
- `npm test` → **194+ tester** (minst 5 nya för implementer-lint)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 4 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `prompts/implementer.md` — "After You Code" steg 3 innehåller `git status`-kontroll
2. ✅ `prompts/implementer.md` — "After You Code" innehåller iteration-budget-instruktion (>40)
3. ✅ `prompts/implementer.md` — Quality Checklist har rad om att verifiera alla filer staging
4. ✅ `tests/prompts/implementer-lint.test.ts` skapad med minst 5 tester
5. ✅ `npm test` → alla tester gröna (189+)
6. ✅ `npx tsc --noEmit` → 0 errors
7. ✅ Git commit med ALLA ändrade filer (prompts/implementer.md + tests/prompts/implementer-lint.test.ts)

---

## Uppgift 5 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Inga beroenden på andra agenter — Researcher behöver inte kallas (prescriptive brief)
- Testen i `tests/prompts/` är ett nytt testmönster — kontrollera att katalogen skapas
- Regexarna i testerna ska matcha de exakta formuleringar som Implementer skriver in i prompten
- Om Implementer väljer lite olika formuleringar är det OK — Reviewer avgör om intent uppfylls
- Historian ska logga observationen: "partial commit prevention added to implementer.md"
