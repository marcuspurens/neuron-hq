# Brief: Historian-fix + errors.md-hygien + lint-test
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #11
**Estimerad tid:** 1 timme

---

## Bakgrund

Tre relaterade problem att lösa i denna körning:

**Problem 1 — Dubbelt öppna ⚠️ i errors.md**
Två poster är markerade som ⚠️ Identifierat men har faktiskt lösts i tidigare körningar:
- "Manager söker Librarian-output i workspace" (rad 62) → löst i körning #9 (rad 142: "Librarian-sökvägsproblem löst i manager.md" ✅)
- "Run-artefakter skrivs till workspace men inte till runs-katalogen" (rad 71) → löst i session 21 (rad 131: "Manager skriver answers.md..." ✅)

**Problem 2 — Historian skapar dubbletter istället för att uppdatera**
Historian-agenten appendar nya ✅-poster istället för att uppdatera befintliga ⚠️-poster. Det syns i errors.md som nu har dubbelposter för samma fel. Prompten saknar tydlig instruktion om "uppdatera in place".

**Problem 3 — Ingen automatisk validering av errors.md-format**
Det finns inget test som fångar upp om errors.md har duplicerade rubriker, saknade Status-rader, eller ⚠️-poster som faktiskt är lösta.

**Baseline (2026-02-23):**
```
npm test → 170/170 passed
npx tsc --noEmit → 0 errors
```

---

## Uppgift 1 — Researcher: Kartlägg exakt vilka poster som ska stängas

Läs `memory/errors.md` och identifiera:
1. Vilka ⚠️-poster som har en motsvarande ✅-post som bekräftar att problemet lösts
2. Exakt vilket räddat lösningscitat som ska lyftas in i status-texten

Läs även `runs/20260223-0700-neuron-hq/audit.jsonl` för att bekräfta att Librarian-sökvägsfixet faktiskt kördes i körning #9.

**Leverera:** `ideas.md` med exakt text för varje status-uppdatering, plus rekommendation om lint-testets validerings-regler.

---

## Uppgift 2 — Implementer: Tre leveranser

### 2a. Uppdatera `memory/errors.md` — stäng de 2 kvarliggande ⚠️

Uppdatera `**Status:**` på de befintliga posterna (ändra i filen, lägg INTE till nya poster):

**Post 1** — "Manager söker Librarian-output i workspace istället för delat minne" (ca rad 62-67):
```
**Status:** ✅ Löst — körning #9 lade till explicit vägledning i prompts/manager.md om att Librarian-output hamnar i delat memory/, inte workspace. Se "Librarian-sökvägsproblem löst i manager.md" i samma fil.
```

**Post 2** — "Run-artefakter skrivs till workspace men inte till runs-katalogen" (ca rad 71-76):
```
**Status:** ✅ Löst — session 21 exponerade runDir i manager.ts, uppdaterade manager.md med absolut sökväg, och lade till workspace-fallback i merger.ts. Se "Manager skriver answers.md till workspace istället för runs-katalogen" i samma fil.
```

### 2b. Uppdatera `prompts/historian.md` — förhindra dubbletter + audit-kontroll

Lägg till två nya instruktioner i Historian-prompten (efter befintliga "What NOT to Do"-regler):

**Tillägg 1 — Uppdatera befintliga poster, skapa inte dubbletter:**
```markdown
- **Uppdatera befintliga errors-poster in place**: När ett problem löses, uppdatera `**Status:**` på den *befintliga* ⚠️-posten till ✅. Skapa INTE en ny post. Dubbelposter i errors.md förvirrar framtida agenter.
```

**Tillägg 2 — Kontrollera audit.jsonl innan du rapporterar fel:**
```markdown
- **Verifiera med audit.jsonl innan du rapporterar att en agent misslyckades**: Innan du skriver att en agent "aldrig körde" eller "inte levererade", sök i `audit.jsonl` efter agentens tool-anrop. Avsaknad av artefakter i workspace ≠ agenten körde inte.
```

### 2c. Skapa `tests/memory/errors-lint.test.ts` — validering av errors.md-format

Skapa en ny testfil som validerar `memory/errors.md`:

```typescript
// tests/memory/errors-lint.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('errors.md lint', () => {
  const content = readFileSync(join(process.cwd(), 'memory/errors.md'), 'utf-8')
  const sections = content.split('\n## ').filter(s => s.trim().length > 0 && !s.startsWith('#'))

  it('every section has a Status line', () => {
    for (const section of sections) {
      const title = section.split('\n')[0].trim()
      expect(section, `Section "${title}" missing Status`).toMatch(/\*\*Status:\*\*/)
    }
  })

  it('no duplicate section titles', () => {
    const titles = sections.map(s => s.split('\n')[0].trim())
    const seen = new Set<string>()
    for (const title of titles) {
      expect(seen.has(title), `Duplicate section: "${title}"`).toBe(false)
      seen.add(title)
    }
  })

  it('no open warnings that reference already-solved solutions', () => {
    const openSections = sections.filter(s => s.includes('**Status:** ⚠️'))
    for (const section of openSections) {
      const title = section.split('\n')[0].trim()
      // En ⚠️-post vars lösning säger "redan löst" är ett tecken på felaktig status
      expect(
        section,
        `Section "${title}" is ⚠️ but solution mentions it's solved`
      ).not.toMatch(/redan löst|already (fixed|solved|resolved)/i)
    }
  })
})
```

### 2d. Kör testsviten och verifiera

```bash
npm test
```

Förväntad utdata: 170 + 3 nya lint-tester = **173 tester gröna**.

### 2e. Git commit

```bash
git add memory/errors.md prompts/historian.md tests/memory/errors-lint.test.ts
git commit -m "fix: close 2 open errors, add historian duplicate-guard, errors lint test"
```

---

## Uppgift 3 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `memory/errors.md` har NOLL kvarliggande ⚠️-poster utan en aktiv lösning
2. ✅ `memory/errors.md` har inga duplicerade rubrikmönster
3. ✅ `prompts/historian.md` har instruktion om att uppdatera in place (inte duplicera)
4. ✅ `prompts/historian.md` har instruktion om att verifiera med audit.jsonl
5. ✅ `tests/memory/errors-lint.test.ts` finns och är grön
6. ✅ `npm test` är 100% grön (inga regressionstester)
7. ✅ Git commit skapad med korrekta filer

---

## Uppgift 4 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Auto-trigger: körning #11 triggar INTE Librarian automatiskt (nästa trigger vid #15)
- Historian-dupliceringsproblemet: Implementer ska uppdatera befintliga ⚠️ in place med `write_file` på hela filen — inte enskilda poster
- Historian i slutet av körningen: skapa entry för körning #11 i runs.md som normalt. Och om du ser ⚠️-poster som lösts — **uppdatera dem in place** enligt din nya instruktion
