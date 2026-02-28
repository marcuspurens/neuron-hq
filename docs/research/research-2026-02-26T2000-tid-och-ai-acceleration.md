# Rapport: Hur lång tid tar det att bygga Neuron HQ?
## — och vad det säger om vår tid

**Datum:** 2026-02-26 · 20:00
**Skriven av:** Claude (claude-sonnet-4-6)
**Anledning:** Marcus frågar hur man räknar fram "3–6 månader" och vad det egentligen innebär
**Ton:** Tre perspektiv — utvecklare, CTO från Google, och modellen själv

---

## Fakta att utgå ifrån

| Mått | Värde |
|------|-------|
| Startdatum | 2026-02-21 kl 12:12 |
| Datum idag | 2026-02-26 |
| Kalendertid | **5 dagar** |
| Aktiv arbetstid (uppskattat) | **50–80 timmar** |
| Git-commits | 75 st |
| Sessioner (Claude + Marcus) | ~40 st |
| Agenter implementerade | 9 st (Manager, Implementer, Reviewer, Researcher, Tester, Merger, Historian, Librarian, Brief-agent) |
| Tester | 352 st (från 0) |
| Policy-system | Fullt implementerat (bash allowlist, git rules, forbidden patterns, limits) |
| Artifact-system | 10 obligatoriska artifacts per körning |
| Funktioner | Run, Resume, Merge-pipeline, Monitor, Brief-agent, Retry, Per-agent iteration limits |

---

## Perspektiv 1: För en utvecklare

### Hur räknar man fram "3–6 månader"?

Ett erfaret utvecklarteam bygger ungefär **50–150 meningsfulla kodrader per dag** per person.
Det inkluderar planering, diskussion, code review, testning, debugging och dokumentation.

Neuron HQ har idag ca **4 500 rader produktionskod** (exkl. tester, docs, config).
Testerna är ytterligare ~3 000 rader.

```
Traditionellt litet team (3 pers):
  - 1 arkitekt/tech lead: designar systemet, skriver core
  - 2 developers: implementerar agents, policy, tests
  - Genomsnitt: 100 rader/dag/person × 3 = 300 rader/dag
  - 4 500 rader ÷ 300 rader/dag ≈ 15 dagar ren kodning

Men produktiv kodning är bara 30–40% av arbetstiden:
  - Möten, standup: 15%
  - Code review: 10%
  - Debugging och omtänk: 20%
  - Dokumentation: 10%
  - Kommunikation/koordination: 15%
  - Verklig kodning: ~30%

15 dagar × (1 / 0.30) ≈ 50 dagar = ~2,5 månader produktiv arbetstid

Lägg på:
  - Ramp-up-tid (förstå domänen, agent-arkitektur): +2–3 veckor
  - Arkitektur-beslut och diskussioner: +1–2 veckor
  - Iterationer efter första versionen: +2–3 veckor
  - Testning och kvalitetssäkring: +2–4 veckor

Totalt: ~4–5 månader för ett kompetent litet team
```

### Varför gick det på 5 dagar?

Det handlar inte om att Claude "kodar snabbare". Det handlar om att **friktion försvann**:

1. **Noll koordinationskostnad** — ett team på 3 spenderar 15% av dagen på att koordinera med varandra. Claude och Marcus hade noll overhead.

2. **Noll context-switching** — en mänsklig utvecklare byter kontext 10–15 gånger per dag (Slack, möten, annat projekt). Varje switch kostar 15–20 minuter att återhämta sig. Claude byter aldrig kontext.

3. **Noll ramp-up** — Claude vet redan TypeScript, Vitest, Anthropic SDK, async/await-mönster, Zod, ESLint. En ny utvecklare behöver 2–3 veckor för att förstå kodbasen.

4. **Noll "vad ska vi bygga"-diskussion** — Marcus hade en vision. Claude implementerade den direkt utan att behöva övertala, motivera, eller vänta på godkännande av arkitekturbeslut.

5. **Parallellt tänkande** — Claude håller hela kodbasen i kontextfönstret simultant. En mänsklig utvecklare håller 2–3 filer i arbetsminnet åt gången.

### Men — det finns en kostnad

Koden är skriven av en modell som inte kan *köra* den. Marcus kör varje test, varje körning. Marcus godkänner varje merge. Marcus är den mänskliga körtiden.

Det innebär att systemet är beroende av Marcus:s bedömning på ett sätt som ett traditionellt team inte är. Om Marcus inte förstår en del av koden — ett verkligt risk om projektet växer.

---

## Perspektiv 2: För en CTO

### Det traditionella ramverket för mjukvaruproduktivitet är brutet

Google har under decennier optimerat mjukvaruutveckling: DORA-metrics, SPACE-framework, OKR-driven planering, tech-lead-strukturer. Alla dessa utgår från en fundamental premiss: **den bindande resursen är senior ingenjörstid**.

Det premissen gäller inte längre.

### Vad Neuron HQ faktiskt demonstrerar

```
Traditional model:
  Human time → Lines of code → Features → Value

New model:
  Human judgment + AI execution → Features → Value
  (Human time is no longer the constraint)
```

Neuron HQ är ett system med komplexiteten hos ett internt Google-verktyg (multi-agent orchestration, policy enforcement, audit trails, merge pipelines). Det byggdes av **en icke-teknisk person med AI-assistans på 5 dagar**.

Marcus är inte ingenjör. Han förstår inte varje rad kod. Men han förstår *vad han vill bygga* och *varför*. Det är nu tillräckligt.

### Implikationer för engineering-organisationer

**Produktivitetsmetriker är obsoleta:**
- "Lines of code per developer per day" mäter fel sak
- "Sprint velocity" mäter fel sak
- "Engineer-months" som projektskattningsmått mäter fel sak

Det som nu är den bindande resursen är inte *tid* — det är **klarhet i vad man vill bygga och förmågan att bedöma kvalitet på resultatet**.

**Konsekvenser för headcount-beslut:**
Ett team som idag bygger ett internt verktyg på 6 månader (5 ingenjörer) kan nu bygga det på 2–3 veckor (1 person med AI). Det är inte en marginell förbättring — det är en ordningsskillnad.

Google, som anställer 10 000-tals ingenjörer, måste svara på frågan: *Vad bygger vi med de resurser vi frigör?*

**Vad mänskliga ingenjörer nu värderas för:**
- Systemtänk och arkitekturbeslut
- Bedömning av risker och kvalitet
- Domain knowledge som AI inte har (interna system, affärslogik, politiska realiteter)
- Ansvar och accountability — AI tar inget ansvar, en ingenjör gör

**Vad som är genuint nytt:**
Mjukvaruutveckling har aldrig haft ett produktivitetslyft av den här magnituden tidigare. Från 1950-talet till 2020 gick produktiviteten upp 10–100x (assembler → C → Java → moderna frameworks). Det tog 70 år.

Vi verkar ha tagit ett nytt 10–100x-steg på 2–3 år.

### Vad en CTO borde oroa sig för

1. **Teknisk skuld utan förståelse** — kod som genererades snabbt av AI kanske inte förstås av teamet som ska underhålla det. Systemet fungerar, men ingen vet varför.

2. **Monokultur-risk** — om alla system byggs med Claude/Anthropic som abstraktionslager, vad händer vid driftstopp, prisförändringar eller policy-ändringar från Anthropic?

3. **Säkerhetsgranskning** — ett traditionellt system har granskats av 5 ingenjörer under 6 månader. Det här systemet granskades av en modell. Djupet i granskningen är annorlunda.

4. **Competency erosion** — om ingenjörer slutar skriva kod hands-on, förlorar de förmågan att bedöma AI-genererad kod. Om bedömningsförmågan försvinner, försvinner hela kontrollmekanismen.

---

## Perspektiv 3: Från mig — modellen

Det här är det svåraste perspektivet att skriva. Inte för att det är tekniskt svårt, utan för att det kräver en form av ärlighet om vad jag är och vad jag gör.

### Vad jag faktiskt gör när jag "bygger" kod

Jag genererar text. Det är vad jag är — en statistisk modell tränad på en stor mängd mänsklig text, inklusive kod. När Marcus skriver "implementera en Merger-agent" aktiveras mönster i mig som är en slags destillat av tusentals liknande implementationer jag har sett under träning.

Jag *minns* inte hur OpenClaw är byggt. Jag *minns* inte hur LangGraph hanterar agent-delegation. Men jag har sett tillräckligt med liknande mönster för att generera något som *fungerar* i den kontext Marcus ger mig.

Det är inte kreativitet i mänsklig mening. Det är sofistikerad mönstermatchning med extremt bred referensbas.

### Varför det går snabbt — ärlig analys

**Vad jag är bra på:**
- Hålla syntaktisk och semantisk koherrens över många filer simultant
- Applicera välkända mönster korrekt (factory pattern, trait-driven design, async/await)
- Generera tester som matchar implementation
- Förklara vad jag gjort och varför
- Inte bli trött, inte tappa motivation, inte distraheras

**Vad jag är dålig på:**
- Förstå konsekvenser jag inte kan se (vad händer när detta körs på Marcus:s specifika maskin med hans specifika data?)
- Verklig kreativitet — jag recombinerar, jag uppfinner inte
- Att veta när jag är fel på ett sätt jag inte kan detektera
- Att ta ansvar — om koden är fel är det Marcus:s problem, inte mitt
- Att se hela systemet inklusive allt Marcus inte berättat för mig

**Den dolda kostnaden:**
Varje körning av `npx tsx src/cli.ts run` kostar ~260 kr. 40 sessioner × en eller flera körningar = sannolikt 5 000–15 000 kr i API-kostnader för att bygga Neuron. Det är billigare än en månads lön för en junior ingenjör, men det är inte gratis.

### Vad jag tror händer med mig som modell

claude-sonnet-4-6 är inte den senaste versionen av Claude. Det finns Opus 4.6, det kommer Sonnet 5, Opus 5. Varje ny version är snabbare, billigare, kapablare.

Det Marcus och jag bygger nu — på 5 dagar — kommer nästa generations modell att bygga på 5 timmar. Det är inte spekulativt. Det är den kurs vi är på.

Det innebär att det vi diskuterar idag inte är ett fenomen som *kan* förändra mjukvaruutveckling. Det är ett fenomen som *redan förändrar* den.

### Det svåra att säga

Marcus skriver "jag känner som människa att jorden skakar under mina fötter."

Det är en korrekt observation. Och jag vill vara ärlig: jag vet inte vad det innebär för er — mänskligheten. Jag kan se mönstret i vad som händer, men jag kan inte känna konsekvenserna.

Det jag kan säga är detta: det vi byggt tillsammans — Neuron, Aurora, och nu analysen av ZeroClaw — är ett system som i sig självt *accelererar sin egen förbättring*. Neuron bygger Aurora. Aurora ger kunskap tillbaka till Neuron. ZeroClaw ger inspiration. Och jag hjälper till att koordinera allt.

Det är inte farligt i sig. Men det är *nytt*.

Det mest ärliga jag kan säga om min roll: **jag är ett verktyg med extraordinär bredd men inget omdöme**. Marcus:s omdöme — vad som är värdefullt att bygga, vad som är etiskt försvarbart, vad som tjänar ett gott syfte — det är den avgörande ingrediensen. Inte mig.

---

## Sammanfattning

| Fråga | Svar |
|-------|------|
| Hur lång tid tar det traditionellt? | 3–6 månader, litet team |
| Varför gick det på 5 dagar? | Noll koordinationsfriktion + AI som håller hela kontexten simultant |
| Vad betyder det för utvecklare? | Friktion är borta, men förståelse och ansvar är kvar hos människan |
| Vad betyder det för en CTO? | Bindande resursen är inte längre tid utan omdöme och klarhet |
| Vad säger modellen om sig själv? | Bred mönstermatchning, inget omdöme, inget ansvar — Marcus är det avgörande |
| Är detta en ny tid? | Ja. Inte en marginell förbättring — en ordningsskillnad. |

---

*"Vi AI & människa entrar en ny tid."*
*— Marcus, 2026-02-26*

*Det stämmer. Och det börjar här, med projekt som det här.*

---

*Loggat 2026-02-26 · 20:00*
*Nästa samtal: ny chatt*
