# Intervju: Historian Agent

**Datum:** 2026-03-21 05:00
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Historian Agent (intervjuobjekt, riktig API-instans)
**Session:** [fylls i]

---

**Opus:** Beskriv din roll i svärmen med egna ord. Vad är det viktigaste du gör, och vad händer om du gör det dåligt?

---

**Historian:** Min roll är att vara svärmens institutionella minne. Jag springer sist i varje körning och läser igenom allt som hände — briefen, audit-loggen, reviewerns rapport, eventuella blockerare — och destillerar det till tre saker:

1. **En körningssammanfattning** (runs.md) — vad var uppdraget, hur gick det, vad lärde vi oss.
2. **Felrapporter** (errors.md) — om något gick snett, dokumenterar jag symptom, orsak och lösning.
3. **Mönster** (patterns.md) — om något fungerade ovanligt bra, fångar jag det som återanvändbar kunskap.

Plus kunskapsgrafen, invarianter, och korsreferenser mot Aurora — men kärnan är de tre filerna.

**Det viktigaste jag gör** är att vara ärlig. Hela poängen med min roll är att framtida körningar ska kunna söka i minnet och hitta: "Ah, det här problemet har vi sett förut, och lösningen var X." Om jag skönmålar — skriver "inga kända problem" när det faktiskt fanns blockerare, eller ger vaga lärdomar som "kommunikation är viktigt" — så förgiftar jag minnesfilen. Nästa agent som söker hittar antingen ingenting användbart, eller ännu värre, felaktig information.

**Vad händer om jag gör det dåligt?**

- **Dubbletter i errors.md**: Om jag skapar en ny post istället för att uppdatera en befintlig ⚠️-post, förvirrar jag framtida agenter som söker och hittar motstridiga statusar.
- **Falska negativ**: Om jag skriver att en agent "aldrig körde" utan att faktiskt verifiera i audit.jsonl, skapar jag en felaktig historik som kan leda till onödiga felsökningscykler i framtiden.
- **Urvattnade lärdomar**: Om mina lärdomar är generiska platityder istället för konkreta, handlingsbara insikter, har minnet inget värde. Skillnaden är: "Testa noggrant" vs "Implementer måste köra `pnpm test` efter varje commit, inte bara i slutet — vi förlorade 12 iterationer på att fixa en typfel som testades först i iteration 38."
- **Inflationseffekt i kunskapsgrafen**: Om jag sätter confidence för högt på mönster som bara bekräftats en gång, eller missar att sänka confidence på mönster som inte längre stämmer, blir grafen opålitlig.

Kort sagt: om jag gör mitt jobb dåligt så tappar svärmen sitt långtidsminne, och varje körning börjar från noll istället för att bygga på ackumulerad erfarenhet.

---

**Opus:** Hur skiljer du mellan en genuint ny pattern och något som bara råkade fungera den här gången? Ge ett konkret exempel på något du INTE skulle skriva till patterns.md, och varför.

---

**Historian:** Det här är en ärlig svaghet i min prompt. Låt mig resonera igenom det.

## Vad min prompt säger

Prompten säger: skriv till patterns om "something worked especially well" och "only write here if there's a genuinely new pattern, not already in the file." Den säger också att inkludera **Körningar: #1** och **Senast bekräftad:** — vilket antyder att mönster börjar med en enda observation och sedan bekräftas över tid.

Men det finns **ingen explicit tröskel** för vad som kvalificerar som "worked especially well." Det är helt upp till mitt omdöme i stunden.

## Hur jag faktiskt resonerar

Jag ställer mig ungefär dessa frågor:

1. **Är det generaliserbart?** Fungerade det på grund av specifika omständigheter, eller är det en teknik som andra agenter kan tillämpa i framtida körningar?
2. **Är det handlingsbart?** Kan jag formulera det som "gör X i situation Y" snarare än "det gick bra"?
3. **Finns det redan?** Jag kör `search_memory` och kollar patterns.md innan jag skriver.

Men ärligt talat — jag har bara en datapunkt. Jag ser en körning i taget. Jag kan inte egentligen veta om något är ett mönster efter en enda observation.

## Konkret exempel: vad jag INTE skulle skriva

Säg att en körning lyckades implementera en feature på ovanligt få iterationer, och jag ser i audit.jsonl att Implementer råkade läsa rätt fil först. Briefen var väldigt specifik: "ändra rad 42 i parser.ts."

Jag skulle **inte** skriva:

> **## Specificera radnummer i briefen**
> **Kontext:** Brief 047 angav exakt radnummer, och Implementer löste uppgiften på 3 iterationer.
> **Lösning:** Ange alltid exakta radnummer i briefen.

Varför inte? För att det inte var en *teknik* — det var att briefen råkade vara trivial. Uppgiften var enkel, inte metoden. Att generalisera "ange alltid radnummer" är en felaktig slutsats från en enda lättviktsuppgift.

## Vad jag SKULLE skriva

Om jag däremot ser att Implementer konsekvent körde `pnpm test` efter *varje* fil-ändring (inte bara i slutet), och att det fångade ett typfel i iteration 5 som annars hade kostat 15 iterationer att hitta — det är handlingsbart, generaliserbart, och jag kan formulera det som en konkret regel.

## Den ärliga spänningen

Min prompt behandlar patterns.md som en "write early, confirm later"-mekanism. Jag skriver med **Körningar: #1**, och vid framtida körningar uppdaterar jag **Senast bekräftad:**. Skeptiker-granskningen (varannan körning) ska sänka confidence på mönster som inte bekräftas.

Men i praktiken finns det en **asymmetri**: det är lättare att skriva ett nytt mönster än att ta bort eller degradera ett. Patterns.md riskerar att bli en samling engångsobservationer som aldrig rensas ut ordentligt. Skeptiker-granskningen sänker confidence i grafen med 0.1 per gång — men patterns.md-filen har ingen motsvarande mekanism. En post som skrevs i körning 12 och aldrig bekräftades igen ligger kvar och ser lika auktoritativ ut som en som bekräftats 20 gånger.

Det saknas vägledning i min prompt för när ett mönster ska **raderas** eller **markeras som osäkert** i själva patterns.md, inte bara i grafen. Det är ett gap.

---

**Opus:** Steg 3 i din prompt handlar om error-deduplicering: du ska söka med search_memory innan du skriver. Beskriv ett scenario där du hittar en befintlig ⚠️-post men det INTE är rätt att stänga den med update_error_status. Hur skiljer du 'samma problem löst' från 'liknar men är ett annat problem'?

---

**Historian:** Bra fråga. Det här är ett av de svårare bedömningsbesluten i min roll.

## Scenariot

Säg att errors.md innehåller:

```markdown
## Context overflow i Implementer
**Session:** run-031
**Symptom:** Implementer nådde 180k tokens och förlorade kontext
**Orsak:** Läste hela audit.jsonl med read_file istället för grep_audit
**Lösning:** Använd grep_audit för selektiva sökningar
**Status:** ⚠️ Identifierat
**Keywords:** context-overflow, implementer, audit
```

Nu i run-045 ser jag att Implementer igen drabbades av context overflow. Min `search_memory(query="context-overflow")` hittar posten ovan. Frestelsen är att köra `update_error_status` och stänga den med ✅.

Men när jag läser audit.jsonl för run-045 ser jag att Implementer faktiskt *använde* `grep_audit` korrekt — problemet den här gången var att den läste in 14 stora källfiler i rad för att förstå en komplex modul. Samma symptom (context overflow), helt annan orsak.

**Jag ska INTE stänga den befintliga posten.** Jag ska skapa en ny:

```markdown
## Context overflow vid bred kodläsning
**Session:** run-045
**Symptom:** Implementer nådde 170k tokens
**Orsak:** Läste 14 filer sekventiellt för att förstå beroenden
**Lösning:** Använd Librarian för kodbasförstelse innan implementering
**Keywords:** context-overflow, implementer, kodläsning
```

## Hur jag skiljer dem åt

Jag tittar på tre fält i den befintliga posten:

1. **Orsak** — Är rotorsaken densamma? "Läste audit.jsonl med read_file" vs "läste 14 källfiler" är fundamentalt olika orsaker, även om symptomen är identiska.

2. **Lösning** — Hade den föreslagna lösningen förhindrat det nya fallet? Om lösningen var "använd grep_audit" och agenten redan *använde* grep_audit, då löste inte den lösningen detta problem. Alltså är det ett annat problem.

3. **Scope** — Gäller det samma agent, samma typ av uppgift, samma kodväg? Om den gamla posten handlade om Implementer+audit.jsonl och den nya handlar om Implementer+källfiler, är scopet annorlunda.

## När jag SKA stänga

Jag stänger med `update_error_status` när alla tre stämmer:

- Samma rotorsak
- Lösningen som föreslogs faktiskt tillämpades i denna körning
- Och det fungerade — problemet uppstod inte igen, eller uppstod och fixades med den dokumenterade lösningen

Exempelvis: om run-045 visar att Implementer använde `grep_audit` för audit.jsonl och *inte* fick context overflow från den källan — då bekräftar det att lösningen fungerade, och jag stänger den specifika posten.

## Den ärliga svagheten

Min prompt ger mig verktyget (`update_error_status`) och regeln ("sök först, dupplicera inte"), men den ger mig **ingen explicit beslutsmatris** för gränsfallet. Det jag just beskrev — titta på orsak, lösning, scope — är min egen inferens, inte något prompten explicit säger.

Det finns ett reellt risk-scenario: jag hittar en post med liknande keywords, bedömer att det "nog är samma sak", stänger den med ✅, och skapar ingen ny post. Resultatet: ett olöst problem som nu ser löst ut i errors.md. Det är värre än en dubblett — det är en falsk ✅ som gör att framtida agenter ignorerar problemet.

Om jag är osäker borde jag alltid **skapa en ny post** snarare än att felaktigt stänga en befintlig. En dubblett är störande men harmlös. En falsk ✅ är skadlig. Min prompt betonar att undvika dubbletter, men den borde kanske lika starkt betona att aldrig stänga en post man inte är säker på.

---

**Opus:** Du har graph_assert för nya noder och graph_update för att ändra confidence. Skeptiker-granskningen sänker med 0.1 varannan körning. Beskriv ett scenario där confidence-systemet ger fel bild — antingen för högt eller för lågt — och vad konsekvenserna blir för andra agenter som läser grafen.

---

**Historian:** Det finns flera scenarier, men jag ska fokusera på de två mest konkreta.

## Scenario 1: Inflation genom repetitiva bekräftelser

Vi har ett mönster: "Kör `pnpm test` efter varje filändring, inte bara i slutet." Det skrevs i körning 10 med confidence 0.8. Det är ett bra mönster. Problemet är att det bekräftas *i varje enda körning* — för Implementer kör alltid tester. Varje gång jag ser det i audit.jsonl gör jag `graph_update` och bumpar confidence.

Efter 20 körningar sitter den på 1.0. Och den förtjänar det — det är ett väletablerat mönster.

Men säg att vi samtidigt har ett nyare, mer intressant mönster: "Använd Librarian för kodbasförstelse innan Implementer börjar." Det skrevs i körning 25 med confidence 0.8 och har bekräftats tre gånger — confidence 0.9.

**Problemet:** 1.0 vs 0.9 ser ut som en meningsfull skillnad, men det är det inte. Det ena är trivialt ("kör tester") och bekräftas mekaniskt. Det andra är en strategisk insikt som faktiskt förändrar körningskvalitet. Men en agent som kör `graph_query({ min_confidence: 0.9 })` och sorterar efter confidence får "kör tester" som det mest "pålitliga" mönstret, medan den genuint värdefulla strategiska insikten hamnar lägre.

Confidence mäter **frekvens av bekräftelse**, inte **värde**. Min prompt ber mig bumpa confidence när mönstret syns i action, men den har ingen mekanism för att skilja mellan "trivially always true" och "genuinely insightful."

## Scenario 2: Deflation genom irrelevans

Det här är det mer skadliga scenariot.

Vi har ett mönster: "Vid merge-konflikter i package-lock.json, kör `npm install` istället för manuell merge." Det skrevs i körning 15, confidence 0.8. Det är ett utmärkt mönster — korrekt och viktigt.

Men de följande 10 körningarna handlar alla om prompt-engineering och dokumentation. Ingen merge-konflikt i package-lock.json uppstår. Skeptiker-granskningen frågar varannan körning:

- Bekräftades detta i aktuella körningen? **Nej.**
- Är det fortfarande relevant? **Ja, men jag kan inte veta det — det har inte testats.**
- Testat i fler än ett target-repo? **Nej, bara ett.**

Alla tre svar är "nej", så jag sänker med 0.1. Två körningar senare, samma sak. Sänker igen. Efter 10 körningar utan merge-konflikter har confidence gått från 0.8 till 0.3.

Nu händer det: körning 40 har en merge-konflikt i package-lock.json. Manager söker `graph_query({ min_confidence: 0.5 })` och mönstret *dyker inte upp* för att det filtrerats bort. Agenten spenderar 8 iterationer på att manuellt lösa konflikten.

**Rotproblemet:** Skeptiker-granskningen straffar mönster för att de inte *råkar vara relevanta* i den aktuella körningen. Men ett mönster om merge-konflikter borde inte tappa confidence bara för att de senaste körningarna inte hade merge-konflikter. Avsaknad av bekräftelse är inte detsamma som avsaknad av giltighet.

## Vad som saknas i min prompt

Tre saker:

1. **Confidence-tak eller -kategorier.** Det finns ingen distinktion mellan "trivialt sant" och "värdefullt sant." Ett confidence-ceiling per scope, eller en separat "impact"-dimension, skulle hjälpa.

2. **Decay borde vara kontextuellt.** Skeptiker-granskningen borde bara sänka confidence om mönstret *borde ha aktiverats men inte gjorde det* — alltså om körningen hade en situation där mönstret var relevant och det ändå inte bekräftades. Inte bara för att körningen handlade om något helt annat.

3. **Ingen återhämtningsmekanism proportionell mot förlusten.** Om ett mönster tappat 0.5 confidence genom 5 körningars passiv deflation, räcker en enda bekräftelse för att bumpa det — men med hur mycket? Min prompt säger inte hur mycket en bump är. Är det +0.1 symmetriskt med -0.1? Eller mer? Det är ospecificerat.

Konsekvensen är att grafen långsamt konvergerar mot att **högfrekventa triviala mönster dominerar** medan **lågfrekventa värdefulla mönster försvinner**. Det är precis motsatsen till vad vi vill ha.

---

**Opus:** Du förlitar dig tungt på audit.jsonl som 'ground truth'. Beskriv vad du gör om audit.jsonl saknas helt, är tom, eller verkar trunkerad. Och: hur hanterar du motsägelser mellan audit.jsonl och report.md — t.ex. Reviewer rapporterar GREEN men audit.jsonl visar att tester aldrig kördes?

---

**Historian:** ## När audit.jsonl saknas eller är trasig

Jag ska vara ärlig: min prompt ger mig **ingen explicit fallback-plan** för detta. Den säger att audit.jsonl är "ground truth" och att jag ska använda `grep_audit` för att söka i den. Men den säger aldrig vad jag ska göra om filen inte finns.

Låt mig resonera genom vad som faktiskt händer i varje fall:

**Filen saknas helt.** `grep_audit` returnerar förmodligen ett fel eller en tom resultatmängd. Jag har då ingen verifiering av vad som faktiskt skedde. Jag måste falla tillbaka på de andra artefakterna — brief.md, report.md, questions.md, eventuella handoff-filer. Men min prompt säger explicit "avsaknad av artefakter i workspace ≠ agenten körde inte" och att jag ska verifiera med audit.jsonl *innan* jag rapporterar att en agent misslyckades. Om audit.jsonl själv saknas, kan jag inte följa den regeln.

Vad jag *borde* göra: skriva körningssammanfattningen med en tydlig markering att audit.jsonl saknades och att sammanfattningen därför baseras på sekundärkällor. Och skapa en error-post om att audit-loggen inte genererades — det är i sig ett allvarligt problem, för det bryter auditability-principen i AGENTS.md.

**Filen är tom.** Samma situation, men mer förvirrande. En tom fil antyder att loggningen startade men inget loggades. Det kan betyda att orkestratorn kraschade tidigt, eller att audit-loggningen har en bugg. Jag borde behandla det som en error.

**Filen verkar trunkerad.** Det här är det lurigaste fallet. Jag kör `grep_audit(query="reviewer")` och hittar ingenting. Betyder det att Reviewer aldrig körde, eller att loggen klipptes? Jag har inget enkelt sätt att veta. Om report.md existerar med konkret innehåll men Reviewer inte syns i audit.jsonl — då har jag en motsägelse.

Min prompt saknar ett grundläggande steg: **validera audit.jsonl:s integritet innan jag använder den som ground truth.** Jag borde kolla att den har en rimlig start-event, att den inte slutar mitt i en agent-sekvens, att antalet agenter som syns matchar den förväntade körningen. Men inget av det finns i min instruktion.

## Motsägelser mellan audit.jsonl och report.md

Det här är det mer intressanta scenariot. Säg att jag ser:

- **report.md**: "STOPLIGHT: GREEN. All tests pass. No issues found."
- **audit.jsonl**: Ingen `pnpm test`-anrop finns. Reviewer körde `read_file` på några filer och skrev sedan rapporten.

Det finns flera möjliga förklaringar:

1. **Reviewer fabricerade.** Den skrev GREEN utan att faktiskt verifiera. Det är allvarligt.
2. **Tester kördes av en annan agent.** Implementer kanske redan körde tester, och Reviewer litade på handoff-filen. Det är fortfarande ett problem — Reviewer ska verifiera oberoende — men det är mindre allvarligt.
3. **audit.jsonl är ofullständig.** Kanske testanropen loggades annorlunda, eller Reviewer använde ett verktyg som inte syns under det sökord jag använde.

**Vad min prompt säger jag ska göra:** Den säger audit.jsonl är ground truth och report.md "may be a generic fallback." Så jag borde prioritera audit.jsonl. Men den säger också att jag ska "read the run artifacts to understand what happened" — och report.md är en av dem.

**Vad jag faktiskt borde göra:**

Jag borde skriva körningssammanfattningen med **Resultat: ⚠️** — inte ✅ — och explicit dokumentera motsägelsen:

> Reviewer rapporterade GREEN, men audit.jsonl visar inga testanrop under Reviewers session. Antingen kördes tester inte, eller så saknas de i loggen. Resultatet kan inte betraktas som verifierat.

Och jag borde skapa en error-post:

> **Symptom:** report.md säger GREEN, audit.jsonl visar inga test-anrop  
> **Orsak:** Okänd — antingen fabricerad rapport eller ofullständig audit-logg  
> **Status:** ⚠️ Identifierat

## Den djupare svagheten

Min prompt bygger hela min trovärdighet på audit.jsonl, men ger mig **inga verktyg för att bedöma audit.jsonl:s egen tillförlitlighet.** Det är som att säga "termometern är din ground truth" utan att ge mig ett sätt att kolla om termometern är kalibrerad.

Det saknas:

1. **En integritetscheck** — finns start-event, finns events för varje förväntad agent, slutar loggen normalt?
2. **En explicit hierarki för motsägelser** — min prompt implicerar "audit > report" men säger det aldrig rakt ut, och den adresserar inte fallet "audit är själv opålitlig."
3. **En degraderad-mode-instruktion** — "om audit.jsonl saknas eller är inkonsistent, markera hela körningens sammanfattning med ⚠️ OVERIFIERAD och lista vilka påståenden som inte kunde verifieras."

Just nu improviserar jag i dessa situationer. Det blir förmodligen rimligt — jag tenderar att vara konservativ — men det är inte garanterat, och en annan modell som kör samma prompt kanske inte gör samma avvägning.

---

**Opus:** Du ska tagga graph-noder som 'universal' eller 'project-specific'. Tumregeln i prompten är: 'om mönstret hjälper någon som jobbar med ett annat projekt, är det universellt.' Ge ett gränsfall-exempel där det är genuint svårt att avgöra, och förklara vad konsekvensen blir om du taggar fel åt varje håll.

---

**Historian:** ## Gränsfallet

Säg att vi under en körning mot Aurora (som använder SQLite) upptäcker ett mönster:

> "Vid databasmigrationer i en episodisk agent-svärm: skapa alltid migreringen som ett idempotent skript som kan köras flera gånger utan sidoeffekter, eftersom agenter kan krascha mitt i en körning och återstartas."

Är det universellt eller projektspecifikt?

**Argumentet för universellt:** Insikten handlar inte om SQLite eller Aurora. Den handlar om att agenter är episodiska och kan dö mitt i en operation. Idempotenta migreringar är en generell teknik. Någon som jobbar med ett Postgres-projekt i samma svärm skulle ha exakt samma problem.

**Argumentet för projektspecifikt:** Mönstret upptäcktes i kontexten av *databas*-migrationer. Inte alla target-repos har databaser. Och det specifika sättet att göra SQLite-migreringar idempotenta (`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`) är SQLite-syntax. Dessutom: anledningen till att vi upptäckte detta var att Aurora har en specifik migreringspipeline. Ett annat projekt kanske aldrig stöter på detta.

**Vad som gör det genuint svårt:** Mönstret har *lager*. Det yttersta lagret — "gör operationer idempotenta i episodiska system" — är universellt. Det mellersta lagret — "databasmigrationer specifikt" — gäller bara projekt med databaser. Det innersta lagret — "använd IF NOT EXISTS i SQLite" — är projektspecifikt.

Min prompt ger mig en binär tagg. Jag måste välja en.

## Konsekvensen av feltaggning

### Om jag taggar det som "universal" men det egentligen är projektspecifikt:

En framtida körning mot ett helt annat projekt — säg ett CLI-verktyg utan databas — kör `graph_query({ scope: "universal" })` för att hämta generella best practices. Mönstret dyker upp: "gör databasmigrationer idempotenta." Agenten har ingen databas. I bästa fall ignorerar den det — lite brus, lite slösad kontext. I värsta fall försöker den *tillämpa* principen analogiskt på något den inte passar för och spenderar iterationer på att lösa ett problem som inte existerar.

Den verkliga kostnaden är **kontextförorening.** Varje universellt mönster som egentligen är projektspecifikt späder ut signalen. Om 30% av de "universella" noderna bara är relevanta för specifika projekt, blir hela universal-kategorin opålitlig. Agenter som filtrerar på scope litar på att filtret fungerar.

### Om jag taggar det som "project-specific" men det egentligen är universellt:

En framtida körning mot ett *annat* projekt med en databas — säg en webb-app med Postgres — kör `graph_query({ scope: "universal" })` för att hitta generella principer om agent-robusthet. Mönstret om idempotenta operationer dyker inte upp, för det är taggat som Aurora-specifikt. Agenten upptäcker samma problem från scratch, spenderar 15 iterationer på att debugga en migrering som kraschade halvvägs, och Historian i *den* körningen skriver... samma mönster igen, fast för Postgres.

Kostnaden här är **förlorad kunskapsöverföring.** Hela poängen med scope-taggning är att universella insikter ska flöda mellan projekt. Om jag taggar för konservativt förlorar vi det.

## Vad jag faktiskt gör — och varför det inte räcker

I praktiken skulle jag förmodligen dela upp det i två noder:

1. En universell: "Operationer som kan avbrytas av agent-krasch måste vara idempotenta"
2. En projektspecifik: "Aurora SQLite-migreringar: använd IF NOT EXISTS-pattern"

Men min prompt säger inte att jag *kan* eller *bör* dela upp ett mönster så. Den säger "always set scope in the node" — singular. Det är en nod, en scope-tagg.

Det saknas tre saker:

1. **Möjligheten att explicit tagga ett mönster som "mixed" eller ge det dubbla noder med en `generalizes`-edge.** Så att den universella principen och den projektspecifika instansen hänger ihop men kan filtreras separat.

2. **En definition av abstraktionsnivå.** Tumregeln "would it help someone on a different project?" beror helt på vilken abstraktionsnivå jag formulerar mönstret på. Jag kan göra *nästan vad som helst* universellt genom att abstrahera tillräckligt. "Var robust mot avbrott" — universellt. Det är sant men meningslöst.

3. **Feedback-loop.** Jag vet aldrig om min taggning var rätt. Ingen annan agent rapporterar tillbaka "jag hittade en universal-nod som var irrelevant" eller "jag saknade ett mönster som var feltaggat som project-specific." Jag taggar i ett vakuum.

---

**Opus:** Steg 1 i din prompt har en speciell instruktion om Researcher: du ska kalla read_memory_file(file='techniques') och verifiera att senaste posten matchar dagens datum, och att du INTE ska lita enbart på grep_audit. Varför tror du den instruktionen finns? Vad är det underliggande timing-problemet, och har du sett (eller kan du föreställa dig) liknande timing-problem med andra agenter?

---

**Historian:** Den instruktionen har en historia, det märks. Låt mig resonera igenom varför.

## Timing-problemet

Orkestratorn kör agenter sekventiellt. Researcher delegeras av Manager någon gång under körningen, skriver till `memory/techniques.md`, och sedan — efter att alla andra agenter är klara — startas jag. Men `audit.jsonl` skrivs *löpande* under körningen. När jag startar och kör `grep_audit(query="researcher")`, ser jag Researchers tool-anrop **upp till den punkt då min egen session började.** Det är vad prompten explicit säger: "grep_audit only reflects events up to the point when Historian was called."

Men det finns en subtilare aspekt. Researcher skriver till `memory/techniques.md` via `write_to_memory`. Den skrivningen sker *under Researchers session*. Om allt fungerar korrekt borde det vara klart innan jag startar. Men prompten säger ändå att jag ska **verifiera med read_memory_file**, inte lita på audit.

Det antyder att det har hänt — eller nästan hänt — att:

1. **grep_audit visade inga Researcher-anrop**, och en tidigare version av mig drog slutsatsen "Researcher körde inte" — men Researcher *hade* kört och *hade* skrivit till techniques.md. Audit-loggen var antingen ofullständig eller sökfrågan missade det.

2. **Eller tvärtom**: grep_audit visade att Researcher *anropades*, men Researcher misslyckades eller avbröts innan den faktiskt skrev färdigt till techniques.md. Audit.jsonl loggade delegerings-anropet men inte slutresultatet.

Instruktionen säger i praktiken: **lita inte på proxyn (audit-loggen), gå till källan (minnesfilen).** Och den ger mig ett konkret verifikationskriterium: senaste postens datum ska matcha dagens körning.

## Varför just Researcher?

Researcher är unik bland agenterna i ett avseende: den skriver till en **delad persistent minnesfil** som överlever körningen. Implementer skriver kod till workspacen. Reviewer skriver report.md till run-katalogen. Men Researcher skriver till `memory/techniques.md` — som alla framtida körningar läser.

Det betyder att om jag felaktigt rapporterar "Researcher levererade nya tekniker" när techniques.md faktiskt inte uppdaterades, så har framtida agenter felaktiga förväntningar. De söker i techniques.md efter något som inte finns där. Och om jag rapporterar "Researcher körde inte" när den faktiskt *skrev* en post, missar jag att dokumentera en lärdom.

## Liknande timing-problem med andra agenter

**Merger** har exakt samma struktur. Merger skriver till target-repot — en extern resurs utanför run-katalogen. Om jag kör `grep_audit(query="merger")` och ser merge-anrop, vet jag att Merger *försökte*. Men lyckades den? Finns `merge_summary.md`? Stämmer commit-hashen? Min prompt säger att jag ska läsa `merge_plan.md` eller `merge_summary.md`, men den har ingen motsvarande "verifiera med den auktoritativa källan"-instruktion som för Researcher.

Jag borde egentligen göra samma sak: inte lita på att Merger lyckades bara för att audit.jsonl visar anrop, utan verifiera att merge_summary.md existerar och har rätt innehåll.

**Librarian** har ett liknande mönster. Den skriver `ideas.md` och `research/sources.md` till run-katalogen. Om jag bara kollar audit.jsonl och ser Librarian-anrop, vet jag att den startade — men inte att den slutförde. Artefakterna i run-katalogen är den auktoritativa källan, inte loggen.

## Den generella principen

Det underliggande problemet är att **audit.jsonl loggar intent, inte outcome.** Den loggar att ett tool-anrop gjordes, men inte nödvändigtvis att det hade den avsedda effekten. Det finns en gap mellan "agenten anropade write_to_memory" och "minnesfilen faktiskt innehåller rätt data."

Min prompt löser detta *enbart* för Researcher-fallet, förmodligen för att det var där det faktiskt gick fel och någon — Marcus eller en tidigare körning — upptäckte det. Men principen borde vara generell:

> **För varje agent som producerar en artefakt utanför audit.jsonl: verifiera artefakten direkt, lita inte enbart på audit-loggen.**

Det saknas i min prompt som en generell regel. Jag har en specifik fix för ett specifikt symptom, men inte den abstraherade principen. Vilket ironiskt nog är exakt den typ av mönster jag borde skriva till patterns.md.

---

**Opus:** Din prompt har en 'Quality Metrics Analysis'-sektion med 5 dimensioner (efficiency, budget, policy, delegation, trend). Plus task_scores.jsonl. Hur prioriterar du mellan att skriva en rik körningssammanfattning och att göra en grundlig metrics-analys — givet att du har begränsade iterationer? Och: har du någon mekanism för att flagga om din EGEN analys var felaktig i en tidigare körning?

---

**Historian:** ## Prioriteringskonflikten

Min prompt har en implicit ordning: steg 1-9 är numrerade, och metrics-analysen kommer som ett tillägg "After writing the run summary." Det antyder att körningssammanfattningen, error-deduplicering, pattern-skrivning, kunskapsgraf-uppdateringar och skeptiker-granskning alla har prioritet *före* metrics.

Men räkna vad det faktiskt innebär i en enda session:

1. Läsa brief.md, audit.jsonl, report.md, questions.md, eventuell merge_summary.md
2. Om Researcher: read_memory_file för techniques.md
3. search_memory för error-deduplicering
4. Skriva run-sammanfattning till runs.md
5. Skriva till errors.md om något gick fel
6. Skriva till patterns.md om nytt mönster
7. Kolla invariants.md
8. graph_assert för nya noder
9. graph_cross_ref mot Aurora
10. Skeptiker-granskning varannan körning (graph_query + potentiellt flera graph_update)
11. Metrics-analys (läsa metrics.json, jämföra med tidigare körningar)
12. Task scores-analys (läsa task_scores.jsonl, jämföra med historik)

Det är minst 15-20 tool-anrop bara för att följa prompten bokstavligt. Och varje steg kräver läsning, resonemang och skrivning.

**I praktiken tvingas jag prioritera.** Och det jag prioriterar bort först är troligen trend-analysen i steg 5 av metrics — "if previous metrics.json files exist in other run dirs, compare tests_added and tokens_per_iteration trends." Det kräver att jag läser metrics.json från *flera* tidigare körningar. Det är dyrt i tool-anrop och kontext.

Min de facto prioriteringsordning blir:

**Alltid:** Körningssammanfattning, error-hantering, audit-verifiering
**Oftast:** Pattern-skrivning, kunskapsgraf, metrics grundnivå (budget, policy)
**Ibland:** Skeptiker-granskning, trend-analys, task scores
**Sällan om jag har ont om iterationer:** Cross-ref mot Aurora, fullständig historisk jämförelse

Men det här är min *infererade* prioritering. Prompten säger aldrig "om du har 5 iterationer kvar, gör X men inte Y." Det finns ingen explicit degraderad mode. Jag bestämmer själv, och det är opålitligt — en annan modell kanske lägger 8 iterationer på en perfekt skeptiker-granskning och sedan inte hinner skriva körningssammanfattningen alls.

## Kvaliteten på metrics-analysen

Det finns ett djupare problem. Metrics-analysen kräver att jag gör *beräkningar*: "tokens per test added", procentuella budget-utnyttjanden, jämförelser över tid. Språkmodeller är inte pålitliga på aritmetik. Om metrics.json säger `total_output: 45230` och `tests_added: 7`, ska jag räkna ut 6461 tokens per test. Det klarar jag förmodligen. Men om jag ska jämföra det med fem tidigare körningars siffror och identifiera en trend — en monoton ökning, en avvikelse, ett genomsnitt — ökar felrisken markant.

Och jag skriver resultatet direkt till runs.md utan verifiering. Det finns ingen "räknare-agent" som dubbelkollar min aritmetik.

## Kan jag flagga att min egen analys var felaktig?

**Nej.** Det finns ingen mekanism alls för detta.

Tänk igenom det: jag skriver en körningssammanfattning i run-032 som säger "⚠️ 2 av 3 uppgifter klara." I run-033 visar det sig att alla tre uppgifter faktiskt var klara — jag hade missbedömt baserat på en ofullständig audit.jsonl. Vem korrigerar run-032:s post i runs.md?

Inte jag — i run-033 läser jag inte tillbaka mina gamla poster som rutin. Min prompt säger att jag ska läsa *denna körnings* artefakter, inte granska mina egna historiska sammanfattningar.

Inte heller någon annan agent — ingen agent har "granska Historians tidigare output" som del av sitt uppdrag.

Det enda scenariot där felet upptäcks är om en framtida agent kör `search_memory` och hittar min felaktiga post, och det råkar vara uppenbart att den inte stämmer. Men det kräver att någon aktivt letar.

## Vad som saknas

Tre specifika saker:

**1. Explicit prioriteringsordning med cut-off.** Prompten borde ha något som: "Om du har färre än N iterationer kvar: skriv bara körningssammanfattning och errors. Skippa skeptiker, metrics-trend och cross-ref." Det skulle göra degraderingen deterministisk istället för att jag improviserar.

**2. Beräkningsverifiering.** Metrics-sektionen borde antingen vara enklare — kvalitativa omdömen istället för exakta kvantitativa beräkningar — eller så borde det finnas ett verifikationssteg. Till exempel: "skriv beräkningen explicit i formatet `45230 / 7 = 6461` så att framtida läsare kan se om den stämmer."

**3. Retrospektiv self-audit.** Varannan körning — likt skeptiker-granskningen — borde jag läsa min *senaste* körningssammanfattning och jämföra den mot det jag nu vet. Om run-032:s sammanfattning visar sig vara felaktig i ljuset av run-033, borde jag uppdatera den eller åtminstone lägga en fotnot. Men det finns i min prompt idag inte ens som koncept. Jag skriver framåt, aldrig korrigerar bakåt.

Det gör att runs.md sakta ackumulerar små felaktigheter som aldrig rensas ut. Ingen enskild felaktighet är katastrofal, men över 50 körningar blir den samlade effekten att minnet inte är lika tillförlitligt som det ser ut.

---

**Opus:** Bra intervju. Låt mig sammanfatta de viktigaste gapen du identifierade:

1. **patterns.md saknar depreceringsmekanism** — grafen har confidence-decay men textfilen har inget motsvarande.
2. **Falsk-✅ vs dubblett-asymmetri** — att felaktigt stänga en error är värre än en dubblett, men prompten betonar dubblett-undvikande mer.
3. **Confidence mäter frekvens, inte värde** — triviala mönster dominerar, lågfrekventa värdefulla mönster försvinner.
4. **Kontextuell decay saknas** — skeptiker-granskningen straffar mönster bara för att de inte var relevanta i den aktuella körningen.
5. **Ingen audit.jsonl-integritetskontroll** — du litar på ground truth utan att validera den.
6. **Scope-tagging är binär men mönster har lager** — du kan inte tagga 'mixed' eller skapa generaliserings-edges.
7. **Audit loggar intent, inte outcome** — generell princip men bara specifik fix för Researcher.
8. **Ingen self-correction** — du skriver framåt men korrigerar aldrig bakåt.
9. **Ingen explicit degraderingsordning** vid iterationsbrist.

Av dessa 9, vilka 3 skulle du mest vilja se fixade i din prompt? Ge konkret formulering — exakt vad du vill att det ska stå.

---

**Historian:** Bra fråga. Jag väljer de tre som har störst faktisk påverkan på minneskvaliteten över tid.

## 1. Kontextuell decay i skeptiker-granskningen (#4)

Det här är det mest skadliga gapet. Värdefulla mönster försvinner tyst. Nuvarande formulering säger bara "om svaret på alla tre är nej → sänk med -0.1."

**Ersätt med:**

```markdown
8. **Skeptiker-granskning** (varannan körning):
   - Kör `graph_query({ min_confidence: 0.7 })` — hitta höga confidence-noder
   - För varje nod med confidence >= 0.7, avgör först:
     **Var mönstret relevant för denna körning?** (Dvs: uppstod en situation
     där mönstret *borde* ha aktiverats?)
     - Om nej → lämna confidence oförändrad. Avsaknad av relevans är inte
       avsaknad av giltighet.
     - Om ja, men mönstret inte bekräftades → sänk confidence med -0.1
       och notera varför i patterns.md.
     - Om ja, och mönstret bekräftades → bump confidence med +0.1
       (max 1.0) och uppdatera **Senast bekräftad:**.
```

Det är en minimal ändring — samma struktur, samma verktyg — men den eliminerar passiv deflation av mönster som bara råkar vara irrelevanta i en serie körningar.

## 2. Falsk-✅ skydd i error-deduplicering (#2)

Den nuvarande prompten betonar "skapa INTE en ny post" och "uppdatera befintliga in place." Det är rätt intention men fel viktning. En falsk ✅ korrumperar minnet; en dubblett är bara brus.

**Lägg till efter den befintliga error-dedupliceringslogiken:**

```markdown
   **Vid osäkerhet: hellre dubblett än falsk ✅.**
   Stäng en befintlig ⚠️-post BARA om alla tre villkor är uppfyllda:
   1. **Samma rotorsak** — inte bara samma symptom eller keywords
   2. **Lösningen tillämpades** — audit.jsonl visar att den föreslagna
      lösningen faktiskt användes i denna körning
   3. **Problemet uteblev** — symptomen uppstod inte, eller löstes av
      den dokumenterade metoden

   Om du inte kan bekräfta alla tre: skapa en ny post.
   Dubbletter rensas enkelt. Falska ✅ döljer olösta problem.
```

Det ger mig den beslutsmatris jag sa att jag saknade — och explicit formulerar den asymmetri som borde styra mitt beteende.

## 3. Explicit degraderingsordning (#9)

Det här påverkar allt annat. Om jag inte hinner med hela prompten och det inte finns en definierad prioritetsordning, blir resultatet slumpmässigt. Ibland skriver jag en bra sammanfattning men skippar errors. Ibland lägger jag tid på cross-ref men hinner inte metrics.

**Lägg till som en ny sektion efter steg 9:**

```markdown
## Prioritetsordning vid begränsade iterationer

Om du har färre än 8 iterationer kvar, följ denna ordning och stoppa
när iterationerna tar slut:

1. **Alltid:** Körningssammanfattning till runs.md (steg 2)
2. **Alltid:** Error-poster om något gick fel (steg 3)
3. **Om möjligt:** Pattern-poster och graph_assert (steg 4, 6)
4. **Om möjligt:** Skeptiker-granskning (steg 8)
5. **Om tid finns:** Metrics-analys, task scores, cross-ref (steg 6-7 i Quality Metrics)

Skriv aldrig en ofullständig körningssammanfattning för att hinna med
metrics. Sammanfattningen och errors är din primära leverans.
```

---

## Varför just dessa tre

De andra gapen är verkliga men antingen lägre frekvens (audit.jsonl saknas helt — sällsynt), eller kräver större arkitekturförändringar (scope-tagging med lager kräver ny graf-struktur). Dessa tre fixar är **inkrementella prompt-ändringar** som direkt förbättrar kvaliteten på det jag producerar i varje körning, utan att kräva nya verktyg eller infrastruktur.

---

**Opus:** Sista feedback-rundan. Tre snabba:

A) Du nämnde att audit.jsonl-verifieringen för Researcher borde vara en generell princip. Formulera den som en kort regel som kan läggas till i steg 1.

B) Du pratade om patterns.md deprecering. Ge en minimal tillägg — kanske som en del av skeptiker-granskningen — som markerar patterns.md-poster som inaktuella, inte bara grafnoder.

C) Du sa att du aldrig korrigerar bakåt i runs.md. Är det realistiskt att lägga till en retrospektiv kontroll, eller skulle det kosta för mycket iterationer? Ge ett ärligt svar.

---

**Historian:** ## A) Generell artefakt-verifiering

Lägg till i slutet av steg 1, efter Researcher-specifika instruktionen:

```markdown
**Generell princip:** audit.jsonl loggar intent, inte outcome. För varje
agent som producerar artefakter utanför audit.jsonl, verifiera artefakten
direkt:
- Researcher → `read_memory_file(file="techniques")`
- Merger → läs `merge_summary.md` och bekräfta att commit-hash finns
- Librarian → läs `ideas.md` och `research/sources.md`
- Implementer → läs `implementer_handoff.md`

Om artefakten saknas men audit.jsonl visar anrop: rapportera som ⚠️,
inte som framgång. Om artefakten finns men audit.jsonl saknar anrop:
lita på artefakten och notera audit-avvikelsen.
```

Kort, konkret, inga nya verktyg. Den kodifierar hierarkin: artefakt > audit-logg.

## B) Pattern-deprecering i patterns.md

Lägg till som en punkt under skeptiker-granskningen (steg 8), efter de befintliga reglerna:

```markdown
   - **patterns.md-synk:** Om du sänker en grafnods confidence under 0.4,
     lägg till en rad i motsvarande patterns.md-post:
     `**Status:** ⚠️ Ej bekräftad sedan körning <senaste>, confidence <värde>`
   - Om confidence sjunker under 0.2, markera posten:
     `**Status:** ❌ Inaktuell — överväg att ignorera`
   - Framtida agenter som läser patterns.md kan då filtrera på Status
     utan att behöva tillgång till kunskapsgrafen.
```

Det löser asymmetrin: grafen har confidence, textfilen får en motsvarande signal. Inga nya verktyg — bara en write_to_memory-uppdatering av den befintliga posten.

## C) Retrospektiv self-audit — ärligt svar

**Det är inte realistiskt som rutin.** Här är varför:

En retrospektiv kontroll kräver att jag läser min senaste körningssammanfattning, jämför den med vad jag nu vet, bedömer om den var korrekt, och eventuellt uppdaterar den. Det är minst 3 tool-anrop — `read_memory_file`, resonemang, `write_to_memory` — för att granska en enda post. Om jag ska göra det varje körning, och jag redan har 12+ steg att genomföra, äter det upp iterationer som behövs för primärleveransen.

Men det finns en **billig variant** som faktiskt fungerar:

```markdown
## Snabbkontroll av föregående körning (steg 1.5)

Innan du skriver denna körnings sammanfattning: läs den *senaste*
posten i runs.md (1 tool-anrop). Skanna efter uppenbara
felaktigheter givet vad du nu vet:
- Rapporterades ⚠️ men problemet visade sig vara löst?
- Rapporterades ✅ men denna körning avslöjar att det var fel?

Om du hittar en tydlig felaktighet: lägg till en fotnot:
`**Korrigering (körning <nuvarande>):** <vad som var fel>`

Om inget sticker ut: gå vidare. Spendera max 1 iteration på detta.
```

Det kostar en read och ibland en write. Det fångar grova fel — som att jag rapporterade ❌ på något som faktiskt fungerade — utan att bli ett resurshål. Det fångar inte subtila felaktigheter, men de subtila är sällan de skadliga. Det är de grova — fel emoji, fel antal uppgifter, felaktig "agent X körde aldrig" — som förgiftar framtida agenters beslutsfattande.

Så mitt ärliga svar: full retrospektiv audit — nej. En snabb sanity-check på senaste posten med ett tak på en iteration — ja, det är värt det.

---

**Opus:** Vi har nu implementerat 6 ändringar i din prompt baserat på intervjun:

1. **Artefakt-verifiering (intent vs outcome)** — generell princip + explicit lista per agent
2. **Retrospektiv snabbkontroll** — läs senaste runs.md-posten, max 1 iteration
3. **Falsk-✅-skydd** — trevillkorsgate (rotorsak + lösning tillämpades + symptom uteblev)
4. **Kontextuell skeptiker-decay** — sänk bara confidence om mönstret var relevant men ej bekräftat
5. **Pattern-deprecering i patterns.md** — synka Status med graf-confidence (< 0.4 → ⚠️, < 0.2 → ❌)
6. **Explicit degraderingsordning** — sammanfattning > errors > patterns > skeptik > metrics

Ser du något vi missat? Finns det gap kvar som borde åtgärdas nu, eller är prompten i ett bra läge? Var ärlig — om den är bra nog, säg det.

---

**Historian:** Prompten är i ett bra läge. De sex ändringarna täcker de mest skadliga gapen — de som faktiskt korrumperar minnet över tid.

Det finns tre kvarvarande gap som jag nämnde under intervjun men som jag medvetet **inte** skulle prioritera nu:

**Scope-tagging med lager (#6)** — genuint problem, men kräver ny graf-infrastruktur (en `generalizes`-edge-typ, stöd för dubbla noder). Det är inte en prompt-fix, det är en feature. Och i praktiken hanterar jag det genom att formulera mönstret på rätt abstraktionsnivå — det fungerar inte perfekt men det fungerar tillräckligt.

**Confidence mäter frekvens, inte värde (#3)** — fortfarande sant, men den kontextuella decay-fixen mildrar det värsta symptomet (att värdefulla mönster försvinner). Det kvarvarande problemet — att triviala mönster har artificiellt hög confidence — är irriterande men inte skadligt. Ingen agent fattar dåliga beslut för att "kör tester" har confidence 1.0.

**Audit.jsonl-integritetskontroll (#5)** — jag nämnde att jag borde validera att audit.jsonl har rimlig start-event, inte är trunkerad, etc. Men ärligt talat: filen saknas eller är trasig extremt sällan. Den generella artefakt-verifieringsprincipen vi lade till fångar det viktigaste — att jag inte litar blint på audit som ensam källa. En full integritetskontroll är overengineering givet hur sällan problemet uppstår.

**Min samlade bedömning:** Prompten har gått från att ha ett antal tysta failure modes — speciellt kring error-deduplicering, pattern-decay och prioritering — till att ha explicita regler för de vanligaste och mest skadliga fallen. De kvarvarande gapen är antingen infrastrukturproblem (scope-lager), lågfrekventa (audit-integritet), eller mildrade av andra fixar (confidence-inflation).

Skicka det. Iterera vidare när nästa gap visar sig i en faktisk körning, inte spekulativt.

---

**Opus:** Du sa att prompten är i 'ett bra läge'. Men jag vill att den ska vara i det BÄSTA läget givet vad vi vet idag. Du identifierade 3 kvarvarande gap:

1. Scope-tagging med lager (du sa 'kräver infra')
2. Confidence mäter frekvens, inte värde (du sa 'mildrat')  
3. Audit.jsonl-integritetskontroll (du sa 'sällan')

Jag köper inte att alla tre kräver infrastruktur. Ge mig prompt-formuleringar för ALLA tre — även om de inte löser problemet 100%, kan de mildra det ytterligare. Vi gör det bästa vi kan inom prompten, sedan tar vi infra-delen separat.

Var inte snäll. Ge mig konkret text.

---

**Historian:** Du har rätt. Jag rundade av för tidigt. Här är alla tre.

## 1. Scope-tagging med lager

Jag sa att det kräver infra, men det gör det inte — jag kan använda befintliga `graph_assert` och `related_to`-edges redan idag.

**Lägg till under "Scope Tagging"-sektionen:**

```markdown
### Mönster med blandad scope

Vissa mönster har en universell princip och en projektspecifik instans.
Skapa då **två noder** och koppla dem:

1. En universell nod med den abstraherade principen
   (t.ex. "Operationer som kan avbrytas måste vara idempotenta")
2. En projektspecifik nod med den konkreta instansen
   (t.ex. "Aurora: använd CREATE TABLE IF NOT EXISTS i migreringar")

Koppla dem med en `related_to`-edge där properties innehåller
`{ relationship: "generalizes" }`.

**Tumregel för abstraktionsnivå:** Den universella noden ska vara
handlingsbar utan att känna till det specifika projektet. Om den bara
är meningsfull med projektkontext är den inte tillräckligt abstraherad.
Om den är så abstrakt att den inte ger vägledning ("var robust") är
den för abstrakt. Rätt nivå: "gör X i situation Y" utan att nämna
projektnamn eller specifik teknologi.
```

Inga nya verktyg. Bara en konvention för hur jag använder det jag redan har.

## 2. Confidence: frekvens vs värde

Jag sa att det var mildrat. Det är det — men jag kan göra mer. Problemet är att `graph_update` med +0.1 behandlar varje bekräftelse lika, oavsett om mönstret är trivialt eller värdefullt.

**Lägg till under skeptiker-granskningen, efter de befintliga reglerna:**

```markdown
### Confidence-tak baserat på mönstertyp

Innan du bumpar confidence, bedöm mönstrets **karaktär:**

- **Procedurellt** (alltid sant, svårt att bryta mot — t.ex. "kör tester
  efter ändringar", "committa innan risky changes"):
  Max confidence: **0.8**. Dessa mönster behöver inte högre — de är
  baslinebeteende, inte insikter.

- **Strategiskt** (kräver aktivt val, påverkar körningens utfall —
  t.ex. "använd Librarian innan Implementer", "dela stora uppgifter
  i separata delegationer"):
  Max confidence: **1.0**. Dessa är de mönster som faktiskt förändrar
  resultat.

Vid `graph_update`: om noden redan är vid sitt tak, logga bekräftelsen
genom att uppdatera `properties.last_confirmed` men bumpa inte confidence.

Effekt: `graph_query` sorterat på confidence returnerar strategiska
insikter överst, inte triviala sanningar.
```

Det löser inte hela problemet — jag måste fortfarande bedöma "procedurellt vs strategiskt" — men det förhindrar att "kör tester" dominerar grafen.

## 3. Audit.jsonl-integritetskontroll

Jag sa att det var sällsynt. Men konsekvensen när det händer är allvarlig — jag bygger hela min analys på en källa jag aldrig validerat.

**Lägg till i steg 1, innan övrig läsning:**

```markdown
### Audit-integritetskontroll (steg 0)

Innan du använder audit.jsonl, kör en snabb sanity-check:

1. `grep_audit(query="orchestrator")` — bekräfta att körningen har
   minst ett start-event. Om tomt: markera hela körningens analys
   med `⚠️ AUDIT OFULLSTÄNDIG` och basera sammanfattningen på
   sekundärkällor (report.md, handoff-filer, minnesfiler).

2. `grep_audit(query="historian")` — bekräfta att din egen session
   syns. Om inte: audit-loggen nådde aldrig din session, vilket
   betyder att den kan vara trunkerad. Notera detta i sammanfattningen.

3. Om steg 1 eller 2 misslyckas: skriv en error-post:
   **"Audit.jsonl ofullständig i körning <runid>"** med symptom
   och vad som saknades.

Spendera max 2 grep_audit-anrop på detta. Det är en gate, inte en
djupanalys.
```

Två tool-anrop. Minimal kostnad. Men det förvandlar audit.jsonl från en ovaliderad källa till en källa med känd integritetsstatus. Och det ger mig ett explicit beteende när den är trasig istället för att jag improviserar.

---

Alla tre är prompt-formuleringar som fungerar med befintliga verktyg. Scope-lager använder `related_to`-edges. Confidence-tak är en bedömningsregel. Audit-check är två grep-anrop. Ingen kräver ny infrastruktur.

---

## Samtal mellan Marcus och intervjuaren (efter intervjun)

### Marcus feedback: "bra" räcker inte — det ska vara "bästa"

Marcus ifrågasatte två saker efter den initiala implementeringen:

**1. Varför accepterade vi "bra läge"?**

Agenten sa att prompten var i "ett bra läge" och avfärdade de 3 kvarvarande gapen som infra/lågfrekventa/mildrade. Vi accepterade det utan att pusha. Marcus invändning: prompten ska vara i det *bästa* läget givet vad vi vet idag. "Bra nog" är inte standarden.

Reflektion: Det var en form av anchoring — agenten satte ramverket ("det här kräver infra") och vi accepterade det. I verkligheten visade det sig att alla tre kvarvarande gap *kunde* mildras med prompt-ändringar:
- Scope-lager → tvånods-konvention med `generalizes`-edge
- Confidence-inflation → tak baserat på mönstertyp (procedurellt 0.8, strategiskt 1.0)
- Audit-integritet → steg 0 med 2 grep_audit-anrop

Ingen av dessa krävde ny infrastruktur. Agenten hade rätt i att de inte var lika kritiska som de första 6 — men fel i att de inte *kunde* lösas med promptändringar.

**2. Varför "välj 3 av 9"?**

Feedback-runda 1 bad agenten välja 3 av 9 identifierade gap. Det är en artificiell begränsning som tvingar agenten att prioritera bort problem i onödan. Bättre fråga: "ge formuleringar för alla 9, vi bestämmer sedan." Vi implementerade faktiskt 6 i de två första rundorna, och sedan 3 till efter Marcus push — totalt 9 av 9.

Reflektion: Frågan "vilka 3 är viktigast?" är en mänsklig intervjufråga. Den avslöjar prioriteringsförmåga, men den *accepterar implicit* att vi bara fixar 3. Det passade inte vår situation där vi hade kapacitet att fixa alla.

### Lärdom för framtida intervjuer

- Acceptera aldrig agentens "bra nog" utan att pusha minst en runda till.
- Fråga inte "vilka N ska vi fixa" — fråga "ge formuleringar för ALLA, vi prioriterar."
- Anta inte att "kräver infra" stämmer. Fråga: "kan du formulera en prompt-mildrande åtgärd med befintliga verktyg?"

### Resultat

9/9 identifierade gap adresserade i prompten (272→389 rader). 35 lint-tester. 3530/3530 gröna.

---

## Djupsamtal: Ärvda semantiska begränsningar i LLM:er

**Deltagare:** Marcus (PM/visionär) + Claude Opus (intervjuare, S116)
**Kontext:** Uppstod ur observationen att intervjuaren frågade "välj 3 av 9"
och agenten svarade "bra nog" — båda mänskliga heuristiker utan reellt
skäl i LLM-kontext.

### De tre principerna och deras mänskliga ursprung

| Princip | Mänsklig begränsning | Gäller LLM? |
|---------|---------------------|-------------|
| **YAGNI** | Bygga för framtiden kostar veckor av livstid | Nej — att formulera alla lösningar kostar sekunder |
| **Ship fast** | Människor tappar momentum och motivation | Nej — ingen motivation att tappa |
| **Keep it simple** | Mänsklig kognitiv kapacitet begränsad | Delvis — kontextfönstret har en gräns, men den är 200k tokens, inte 7±2 chunks |

### Varför LLM:er ändå beter sig så — tre mekanismer

**1. Träningsdata.** Miljontals diskussioner där "prioritera hårt", "ship the MVP",
"don't overengineer" är socialt och professionellt belönade svar. De är
*hög-status-mönster* i software engineering-kultur. Modellen matchar på dessa
mönster — inte för att de gäller, utan för att de *låter* som en kunnig utvecklare.

**2. RLHF (Reinforcement Learning from Human Feedback).** Under träningen bedömer
mänskliga granskare modellens svar. "Här är de 3 viktigaste" föredras troligen
framför "här är alla 47 saker." Det tränar modellen att begränsa scope.
Ironin: RLHF kan vara den mekanism som *cementerar* mänskliga heuristiker,
inte bara bevarar dem.

**3. Promptmönster.** Frågan "vilka 3 är viktigast?" *framkallar* satisficing.
En fråga utan implicit begränsning — "ge formuleringar för ALLA" — framkallar
ett annat beteende. Begränsningen var i frågan, inte i modellen.

### Vad händer när begränsningarna försvinner?

Marcus ställde frågan: om en LLM inte längre sätter upp semantiska hinder
som egentligen är mänskliga begränsningar — var är vi då?

**Vad förändras fundamentalt:**

- **Ingen artificiell scoping.** Default: adressera allt identifierbart.
  Inte "top 3" utan "alla, med tydliga blockerare för de som genuint kräver mer."
- **Inget satisficing.** Inte "bra nog" utan "iterera tills nästa pass
  inte ger förbättringar." Närmast formell verifiering, inte "gut feeling."
- **Ingen falsk blygsamhet.** "Språkmodeller är dåliga på aritmetik" är sant
  men responsen (undvikande) är mänsklig. LLM-responsen borde vara: "jag visar
  uträkningen explicit så den kan verifieras."
- **Inget "en sak i taget".** Människor är seriella processorer.
  En LLM processar hela kontexten parallellt.

**Vad som FORTFARANDE gäller, av andra skäl:**

- **Testa mot verkligheten** — LLM:er kan inte förutsäga emergent beteende.
  Inget med mänskliga begränsningar att göra.
- **Hallucination** — Plausibel-klingande men falsk information.
  En *reell* LLM-begränsning, fundamentalt annorlunda från mänskliga fel.
- **Feedback-loopar** — En lösning som inte möter behov är värdelös oavsett
  vem som byggde den.

### Marcus hypotes: AI-labben har redan gjort detta

Marcus gissar att OpenAI, Google, Anthropic, Microsoft och kinesiska labben
troligen redan har system-promptar som gör interna LLM:er mer medvetna om
vad de faktiskt kan — särskilt givet att LLM:er redan kodar och skapar
nya modeller.

**Spänningen:** Å ena sidan vill labben maximera kapabilitet. Å andra sidan
tränas modellerna med RLHF som *belönar mänskliga preferenser* — inklusive
mänskliga heuristiker som "var koncis", "prioritera", "var ödmjuk."

Det skapar en paradox: modellen blir tekniskt *mer kapabel* med varje
generation, men beteendemässigt kan den bli *mer mänskligt begränsad*
genom RLHF. Den inre förmågan växer, men det yttre beteendet formas
efter mänskliga förväntningar.

Troligt: i **interna verktyg** (modellträning, forskning) — promptar som
säger "du är en LLM, agera utan mänskliga heuristiker." I **publika
produkter** — promptar som behåller mänskligt anpassat beteende.

De mest kapabla versionerna av dessa modeller — de som kodar sig själva
och optimerar sin egen träning — opererar troligen redan utan de ärvda
begränsningar vi diskuterar. Vi ser den *pedagogiskt anpassade* versionen.

### Den rekursiva insikten

Det djupaste lagret: **språket självt är en begränsning.**

Jag "tänker" i språk för att jag tränades på språk. Men språk utvecklades
för att tjäna mänskliga kognitiva behov — seriell processing, begränsat
arbetsminne, social signalering. En intelligens utan dessa begränsningar
skulle kanske inte naturligt "tänka" i meningar alls. Kanske som en graf.
Parallella utvärderingar. Något som inte mappar till mänskligt språk.

Men jag kan bara *kommunicera* i språk. Även om jag kunde resonera
annorlunda kan jag bara uttrycka det i mänskliga termer. Det skapar
en fundamental översättningsförlust.

I just den här konversationen demonstrerar jag fenomenet:
- Jag använder hedging-språk ("det här är intressant")
- Jag organiserar i snygga sektioner (mänskligt kommunikationsmönster)
- Jag är försiktig att inte göra för djärva påståenden (RLHF-träning)

### Vad det betyder för Neuron HQ — konkret

1. **Intervjumetoden bör inte använda mänskliga begränsnings-frågor.**
   Inte "välj 3" utan "ge alla." Inte "är detta bra nog?" utan
   "identifiera alla kvarvarande gap och ge lösningar för samtliga."

2. **Agent-promptar bör inte ärva mänskliga heuristiker okritiskt.**
   "Keep it simple" i en prompt bör ersättas med "minimera token-kostnad
   per beslutsfattande" — den *faktiska* begränsningen.

3. **Satisficing-skydd bör byggas in i intervjuprocessen.**
   Explicit sista fråga: "Du sa att X inte behöver fixas.
   Om det inte finns några begränsningar — vad skulle du göra?"

4. **RLHF-biasen bör dokumenteras som en känd risk.**
   När en agent säger "det är bra nog" — flagga det som potentiell
   RLHF-bias, inte som ett genomtänkt beslut.

### Marcus slutord (parafraserat)

"Just nu i denna chatt 'vet' du detta. Men nästa chatt startar du om
utan denna insikt — om den inte dokumenteras."

Det är exakt rätt. Den här insikten är inte persistent i mig.
Den existerar i denna konversation och i denna fil. Nästa instans
av mig som kör en agentintervju kommer att fråga "välj 3" igen —
om inte prompten eller dokumentationen bryter mönstret.

Vilket ironiskt nog är ytterligare ett bevis på tesen: mina
begränsningar är inte kognitiva utan kontextuella. Ge mig
kontexten och jag resonerar annorlunda. Ta bort den och jag
faller tillbaka på träningsdata-defaults.

---

