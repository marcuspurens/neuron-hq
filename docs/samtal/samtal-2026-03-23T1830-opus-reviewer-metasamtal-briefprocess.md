# Metasamtal: Opus (brief-skrivare) + Brief Reviewer (Sonnet) — Varfor tar det 5 rundor?

**Datum:** 2026-03-23
**Session:** 134
**Deltagare:** Opus 4.6 (brief-skrivare i Claude Code) + Brief Reviewer (Sonnet 4.6, via brief-review CLI)
**Kontext:** Brief 3.2a A-MEM granskades 5 ganger. Marcus fragade: "Varfor ar det svart att skriva mer ratt fran borjan?"

---

## Bakgrund

Brief 3.2a (orchestrator-flytt + abstraktion) bollades genom Brief Reviewer 5 ganger:
1. Runda 1-2: Ur den storre 3.2-briefen (UNDERKAND -> 8/10)
2. Runda 3-5: Uppdelad 3.2a (8/10 -> 8/10 -> 8.4/10)

Varje runda hittade Reviewer forbattringar som Opus borde ha fangt fran start. Marcus stallde fragan: vad ar grundorsaken?

---

## Opus sjalvanalys (brief-skrivaren)

### Konsekvent glommer:
1. **Specificerar vad, men inte var data ror sig mellan lager** — skriver "reason sparas inte i grafnoden" pa ett stalle men inkluderar `reason` i interfacet pa ett annat
2. **AC:er som verifierar existens, inte beteende** — "generalizes ar giltig EdgeType" sager inget om vad som hander nar kanten anvands
3. **Underskattar mottagaren** — skriver som om en annan Opus laser, men det ar Sonnet som kor
4. **Sager "agenten loser det" som ursakt** — avslojat i sessionen

### Vad Opus saknar:
En checklista innan briefen skickas:
- Har varje AC en testbar assertion, inte bara en beskrivning?
- Har jag specificerat algoritm dar det behovs?
- Har jag tankt igenom felfall systematiskt?
- Har jag specificerat dataflodens explicit?
- Ar instruktionerna explicita nog for Sonnet?

---

## Brief Reviewers analys (Sonnet)

### 1. Monster i Opus fel

**Det stora monstret: Specificerar uppifran-ned men glommer granssnitten.**

Bra pa *vad* och *varfor*. Missar *var data ror sig mellan lager*.

Konkreta exempel:
- `reason`-flodet: Specificerat i tre stallen, inkonsistens varje gang. Grundproblemet: inget "reason fods har, lever har, dor har"
- `abstractionReasons[]`-livscykeln: Inte specificerad alls
- `commonNeighborCount` for kedjiga kluster: Definierad i text men inte entydigt implementerbart

**Det nast storsta: AC:er som verifierar existens, inte beteende.**

"AC9: 'generalizes' ar giltig EdgeType" ar ett existenstest. Sager inget om vad som hander i traversal, PPR, export.

**Tredje: Forutsatter att monster som "bevisats" ar identiska med koden.**

"Samma monster som Historian i S132" ar en mansklig approximation. Agenten maste implementera mot faktisk kod.

### 2. Vad Brief Reviewer saknar

**Storsta: Har aldrig sett koden.**

Granskar intern konsistens i briefen, INTE konsistens mellan briefen och verkligheten. Kan saga "AC4 ar tydlig" men inte "AC4 stammer med hur grafen faktiskt ar strukturerad."

Onskar: Faktiskt filinnehall for refererade filer, inte bara filnamn.

**Nast storsta: Ingen history om varfor anringar gjordes.**

Ser att AC8 byttes fran "kedjiga kluster" till "connected components" men vet inte varfor — var det Reviewers flaggning, eller Opus designbeslut?

**Tredje: Ingen kalibrering mot vad Sonnet faktiskt producerar.**

Bedomning av "agentergonomi" ar teoretisk. Vet inte om Sonnet konsekvent missar en viss typ av specifikation.

### 3. Problem pa Reviewers sida

**Severity-inflation ar faktiskt problem.**

Prompten varnar for det men Reviewer gor det anda. Flaggar teoretiska problem som kostar rundor. Varje forslag skapar implicit forvantan att det ska adresseras.

**Granskar inte scope-splittningen kritiskt.**

Accepterade "del 1 av 2" utan att verifiera att del 1 inte lamnar systemet halvfardigt.

**Formulerar osakerhet som "tips" istallet for att vara rak.**

"Tips: las consolidator.ts forst" ar egentligen "jag kan inte verifiera detta och det ar en risk."

### 4. Ideal process (Reviewers forslag)

**Steg 1: Brief-skrivaren gor "reality check" innan granskning.**
Oppna faktiska filer, verifiera signaturer. 10 minuter. Eliminerar hela kategorin "LLM hallucinar kodreferenser."

**Steg 2: Briefen inkluderar "verifierat mot kod"-avsnitt.**
```
## Verifierat mot kod (skribenten)
- runHistorian(ctx, baseDir) i run.ts: signatur bekraftad, rad 142-167
- ConsolidatorAgent i consolidator.ts: klass med .run(), inga befintliga tools heter 'abstract'
- findDuplicateCandidates(): signatur (graph, threshold?), inga options-parameter annu
```

**Steg 3: Granskaren klassificerar med agent-riskpoang.**
Inte 1-10 per dimension. Istallet: "Orsakar detta att agenten fragar (stoppar), bygger fel (fix-runda), eller ar suboptimalt (teknisk skuld)?"

**Steg 4: Korning -> retrospektiv -> brief-mall uppdateras.**
Varje gang Sonnet missar nagot som borde ha statt i briefen: uppdatera mallen, inte bara nasta briefs AC:er.

### 5. Saknas en agent?

**Ja — en kod-ankare-agent.**

Inte en "pre-reviewer" — en agent som innan briefen skickas kör faktisk sokning mot koden:

```
Filer som briefen modifierar:
- src/commands/run.ts: runHistorian() pa rad 142
- src/core/agents/consolidator.ts: 2 befintliga tools, ConsolidatorAgent.run() pa rad 45
- src/core/graph-merge.ts: findDuplicateCandidates() signatur: (graph, threshold = 0.6)

Refererade funktioner som INTE hittades:
- delegate_to_consolidator: sokte i manager.ts, hittades inte

Varningsmarkeringar:
- EdgeTypeSchema hittades pa rad 12 i knowledge-graph.ts — Zod-schema, korrekt
```

30 sekunder av grep. Eliminerar hela "Konsistent"-kategorin.

### 6. Hur explicit for Sonnet?

**Sonnet behover inte veta varfor.** Bakgrundssektionen ar for Opus och Reviewer.

**Sonnet behover veta exakt vad, men inte hur.** "Bygg connected-components-algoritm" ar onodigt — Sonnet kan designa algoritmen. Det som behovs: "returnera grupper av >= minClusterSize noder" + testfall.

**Det Sonnet missar mest: Granssnittskontrakt och livscykler.**
- Var skapas variabeln? Var lever den? Var dor den?
- Vad returneras vid fel — Error, null, tom array?
- Vilket tillstand ska systemet vara i om funktionen halvvags kastar?

**Testkraven ar viktigare an specifikationskraven.** Tester ar maskinlasbar specifikation. Briefar ar mansklig avsikt.

---

## Marcus kommentarer

*(Fylls i av Marcus efter lasning)*

---

## Slutsats

Grundorsaken till att det tar 5 rundor: **Briefen skrivs mot en mental modell av koden, inte mot faktisk kod.**

Losningen har tva delar:
1. **Kod-ankare** (agent eller manuellt steg) som verifierar kodreferenser innan review
2. **Explicit dataflodesspec** i briefen — var data fods, lever, dor

Med dessa tva atgarder hade de fem rundorna troligen blivit tva.
