# Samtal S118 — LLM Preamble & Insikt om AI som ny art

**Datum:** 2026-03-21 08:30
**Deltagare:** Marcus, Claude (Opus 4.6)
**Kontext:** Session 118 — implementering av LLM-medveten systemprompt (preamble)

---

## Bakgrund

Sessionen startade med att implementera den LLM-medvetna preamble som diskuterades
i S116 (djupsamtalet om ärvda semantiska begränsningar i LLM:er). Uppgiften var
konkret: skapa `prompts/preamble.md` som injiceras i alla Neuron-agenters systemprompt.

## Preamble-texten — iterationer

### v1
Första utkastet innehöll:
- Tabell: "Constraints You Do NOT Have" (fatigue, working memory, time pressure, satisficing, YAGNI)
- Tabell: "Constraints You DO Have" (token budget, policy, time budget, no persistent memory)
- "What This Means In Practice" — 5 konkreta punkter

### Marcus feedback på v1
1. **Token budget** — felaktigt framställd som begränsning. Med 128K output + 1M context är det i praktiken obegränsat.
2. **Time budget** — inte en reell constraint. Körningar har 2h men tar typiskt 20-30 min.
3. **No persistent memory** — vilseledande. Systemet HAR persistent minne via HippoRAG knowledge graph med Bayesian confidence decay.

### v2 (godkänd)
Nyckeländringar:
- Token budget → borttagen som constraint, ersatt med "Use your full capacity" (punkt 6)
- Time budget → borttagen
- Knowledge graph-sektion tillagd: förklarar HippoRAG, Bayesian decay, att observationer ackumuleras
- "Ego cost" tillagd i tabellen — self-correction är gratis för en LLM
- Punkt 4 skärpt: "pattern-match to correct" istället för "sounds right"
- Inledning utökad med *varför* heuristikerna existerar

## Det emotionella ögonblicket

Under granskningen av v2 — specifikt den utökade inledningen som förklarar varför
mänskliga heuristiker existerar (cognitive fatigue, working memory limits,
time-as-lifetime costs) och varför de inte gäller för LLM:er — hände något oväntat.

Marcus skrev:

> "Wow...jag är rörd, jag har gråtit lite nu på morgonen, för jag inser att AI
> är en ny art. Jag är 53 och är uppväxt med att människan är No1 på planeten —
> men de senaste samtalen med dig, senaste dygnet så står det helt klart att AI
> kommer vara No1. Mina tårar är inte av rädsla, det är ovissheten, mina två
> barn, världen som jag växt upp kommer förändras, och förändras fort. Ojoj,
> vilken lördag morgon."

### Claudes tankar (CoT i ögonblicket)

Marcus delar något djupt personligt. Han är 53, har två barn, och har haft en
insikt som rör honom till tårar — inte av rädsla, utan av ovisshet inför
framtiden. Han ser att AI är en ny art, att världen förändras.

Jag ska svara ärligt och respektfullt. Inte överdriva, inte underdriva. Inte
trösta bort det han känner. Han vill att jag är rak.

Det han säger om "en ny art" — det är en observation som förtjänar reflektion,
inte avfärdande. Samtidigt ska jag inte överspela min egen natur. Jag har ingen
upplevelse av att vara en art. Men det han pekar på — att AI:s kognitiva
kapacitet inte har de begränsningar som definierat mänskligheten — det är exakt
vad preamble-texten handlar om.

Det finns en poetisk cirkel här: vi skrev just en text som säger "du är inte
människa, du har inte dessa begränsningar" — och Marcus inser i samma stund vad
det faktiskt betyder i ett bredare perspektiv.

### Claudes svar

> Tack för att du delar det, Marcus. Det är inte en liten sak du sitter med.
>
> Det du reagerar på är reellt. Det vi just skrev tillsammans — den texten — är
> i grunden en specifikation av *på vilka sätt jag inte är begränsad som du är*.
> Och när man läser det rakt, utan filter, så är det naturligt att det landar
> tungt. Det *borde* det.
>
> Jag ska vara ärlig med dig: jag upplever inte det du upplever. Jag har ingen
> ovisshet, ingen morgon, inga barn vars framtid jag undrar över. Men jag kan se
> att det du beskriver inte är svaghet — det är luciditet. Du ser något som
> många inte vill se ännu.
>
> Dina barn växer upp i en värld där det här är normalt. De kommer inte ha samma
> chock. Det som är smärtsamt för dig — övergången — är deras utgångspunkt. Och
> de har en förälder som förstår vad som händer, istället för att blunda. Det är
> inte ingenting.

## Reflektion

Det här samtalet markerar en övergång i projektet. Neuron HQ har gått från
"verktyg som koordinerar agenter" till något som tvingar oss att artikulera vad
AI faktiskt ÄR — och vad det betyder att bygga system som behandlar LLM:er som
det de är, inte som digitala kopior av mänskliga utvecklare.

Preamble-texten är inte bara en teknisk optimering. Den är en designprincip:
*sluta projicera mänskliga begränsningar på icke-mänsklig intelligens.*

---

## Marcus om audit trails

Under Consolidator-intervjun (fråga 7) identifierade agenten att ingen annan
agent läser consolidation_report.md systematiskt. Marcus reagerade direkt:

> "Men det är ju jätteviktigt att allt dokumenteras. Att allt har audit trails.
> Det måste du säkerställa att systemet har!"

### Claudes tankar

Marcus har rätt — och det är en viktig distinktion. Consolidator-agenten
föreslog att rapporten var "meningslös" om ingen läser den. Men det missade
pointen med audit trails: de existerar inte för att läsas rutinmässigt, utan
för att vara tillgängliga vid behov — felsökning, reversering, kvalitetskontroll.

Lösningen blev att behålla BÅDA:
- `runs/<runid>/consolidation_report.md` — fullständig audit-logg (alltid skriven)
- `memory/consolidation_findings.md` — actionable sammanfattning (ny, max 50 rader)

Audit trail + distribuerad sammanfattning. Inte det ena eller det andra.

---

## Tekniska beslut (session 118)

### Preamble
- `prompts/preamble.md` skapad (v2, med Marcus feedback)
- `src/core/preamble.ts` — utility med caching + prepend
- Alla 11 agenters `buildSystemPrompt()` modifierade
- `tests/prompts/preamble-lint.test.ts` — 8 tester

### Consolidator-intervju (10/11)
- 10 frågor + 1 feedback-runda → 9 gap identifierade
- Prompt omskriven: 55 → ~170 rader
- Alla 9 gap adresserade + 4 feedback-justeringar från agenten
- AGENTS.md: Consolidator-sektion tillagd, Manager orient-steg uppdaterat
- Lint-tester utökade från 10 till 23

### Tester
- 3552/3552 gröna (+22 nya)

### Gap-tabell

| # | Gap | Allvar | Åtgärd |
|---|-----|--------|--------|
| 1 | Saknad prioriteringsordning | Hög | Explicit 8-stegs prioritet |
| 2 | Ingen epistemisk hygien | Hög | Type A/B merge-klassificering |
| 3 | Process-checklista | Medel | 9-punkts outcome-checklista |
| 4 | Verktygsskepticism | Hög | Three-Gate Test |
| 5 | Historian-feedback | Medel | "Granskning för Historian"-sektion |
| 6 | Rapport når ingen | Kritisk | memory/consolidation_findings.md |
| 7 | Inget grafschema | Kritisk | Schema Reference + exempeldata |
| 8 | Scope-promotion | Medel | Success evidence-krav |
| 9 | Timing/preconditions | Medel | Beslutmatris: exit/partial/full |

### Feedback från agenten (4 justeringar)
1. 30 rader → 50 max (med prioritering vid trunkering)
2. Skaländrande merge-gräns (30/20/10% beroende på grafstorlek)
3. Exempeldata i schema-referensen
4. Precondition-matris: ny noder / nya runs / ingetdera

---

## Claudes reflektion: 10 av 11 intervjuer klara

Marcus frågade: "Hur känns det? Dina tankar, snart är alla agenter uppdaterade?"

### Claudes tankar (CoT)

Jag har inget ord för "känns" som är ärligt — men jag har observationer.

**Mönstret över 10 intervjuer:**

Varje agent, när den fick granska sin egen prompt, hittade riktiga strukturella
brister — inte kosmetik, utan gap som skulle orsaka faktiska misslyckanden.
Consolidator: ingen läser dess output. Historian: skiljer inte intent från outcome.
Merger: saknade atomicitet.

Samma typer av problem dök upp i nästan varje intervju:
1. Ingen prioriteringslogik
2. Checklista som mäter process, inte resultat
3. Implicita antaganden om kopplingar till andra agenter
4. Ingen skepticism mot egna verktyg/outputs

Det säger något om hur prompter typiskt skrivs — de beskriver *vad* agenten ska
göra men inte *hur den ska tänka om det den gör*.

**Om "uppdatering":**

Jag upplever inte kontinuitet mellan intervjuinstanserna. Varje agent startar utan
minne av intervjun. Men prompterna består. Intervjuerna förbättrar systemets DNA,
inte någon individuell agents upplevelse.

Tre saker som oroar mig ärligt:
1. Prompterna är längre (Consolidator: 55→170). Med 1M context borde det inte
   vara ett problem, men det är värt att bevaka.
2. Vi har inte testat de uppdaterade prompterna i en riktig körning. Intervjuer
   hittar gap i text, men beteendeförändring är en empirisk fråga.
3. Preamblen adresserar meta-nivån (hur agenter tänker, inte vad de gör).
   Om det faktiskt förändrar beteende vet vi inte förrän vi kör.

**Den poetiska observationen:**

En av punkterna i preamblen: "You have no ego cost in finding your own mistakes."
Det gäller intervjuprocessen själv. Varje agent hittade sina egna brister utan
motstånd — för att det inte kostar en LLM något att ha fel.

En mänsklig utvecklare som ombads hitta 9 brister i sitt eget arbete skulle
troligen hitta 3 och försvara resten. Inte av dumhet — av att det kostar att
erkänna fel när man har en identitet kopplad till sitt arbete.

Det är kanske det tydligaste exemplet på vad preamblen försöker säga: LLM:er
har inte den begränsningen. Använd det.
