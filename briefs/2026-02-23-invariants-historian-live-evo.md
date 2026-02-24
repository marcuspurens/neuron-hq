# Brief — Körning #19: invariants.md + Historian-uppdatering + Live-Evo-metadata

**Datum:** 2026-02-23
**Target:** neuron-hq
**Kategori:** Minnessystemförbättring

---

## Bakgrund

Session 30 identifierade en lucka i memorysystemet: `coverage.test.ts` fångade en *implicit strukturinvariant* (varje prompt måste ha ett lint-test) — men systemet saknar ett explicit ställe att förvara sådana strukturkrav. Forskning (StructMemEval 2026, A-MEM NeurIPS 2025, LoCoMo-Plus 2026) bekräftar att implicita constraints måste göras explicita för att retrieval ska fungera.

Nuläge:
- 267/267 tester gröna (30 testfiler)
- 0 öppna ⚠️ i errors.md
- Senaste commit: `5e6808a`

---

## Uppgift

Implementera tre förbättringar av memorysystemet:

### 1. Skapa `memory/invariants.md`

Ny minnesfil för strukturkrav som alltid måste gälla i systemet.

Format per post:
```
## [INV-NNN] Titel
**Beskrivning:** Vad som alltid måste vara sant
**Vaktas av:** Vilken test/mekanism garanterar det
**Tillagd:** Körning #X
```

Starta med dessa tre kända invarianter:

**[INV-001]** Varje `prompts/*.md` måste ha ett `tests/prompts/*-lint.test.ts`
- Vaktas av: `tests/prompts/coverage.test.ts`
- Tillagd: Körning #18

**[INV-002]** Librarian körs FÖRE Historian i Manager-delegationsordningen
- Vaktas av: `prompts/manager.md` (explicit ordning) + `tests/prompts/manager-lint.test.ts`
- Tillagd: Körning #16

**[INV-003]** Alla 8 agenter har `withRetry()` runt `messages.stream()`
- Vaktas av: `tests/core/agent-utils.test.ts` (withRetry-tester)
- Tillagd: Körning #12

### 2. Uppdatera `prompts/historian.md`

Lägg till ett nytt steg i Historian-prompten (efter nuvarande steg 4, innan "Stop"):

```
5. **Check invariants**: Läs `memory/invariants.md`. Om körningen avslöjar en
   ny strukturinvariant (något som alltid måste gälla i systemet) — lägg till
   den med `write_to_memory`. Format:
   `[INV-NNN] Beskrivning | Vaktas av: X | Tillagd: körning Y`
   Numrera sekventiellt. Skriv bara om det är en genuint ny strukturregel.
```

Lägg också till `invariants` till listan av tillgängliga memory-filer under **Tools**-sektionen:
```
- **write_to_memory**: Write an entry to a specific memory file (runs, patterns, errors, or invariants)
- **read_memory_file**: Read a memory file (runs, patterns, errors, techniques, invariants)
```

### 3. Lägg till `**Körningar:**`-metadata i `memory/patterns.md`

Varje befintligt mönster i patterns.md ska få ett nytt fält direkt före `---`:
```
**Körningar:** #X, #Y
```

Populera med korrekt information baserat på när mönstret uppstod (session/körning-nummer som nämns i Kontext-fältet). Om körningsnummer är oklart, använd `#?`.

Mönstren och deras korrektionen körningsnummer:
- "Kompakt testutdata..." → #11
- "initWorkspace()..." → #11
- "Brief-innehåll injiceras..." → #9
- "Datumstämplade briefs..." → #9
- "Tvåfas-Merger..." → #10
- "Librarian dubbelkontrollerar..." → #? (körning 20260222-1651 = session ~19-20, okänt nummer)
- "Researcher: multi-signal..." → #? (körning 20260222-1757)
- "Reviewer git-stash..." → #? (körning 20260222-1901)
- "Implementer: direktskrivning..." → #? (körning 20260222-2113)
- "Implementer anpassar sig..." → #? (körning 20260222-2253)
- "Resume-körning..." → #? (körning 20260222-2314-resume)
- "Self-hosting: svärmen fixar..." → #8
- "Audit.jsonl som sanningskälla..." → #10
- "Prompt-lint-tester..." → #14
- "Explicit agentordning..." → #16
- "Meta-test (coverage.test.ts)..." → #18

### 4. Skapa `tests/memory/invariants-lint.test.ts`

Ny testfil som verifierar invariants.md struktur:
- Test 1: Filen `memory/invariants.md` existerar
- Test 2: Filen innehåller minst 3 INV-poster (matchar `[INV-` prefix)
- Test 3: Varje INV-post har rätt format (`[INV-NNN]` med 3 siffror)
- Test 4: Filen innehåller `Vaktas av:` (guardrail-fält finns)

---

## Acceptanskriterier

1. `memory/invariants.md` skapad och innehåller minst 3 INV-poster med korrekt format
2. `prompts/historian.md` uppdaterad med invariants-steg (steg 5) och invariants i Tools-listan
3. `tests/memory/invariants-lint.test.ts` skapad med 4+ tester
4. Varje befintligt mönster i `memory/patterns.md` har `**Körningar:**`-fält
5. `npm test` → 270+ gröna (alla befintliga 267 + minst 4 nya)
6. `npx tsc --noEmit` → 0 errors
7. Git commit med alla ändringar

---

## Begränsningar

- Inga ändringar i src/core/ eller andra källfiler — detta är enbart minnessystem och testförbättringar
- Lägg INTE till embeddings eller RAG — det är nästa fas
- Historian ska inte köras om/om igen — en körning räcker
- Budget: max 60 manager-iterationer

---

## Filer att läsa/ändra

| Fil | Åtgärd |
|-----|--------|
| `memory/invariants.md` | SKAPA (ny fil) |
| `memory/patterns.md` | ÄNDRA (lägg till Körningar-metadata) |
| `prompts/historian.md` | ÄNDRA (lägg till steg 5 + invariants i Tools) |
| `tests/memory/invariants-lint.test.ts` | SKAPA (ny testfil) |

Läs också:
- `memory/errors.md` — kontrollera att inga öppna ⚠️ finns
- `tests/memory/errors-lint.test.ts` — mall för hur en memory-lint-testfil ser ut
