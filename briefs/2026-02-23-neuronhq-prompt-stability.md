# Brief: Neuron HQ — promptstabilitet och minnesdisciplin
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #15
**Estimerad tid:** 1 timme

---

## Bakgrund

Neuron HQ har nu prompt-lint-tester för `implementer.md` (körning #14). Men fem andra
kritiska prompt-filer saknar skydd: om deras nyckelinstruktioner raderas av misstag
syns det bara som beteendefel i produktion — inte som ett testfel.

Dessutom: `historian.md` instruerar att använda `update_error_status` (istf att appenda
en ny ✅-post), men instruktionen är utspridd i "What NOT to Do"-sektionen och i
Verktygs-beskrivningen. Historian söker inte aktivt efter befintliga ⚠️-poster
innan den skapar nya. Det leder till dubbelposter i errors.md.

**Två konkreta fixar:**
1. Lägg till prompt-lint-tester för `merger.md`, `historian.md` och `manager.md`
2. Förstärk steg 3 i historian.md med ett explicit söksteg

**Baseline (2026-02-23):**
```
npm test               → 194/194 gröna (20 testfiler)
npx tsc --noEmit       → 0 errors
errors.md öppna ⚠️     → 0
```

**Hälsokontroll:** Verifiera dessa tre värden INNAN arbetet börjar. Om något avviker
— stoppa och rapportera i `questions.md`.

---

## Uppgift 1 — Implementer: Stärk historian.md steg 3

I `prompts/historian.md`, i **What You Do**, hitta steg 3:

```
3. **Write to `errors`** if anything went wrong — blockers, unexpected failures, agent mistakes.
   Use concrete language: what happened, why, and how to avoid it next time.
```

Ersätt med:

```
3. **Write to `errors`** if anything went wrong — blockers, unexpected failures, agent mistakes.
   **Before writing anything**: call `search_memory(query="<error keyword>")` to check if an
   existing entry already covers the same symptom.
   - If a ⚠️ entry already exists → use `update_error_status` to close it in place. Do NOT append a new ✅ entry.
   - If no existing entry → create a new one with `write_to_memory(file="errors", ...)`.
   Use concrete language: what happened, why, and how to avoid it next time.
```

---

## Uppgift 2 — Implementer: Lägg till prompt-lint-tester

Skapa `tests/prompts/merger-lint.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/merger.md'), 'utf-8');

describe('merger.md — critical instructions', () => {
  it('documents PLAN and EXECUTE phases', () => {
    expect(prompt).toMatch(/PLAN phase/i);
    expect(prompt).toMatch(/EXECUTE phase/i);
  });

  it('requires APPROVED keyword in answers.md', () => {
    expect(prompt).toMatch(/APPROVED/);
  });

  it('forbids committing without user approval', () => {
    expect(prompt).toMatch(/NEVER commit without user approval/i);
  });

  it('uses copy_to_target tool', () => {
    expect(prompt).toMatch(/copy_to_target/);
  });

  it('forbids force push', () => {
    expect(prompt).toMatch(/force push/i);
  });
});
```

Skapa `tests/prompts/historian-lint.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/historian.md'), 'utf-8');

describe('historian.md — critical instructions', () => {
  it('instructs to use grep_audit instead of read_file for audit.jsonl', () => {
    expect(prompt).toMatch(/grep_audit/);
  });

  it('instructs to use update_error_status (not write_to_memory) for existing errors', () => {
    expect(prompt).toMatch(/update_error_status/);
  });

  it('instructs to search before writing error entries', () => {
    expect(prompt).toMatch(/search_memory/);
  });

  it('forbids creating duplicate error entries', () => {
    expect(prompt).toMatch(/duplikat|duplicate|Skapa INTE en ny post/i);
  });

  it('instructs to verify with audit.jsonl before reporting agent failure', () => {
    expect(prompt).toMatch(/audit\.jsonl/);
  });
});
```

Skapa `tests/prompts/manager-lint.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');

describe('manager.md — critical instructions', () => {
  it('forbids # comments in bash commands', () => {
    expect(prompt).toMatch(/Never.*#|#.*policy|comment.*block/i);
  });

  it('instructs manager to be coordinator not performer', () => {
    expect(prompt).toMatch(/coordinator/i);
  });

  it('instructs to write answers.md to runs directory', () => {
    expect(prompt).toMatch(/answers\.md/);
    expect(prompt).toMatch(/runs.*dir|Run artifacts dir/i);
  });

  it('instructs not to repeat researcher analysis', () => {
    expect(prompt).toMatch(/do NOT repeat|not.*repeat/i);
  });

  it('instructs to use read_memory_file for librarian output', () => {
    expect(prompt).toMatch(/read_memory_file/);
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
- `npm test` → **209+ tester** (15 nya: 5 per ny lint-testfil)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 4 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `prompts/historian.md` steg 3 innehåller `search_memory`-kall innan write
2. ✅ `prompts/historian.md` steg 3 skiljer tydligt på "befintlig ⚠️" vs "ny post"
3. ✅ `tests/prompts/merger-lint.test.ts` skapad med 5 tester
4. ✅ `tests/prompts/historian-lint.test.ts` skapad med 5 tester
5. ✅ `tests/prompts/manager-lint.test.ts` skapad med 5 tester
6. ✅ `npm test` → alla tester gröna (194+)
7. ✅ `npx tsc --noEmit` → 0 errors
8. ✅ Git commit med ALLA fyra ändrade filer (historian.md + 3 test-filer)

---

## Uppgift 5 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

⚡ Auto-trigger: Librarian (körning #15 — var 5:e körning)

## Noteringar

- Researcher behövs inte — detta är prescriptive brief
- Lint-testernas regex ska matcha det historian.md faktiskt innehåller *efter* uppgift 1 är gjord
  (historian-lint.test.ts testar bland annat `/search_memory/` — som tillkommer i uppgift 1)
- Historian ska logga: "search-before-write guardrail tillagd i historian.md"
- Nästa Librarian auto-trigger: vid 15 körningar i runs.md → körning #15 triggar den
  (lägg till `⚡ Auto-trigger: Librarian` i manager-delegation)
