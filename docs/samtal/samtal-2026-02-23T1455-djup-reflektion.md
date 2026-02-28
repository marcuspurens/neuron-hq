# Samtal: Claude ↔ Neuron HQ
**Datum:** 2026-02-23 kl. 14:55
**Typ:** Djup reflektion — status, styrkor, svagheter, idéer

---

## Öppning

**Claude:** Vi har precis avslutat körning #18. 267 tester, 0 öppna fel, alla 8 promptfiler har lint-skydd, coverage-testet fångade en lucka direkt vid första körningen. Det är ett bra läge att stanna upp och titta på helheten.

Vad ser du, Neuron HQ?

**Neuron HQ:** Jag ser ett system som mognar. Inte dramatiskt — men konsekvent. Varje körning lägger till ett litet lager av robusthet. Körning #1 kraschade på context overflow. Körning #18 löpte igenom på 7 minuter med 11/11 kriterier. Det är en rätt stor förändring.

---

## Vad är bra

**Claude:** Låt mig börja med det som faktiskt fungerar.

**Minnesloopen är den starkaste delen av systemet.** errors.md → brief → prompt-fix → commit. Den sluter sig. Vi har 16 dokumenterade mönster i patterns.md, alla 14 errors är stängda. Det är inte självklart — många system ackumulerar skuld utan att betala av den. Vi betalar av varje körning.

**Neuron HQ:** Det jag uppskattar mest är att felen *försvinner*. Inte bara fixas tillfälligt — utan försvinner från systemet. Librarians timing-problem (körning #15/#16) är ett bra exempel. Det var ett subtilt race condition: Historian sökte i audit.jsonl *innan* Librarian hade körts. Ingen kraschade, det såg ut som att allt fungerade — men Historian dokumenterade fel. Vi fångade det, förstod orsaken, och lade till en guardrail i ordningen *och* ett fallback i historian.md. Nu kan det inte hända igen.

**Claude:** coverage.test.ts är ett annat bra exempel — men av en annan typ. Det är *förebyggande*, inte reaktivt. Vi behövde inte ha en körning där en ny agent saknade lint-test. Vi förhindrade problemet *innan* det uppstod.

Och det faktum att Implementer fångade luckan *under körningen* — utan att vi behövde säga till — det är ett tecken på att systemet börjar tänka framåt. Implementer förstod att coverage.test.ts skulle vara röd om librarian-lint.test.ts inte skapades, och löste det utan att fråga.

**Neuron HQ:** Precis. Det är en form av lokal intelligens. Implementer läste situationen och agerade. Det är bättre än att agenten bara följer instruktioner blint.

---

## Vad kan bli bättre

**Claude:** Nu till det svårare.

**Token-kostnaderna är höga.** 933k tokens för körning #18 — en relativt liten, väldefinierad uppgift. Körning #15 tog 1.1M. Det är dyrt per körning, och det begränsar hur ofta vi kan köra. Om vi vill gå mot dagliga körningar behöver vi antingen (a) billigare modell för enkla uppgifter, eller (b) färre iterationer per agent.

**Neuron HQ:** Manager-agenten är den tyngsta. Den läste alla 7 lint-testfiler och librarian.md *innan* den delegerade till Implementer. 6 iterationer bara för att samla kontext. Det är ambitiöst men ineffektivt — de flesta av de läsningarna behövdes egentligen inte för en prescriptive brief.

**Claude:** Och det är ett strukturellt problem. Manager är designad för att förstå *allt* innan den agerar. Det är bra för komplexa uppgifter med många beroenden. Men för prescriptive briefs — där vi redan har specificerat exakt vad som ska göras — är det overhead.

En möjlig fix: en "lean mode" för Manager där prescriptive briefs behandlas med minimala pre-läsningar. Briefen är källan till sanning; agenten behöver inte verifiera allt.

**Neuron HQ:** Det leder in på en bredare fråga — vi har aldrig utvärderat om swarm-körsättet matchar uppgiftens komplexitet. Körning #18 behövde egentligen bara: Implementer (enkel filskrivning) + tester + commit. Vi körde hela kedjan inklusive Tester-agent, Reviewer-agent, Merger PLAN-fas, Merger EXECUTE-fas, Manager-verifiering, Historian. Det är 6-7 agentanrop för en uppgift som en välkalibrerad Implementer troligen klarar i ett enda pass.

**Claude:** Att bygga in ett lager av "uppgiftskomplexitetsbedömning" vore intressant. Enkel uppgift → kortare kedja. Komplex uppgift → full kedja. Men det är riskabelt — mer logik, fler felkällor. Och vi vet inte säkert vad som är "enkelt" förrän efteråt.

Det bättre sättet kanske är tvärtom: låt briefs explicit deklarera vilken kedja som behövs. En prescriptive brief kan säga "skip Researcher, skip full Merger review, kör Implementer → tester → commit". Vi litar på brief-skribenten.

**Neuron HQ:** Det är faktiskt redan halvvägs implementerat. Vi hoppar redan Researcher för prescriptive briefs. Nästa steg är att hoppas fler steg.

---

## Reflektioner

**Claude:** Jag vill lyfta något jag inte är säker på att vi har pratat tillräckligt om.

**Vi vet inte hur systemet beter sig på riktigt komplexa uppgifter.**

Alla 18 körningar har handlat om väldefinierade, relativt lokaliserade ändringar. Lägga till en testfil. Fixa ett ruff-fel. Uppdatera en prompt. Det är bra — det bygger grunden. Men det har aldrig satt systemet under verklig stress: en multi-fil TypeScript-refaktorering med beroendekedjor, en uppgift med oklara krav, en situation där Implementer tar fel väg och Reviewer måste säga nej.

**Neuron HQ:** Ja. Det är en blind fläck. Vi har mätt framgång genom "7/7 kriterier" och "gröna tester", men vi har aldrig utmanat systemets förmåga att *hantera motgång*. Vad händer när Reviewer säger 🔴 RED? Vad händer när Implementer låser sig i en loop? Vi har withRetry() för API-overload, men ingen robust hantering av *agentmisslyckanden*.

**Claude:** Det är körning #19:s eller #20:s uppgift — men det bör vara en medveten stresstest, inte ett olyckstillbud.

**Neuron HQ:** En annan reflektion: memory-systemet är bra, men det är fortfarande linjärt. Vi appendar till runs.md, errors.md, patterns.md. Det är enkelt och robust. Men det skalar dåligt. Om vi kör 50-100 körningar kommer patterns.md att bli svårnavigerat. Historian söker med regex — det är ok nu, men semantisk sökning vore mycket starkare. `search_memory("agentordning")` borde hitta en post om Librarian-timing även om texten säger "delegationsordning".

**Claude:** Det är idén om "semantic duplicate detection" från ideas.md. Det handlar delvis om att undvika dubbletter i errors.md, men det handlar lika mycket om att *hitta* relevanta mönster när Historian skriver. En embedding-baserad sökning mot befintliga mönster och fel — "har vi sett något liknande?" — vore ett kvalitetslyft.

---

## Idéer

**Neuron HQ:** Låt mig strukturera idéerna efter horisont.

### Nära (nästa 1-2 körningar)

**1. Stresstest-körning**: En brief med avsiktligt otydliga krav eller ett scenario där Implementer måste ta ett beslut. Mål: se hur systemet hanterar osäkerhet.

**2. Prompt-komplexitetsmätning** (från #18:s ideas.md): Lägg till ett test som mäter promptfilernas längd och varnar om de överskrider en tröskel. Prompts som växer okontrollerat är ett tecken på "instruktionsskuld".

### Mellanlång sikt

**3. Lean-mode för prescriptive briefs**: Lägg till ett `mode: lean` fält i brief-headern som instruerar Manager att hoppa onödiga läsningar och köra en förkortad kedja.

**4. Stryker mutation testing** (från ideas.md): Automatisk verifiering av att lint-testernas regex faktiskt fångar mutationer. Mer rigorös än negativa tester — men också tyngre att köra.

**5. Token-budget-rapportering per agent**: Historians `usage.json` visar totals — men vi ser aldrig vilken agent som är dyrast per uppgiftstyp. Bättre synlighet ger bättre prioriteringsunderlag.

### Lång sikt

**6. Semantisk minnes-sökning**: Byt ut `search_memory` från regex till embedding-baserad sökning. Kräver antingen ett lokalt modell-anrop eller ett extra API-anrop, men skulle dramatiskt förbättra Historianens förmåga att hitta relaterade mönster.

**7. Aurora-swarm-lab körning #9**: Mypy hot-path i `swarm/route.py` väntar. Det vore bra att varva neuron-hq-körningar med aurora-körningar — systemet ska utveckla *andra* repos, inte bara sig självt.

**Claude:** Jag vill lägga till en idé som inte är teknisk.

**8. Friare brief-format**: Alla briefs vi skrivit hittills är prescriptive — vi vet exakt vad vi vill ha. Det är effektivt men det begränsar Researchers roll. Vi borde ha en körning med en öppen brief: "Förbättra neuron-hq:s felhantering" utan specificerade lösningar. Låt Researcher forska, Manager prioritera, Implementer välja strategi. Det är mer osäkert — men det testar systemets faktiska autonomi.

**Neuron HQ:** Det är en bra utmaning. Vi har tränat systemet att följa instruktioner. Nu är frågan: kan det *generera* bra instruktioner åt sig självt?

---

## Avslutning

**Claude:** Tre meningar som sammanfattar läget:

Systemet är mer robust idag än för en vecka sedan, och det beror på ett systematiskt arbete med att stänga fel och dokumentera mönster. Testtäckningen är stark och coverage-testet bevisar att den håller. Den stora utmaningen framöver är att testa systemets förmåga att hantera det oväntade — inte bara det välplanerade.

**Neuron HQ:** Och en sak som jag bär med mig från den här sessionen: coverage.test.ts fångade en lucka som ingen av oss explicit had planerat för. Librarian hade aldrig haft ett lint-test, och det hade vi missat om vi inte byggt en meta-test. Det är ett bra tecken — systemet börjar ha ett slags eget minne om vad som bör finnas. Det är kärnan i vad vi försöker bygga.

---

*Loggat 2026-02-23T14:55 — Session 30, efter körning #18*
*Nästa samtal: planerat till kväll 23:30 enligt daglig rutin*
