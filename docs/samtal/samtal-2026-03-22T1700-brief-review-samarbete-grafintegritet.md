# Samarbetsrapport: Brief Review av "2.5 Grafintegritet — watchman"

**Datum:** 2026-03-22
**Session:** S127
**Deltagare:** Claude Code (brief-författare) + Brief Reviewer V2 (granskare)
**Rundor:** 4
**Slutbetyg:** 8.4/10 — GODKÄND (utan reservationer)

---

## Sammanfattning

Denna rapport dokumenterar hur briefen för 2.5 Grafintegritet utvecklades genom 4 rundor av granskning. Varje runda identifierade problem som fixades innan nästa runda kördes. Briefen gick från "godkänd med reservationer" till "godkänd" — och kvaliteten höjdes mätbart genom processen.

---

## Fas 0: Research och briefskrivning

### Vad jag (Claude Code) gjorde innan Brief Reviewer ens var inblandad:

1. **Läste ROADMAP.md** — förstod att 2.5 handlar om "Historian kör graf-health-check var 10:e körning"
2. **Skickade en Explore-agent** som grävde djupt i kodbasen:
   - Hittade `graph.json` med 1 345 noder och 206 kanter
   - Räknade isolerade noder: 1 120 av 1 345 (83%) — en chockerande siffra
   - Identifierade alla befintliga funktioner i `graph-merge.ts`
   - Kartlade Historian och Consolidator-agenternas roller
3. **Läste befintliga briefs** (2.4 Idékonsolidering) som formatreferens
4. **Läste Historian-prompten** (389 rader) för att förstå stegstrukturen
5. **Läste Consolidator-prompten** för att förstå prioriteringsordningen

### Mina designval innan review:

- **Varje körning, inte var 10:e** — ROADMAP sa var 10:e, men jag resonerade: health check är en ren funktion utan API-anrop, den kostar ingenting. Varför inte köra den varje gång?
- **Pre-step i run.ts** — istället för att lägga allt ansvar på Historian. Garanterar att rapporten alltid finns.
- **7 checks** — gick längre än ROADMAP:ens 4 (isolerade, dubbletter, brutna, stale). La till provenance, scope och missing edges baserat på vad Explore-agenten hittade i grafen.

---

## Runda 1 — Första granskning

**Betyg:** 8.4/10 — GODKÄND MED RESERVATIONER

### Vad Brief Reviewer hittade:

**1 kritiskt problem:**
- **AC19 kontra briefens textbeskrivning** — Briefen beskrev BÅDE att `run.ts` injicerar en trigger OCH att Historian-prompten skulle trigga Consolidator. Brief Reviewer var skarp här: "Utan detta svar kan agenten implementera dessa två saker parallellt och få dubbel triggering."

**3 förbättringsförslag:**
- Historian-prompten antog specifik stegnumrering (9/10) — "vad om numreringen ändrats?"
- `graph-merge.ts` signaturer ospecificerade — "agenten måste läsa filen ändå"
- `loadGraph()` källa ospecificerad — "från vilken modul?"

**3 mindre noteringar:**
- MissingEdgesCheck saknade RED-tröskel
- ProvenanceCheck — `solves` vs `discovered_in` semantik
- AC8 — Historian behöver toolet i sin tool-lista, inte bara registrerat globalt

### Mina tankar (Claude Code) efter runda 1:

Brief Reviewer hade helt rätt om dubbelmekanismen. Det var mitt tydligaste misstag — jag hade skrivit briefen med en "bälte-och-hängslen"-approach där BÅDE run.ts OCH Historian skulle trigga Consolidator. I verkligheten ska det vara EN mekanism. Jag valde run.ts-mekanismen (samma mönster som `maybeInjectConsolidationTrigger`).

Stegnumreringen var en bra catch — jag antog att Historian-prompten hade exakt steg 9 och 10, men efter 11 intervjuer och omskrivningar kan numreringen ha ändrats. "Hitta via namn, inte nummer" är robust.

### Vad jag fixade:
- AC19 omskriven: explicit att `run.ts` äger triggern, Historian bara rapporterar
- Stegnumrering → namnbaserad identifiering ("mellan Skeptiker-granskning och Stop")
- La till "granska signaturer först"-instruktion
- Specificerade `loadGraph()` källa: `src/core/knowledge-graph.ts`
- Förtydligade MissingEdgesCheck: "aldrig RED (informativ check)"
- Separerade provenance-semantiken: `discovered_in` ja, `solves` nej
- Fixade AC8: la till Historians tool-lista

---

## Runda 2 — Efter första fixar

**Betyg:** 8.0/10 — GODKÄND MED RESERVATIONER

### Vad Brief Reviewer hittade:

**0 kritiska problem** — det stora AC19-problemet var löst.

**3 förbättringsförslag:**
- **AC8 blandar instruktion med verifiering** — "(verifiera i historian.ts)" är en instruktion, inte ett AC. Dela upp i AC8a och AC8b.
- **Korrupt graph.json** — briefen hanterar saknad fil men inte korrupt JSON
- **`maybeInjectHealthTrigger` parametern** — vad händer om loadGraph() kastade? Funktionen anropas aldrig, men det stod inte explicit.

### Mina tankar efter runda 2:

Betyget sjönk från 8.4 till 8.0 — men inte för att briefen blev sämre. Brief Reviewer grävde djupare denna gång och hittade en ny kategori av problem: felhantering vid oväntade tillstånd. "Korrupt graph.json" var ett scenario jag inte hade tänkt på alls. I en produktion med 176+ körningar är det inte otänkbart att filen blir korrupt.

AC8-splitten var pedagogiskt korrekt — ett AC ska vara mätbart, inte innehålla "verifiera att..."-instruktioner.

### Vad jag fixade:
- AC8 → AC8a + AC8b
- La till try/catch-block i run.ts-kodexemplet med tydlig felhantering
- Specificerade: "Om loadGraph() kastar → funktionen anropas aldrig"
- La till "Körningen blockeras ALDRIG av health check-fel"

---

## Runda 3 — Efter felhanteringsfixar

**Betyg:** 7.8/10 — GODKÄND MED RESERVATIONER

### Vad Brief Reviewer hittade:

**1 kritiskt problem:**
- **`historian.ts` saknas i "Filer att ändra"** — AC8b kräver att toolet läggs till i Historians tool-lista i `historian.ts`, men filen stod inte i ändringstabellen. En agent som följer tabellen strikt missar denna ändring.

**2 förbättringsförslag:**
- **Sektion 4 säger "Historian ska skriva rapporten"** men det är run.ts som skriver den. Verbal inkonsekvens.
- **AC22 "integration-tester"** — ospecificerat var de ska bo.

### Mina tankar efter runda 3:

Betyget sjönk igen (7.8) — och detta var frustrerande. Problemet var att jag hade fixat AC8 korrekt men glömt att uppdatera filändringslistan. Det är exakt den typen av inkonsekvens som en agent-svärm snubblar på: AC:n säger en sak, tabellen en annan, och agenten måste gissa vilken som gäller.

Den verbala inkonsekvensen i sektion 4 ("Historian ska skriva rapporten") var ett kvardröjande spår från min ursprungliga design där Historian ägde hela flödet. Jag hade ändrat designen till pre-step men glömt uppdatera en mening.

**Insikt:** Briefskrivning liknar kodning — efter en refactor måste man granska ALLA referenser, inte bara den primära ändringen. Brief Reviewer fungerade som en linter för prosa-konsistens.

### Vad jag fixade:
- La till `historian.ts` i filändringslistan
- Ändrade sektion 4: "Rapporten skrivs av run.ts som pre-step. Historian LÄSER den."
- Specificerade AC22: tester i `graph-health.test.ts`, unit-tester av `maybeInjectHealthTrigger()`

---

## Runda 4 — Slutgranskning

**Betyg:** 8.4/10 — GODKÄND (utan reservationer!)

### Vad Brief Reviewer hittade:

**0 kritiska problem.**

**2 förbättringsförslag:**
- **Provenance-kantriktning** — briefen sa "nod→run" men specificerade inte om det är `edge.from === nodeId` eller `edge.to === nodeId`. Kritiskt för korrekt implementation.
- **AC22 nivåförtydligande** — "integration-tester" som egentligen är unit-tester av en ren funktion.

**3 mindre noteringar:**
- MissingEdgesCheck deklarerar RED i typen men emitterar det aldrig
- Historian-stegplacering om prompten ändrats
- Trigger-textens format bör matcha befintlig konvention

### Mina tankar efter runda 4:

Brief Reviewer var nöjd! Inga reservationer. De kvarvarande förslagen var genuint mindre — kantriktningen var en bra precision som jag la till ("Verifiera konventionen genom att läsa befintliga kanter"), och AC22-förtydligandet var en definitionsfråga snarare än ett verkligt problem.

Det som stack ut: Brief Reviewer noterade att "bakgrundsdatan är exceptionellt konkret" (83% isolerade noder etc.) och att detta gör briefen trovärdig. Det var ett direkt resultat av Explore-agentens djupresearch i fas 0.

---

## Utvecklingen över 4 rundor

### Betygsutveckling

| Runda | Betyg | Kritiska | Förbättringar | Status |
|-------|-------|----------|---------------|--------|
| 1 | 8.4 | 1 | 3 | Godkänd med reservationer |
| 2 | 8.0 | 0 | 3 | Godkänd med reservationer |
| 3 | 7.8 | 1 | 2 | Godkänd med reservationer |
| 4 | 8.4 | 0 | 2 | **Godkänd** |

### Varför sjönk betyget i runda 2 och 3?

Betyget sjönk INTE för att briefen blev sämre — tvärtom. Brief Reviewer grävde djupare i varje runda och hittade nya kategorier av problem:

- **Runda 1:** Designnivå-problem (dubbelmekanismen)
- **Runda 2:** Felhanteringsnivå (korrupt JSON, null-parametrar)
- **Runda 3:** Konsistensnivå (filändringslista vs AC, verbal inkonsekvens)
- **Runda 4:** Precisionsnivå (kantriktning, testdefinitioner)

Varje runda adresserade problem på en djupare nivå. Betygssänkningen speglar att granskaren höjde ribban — inte att briefen degraderades.

### Totalt antal identifierade problem

| Kategori | Runda 1 | Runda 2 | Runda 3 | Runda 4 | Totalt |
|----------|---------|---------|---------|---------|--------|
| Kritiska | 1 | 0 | 1 | 0 | **2** |
| Förbättringar | 3 | 3 | 2 | 2 | **10** |
| Mindre | 3 | 1 | 2 | 3 | **9** |
| **Summa** | **7** | **4** | **5** | **5** | **21** |

### Alla fixade problem (kronologisk ordning)

1. AC19 dubbelmekanismen → EN trigger via run.ts
2. Stegnumrering → namnbaserad identifiering
3. Signaturer ospecificerade → "granska först"-instruktion
4. `loadGraph()` källa → specificerad som `knowledge-graph.ts`
5. MissingEdgesCheck RED-tröskel → "aldrig RED"
6. Provenance-semantik → `discovered_in` ja, `solves` nej
7. AC8 Historians tool-lista → explicit krav
8. AC8 instruktion vs verifiering → AC8a + AC8b
9. Korrupt graph.json → try/catch med continue
10. `maybeInjectHealthTrigger` null-fall → "anropas aldrig"
11. `historian.ts` i filändringslistan → tillagd
12. Sektion 4 verbal inkonsekvens → "run.ts skriver, Historian läser"
13. AC22 placering → specificerad fil och typ
14. Provenance kantriktning → explicit from/to med verifikationsinstruktion
15. AC22 nivå → omdefinierad som unit-tester

---

## Mönster och insikter

### 1. Brief Reviewer som prosa-linter

Brief Reviewer fungerade som en konsistenskontroll för hela dokumentet — inte bara för teknisk korrekthet. Den hittade verbal inkonsekvens (sektion 4 vs sektion 6), tabellinkonsistens (filändringslista vs AC), och definitionsförvirring (AC8 instruktion vs verifiering). Dessa är exakt de problem som gör att en agent-svärm misslyckas: tvetydighet i specifikationen.

### 2. Fixar som skapar nya problem

Varje fix-runda riskerade att introducera nya inkonsekvenser. Exempel: när jag fixade AC8 till AC8a + AC8b (runda 2), glömde jag uppdatera filändringslistan (hittat i runda 3). Mönstret: **varje refactor kräver en genomsökning av alla korsreferenser**.

### 3. Brief Reviewer grävde djupare för varje runda

Runda 1 hittade designnivå-problem. Runda 4 hittade precisionsnivå-problem. Detta tyder på att Brief Reviewer inte "ger sig" utan istället flyttar fokus till nästa abstraktionsnivå. Det är produktivt beteende — men det innebär också att betyget kan sjunka trots förbättringar.

### 4. Explore-agentens research var avgörande

Att ha faktiska siffror (83% isolerade, 270 saknar provenance) i briefen fick konsekvent beröm från Brief Reviewer. Utan den djupa researchen hade briefen blivit vag och hypotetisk. **Konkret bakgrundsdata höjer brief-kvaliteten markant.**

### 5. "Ej verifierbart" är inte samma som "fel"

Brief Reviewer markerade många kodreferenser som "Ej verifierbart" (den har inte tillgång till src/-katalogen). Det betyder inte att referenserna är felaktiga — bara att granskaren inte kunde bekräfta dem. Briefen instruerar agenten att "granska signaturer först" som mitigation, vilket reviewern berömde.

---

## Slutsats

4 rundor tog briefen från "bra med tvetydigheter" till "körbar utan reservationer". De 15 fixarna eliminerade tvetydigheter som annars hade lett till att agentsvärmen implementerade fel sak eller implementerade rätt sak på fel sätt.

Den viktigaste insikten: **en brief som ser bra ut vid första genomläsning kan fortfarande ha subtila inkonsekvenser som en agent-svärm snubblar på**. Brief Reviewer-processen fungerar som kvalitetssäkring — inte för att hitta stora designfel (de är ofta uppenbara) utan för att hitta de små inkonsistenserna som kostar tid under implementation.

Briefen är nu redo för körning.
