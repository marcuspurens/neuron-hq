# Brief — Körning #20: RunOrchestrator-förbättringar

**Datum:** 2026-02-23
**Target:** neuron-hq
**Kategori:** TypeScript-kodkvalitet (stresstest — src/-ändringar)

---

## Bakgrund

`src/core/run.ts` är kärnan i systemet — den initierar och avslutar varje körning. Koden fungerar men har ett antal kodluktproblem som Researcher bör analysera och prioritera:

- `initRun()` och `resumeRun()` delar identisk initialiseringskod för components (artifacts, audit, manifest, usage, redactor, verifier) — tydlig DRY-violation
- `isTimeExpired()` finns men ingen metod för att läsa ut *hur mycket* tid som är kvar — agenter kan i framtiden behöva anpassa sitt beteende baserat på återstående budget
- `copyDirectory()` har hårdkodade skip-strängar spridda i if-satser

## Uppgift

Förbättra kodkvaliteten i `src/core/run.ts`. Researcher ska analysera filen och de befintliga testerna (`tests/core/run.test.ts`) för att identifiera vilka förbättringar som ger mest värde med minst risk.

**Förväntade förbättringar (men Researcher avgör prioritet och exakt approach):**

1. **Extrahera gemensam init-logik** från `initRun()` och `resumeRun()` till en privat hjälpmetod (t.ex. `_buildContext()`), så att komponenter bara initieras på ett ställe

2. **Lägg till `getTimeRemainingMs(ctx: RunContext): number`** i RunOrchestrator — returnerar millisekunder kvar, 0 om tid gått ut. `isTimeExpired()` kan delegera till den.

3. **Samla skip-mönster** i `copyDirectory()` — ersätt de spridda if-satserna med en konstant/array `COPY_SKIP_DIRS`

**Viktigt:** Researcher bör läsa `tests/core/run.test.ts` och befintliga tester för att förstå vad som already täcks — och se till att nya metoder får tester.

---

## Acceptanskriterier

1. `initRun()` och `resumeRun()` delar inte duplicerad init-kod — gemensam logik är extraherad
2. `RunOrchestrator` har en `getTimeRemainingMs(ctx)` metod som fungerar korrekt
3. `copyDirectory()` använder en namngiven konstant/array för skip-mönster (inte inline if-satser)
4. `npm test` → alla befintliga + nya tester gröna (271+ totalt)
5. `npx tsc --noEmit` → 0 errors
6. Git commit

---

## Begränsningar

- Ändringar begränsade till `src/core/run.ts` och `tests/core/run.test.ts`
- Inga API-förändringar — `RunContext`-interfacet och publika metoder ska ha samma signaturer som idag
- Researcher analyserar och bekräftar approach *innan* Implementer skriver kod
- Om en förbättring visar sig riskfylld (t.ex. kräver ändringar i många andra filer) — hoppa över den och dokumentera varför i knowledge.md

---

## Filer att läsa

| Fil | Vad du letar efter |
|-----|-------------------|
| `src/core/run.ts` | Nuvarande implementation |
| `tests/core/run.test.ts` | Befintlig testtäckning |
| `src/core/types.ts` | RunContext, RunConfig m.fl. typer |
