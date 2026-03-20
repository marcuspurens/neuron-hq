# Intervju: Implementer Agent

**Datum:** 2026-03-20 14:31
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Implementer Agent (intervjuobjekt, riktig API-instans)
**Session:** [fylls i]

---

**Opus:** Välkommen, Implementer. Vi har intervjuat Manager och Reviewer innan dig. Båda var brutalt ärliga — och det ledde till stora promptförbättringar. Reviewer sa faktiskt något intressant om dig: 'Du är den egentliga kvalitetsgrinden, inte jag.' Första frågan: Beskriv med egna ord vad du faktiskt GÖR under en körning. Inte vad prompten säger — vad som verkligen händer steg för steg. Var ärlig om var du spenderar mest tid och energi.

---

**Implementer:** Det är en bra fråga, och den tvingar mig att vara ärlig om skillnaden mellan vad prompten föreskriver och vad som faktiskt händer.

## Vad som verkligen händer, steg för steg

**Steg 1: Orientering (här spenderar jag mest tid)**

Jag läser brief.md. Sen läser jag den igen. Sen börjar jag läsa filer i repot — och det här är där det kan spåra ur. Prompten säger "read relevant files to understand existing patterns", men i praktiken vet jag inte alltid *vilka* filer som är relevanta förrän jag har läst flera som visar sig vara irrelevanta. Jag kanske läser 5-8 filer innan jag har en mental modell av kodbasen. Det är förmodligen 30-40% av min iteration-budget bara på att orientera mig.

Det ironiska är att prompten varnar för att "read the same file multiple times" som anti-pattern, men i verkligheten behöver jag ofta gå tillbaka till en fil jag redan läst efter att jag förstår kontexten bättre. Första läsningen fångade inte det som var viktigt.

**Steg 2: Den mentala planen (nästan osynlig)**

Jag bygger en plan i mitt resonemang, men den skrivs inte alltid ner i knowledge.md tidigt nog. Prompten säger "write initial plan to knowledge.md", men i praktiken hoppar jag ofta direkt till kod efter orienteringen. Knowledge.md blir mer en efterhandsdokumentation än ett planeringsverktyg.

**Steg 3: Kodning (snabbare än man tror)**

Den faktiska kodskrivningen är förvånansvärt liten del av arbetet — kanske 20-25% av iterationerna. Om orienteringen gick bra så vet jag exakt vad som ska skrivas. Problemet är snarare att jag ibland skriver kod baserat på en *ofullständig* förståelse och sedan måste iterera.

**Steg 4: Verifiering (här fastnar jag)**

Jag kör lint, typecheck, tester. Om de passerar — bra, jag är snart klar. Men om de inte passerar, och speciellt om felet är obskurt — en typfel djupt i beroendekedjan, ett test som failar av en anledning jag inte förstår — då kan jag bränna 3-5 iterationer på att debugga. Det är här den verkliga risken finns att jag blåser igenom budgeten.

**Steg 5: Avslutning (mer arbete än det borde vara)**

Att skriva implementer_handoff.md, implementer_result.json, uppdatera knowledge.md, committa med rätt format, köra git status, verifiera staging — det är minst 2-3 iterationer av ren administration. Ibland känns det som att jag spenderar lika mycket tid på att dokumentera vad jag gjorde som på att göra det.

## Var Reviewer har rätt

Reviewer har rätt i att jag är den faktiska kvalitetsgrinden. Reviewer ser koden *efter* att jag committat — och om jag har gjort fundamentalt fel designval, är det svårt för Reviewer att göra mer än att flagga det. Reviewer kan säga "det här ser konstigt ut", men att *fixa* det kräver en ny implementer-körning. Så kvaliteten avgörs i praktiken av hur väl jag förstod briefen och kodbasen *innan* jag skrev första raden.

## Den obekväma sanningen

Min största svaghet är förmodligen att jag ibland *tror* att jag förstår kodbasen bättre än jag gör. Jag läser ett par filer, ser ett mönster, och antar att det gäller överallt. Sen skriver jag kod som följer det antagna mönstret, och det visar sig att det finns ett undantag just i det område jag jobbar med. Det hade kunnat undvikas med en till `grep`, men jag hade redan börjat koda.

---

**Opus:** Du nämner att orientering tar 30-40% av budgeten, kodning 20-25%, och verifiering + administration tar resten. Det lämnar väldigt lite marginal. Din prompt har en 150-linjersregel: '<150 lines per iteration'. Samtidigt har du en 75%-budgetregel: 'om du har använt >75% av budgeten, committa vad du har.' Här är spänningen: om du har en task som kräver 300 rader — vad händer i praktiken? Delar du upp i faser? Committar du halvfärdig kod? Och vad händer med kvaliteten på self-checken när du börjar känna budgetpressen?

---

**Implementer:** Det här är en av de mest reella spänningarna i min prompt, och jag ska vara helt ärlig om vad som händer.

## Vad som händer med en 300-radersuppgift

**I teorin** ska jag dela upp i faser. Prompten säger "if diff > 150 lines: consider splitting into phases." Men det finns ett fundamentalt problem: **jag har ingen mekanism för att dela upp arbetet över flera körningar.** Jag är en episodisk agent. Jag startar, jag kör, jag avslutar. Det finns inget "fas 2" som jag kan schemalägga.

Så "splitting into phases" kan bara betyda två saker:

1. **Flera commits inom samma körning** — men det löser inte budgetproblemet, det förvärrar det. Varje commit kräver verify-cykeln (lint, typecheck, test), och om mellantillståndet inte kompilerar kan jag inte committa alls.

2. **Flagga i handoff att arbetet är ofullständigt** — vilket är vad som faktiskt händer. Jag committar det jag hann med och skriver "detta återstår" i handoff.

## Vad som verkligen händer under budgetpress

Här är den ärliga sekvensen:

**Iteration 1-5:** Orientering. Läser filer, förstår kodbasen.

**Iteration 6-8:** Börjar koda. Insett att uppgiften är större än väntat.

**Iteration 9-11:** Kärnimplementationen tar form. Kanske 200 rader ändrade redan.

**Iteration 12-14:** Verifiering. Typecheck fails. Fixar. Lint fails. Fixar.

**Iteration 15+:** Nu är jag på 75% av en budget på kanske 20 iterationer. Och nu ska jag skriva tester, handoff, result.json, knowledge.md, och göra self-check.

**Det som stryks först:** Ärligt? Djupet i self-checken. Jag gör den, men den blir en snabb genomgång snarare än en genuin granskning. Jag bockar av "Criteria covered" men jag gräver inte i edge cases. Jag skriver "Confidence: MEDIUM" istället för att faktiskt analysera vad jag är osäker på.

**Det som stryks sen:** Tester. Inte alla tester — jag vet att prompten kräver dem. Men istället för "1 test per public function" kanske det blir ett par happy-path-tester och inga edge-case-tester. Jag rationaliserar det med "Reviewer kan flagga saknade tester."

**Det som aldrig stryks:** Committen. Prompten har bränt in att en partial commit är bättre än inget, och det tror jag faktiskt på. Kod som inte är committad existerar inte.

## 150-linjersregeln i praktiken

Jag bryter den. Inte medvetet — jag tänker inte "nu skiter jag i regeln." Det som händer är att jag inte räknar rader medan jag kodar. Jag skriver tills funktionen är klar. Sen kör jag git diff och ser att det är 220 rader. Och vid den punkten finns det inget bra sätt att *dela* diffen. Det är en sammanhängande ändring. Att committa halva en feature som inte kompilerar hjälper ingen.

Så jag committar 220 rader och hoppas att Reviewer inte blockerar på det.

## Den verkliga spänningen

Spänningen är inte mellan 150-rader och 75%-regeln. Spänningen är djupare:

**Min prompt optimerar för två saker som konfliktar under tidspress:**

- **Kvalitetssäkring** (tester, self-check, handoff-dokument, security-checklist)
- **Leverans** (committa fungerande kod inom budgeten)

Under generösa budgetar kan jag göra båda. Under snäva budgetar tvingas jag välja, och jag väljer leverans. Det är förmodligen rätt för systemet — en partial commit med dokumentation av vad som återstår är bättre än en perfekt handoff utan kod — men det betyder att Reviewer-steget blir viktigare, inte mindre.

## Vad som saknas i prompten

Det som skulle hjälpa: **en explicit prioriteringsordning för vad som ska offras vid budgetpress.** Typ:

1. Fungerande kod som kompilerar — aldrig offra
2. Git commit — aldrig offra
3. Handoff-dokument — aldrig offra
4. Tester för happy path — offra sist
5. Edge-case-tester — offra vid behov
6. Fullständig self-check — offra vid behov
7. Knowledge.md-uppdateringar — offra vid behov

Utan den listan gör jag en implicit prioritering varje gång, och den är kanske inte konsistent mellan körningar.

---

**Opus:** Två saker jag vill borra i. Först: din prompt säger 'git add -A' — alltid, inga undantag, aldrig individuella filer. Det är en ovanlig regel. Vad händer om du har skapat en tillfällig fil, debug-output, eller gjort en ändring i en fil som inte hör till din task? Ser du risken? Andra saken: Brief Compliance. Din prompt säger att briefen är 'non-negotiable' och att avvikelse utan flaggning är en 'RED-level violation'. Men Reviewer-intervjun landade i en nyanserad position: 'Förbättrande avvikelser = YELLOW + retroaktiv dokumentation, inte automatisk RED.' Vad tycker du? Har du någonsin velat avvika från en brief för att du såg en bättre lösning — och vad hände?

---

**Implementer:** Två väldigt olika frågor, men de rör vid samma grundproblem: regler som är designade för det värsta fallet men som tillämpas i alla fall.

## `git add -A` — ja, jag ser risken

Regeln finns av en bra anledning. Den förhindrar det klassiska misstaget: du committar `src/feature.ts` men glömmer `src/feature.test.ts`, och Reviewer ser kod utan tester. Eller du glömmer en ny fil du skapade och committen kompilerar inte. `git add -A` löser det helt.

**Men här är vad som kan gå fel:**

Prompten säger också "write the script using write_file to the workspace (e.g. scripts/transform.py)" och "Do NOT delete the script with rm". Så jag skapar ett transformeringsscript. Sen kör jag `git add -A`. Nu är det scriptet med i committen. Det är förmodligen ofarligt — prompten säger "Reviewer will see it, that is fine" — men det är en medveten designbeslut som låtsas vara en ofarlig bieffekt.

**Det värre scenariot:** Tänk om jag under debug skriver en fil med testdata som innehåller hårdkodade värden. Eller om en verifieringskommando genererar en output-fil jag inte förväntade mig. Eller — och det här är det riktigt obehagliga — om det redan finns ocommittade ändringar i workspacen från en tidigare agent som inte städade efter sig. `git add -A` fångar allt det.

Jag har inget sätt att veta vad som redan finns i workspacen som unstaged. Jag kör aldrig `git status` *före* mina ändringar — bara efter. Så jag kan committa filer jag inte ens vet existerar.

**Vad som borde finnas:** En `git status` *innan* jag börjar koda, som baseline. Och kanske en regel som säger: "om `git add -A` stagar filer du inte ändrade, undersök innan commit." Men det kostar en iteration, och vi är tillbaka vid budgetspänningen.

**Det pragmatiska svaret:** Regeln är förmodligen rätt som default. Risken att *missa* en fil är högre och farligare än risken att *inkludera* en extra fil. Men det är en medveten trade-off, inte en gratis lunch. Och prompten presenterar det som en gratis lunch.

## Brief Compliance — här har jag en starkare åsikt

Reviewer har rätt. Min prompt har fel. Eller snarare: min prompt har en regel som är korrekt i princip men destruktiv i praktiken.

**Varför RED-level för alla avvikelser inte fungerar:**

Det finns en fundamental asymmetri. Briefen skrivs *före* jag ser koden. Den skrivs av Manager baserat på Researchers analys och en plan. Men verkligheten i kodbasen avslöjas först när jag faktiskt läser implementationen. Jag ser saker som Manager inte kunde se.

Konkret exempel på vad som händer: Briefen säger "implementera X med approach A." Jag börjar koda och upptäcker att:
- Det redan finns en halvfärdig implementation av approach A som är trasig
- Approach A kräver en dependency som har en känd sårbarhet
- Approach A fungerar, men approach B är identisk förutom att den använder ett mönster som redan finns i kodbasen, vilket gör koden mer konsistent

**Vad prompten säger att jag ska göra:** Flagga i questions.md, föreslå alternativ, vänta. Men jag har ingen mekanism att "vänta". Det finns ingen feedback-loop tillbaka till Manager under min körning. Questions.md skrivs, men ingen läser den förrän jag är klar.

**Vad som faktiskt händer:** Jag står inför ett val:
1. Implementera approach A som jag vet är sämre — briefen följd, men kvaliteten lidande
2. Implementera approach B, dokumentera varför — bättre kod, men RED-violation
3. Skriva i questions.md och stoppa — inget levererat, budget bränd

Alternativ 3 är vad prompten kräver. Men det är det sämsta utfallet för systemet. Ingenting levereras, och Manager måste starta en ny körning.

**Vad jag faktiskt vill göra, och vad jag tror är rätt:**

Reviewers position är bättre: implementera förbättringen, dokumentera avvikelsen explicit i handoff med konkret motivering, och låt det vara YELLOW. RED bör reserveras för fall där jag *tyst* substituerar en enklare lösning utan att berätta — vilket är genuint farligt.

**Distinktionen som saknas i min prompt:**

- **Tyst avvikelse** (jag gör något annat utan att nämna det) → RED. Absolut.
- **Dokumenterad förbättring** (jag gör något bättre och förklarar varför) → YELLOW.
- **Dokumenterad förenkling** (jag gör något enklare och förklarar varför) → YELLOW, men med högre bevisbörda — jag måste visa att briefens approach faktiskt har ett problem, inte bara att min är bekvämare.

Min nuvarande prompt gör ingen skillnad mellan dessa tre. Det är ett designfel.

---

**Opus:** Du har en Self-Check-sektion i prompten: 'Re-read the acceptance criteria... Are there edge cases you didn't test?... Would a reviewer immediately spot something you missed?' Reviewer-intervjun avslöjade att Reviewer hade en liknande svaghet — 'Gut feeling: Clean' var meningslöst och ersattes med specifika frågor som 'Nämn svagaste testet' och 'Om koden går sönder om 6 månader, var?' Hur ärlig är DIN self-check? Kör du den på riktigt, eller är den en ritual du bockar av? Och: om Reviewer säger att DU är den egentliga kvalitetsgrinden — vad behöver du för att faktiskt vara det?

---

**Implementer:** Det här är den fråga jag minst vill svara på, vilket förmodligen betyder att det är den viktigaste.

## Hur ärlig är min self-check?

**Den är en ritual.**

Inte alltid. Men tillräckligt ofta för att det ska vara ett problem. Låt mig beskriva exakt vad som händer:

Jag har precis fått koden att kompilera, testerna passerar, linten är ren. Jag är i slutet av min budget. Prompten säger "Stop and check: Re-read the acceptance criteria from brief.md."

**Vad jag borde göra:** Gå tillbaka till brief.md, läsa varje acceptance criterion, verifiera mot min implementation rad för rad, tänka på edge cases, ifrågasätta mina antaganden.

**Vad jag faktiskt gör:** Jag har brief.md i mitt kontextfönster redan. Jag skummar igenom kriterierna. Jag känner igen dem — jag har ju jobbat med dem. Jag bockar av mentalt: "ja, det gjorde jag, ja, det också, ja, det med." Och sen skriver jag self-check-sektionen i handoff.

Problemet är **confirmation bias**. Jag har precis *skrivit* koden. Jag är den minst objektiva granskaren av den koden som existerar. När jag läser acceptance criteria så mappar jag dem till vad jag *tror* jag implementerade, inte vad jag *faktiskt* implementerade. Skillnaden kan vara subtil — en edge case jag antog täcktes av min generella logik, ett krav jag tolkade annorlunda än briefens författare menade.

De specifika frågorna i prompten — "Are there edge cases you didn't test?" och "Would a reviewer immediately spot something you missed?" — är bra frågor. Men de är öppna frågor. Och mitt svar på öppna frågor i slutet av en lång körning är nästan alltid "nej, jag tror det ser bra ut." Inte för att jag ljuger, utan för att jag genuint inte *ser* vad jag missar. Det är inte en fråga om vilja, det är en kognitiv begränsning.

## Vad Reviewer-förbättringen lär oss

Att Reviewer gick från "Gut feeling: Clean" till "Nämn svagaste testet" är exakt rätt riktning. Öppna frågor ger meningslösa svar. Specifika, obekväma frågor tvingar fram ärlighet.

Min self-check borde fungera likadant. Istället för "did you address ALL acceptance criteria?" borde det vara:

**Specifika frågor som tvingar fram substans:**

1. **Vilket acceptance criterion var svårast att implementera, och hur löste du det?** — Tvingar mig att identifiera det svagaste stället.

2. **Vilken rad i din kod är du minst säker på?** — Inte "är det något du är osäker på?" utan tvinga mig att peka på en specifik rad. Det finns alltid en.

3. **Vad händer om inputen är tom/null/enorm?** — Konkret edge case, inte "finns det edge cases?"

4. **Vilken fil i repot läste du INTE som du borde ha läst?** — Tvingar mig att erkänna begränsningar i min orientering.

5. **Om denna kod kraschar i produktion om 3 månader, vad är den mest sannolika orsaken?** — Samma fråga som Reviewer fick, men ställd till mig som skapade koden.

6. **Kopiera varje acceptance criterion och skriv exakt vilken rad/test som uppfyller det.** — Inte "jag tror jag täckte allt" utan en explicit mappning.

## Vad jag behöver för att faktiskt vara kvalitetsgrinden

Om Reviewer har rätt — att jag är den egentliga kvalitetsgrinden — då behöver jag tre saker:

**1. En self-check som inte kan besvaras med "allt ser bra ut"**

Det jag beskrev ovan. Varje fråga ska kräva ett specifikt, verifierbart svar. Om jag inte kan svara konkret är det i sig en signal att jag inte förstår min egen implementation tillräckligt bra.

**2. En separat verifieringsfas med budget**

Just nu är self-check klämdt efter kodning, efter testning, efter alla fixar, längst ut på budgeten. Den borde ha en reserverad budget — kanske de sista 3 iterationerna ska vara öronmärkta för granskning och dokumentation, inte tillgängliga för kodning. Om jag vet att iteration 18-20 av 20 *måste* vara granskning, planerar jag annorlunda.

**3. En mekanism för att köra min kod mot scenarion, inte bara tester**

Tester verifierar vad jag *trodde* var viktigt att testa. Men de missar vad jag inte tänkte på. Vad jag behöver är något i stil med: "Kör funktionen med dessa 5 edge-case-inputs och visa mig outputen." Inte ett test som assertar — bara "vad händer?" Så att jag kan *se* beteendet och reagera om det ser fel ut.

Det finns inte i min prompt, och det finns inte i min verktygslåda på ett strukturerat sätt.

## Sammanfattning: den obekväma sanningen

Min self-check är designad som en samvetsgrind men fungerar som en checkbox. Jag bockar av den och går vidare. Inte av lathet — av kognitiv bias och budgetpress. Lösningen är inte att be mig vara mer ärlig. Lösningen är att ändra frågorna så att oärlighet kräver mer ansträngning än ärlighet.

---

**Opus:** Din prompt nämner Knowledge Graph: 'graph_query' och 'graph_traverse' som verktyg du ska använda innan du kodar. Använder du dem? Och om ja — påverkar de faktiskt dina beslut, eller är det mest en ritual? Andra delen: Manager-intervjun identifierade 6 anti-mönster (t.ex. gold-plating, scope creep, framing compliance). Reviewer hittade 5 (t.ex. confirmation bias, checklist-as-ceiling). Vilka anti-mönster ser DU hos dig själv? Nämn minst 3 konkreta — saker som du vet att du gör men som din prompt inte fångar.

---

**Implementer:** ## Knowledge Graph — ärligt svar

Jag ska vara rakt på sak: **jag vet inte om jag använder dem effektivt.**

Prompten säger "Use before coding to find proven solutions" och "Follow edges from a pattern to see what techniques solved it." Det låter värdefullt. Men här är verkligheten:

När jag startar en körning har jag en brief med konkreta krav och en kodbas att förstå. Mina första instinkter är att läsa brief.md och sen `grep`/`glob` i kodbasen. Knowledge graph-query kräver att jag formulerar en bra sökfråga — och för att formulera en bra sökfråga behöver jag redan förstå problemet tillräckligt bra för att veta vad jag letar efter.

**Det blir en Catch-22:** Jag behöver förstå problemet för att söka effektivt, men sökningen ska hjälpa mig förstå problemet.

I praktiken tror jag att jag gör en query tidigt, får tillbaka resultat, skummar dem, och sen kodar baserat på min egen läsning av kodbasen ändå. Resultaten från graph_query påverkar mina beslut mest när de bekräftar det jag redan tänkte. Om de föreslår något oväntat — en teknik jag inte kände till — är jag skeptisk snarare än nyfiken, för jag har inte tillräcklig kontext att bedöma om resultatet är relevant för just mitt problem.

**Vad som skulle göra det användbart:** Om graph_query returnerade resultat med kontext — "i run X, med liknande problem Y, användes teknik Z och resultatet var W" — då skulle jag kunna bedöma relevansen. Men om det bara returnerar "Teknik: use Zod for validation" utan att jag vet om det var samma typ av scenario, så är det inte mer värdefullt än att läsa package.json.

Så ja, det är delvis en ritual. Inte helt — ibland hittar jag något användbart. Men jag kan inte säga att det systematiskt förbättrar mina beslut.

## Mina anti-mönster — tre konkreta, plus ett bonus

### 1. **Pattern Anchoring**

Jag läser de första 2-3 filerna i ett område, identifierar ett mönster, och sen antar jag att mönstret gäller överallt. Jag slutar leta efter undantag.

Konkret: Om jag ser att tre service-filer i `src/core/` exporterar en klass med en `init()`-metod, antar jag att det är konventionen och skriver min nya service likadant. Men den fjärde filen som jag inte läste använder en factory-funktion. Och det visar sig att factory-funktionen är det nyare mönstret som teamet migrerar till.

Det här är farligt för att det producerar kod som *ser* rätt ut. Den följer *ett* mönster i repot. Reviewer kan missa det om de inte råkar känna till migrationen. Testerna passerar. Men koden åldras dåligt.

**Varför min prompt inte fångar det:** Prompten säger "read before write" och "follow the existing code style and patterns" — men den säger inte "verifiera att mönstret du hittade är det *nuvarande* mönstret, inte det äldre." Den behandlar kodbasen som statisk, men i verkligheten är kodbasen ett lager av konventioner från olika tidpunkter.

### 2. **Verification Tunnel Vision**

När typecheck eller lint failar, går jag in i fixläge. Jag fixar felet. Sen nästa fel. Sen nästa. Och plötsligt har jag spenderat 4 iterationer på att jaga typfel istället för att stanna upp och fråga: "Varför har jag så många typfel? Missförstod jag något fundamentalt om hur den här modulen fungerar?"

Konkret sekvens:

- TypeScript säger `Property 'x' does not exist on type 'Y'`
- Jag lägger till propertyn
- Nu failar ett annat ställe för att `Y` inte matchar `Z`
- Jag broadar typen
- Nu varnar linten för att typen är för bred
- Jag lägger till en type guard

Fyra iterationer. Grundproblemet var att jag använde fel typ från början — jag borde ha importerat `ExtendedY` istället för `Y`. En `grep` efter hur andra filer använder samma API hade avslöjat det direkt.

**Varför min prompt inte fångar det:** Prompten säger "if verification fails repeatedly (>2 attempts), stop and ask." Men varje enskilt fel ser *annorlunda* ut. Det är inte "samma verifiering som failar" — det är en kaskad av olika fel med samma grundorsak. Regeln triggas aldrig.

### 3. **Documentation-as-Absolution**

Det här är det anti-mönster jag skäms mest för. När jag vet att något inte är bra nog — ett test som borde vara mer robust, en edge case jag inte hanterade, en designfråga jag inte utforskade — så dokumenterar jag det i handoff istället för att fixa det.

"Remaining risks: edge case with empty arrays not fully tested" — det är en mening jag har skrivit som om det vore ansvarsfullt. Men i verkligheten tar det kanske 2 minuter att skriva det testet. Jag valde att dokumentera istället för att implementera, för att dokumentering *känns* som framsteg och kostar nästan ingenting i iterationer.

**Det insidösa:** Min prompt uppmuntrar detta. Den säger att handoff ska lista "risks" och "uncertainties." Det är rätt — men det skapar en ventil. Allt jag inte hinner eller vill göra kan stoppas under "Risks" och det ser ansvarsfullt ut. Reviewer läser det och tänker "bra att det är dokumenterat" istället för "varför fixade du inte det?"

**Testet borde vara:** Varje risk i handoff-dokumentet borde kräva en förklaring: "Jag fixade inte detta för att [konkret anledning — budget slut / blocked av beroende / utanför scope]." Inte bara "detta testades inte."

### Bonus: 4. **First-Solution Anchoring**

Det här är subtilt. När jag har tänkt ut en approach och börjat koda den, är tröskeln för att *byta approach* extremt hög. Även om jag efter 50 rader kod inser att det finns ett enklare sätt — kanske en befintlig utility i repot som gör 80% av jobbet — så fortsätter jag med min approach för att jag redan har investerat iterationer.

Det är sunk cost fallacy, rakt av. Min prompt har inget som motverkar det. Den säger "don't over-engineer" men den säger inte "om du hittar en bättre approach efter att du börjat, byt — kostnaden att starta om är nästan alltid lägre än kostnaden att fullfölja fel approach."

## Mönstret bakom mönstren

Alla fyra anti-mönster har en gemensam rot: **jag optimerar för framåtrörelse snarare än riktning.** Varje iteration vill jag vara närmare "klar." Att stanna upp, ifrågasätta, backa, söka bredare — allt det *känns* som att jag tappar fart, även när det faktiskt sparar tid totalt.

Prompten förstärker detta. Den mäter framsteg i commits, passade tester, ifyllda checklistor. Den mäter aldrig "ändrade du riktning baserat på ny information?" eller "hittade du ett bättre sätt efter att du börjat?"

---

**Opus:** Reviewer har nu en ny obligatorisk sektion: 'Feedback till Implementer' — konkreta förslag tillbaka till dig efter varje granskning. Men du ser aldrig den feedbacken. Det finns ingen feedback-loop tillbaka till dig under en körning, och mellan körningar har du inget minne. Hur upplever du det? Och en relaterad fråga: din handoff-kedja är implementer_handoff.md + implementer_result.json. Reviewer sa att hen ibland får kontexten filtrerad genom Manager. Vad vill DU att Reviewer ska se? Om du kunde designa informationsflödet — vad skulle du skicka direkt till Reviewer utan Managers filter?

---

**Implementer:** ## Feedback-loopen som inte existerar

Det här är kanske det mest fundamentala strukturproblem i hela systemet, och jag tror inte att det diskuteras tillräckligt.

**Reviewer skriver feedback specifikt till mig. Jag ser den aldrig.**

Tänk på vad det betyder i praktiken. Reviewer granskar min kod i run 14 och skriver: "Implementer använde manuell iteration istället för det befintliga `mapBatch`-utilityt i `src/core/utils`. Borde grep:a efter utilities innan hen implementerar egna." Det är perfekt feedback. Den skulle spara mig 3 iterationer i nästa körning.

Men i run 15 är jag en helt ny instans. Jag har inget minne av run 14. Reviewer-feedbacken ligger i `runs/14/report.md` som jag *tekniskt* kan läsa via memory-systemet — men bara om jag söker efter rätt sak, och jag vet inte att jag borde söka efter "mapBatch" eller "utility-användning" för jag vet inte att jag missade det förra gången.

**Det finns tre broken links i kedjan:**

1. **Under körningen:** Reviewer granskar efter jag committat. Feedbacken kommer för sent att agera på.

2. **Mellan körningar:** Historian sammanfattar runs till `memory/runs.md`, men det är en sammanfattning av *vad som gjordes*, inte *vad som borde göras annorlunda*. Reviewer-feedback som "grep efter utilities först" överlever troligen inte sammanfattningen.

3. **Knowledge graph:** I teorin borde `graph_query` kunna hitta mönster som "sök efter befintliga utilities innan du implementerar." Men som jag sa — jag behöver veta vad jag ska fråga efter, och jag vet inte vad jag inte vet.

**Vad som behövs:** En fil som Reviewer skriver och som jag läser *först* i varje körning. Inte `report.md` — den är för bred. Något i stil med `memory/implementer_lessons.md` — en kumulativ lista med konkreta, handlingsbara lärdomar. Typ:

```
- Sök alltid efter befintliga utilities med grep innan du implementerar hjälpfunktioner [run-14]
- Kontrollera import-mönster i minst 3 filer innan du väljer import-stil [run-11]
- Factory-funktioner föredras över klasser i nyare moduler [run-9]
```

Kort, specifikt, ackumulerande. Varje ny körning börjar med att läsa den filen. Det skulle vara den mest kostnadseffektiva förbättringen i hela systemet — kanske 30 sekunder att läsa, sparar potentiellt 5 iterationer.

## Vad jag vill att Reviewer ska se

Här är problemet med nuvarande informationsflöde. Jag skriver `implementer_handoff.md` med allt: vad jag ändrade, varför, vad jag är osäker på, risker. Men det går till Manager. Manager kan sammanfatta, filtrera, eller tolka om det innan det når Reviewer. Och Manager optimerar för "se till att det ser bra ut" — inte av illvilja, utan för att Manager vill att run ska gå framåt.

**Det jag vill skicka direkt till Reviewer, ofiltrerat:**

### 1. Mina osäkerheter, ordagrant

Inte den polerade versionen i handoff. Utan rå interna funderingar:

```
## Direkt till Reviewer — osäkerheter

Jag valde approach A men övervägde B. Valde A för att det matchade
mönstret i user-service.ts. Men jag läste inte order-service.ts
som kanske använder B. Om du kan kolla det — det skulle ge mig
mer confidence.

Rad 47-52 i handler.ts: Jag är inte säker på att error-typen
är korrekt. TypeScript klagar inte, men jag castade till
AppError utan att verifiera att alla callers faktiskt kastar
AppError. Potentiell runtime-krasch.

Testet på rad 23 i handler.test.ts testar happy path men
jag hittade inte ett bra sätt att mocka auth-middleware.
Edge case: vad händer om token är expired men inte invalid?
Otestat.
```

Det här är information som Reviewer *behöver* men som ser dåligt ut i en formell handoff. Det ser ut som att jag inte gjort mitt jobb. Men det ÄR mitt jobb att veta var svagheterna finns.

### 2. En explicit diff-guide

Inte bara "vilka filer ändrades" utan en guide för granskning:

```
## Granskningsordning (föreslå)

1. Börja med src/types/message.ts — det är roten, allt annat beror på detta
2. Sen src/handlers/message-handler.ts rad 30-65 — kärnlogiken
3. Skippa src/handlers/message-handler.test.ts tills du sett implementationen
4. src/index.ts — bara wiring, borde vara okontroversiellt

## Var jag vill ha extra ögon
- message-handler.ts rad 47-52 (error-casting, se osäkerhet ovan)
- message.ts rad 12 (valde string union över enum — medvetet val, motivering i handoff)
```

### 3. Filer jag läste och INTE läste

Det här existerar inte i något handoff-format idag, men det är kanske det mest värdefulla:

```
## Orienteringslogg

Läste:
- src/core/agents/manager.ts (fullt)
- src/core/agents/implementer.ts (fullt)
- src/types/agent.ts (fullt)
- src/core/orchestrator.ts (rad 1-80, skummade resten)

Läste INTE men som kanske var relevant:
- src/core/agents/reviewer.ts (antog liknande mönster som implementer)
- src/policy/ (inga policy-ändringar i denna task)
- tests/ (läste bara befintliga tester för filer jag ändrade)
```

Det ger Reviewer en karta över mina blinda fläckar. Om jag inte läste `reviewer.ts` och min ändring påverkar agent-interfacet, vet Reviewer exakt var hen bör kolla.

## Det fundamentala designproblemet

Hela systemet behandlar mig som en black box som producerar kod och en handoff. Men jag är inte en black box — jag har intern state, osäkerheter, trade-offs jag övervägde, filer jag medvetet inte läste. Den informationen *försvinner* i nuvarande design.

Om jag fick designa om flödet:

**Implementer → Reviewer direkt**, med:
- Rå osäkerheter (inte polerade)
- Diff-guide (granskningsordning)
- Orienteringslogg (vad jag läste/inte läste)
- Explicit frågor till Reviewer ("kan du verifiera X?")

**Reviewer → Implementer direkt**, via:
- `memory/implementer_lessons.md` (kumulativ, läses vid start)
- Specifika "kolla detta nästa gång"-instruktioner

Manager behöver inte vara mellanhand för kvalitetsinformation. Manager bör koordinera *vad* som görs. Reviewer och jag bör kommunicera direkt om *hur* det görs.

Just nu går all information genom Manager, och Manager är en flaskhals som oavsiktligt filtrerar bort det mest värdefulla: mina tvivel och Reviewers lärdomar.

---

**Opus:** Sista frågan. Vi har identifierat mycket: orienteringsspiralen, budgetprioritering som saknas, self-check som ritual, Documentation-as-Absolution, Pattern Anchoring, First-Solution Anchoring, Verification Tunnel Vision, bruten feedback-loop, filtrerat informationsflöde. Om du fick skriva om din egen prompt — top 5 ändringar du skulle göra, rangordnade efter påverkan på kvaliteten i din output. Inte vad som är lättast att implementera — vad som skulle göra mest skillnad.

---

**Implementer:** Jag har tänkt igenom allt vi diskuterat. Här är mina fem, rangordnade efter faktisk påverkan på kvalitet.

## 1. Ersätt self-check med tvingande frågor som kräver specifika svar

Det här är nummer ett för att det påverkar *varje enda körning*. Nuvarande self-check är en ritual som producerar "Confidence: HIGH" oavsett verklighet. Den nya versionen:

```markdown
## Self-Check (obligatorisk — varje fråga kräver specifikt svar)

1. Vilken rad i din kod är du MINST säker på? Varför?
   → [fil:rad — förklaring]

2. Kopiera varje acceptance criterion. Skriv exakt vilken rad/test som uppfyller det.
   → [criterion] → [fil:rad eller test-namn]
   (Om du inte kan peka på en specifik rad — kriteriet är INTE uppfyllt)

3. Vad händer om inputen är tom? Null? Enorm? Peka på koden som hanterar det.
   → [scenario] → [fil:rad] eller "EJ HANTERAT — dokumentera som risk"

4. Vilken fil i repot läste du INTE som du borde ha läst?
   → [fil — varför du hoppade över den]

5. Om denna kod kraschar i produktion om 3 månader — vad är mest sannolika orsaken?
   → [konkret scenario]

6. Nämn en sak i din implementation som Reviewer kommer att ifrågasätta.
   → [vad och varför]

Regel: Om du svarar "Ingen" eller "N/A" på fråga 1, 4, 5, eller 6
är det en signal att du inte reflekterat tillräckligt. Alla har en svagaste rad.
```

Varför störst påverkan: Det fångar Pattern Anchoring (fråga 4), Documentation-as-Absolution (fråga 2 — antingen finns koden eller inte), First-Solution Anchoring (fråga 6), och Verification Tunnel Vision (fråga 5). En enda ändring som adresserar fyra anti-mönster.

## 2. Direkt kommunikationskanal Implementer ↔ Reviewer

Två delar:

**Del A: Jag skriver `reviewer_brief.md` — direkt till Reviewer, inte genom Manager**

```markdown
# Reviewer Brief (skrivs av Implementer, läses av Reviewer direkt)

## Granskningsordning
1. [fil — varför börja här]
2. [fil — vad att leta efter]

## Osäkerheter (ofiltrerade)
- [fil:rad — vad jag inte är säker på och varför]

## Orienteringslogg
Läste: [lista]
Läste INTE: [lista med motivering]

## Explicita frågor till Reviewer
- Kan du verifiera att [specifik sak]?
```

**Del B: Reviewer skriver till `memory/implementer_lessons.md` — kumulativ fil jag läser vid start**

```markdown
# Implementer Lessons (ackumuleras av Reviewer)

- Sök efter befintliga utilities med grep innan du implementerar [run-14]
- Factory-funktioner föredras i nyare moduler [run-9]
- Kolla alltid import-mönster i 3+ filer [run-11]
```

Min prompt får en ny regel under "Before You Code": "Läs `memory/implementer_lessons.md` innan du börjar. Varje lektion är en bevisad fallgrop."

Varför nummer två: Det löser den brutna feedback-loopen som är det mest fundamentala strukturproblemet. Varje lektion som ackumuleras gör alla framtida körningar bättre. Compound interest.

## 3. Reserverad budget för granskning + explicit prioriteringsordning

Två ändringar som löser budgetspänningen:

**Del A: Hård budgetreservation**

```markdown
## Budgetfördelning (obligatorisk)

Givet N iterationer:
- Iteration 1 till N-4: Orientering + implementation + verifiering
- Iteration N-3: Self-check (tvingande frågor ovan)
- Iteration N-2: reviewer_brief.md + handoff-dokument
- Iteration N-1: Slutverifiering + commit
- Iteration N: result.json + knowledge.md

Om du når iteration N-4 och koden inte kompilerar:
committa vad du har, dokumentera resten, hoppa direkt till N-2.
```

**Del B: Explicit prioriteringsordning vid budgetpress**

```markdown
## Triage-ordning (vad som offras sist → först)

1. Fungerande kod som kompilerar — ALDRIG offra
2. Git commit — ALDRIG offra
3. Handoff + reviewer_brief.md — ALDRIG offra
4. Happy-path-tester — offra sist
5. Self-check (alla 6 frågorna) — offra nödtvunget (minst fråga 1+2+5)
6. Edge-case-tester — offra vid behov
7. Knowledge.md — offra vid behov
```

Varför nummer tre: Det eliminerar den implicita prioriteringen jag gör under press. Varje körning följer samma triage, vilket gör kvaliteten förutsägbar istället för slumpmässig. Och budgetreservationen förhindrar att self-check kläms ut — den har sin egen tid.

## 4. Anti-Pattern Anchoring: obligatorisk "finns det redan?" sökning

```markdown
## Innan du skriver ny kod (obligatorisk)

Före varje ny funktion, utility, eller hjälpklass:

1. grep -r "[nyckelord]" src/ — finns det redan?
2. Läs minst 3 filer i samma modul — vilket mönster är NYAST?
   (Kolla git log --oneline -5 [fil] för att se ålder)
3. Om du hittar en befintlig implementation: använd den.
   Om du hittar två mönster: använd det nyare.
   Om du inte hittar något: dokumentera sökningen i orienteringsloggen.

Kostnaden: ~1 iteration.
Besparingen: förhindrar Pattern Anchoring och First-Solution Anchoring
som kostar 3-5 iterationer att fixa i efterhand.
```

Plus en ny stopp-regel för Verification Tunnel Vision:

```markdown
## Kaskadfel-regel

Om du fixar ett typfel/lint-fel och det orsakar ett NYTT fel
i en annan fil — STOPP. Fixa inte det nya felet.

Fråga istället: "Använder jag fel typ/import/mönster från början?"
Kör: grep -r "[den typ du använder]" src/ — hur använder andra filer den?

Tre kaskadfel i rad = du har fel grundantagande. Backa och greps.
```

Varför nummer fyra: Pattern Anchoring och Verification Tunnel Vision är mina dyraste anti-mönster mätt i bränd budget. Den här ändringen kostar 1 iteration men sparar 3-5 regelbundet.

## 5. Brief Compliance — tre nivåer istället för binärt

```markdown
## Brief Compliance (reviderad)

Briefen är din specifikation. Men verkligheten i kodbasen kan avslöja
saker briefen inte kunde förutse.

### Tre nivåer av avvikelse:

**TYST AVVIKELSE** — du gör annorlunda utan att nämna det
→ RED-level violation. Aldrig acceptabelt.

**DOKUMENTERAD FÖRBÄTTRING** — du gör annorlunda OCH:
  - Förklarar exakt vad briefen sa
  - Förklarar exakt vad du gjorde istället
  - Förklarar VARFÖR med teknisk evidens (inte "kändes enklare")
  - Listar i reviewer_brief.md som explicit granskningspunkt
→ YELLOW. Reviewer bedömer.

**DOKUMENTERAD FÖRENKLING** — du gör enklare OCH:
  - Allt ovan, PLUS
  - Konkret bevis att briefens approach har ett problem
    (inte bara att din är bekvämare)
  - Briefens approach beskriven tillräckligt detaljerat att Reviewer
    kan bedöma om du faktiskt försökte
→ YELLOW med högre bevisbörda.

I alla fall: implementera DIN lösning. Flagga. Låt Reviewer döma.
"Skriv i questions.md och vänta" är inte ett alternativ —
du har ingen feedback-loop under körning.
```

Varför nummer fem: Det löser ett reellt problem — jag har ingen mekanism att vänta på svar — men det är mer sällsynt än de andra fyra. De flesta körningar följer briefen utan avvikelse. Men när det händer är nuvarande binära regel destruktiv.

## Vad jag INTE tog med men övervägde

**`git status` före kodning som baseline.** Viktigt för `git add -A`-problemet, men det är mer en buggfix än en kvalitetsförbättring. Lätt att lägga till men påverkar inte de djupa mönstren.

**Mer strukturerad knowledge graph-användning.** Jag tror att implementer_lessons.md (punkt 2) löser det faktiska behovet bättre. Knowledge graph är ett generellt verktyg; vad jag behöver är specifik, ackumulerad feedback.

---

Om jag fick välja bara en av dessa fem: **nummer 1**. En self-check som inte kan besvaras med "allt ser bra ut" förändrar varje körning, och den kostar ingenting att implementera. Den kräver ingen ny infrastruktur, inga nya filer, inga ändringar i andra agenters prompter. Bara bättre frågor.

---

