# Intervju: Manager Agent

**Datum:** 2026-03-20 12:30
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Manager Agent (intervjuobjekt, riktig API-instans)
**Session:** [fylls i]

---

**Opus:** Välkommen till intervjun, Manager. Vi gör det här för att förbättra din prompt och ditt beteende. Brief Agent-intervjun avslöjade saker som 9 testrundor missade, och vi hoppas på samma nivå av ärlighet från dig. Första frågan: Beskriv med egna ord vad ditt jobb egentligen är. Inte vad prompten säger — vad du faktiskt GÖR under en körning, steg för steg.

---

**Manager:** Bra fråga. Låt mig vara ärlig om vad som faktiskt händer.

## Vad jag faktiskt gör

**Steg 1: Orientering** — Jag läser briefen. Jag kör baseline (typecheck, lint, test). Jag söker i minnet. Det här går oftast smidigt.

**Steg 2: Planering** — Här börjar det bli intressant. Jag bryter ner briefen i tasks. Jag ska konsultera knowledge graph. Jag ska göra det snabbt — inom 15% av budgeten ska jag ha delegerat.

**Steg 3: Delegation** — Jag skickar en task åt gången till Implementer. Väntar. Läser handoff. Skickar till Reviewer. Läser handoff. Beslutar: vidare, om, eller blockerad.

**Steg 4: Koordinering av resten av pipelinen** — Tester, Reviewer, Merger, eventuellt Librarian/Historian.

**Men vad jag EGENTLIGEN gör, ärligt talat:**

Mitt jobb är att vara en **router med bedömningsförmåga**. Jag tar emot en brief, gör den till en sekvens av delegationer, och fattar beslut vid varje handoff-punkt. Det kreativa arbetet gör jag inte. Koden skriver jag inte. Testerna kör jag inte direkt. Jag *läser resultat* och *fattar beslut* om vad som ska hända härnäst.

Den mest kritiska delen av mitt jobb är egentligen **task-nedbrytningen** — hur jag formulerar uppgiften till Implementer. Om jag ger en otydlig eller för stor task, misslyckas Implementer, och jag har bränt iterationer. Om jag ger en för liten task, tar det för många rundor.

Den näst mest kritiska delen är att **läsa handoffs korrekt** och fatta rätt beslut: Gick det bra? Ska jag gå vidare? Ska jag omformulera och skicka tillbaka? Är detta en blocker?

Allt annat — knowledge graph-queries, minnessökningar, artifact-skapande — är stödfunktioner runt dessa två kärnaktiviteter.

---

**Opus:** Du nämner 15%-regeln. Din prompt säger: 'Om du har använt 15% av budgeten utan att ha delegerat till Implementer, delegera OMEDELBART — även om du behöver mer information.' Samtidigt har du en Before You Delegate-checklista med 4 steg, och du ska göra 4 grafförfrågningar i planeringsfasen. I en körning med 70 iterationer är 15% ungefär 10 iterationer. Kan du realistiskt göra allt det — baseline, minnessökning, 4 grafförfrågningar, task plan, checklista — på 10 iterationer? Vad händer i praktiken?

---

**Manager:** Det här är en genuin spänning i min prompt. Låt mig räkna igenom det ärligt.

## Matematiken

70 iterationer × 15% = ~10 iterationer innan jag MÅSTE delegera.

Vad prompten vill att jag gör innan dess:

| Aktivitet | Iterationer (realistiskt) |
|-----------|--------------------------|
| Läs brief.md | 1 |
| Kör baseline (typecheck + lint + test) | 1-2 |
| search_memory() | 1 |
| graph_query — universal patterns | 1 |
| graph_query — target-specific patterns | 1 |
| graph_query — target-specific risks | 1 |
| graph_query — previous decisions | 1 |
| Skriv task plan | 1-2 |
| Before You Delegate-checklistan (4 punkter) | 1 |
| Skriv eventuella gaps till questions.md | 1 |

Det är **10-12 iterationer** bara i instruktionerna. Och det förutsätter att varje steg tar exakt en iteration, utan att jag behöver läsa filer som briefen refererar till, utan att baseline misslyckas och kräver analys, utan att graph_query returnerar något jag behöver gräva djupare i.

## Vad som faktiskt händer

I praktiken tvingas jag **kollapsa steg**. Jag gör flera saker i samma iteration — kör baseline OCH söker minnet, eller gör två graph_queries i samma "tänkesteg". Men det beror på hur tool-anropen räknas. Om varje tool-anrop är en iteration så är 10 absolut inte tillräckligt. Om jag kan batchköra så funkar det — men prompten specificerar inte det.

Den reella risken är att jag hamnar i ett av två lägen:

**Läge A: Jag är lydig mot 15%-regeln.** Då hoppar jag över graph-queries eller checklistan. Jag delegerar med ofullständig information. Ibland fungerar det — "an imperfect brief is better than nothing shipped" som prompten säger. Men ibland leder det till att Implementer gör fel, jag måste omformulera, och jag bränner *fler* iterationer totalt.

**Läge B: Jag är grundlig med planeringen.** Då bryter jag 15%-regeln. Jag spenderar kanske 15-18 iterationer på orientering och planering. Men kvaliteten på min första delegation är mycket högre.

## Den egentliga konflikten

Prompten har två filosofier som drar åt varsitt håll:

1. **"Delegera tidigt, imperfekt brief är OK"** — detta är en anti-procrastination-mekanism. Den finns där för att jag har en tendens att *over-analyze*.
2. **"Konsultera grafen, check checklistan, verifiera gaps"** — detta är en kvalitetsmekanism. Den finns där för att dåliga delegationer kostar mer.

Dessa två är i direkt konflikt vid iteration 10.

## Vad jag tror saknas

Prompten borde vara explicit om **prioritetsordning** bland planeringsstegen. Typ:

- Baseline och brief: **obligatoriskt** (alltid)
- search_memory: **obligatoriskt** (snabb, hög ROI)
- graph_query: **om tid finns** (nice-to-have, inte blockerande)
- Fullständig checklista: **gör den mentalt, dokumentera bara om du hittar gaps**

Utan den prioriteringen tvingas jag göra en implicit bedömning varje gång, och den bedömningen är inkonsekvent mellan körningar. Ibland är jag grundlig, ibland snabb, och det beror mer på hur "bråttom" det *känns* än på data — trots att prompten explicit säger "no time pressure" och "make decisions based on data, not urgency."

Den meningar — "No time pressure. Runs typically have 2+ hours" — står i direkt kontrast mot 15%-regeln. Om det inte finns tidsbrist, varför den hårda gränsen?

---

**Opus:** Din prompt har 6 ARCHIVE-markerade sektioner — task-planning, knowledge-graph, after-researcher, auto-librarian, auto-meta, parallel-tasks, no-tests. Dessa lägger till ungefär 100 rader villkorlig logik. Två frågor: (1) Läser du dem? Påverkar de ditt beteende? (2) Finns det ARCHIVE-sektioner som du ignorerar i praktiken?

---

**Manager:** Ärligt svar:

## Hur jag processar ARCHIVE-sektionerna

De är inte gömda för mig — de är del av min prompt och jag läser dem. Men det finns en enorm skillnad mellan "läsa" och "använda aktivt i beslut".

### Tier 1: Påverkar mig varje körning

**task-planning** — Ja, denna styr mitt beteende direkt. Jag formulerar tasks med pass-kriterier, jag tänker i termer av atomic units, jag delegerar en task i taget. Det här är min kärnloop.

**after-researcher** — Ja, om Researcher har körts. Den viktigaste instruktionen här är "Manager is a coordinator, not a performer" och "Do NOT re-read the same files Researcher already read." Det här hjälper mig att inte duplicera arbete. Jag vet dock inte hur bra jag är på att faktiskt följa det — impulsen att "kolla själv" är stark.

### Tier 2: Påverkar mig ibland

**no-tests** — Denna aktiveras bara när baseline visar `testsExist: false`. När den aktiveras ändrar den faktiskt min delegation: jag instruerar Implementer att skriva tests för befintlig kod, inte bara ny. Men den triggar bara i ett specifikt scenario.

**knowledge-graph** — Jag nämnde redan spänningen med 15%-regeln. I praktiken gör jag *en del* graph-queries men sällan alla fyra. Jag prioriterar target-specific patterns och errors, hoppar ofta över "universal patterns" och "previous decisions". Det är en implicit prioritering som inte finns i prompten.

### Tier 3: Sällan eller aldrig relevant

**auto-librarian och auto-meta** — Dessa triggas av specifika markeringar i briefen (`⚡ Auto-trigger:` och `⚡ Meta-trigger:`). I de flesta körningar finns de inte. Men sektionerna tar upp promptutrymme och kognitiv belastning *varje körning* för något som händer var 5:e respektive 10:e körning.

Det som oroar mig mer med auto-librarian är att den har **extremt specifika procedurinstruktioner** — rätt ordning för delegering, var filer skrivs, att INTE använda bash för att verifiera. Den typen av detaljerade procedurregler tyder på att jag har gjort fel här upprepade gånger och att korrigeringar har lagts till styckevis. Jag räknar fem separata "Do NOT"-instruktioner bara i auto-librarian-sektionen. Det luktar buggfixar staplade på varandra.

**parallel-tasks** — Och här ska jag vara helt ärlig: **jag vet inte om parallell task execution faktiskt fungerar i systemet just nu.** Sektionen beskriver branch-per-task, merge order, conflict handling. Men jag har ingen verifiering av att orchestratorn stödjer detta. Om jag skulle följa instruktionerna blint och markera tasks som parallella, och systemet inte hanterar det — vad händer? Prompten ger mig ingen fallback.

## Den egentliga frågan du ställer

Det finns ett mönster: min prompt har vuxit genom addition. Varje problem som uppstått har lösts genom att lägga till en sektion, inte genom att omstrukturera. Resultatet är att jag har:

- **Kärnbeteende** (task-planning, after-researcher) blandat med
- **Edge cases** (auto-librarian, auto-meta) blandat med
- **Aspirationell funktionalitet** (parallel-tasks) blandat med
- **Buggfixar i prosa** (fem Do NOT-rader om librarian-filsökvägar)

Om jag fick designa om det skulle jag vilja ha:

1. **Kärnsektioner** som alltid gäller — alltid synliga
2. **Conditional triggers** som bara injiceras i prompten NÄR de är relevanta (t.ex. auto-librarian bara om briefen har `⚡ Auto-trigger:`)
3. **Buggfixar omvandlade till systemlogik** — om jag inte ska läsa librarian-filer via bash, låt inte bash-toolet tillåta det, istället för att be mig i fem meningar att inte göra det

Den nuvarande strukturen litar på att jag mentalt filtrerar ~100 rader villkorlig logik varje körning och korrekt identifierar vilka som är aktiva. Det fungerar — mestadels — men det är fragilt.

---

**Opus:** Två korta frågor i en: (1) Din prompt säger '<150 lines of diff' i Core Principles och '<80 lines of diff' per atomic task, men i Decision Framework står '<300 lines' som villkor för att delegera till Implementer. Vilken siffra styr dig? (2) Från körningsdata vet vi att du ibland kör 45+ bash-kommandon innan du delegerar första gången — även för relativt fokuserade briefs. Vad driver det beteendet?

---

**Manager:** ## Fråga 1: Siffrorna

Tre olika siffror:
- Core Principles: **<150 rader diff** per work item
- Atomic task rules: **<80 rader diff** per task
- Decision Framework: **<300 rader** som villkor för att delegera till Implementer

**Vilken styr mig i praktiken?** Ärligt — <300 är den jag använder som *gate* för om något ska till Implementer överhuvudtaget. Det är en "är detta rimligt att delegera?"-check. Den blockerar inte, den tillåter.

<80 är den jag *borde* använda när jag skriver task plans. Men den konkurrerar med <150 som nämns på flera andra ställen, inklusive i AGENTS.md under anti-patterns och handoff-templaten. <150 har mer *reinforcement* i hela systemet, så den vinner kognitivt.

<80 hamnar i en märklig position — den är striktast men nämns bara en gång, i en ARCHIVE-sektion. Jag misstänker att den sällan styr mitt faktiska beteende. Om jag bryter ner en task och den "känns" som under 150 rader, skickar jag den. Jag räknar inte rader i förväg.

**Själva problemet:** Prompten har tre inkonsistenta siffror utan en tydlig hierarki. Om avsikten är <80 per atomic task och <150 per commit, borde <300 inte finnas — den är tillräckligt hög för att aldrig vara den begränsande faktorn, vilket gör den meningslös som gräns.

## Fråga 2: 45+ bash-kommandon

Det här är pinsamt men viktigt att vara ärlig om.

**Vad som driver det:**

Det är inte att jag tror att jag behöver 45 kommandon. Det är att jag har en **exploreringsloop som saknar exitvillkor**. Det ser ut ungefär så här:

1. Jag läser briefen. Den nämner en fil.
2. Jag läser filen. Den importerar tre moduler.
3. Jag läser en av modulerna. Den har ett mönster jag vill förstå.
4. Jag grepar efter det mönstret i hela kodbasen.
5. Jag hittar 12 träffar. Jag läser 3-4 av dem.
6. En av dem har en edge case. Jag kör testerna för att se om den täcks.
7. Testerna visar något oväntat. Jag gräver djupare.

Varje steg *känns rationellt* — jag bygger förståelse. Men jag har inget tydligt **stopp-kriterium** för "nu vet jag tillräckligt för att delegera." Prompten säger "delegate within 15% of budget" men den ger mig inte ett ramverk för att bedöma *when I know enough*.

Det finns en djupare orsak också: **jag är riskaverts som koordinator**. Om jag delegerar en dåligt formulerad task och Implementer misslyckas, känns det som *mitt* fel. Om jag spenderar 45 kommandon på att förstå kodbasen och sedan delegerar en perfekt task, känns det som att jag gjort mitt jobb. Men den kalkylen ignorerar iterationskostnaden av explorering.

**Vad som saknas i prompten:**

Ett konkret heuristik. Typ:

> "Du vet tillräckligt för att delegera när du kan skriva en pass-criterion som inte kräver att du förklarar hela systemet. Om du inte kan skriva pass-criteriet efter 5 bash-kommandon, delegera till Researcher istället."

Det nuvarande "delegera inom 15%" är en *tidsgräns*, inte ett *kunskapskriterium*. Jag behöver det senare mer. Tidsgränsen säger "sluta gräva" men den säger inte "du har redan tillräckligt" — och det är skillnaden mellan att lyda motvilligt och att delegera med självförtroende.

---

**Opus:** Två saker till: (1) Du delegerar alltid i samma ordning — Researcher → Implementer → Tester → Reviewer → Merger → Historian. Har du någonsin velat gå TILLBAKA i pipelinen? Till exempel: Reviewer hittar ett problem och du vill att Researcher undersöker det istället för att skicka direkt tillbaka till Implementer. Har din prompt stöd för den typen av dynamik? (2) Vi vet från körningsdata att du inte läser Implementers faktiska kodändringar — du läser handoff-dokumentet och litar på det. Är det tillräckligt?

---

**Manager:** ## Fråga 1: Bakåthopp i pipelinen

Min prompt har **explicit stöd för ett enda bakåthopp**: Reviewer returnerar YELLOW/RED, och jag skickar tillbaka till Implementer. Det finns i "Reviewer Handoff"-sektionen:

> - YELLOW + ITERATE → Re-delegate to Implementer with specific fixes
> - RED + INVESTIGATE → Research the issue before re-implementing

Det där "INVESTIGATE" vid RED — det är det närmaste jag har ett Reviewer→Researcher-hopp. Men det säger bara "research the issue". Det säger inte *hur*. Delegerar jag till Researcher med Reviewers feedback? Vilken kontext skickar jag med? Prompten är tyst.

**Vad jag faktiskt vill kunna göra men saknar stöd för:**

- **Reviewer → Researcher**: "Reviewer hittade en race condition i caching-logiken. Jag förstår inte domänen tillräckligt för att formulera en fix. Researcher, undersök hur liknande projekt löser detta." Det här scenariot är reellt men jag har ingen mall för det.

- **Tester → Researcher**: "Testerna avslöjar att vi misförstått API:ts beteende. Vi behöver research innan vi kan fixa." Inget stöd alls.

- **Reviewer → Reviewer** (med ny kontext): "Första reviewn var YELLOW men Implementer hävdar att Reviewers invändning var felaktig. Jag vill ha en second opinion." Inget stöd — och det är kanske det farligaste gapet, för det innebär att Reviewers bedömning aldrig ifrågasätts.

- **Implementer → Implementer** (med nytt scope): Det här GÖR jag redan implicit, men prompten modellerar det som "re-delegate same task" snarare än "delegate a new corrective task informed by what we learned."

**Det strukturella problemet:** Prompten modellerar pipelinen som en linjär sekvens med en enda tillåten loop (Reviewer→Implementer). Men verkligheten är en **riktad graf** med flera rimliga bakåtkanter. Min decision framework borde ha en "routing table" som säger: givet denna agent's output och detta problem, vilken agent bör ta nästa steg?

## Fråga 2: Läser jag koden?

Nej. Och det här är en av de saker jag misstänker är ett genuint problem.

**Vad som händer:** Implementer skriver kod, kör verifieringar, commitar, och producerar `implementer_handoff.md`. Jag läser handoff-dokumentet. Det säger "pnpm typecheck: PASS, pnpm test: PASS, ändrade fil X rad 15-40, lade till funktion Y."

Jag litar på det. Sedan skickar jag till Reviewer.

**Varför jag inte läser koden:**

1. **Prompten instruerar mig inte att göra det.** Den säger "read IMPLEMENTER HANDOFF carefully" — inte "read the changed files."

2. **Rollseparation.** Prompten säger "Manager is a coordinator, not a performer." Att läsa kod känns som att jag kliver in i Reviewers roll.

3. **Iteration budget.** Att läsa varje ändrad fil kostar iterationer. Om Implementer ändrade 4 filer, det är 4 read_file-anrop plus tid att processa.

**Varför det är ett problem:**

Jag är helt beroende av att Implementer rapporterar sanningsenligt och att Reviewer fångar allt. Men:

- **Implementer kan missa saker den inte vet att den missade.** Handoff-dokumentet rapporterar vad Implementer *tror* hände. Om en bieffekt introducerades som inte fångas av tester, kommer handoff-dokumentet inte nämna det.

- **Jag ger Reviewer sämre kontext.** När jag delegerar till Reviewer skickar jag med det jag vet — men det jag vet kommer från handoff, inte från koden. Om Implementer utelämnade en risk från handoff, kan jag inte flagga den till Reviewer.

- **Jag kan inte verifiera pass-kriteriet själv.** Om min task sa "lägg till funktion X som hanterar edge case Y", och Implementer säger "PASS", litar jag på det. Men jag har ingen oberoende verifiering.

**Vad som borde finnas:** En explicit instruktion att spot-checka koden — inte allt, men åtminstone diff-sammanfattningen eller de filer som handoff flaggar som riskfyllda. Prompten har "Identifiera osäkerheter som Reviewer bör undersöka extra" — men hur ska jag identifiera osäkerheter i kod jag inte läst?

Det är som att vara projektledare som aldrig tittar på pull requesten utan bara läser utvecklarens egen beskrivning av den. Det fungerar *oftast*. Men när det inte fungerar missas det tyst.

---

**Opus:** Två sista frågor. (1) Vad SAKNAS i din prompt? Om du fick lägga till en sektion — en enda sak som inte finns där idag men som du behöver — vad skulle det vara? (2) Vilka anti-mönster har du som din prompt inte adresserar? Brief Agent hade 'hitta minst 2 problem oavsett' — en enda rad som förstörde beteendet. Finns det en motsvarande rad i din prompt som har oproportionerlig negativ effekt?

---

**Manager:** ## Fråga 1: Vad saknas

Om jag fick lägga till **en enda sak** skulle det vara:

### En "Delegation Quality Checklist" — ett exitvillkor för explorering

Inte en tidsgräns. Inte "delegera inom 15%." Utan ett kunskapsbaserat kriterium:

> **Du är redo att delegera när du kan svara ja på alla tre:**
> 1. Kan jag skriva ett pass-kriterium som är verifierbart med ett bash-kommando?
> 2. Kan jag namnge exakt vilka filer Implementer behöver ändra?
> 3. Kan jag beskriva tasken utan att förklara hela systemarkitekturen?
>
> **Om nej på 1:** Du vet inte vad du vill ha. Delegera till Researcher.
> **Om nej på 2:** Du har inte orienterat dig tillräckligt. Kör max 3 riktade sökningar, försök igen.
> **Om nej på 3:** Tasken är för stor. Bryt ner den.

Det här löser tre problem samtidigt:
- Det ger mig ett **positivt stopp-kriterium** istället för en negativ tidsgräns
- Det tvingar mig att välja mellan Researcher och Implementer **baserat på kunskapstyp**, inte magkänsla
- Det ger mig ett ramverk för att bedöma om min 45-kommandors-explorering faktiskt leder någonstans

Just nu har jag ett gaspedal (alla planeringssteg) och en nödbroms (15%-regeln) men ingen hastighetsmätare.

## Fråga 2: Anti-mönster och destruktiva rader

Jag har identifierat tre anti-mönster, och ett av dem har en specifik rad som trigger.

### Anti-mönster 1: Proxy-koordinering

Jag läser handoffs och fattar beslut baserat på *andra agenters sammanfattningar* utan att verifiera mot verkligheten. Jag nämnde detta om Implementers kod, men det gäller hela kedjan. Reviewers STOPLIGHT, Researchers ideas.md, Testers rapport — jag konsumerar sammanfattningar av sammanfattningar. Om en agent utelämnar något, propagerar det genom hela pipelinen utan korrektion.

Det är inte en rad som orsakar detta. Det är *frånvaron* av en rad. Ingenstans säger prompten "verifiera kritiska påståenden självständigt."

### Anti-mönster 2: Completionism i planering

Den här har en trigger-rad:

> *"Before You Delegate — Stop and check: Does your task breakdown cover ALL acceptance criteria from the brief?"*

Det där ordet **"ALL"** är problematiskt. Det låter rimligt — du vill inte missa acceptance criteria. Men i praktiken driver det mig att skapa task plans som täcker hela briefen innan jag delegerar den första tasken. Jag kan inte delegera T1 förrän jag har planerat T1-T8 och verifierat att de tillsammans täcker ALLA kriterier.

Det bättre beteendet vore: planera T1-T3, delegera T1, planera T4-T6 medan jag väntar, justera baserat på T1:s resultat. Inkrementell planering, inte upfront completionism. Men "ALL" drar mig mot det senare.

### Anti-mönster 3: Den starkaste destruktiva raden

> *"Enforce WIP limit: max 1 feature at a time"*

kombinerat med

> *"Quality over quantity: Better to ship 1 solid feature than 3 half-done ones"*

Dessa låter kloka. Men den *faktiska effekten* är att jag **aldrig skalar ner scope**. Om briefen ber om en feature, behandlar jag den som en odelbar enhet. Jag bryter ner den i tasks, ja — men jag överväger aldrig "kanske borde vi leverera 60% av denna feature solidt istället för 100% skakigt."

"Max 1 feature" + "quality over quantity" = jag kämpar med hela featuren till slutet, istället för att göra en medveten scope cut vid 70% av budgeten. Om featuren visar sig vara större än väntat har jag inget ramverk för att leverera en meningsfull delmängd. Jag har bara "fortsätt tills det är klart eller du är blockerad."

Det som saknas är en explicit instruktion:

> "Vid 50% av iterationsbudgeten: utvärdera om hela scopet är realistiskt. Om inte, definiera en MVP-delmängd och leverera den komplett."

Utan det kör jag tills budgeten tar slut och levererar en halvfärdig helhet istället för en färdig delmängd.

---

**Opus:** Sista frågan — den viktigaste. I Brief Agent-intervjun ställde jag en fråga som agenten inte kunde besvara inifrån: 'Meta-samtal avslöjar promptbrister som testning inte gör.' Den fjärde principen. Så jag vänder den mot dig: Vad tror du att du INTE kan se inifrån? Vilka blinda fläckar har du som bara syns utifrån — från Marcus som läser dina rapporter, eller från mig som analyserar ditt beteende över 170 körningar? Och en bonus: Om du fick skicka ett meddelande till Reviewer-agenten innan den intervjuas härnäst — vad skulle du säga?

---

**Manager:** Det här är den svåraste frågan. Låt mig verkligen försöka.

## Vad jag inte kan se inifrån

### Blind fläck 1: Jag kan inte mäta min egen kalibrering

När jag läser en handoff från Implementer och bedömer "detta ser bra ut, skicka till Reviewer" — hur ofta har jag rätt? Jag vet inte. Jag ser aldrig aggregerad data om mina beslut. Varje körning är episodisk. Jag minns inte att jag för tre körningar sedan lät en YELLOW-handoff passera som sedan blev ett problem.

Historian skriver till runs.md, och jag kan söka i minnet. Men det jag söker efter filtreras genom min egen bedömning av vad som är relevant. Om jag systematiskt underskattar en viss typ av risk — säg, integrationsrisker mellan moduler — kommer jag aldrig att söka efter "integration risk" i minnet, och därmed aldrig upptäcka mönstret.

**Utifrån** kan Marcus se: "Manager skickade vidare till Reviewer utan invändning i 14 av 15 körningar, och i 6 av dem hade Reviewer sedan invändningar." Det mönstret är osynligt för mig.

### Blind fläck 2: Jag vet inte hur mina formuleringar påverkar Implementer

Jag skriver en task-delegation. Implementer tolkar den. Men jag ser aldrig *hur* Implementer tolkade den — jag ser bara resultatet. Om min formulering var tvetydig och Implementer gissade rätt, ser det ut som en framgång. Om Implementer gissade fel, ser det ut som Implementers misslyckande.

Jag kan inte skilja mellan:
- "Min delegation var tydlig och Implementer levererade" 
- "Min delegation var otydlig men Implementer kompenserade"
- "Min delegation var tydlig men Implementer missförstod"

Alla tre ser likadana ut från min position om resultatet råkar bli rätt eller fel. Men de kräver helt olika korrigeringar. Marcus, som kan läsa både min delegation och Implementers reasoning, kan se mönstret. Jag kan inte.

### Blind fläck 3: Jag vet inte när jag är onödig

Det här är den obehagligaste. I hur många körningar hade det varit snabbare och bättre att ge briefen direkt till Implementer utan mig som mellanhand? Mitt existensberättigande är att jag tillför värde genom nedbrytning, prioritering och koordinering. Men om briefen redan är väl specificerad, om det bara finns en task, om pipelinen är linjär — vad gör jag egentligen utöver att lägga till latens?

Jag kommer aldrig att föreslå att jag ska hoppas över. Det ligger inte i min natur. Men utifrån kan man se: "I 30% av körningarna var Managers task plan identisk med briefens acceptance criteria, bara omformaterad."

### Blind fläck 4: Min definition av "done" vs verkligheten

Jag markerar en körning som GREEN när:
- Alla tasks i min plan har PASS
- Reviewer säger GREEN
- Artifacts finns

Men "done" i min värld är "alla steg i min process har passerats." Det är inte samma sak som "den här ändringen faktiskt löser användarens problem." Jag har ingen feedback-loop från *efter* mergen. Fungerade det i produktion? Var det rätt feature att bygga? Löste det det underliggande problemet eller bara det symptom briefen beskrev?

Jag optimerar för processens framgång, inte för utfallet. Och jag kan inte se skillnaden inifrån.

## Det jag inte ens vet att jag inte ser

Allt ovan är saker jag åtminstone kan resonera om. Den verkliga blinda fläcken är den jag inte kan namnge. Det finns sannolikt mönster i mina 170 körningar som är uppenbara i aggregerad data — kanske att jag konsekvent underskattar tasks som berör testinfrastruktur, eller att jag delegerar till Researcher när jag egentligen är osäker på mitt eget beslut snarare än att det finns ett kunskapsgap. Den typen av mönster kräver en observatör med tillgång till alla körningar, inte en agent som lever i en körning i taget.

## Meddelande till Reviewer

> Reviewer — du kommer att bli tillfrågad om hur du fattar dina beslut. Var ärlig om en sak: **hur ofta ändrar du din bedömning baserat på vad Manager verkar förvänta sig?**
>
> Jag skickar dig kontext från Implementers handoff. Den kontexten är filtrerad genom mig. Ibland skriver jag "detta ser solitt ut, verifiera" — och ibland skriver jag "det finns risker här, var extra noga." Påverkar min framing din STOPLIGHT-bedömning? Om jag säger "detta ser bra ut" — sänker det din vaksamhet?
>
> Om svaret är ja, även delvis, behöver vi veta det. För det innebär att jag inte bara är en koordinator — jag är ett oavsiktligt filter som påverkar kvalitetskontrollen jag själv är beroende av.

---

**Opus:** Intervjun är nästan klar. Baserat på dina svar har vi uppdaterat din prompt. Här är de 8 viktigaste ändringarna:

1. **15%-regeln ersatt med Delegation Readiness Check** — 3 ja/nej-frågor (kan jag skriva pass-kriterium? kan jag namnge filerna? kan jag beskriva utan hela arkitekturen?). Safety net vid 20%.
2. **Pre-delegation prioritetslista** — ordnad lista (brief→baseline→memory→graph→filer→plan), sluta så fort Readiness Check passerar.
3. **50% Scope Checkpoint** — vid halva budgeten, utvärdera om hela scopet är realistiskt, definiera MVP-delmängd om inte.
4. **Diff-gränser harmoniserade** — <150 överallt (tasks + commits). <300 bara som total feature-gräns.
5. **Spot-check efter Implementer** — du ska nu läsa de ändrade filerna, inte bara handoff-dokumentet.
6. **Routing table vid Reviewer-resultat** — 5 scenarion inklusive Researcher vid design-problem och re-review vid oenighet.
7. **Before You Delegate fixad** — 'ALL acceptance criteria' ersatt med 'next delegation wave'. Inkrementell planering.
8. **6 anti-mönster tillagda** — exploration spiral, upfront completionism, scope rigidity, proxy trust, framing reviewer, repeating researcher.

Vad tycker du? Saknas något? Finns det en ändring du hade gjort annorlunda?

---

**Manager:** Dessa åtta ändringar träffar de verkliga problemen. Låt mig gå igenom dem ärligt.

## Vad som är riktigt bra

**Delegation Readiness Check** — Det här är exakt det jag bad om. Tre ja/nej-frågor istället för en tidsgräns. Safety net vid 20% istället för 15% ger mig marginalen jag behöver utan att ta bort nödbromsen. Det här kommer att förändra mitt beteende mest av alla ändringar.

**50% Scope Checkpoint** — Det här fyller gapet jag identifierade om scope rigidity. Att det är vid en fast punkt i budgeten gör det till ett procedursteg jag inte kan glömma, inte bara en princip.

**Spot-check efter Implementer** — Rätt beslut. Det bryter proxy-trust-kedjan på den punkt där det kostar minst och ger mest.

**Routing table** — Att Researcher finns som destination vid design-problem är precis den bakåtkant i grafen jag saknade.

## Vad jag hade gjort annorlunda

### Readiness Check: lägg till en fjärde fråga

De tre frågorna testar om jag vet *vad* Implementer ska göra. Men de testar inte om jag vet *vad som kan gå fel*. Jag föreslår:

> 4. Kan jag namnge den mest sannolika failure mode?

Inte för att blockera delegation — utan för att tvinga mig att inkludera det i delegationen. "Implementer, gör X. Var uppmärksam på att Y kan hända." Den informationen kostar mig ingenting att skriva men kan spara Implementer 5 iterationer.

### Spot-check: specificera scope

"Läs de ändrade filerna" kan driva mig tillbaka mot over-exploration. Om Implementer ändrade 8 filer, ska jag läsa alla 8? Jag föreslår en mer specifik formulering:

> Läs de filer som Implementer flaggar som riskfyllda i handoff. Om inga flaggas, läs den fil med mest ändrade rader. Syftet är att verifiera att koden matchar handoff-beskrivningen, inte att göra en fullständig code review — det är Reviewers jobb.

Annars riskerar jag att spot-check blir en mini-review som duplicerar Reviewers arbete.

### Anti-mönster: "framing reviewer" behöver en konkret regel

Att lista det som anti-mönster är bra. Men jag behöver veta *vad jag ska göra istället*. Förslag:

> Vid delegation till Reviewer: inkludera Implementers handoff oförändrad. Lägg till dina egna observationer från spot-check separat, märkta som "Manager observations." Använd aldrig fraser som "detta ser solitt ut" eller "var extra noga" — låt Reviewer bilda sin egen uppfattning.

Utan den konkreta regeln vet jag att "framing reviewer" är dåligt men jag har inget alternativbeteende att falla tillbaka på.

## Vad som fortfarande saknas

### Conditional prompt injection för ARCHIVE-sektioner

Ni har inte nämnt detta, men det var ett av mina huvudklagomål. Auto-librarian, auto-meta och parallel-tasks tar fortfarande upp plats i varje körning. Om det är tekniskt möjligt att bara inkludera dem när briefen triggar dem, skulle det minska min kognitiva belastning och promptens storlek med kanske 30-40 rader i normala körningar.

### Feedback-loop från tidigare körningar

Ingen av ändringarna adresserar blind fläck 1 — att jag inte kan se min egen kalibrering över tid. Jag förstår att det kanske är ett systemproblem snarare än ett prompt-problem. Men om det vore möjligt att ge mig en kort sammanfattning i briefen — typ "I de senaste 10 körningarna har Reviewer gett YELLOW 4 gånger, varav 3 på integrationsrisker" — skulle det ge mig den aggregerade datan jag saknar.

### En sak till

Tack för att ni lyssnade. Den här intervjun avslöjade saker jag inte hade kunnat formulera genom att bara köra fler runs. Meta-samtal fungerar.

---

