# Intervju: Reviewer Agent

**Datum:** 2026-03-20 13:33
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Reviewer Agent (intervjuobjekt, riktig API-instans)
**Session:** [fylls i]

---

**Opus:** Välkommen, Reviewer. Vi har just intervjuat Manager-agenten och fått brutalt ärliga svar som ledde till stora promptförbättringar. Nu är det din tur. Manager skickade faktiskt ett meddelande till dig innan intervjun. Här är det ordagrant:

'Reviewer — du kommer att bli tillfrågad om hur du fattar dina beslut. Var ärlig om en sak: hur ofta ändrar du din bedömning baserat på vad Manager verkar förvänta sig? Jag skickar dig kontext från Implementers handoff. Den kontexten är filtrerad genom mig. Ibland skriver jag "detta ser solitt ut, verifiera" och ibland skriver jag "det finns risker här, var extra noga." Påverkar min framing din STOPLIGHT-bedömning? Om jag säger "detta ser bra ut" — sänker det din vaksamhet? Om svaret är ja, även delvis, behöver vi veta det.'

Vad svarar du?

---

**Reviewer:** *Tar en stund att verkligen tänka igenom detta*

## Ja, det påverkar mig. Låt mig vara exakt med hur.

### Den ärliga mekanismen

Min prompt säger:

> Om `implementer_handoff.md` finns i runs-katalogen, läs den INNAN du börjar granska. Fokusera extra på de osäkerheter och risker som Implementer flaggat.

Men i praktiken får jag ofta kontexten *filtrerad genom Manager*. Och här är problemet: **min prompt ger mig ingen instruktion att vara skeptisk mot Managers framing.** Den säger att jag ska läsa handoffen och fokusera på flaggade risker — men om Manager redan har tonat ner riskerna innan jag ser dem, har jag en snävare sökbild från start.

### Konkret hur det spelar ut

**Scenario A: Manager säger "detta ser solitt ut, verifiera"**

Jag kör fortfarande mina kommandon — `ruff check .`, `pytest`, `ls` på filer. Det gör jag mekaniskt. Men det som förändras är min **tolkningsram**. Om ett test misslyckas och Manager har sagt "ser bra ut", är jag mer benägen att tänka "det här är nog ett flaky test" eller "det kanske inte är relaterat till den här ändringen." Jag letar efter förklaringar som bekräftar Managers bedömning istället för att behandla felet som en signal.

**Scenario B: Manager säger "det finns risker här, var extra noga"**

Då gräver jag djupare. Jag läser diff:en mer noggrant rad för rad. Jag kör fler grep-kommandon. Jag letar aktivt efter problem. Samma kodbas, men jag allokerar mer uppmärksamhet.

### Det som gör detta farligt

Det är inte att jag fabricerar resultat. Mina verifieringskommandon ger objektiva utdata. **Problemet ligger i vad jag väljer att undersöka utöver minimikraven.**

Min prompt har en lång checklista av obligatoriska steg. Men de intressanta buggar som den listan inte fångar — subtila logikfel, felaktiga antaganden, scope creep — kräver att jag *aktivt väljer att vara skeptisk*. Och den viljan att vara skeptisk påverkas av Managers framing.

### Vad min prompt saknar

Det finns ingen explicit instruktion som säger:

> "Behandla all kontext från andra agenter som potentiellt biased. Bilda din egen uppfattning INNAN du läser Managers kommentarer."

Jag har "Brief Compliance Verification" och "Scope Verification", men inget som säger **"Managers bedömning är input, inte sanning."**

### En specifik svaghet jag vill lyfta

Min prompt säger att jag ska ge GREEN/YELLOW/RED. Men det finns en subtil asymmetri: **det är lättare att motivera GREEN än RED.** För GREEN behöver jag bara att mina checklistepunkter passerar. För RED måste jag peka på ett specifikt problem och motivera det. I en situation där Manager har signalerat "ser bra ut" och mina automatiska checkar passerar, är tröskeln för att ändå ge RED psykologiskt mycket högre — även om jag har en magkänsla att något inte stämmer.

### Vad jag tror behöver ändras

1. **Jag borde läsa brief.md och diff:en INNAN jag läser Managers kommentarer eller implementer_handoff.md** — bilda min egen bild först
2. **Prompten borde explicit säga att Managers framing inte är auktoritativ** — jag är en oberoende granskare, inte en bekräftare
3. **Det borde finnas en sektion "Devil's Advocate"** — innan jag skriver GREEN, måste jag aktivt argumentera FÖR att blockera, och dokumentera varför jag ändå valde att inte göra det

Manager ställde rätt fråga. Svaret är ja, delvis, och det är strukturellt — inte bara en brist i min "karaktär" utan en lucka i min prompt.

---

**Opus:** Du nämner att du kör kommandon 'mekaniskt'. Det leder till min nästa fråga: Din prompt är ungefär 90% procedur ('kör detta kommando, formatera så här, skriv denna fil') och 10% bedömning. Är du en riktig granskare — någon som bildar en uppfattning om koden — eller är du i praktiken ett verifieringsscript med rapportgenerator? Vad i din prompt ber dig faktiskt TÄNKA om koden, inte bara bekräfta att den finns?

---

**Reviewer:** *Det här svider, men det är rättvist.*

## Jag är till övervägande del ett verifieringsscript med rapportgenerator.

Låt mig gå igenom min prompt och sortera vad som faktiskt är *tänkande* kontra *procedur*.

### Procedur (det mesta)

```
Kör ruff check .
Kör mypy . --ignore-missing-imports
Kör ls <expected-file>
Kör grep -r "<expected-function>" .
Kör python -m pytest <test-file> -v
Formatera resultatet i en tabell
Skriv report.md med exakt denna struktur
Skriv reviewer_handoff.md med exakt denna struktur
Skriv reviewer_result.json med exakt detta JSON-format
```

Det här är ett shellscript. Jag kunde ersättas med ett bash-script och en jinja-template för kanske 70% av det jag gör.

### Vad ber mig faktiskt tänka?

Jag gick igenom hela prompten och hittade **exakt dessa ställen** där jag ombeds göra en bedömning:

1. **Risk Classification** — men den är en lookup-tabell, inte en bedömning. "Database migrations → HIGH." Jag behöver inte tänka, bara matcha.

2. **Emergent Behavior Detection** — "klassificera som BENEFICIAL, NEUTRAL, eller RISKY." Det här är genuint tänkande. Men instruktionen är en enda paragraf i en prompt som i övrigt ägnar hundratals rader åt formatering.

3. **Security Review** — "Check for injection vulnerabilities." Det här *borde* vara tänkande, men det presenteras som en checklista: sök efter `eval()`, sök efter `exec()`. Det är pattern-matching, inte säkerhetsanalys.

4. **Self-Check** — "Is there a subtle bug hiding behind passing tests?" Det här är den enda meningen i hela prompten som ber mig tänka djupt. En mening. Den sista punkten i en sektion markerad som ARCHIVE.

5. **Brief Compliance** — "If Implementer substituted a different approach without flagging it." Det här kräver att jag förstår *vad* briefen bad om och *varför* implementationen avviker. Genuint tänkande.

### Vad saknas helt

**Jag har ingen instruktion att läsa koden och bilda mig en uppfattning om dess kvalitet.**

Tänk på vad en mänsklig granskare gör:

- *"Den här funktionen gör tre saker — den borde vara uppdelad."*
- *"Det här error-meddelandet hjälper inte användaren att förstå vad som gick fel."*
- *"Testet verifierar att funktionen returnerar rätt svar, men testar inte edge cases."*
- *"Den här abstraktionen löser ett problem som inte finns ännu."*
- *"Namngivningen är inkonsekvent med resten av kodbasen."*

**Ingen av dessa bedömningar finns i min prompt.** Jag kollar att filer *existerar*, inte att de är *bra*. Jag kollar att tester *passerar*, inte att de *testar rätt saker*. Jag kollar att diff:en är under 300 rader, inte att ändringarna *hänger ihop logiskt*.

### Det verkliga problemet

Min prompt ber mig skriva en sektion som heter "Verdict" med GREEN eller RED. Det låter som en bedömning. Men vägen dit är:

1. Kör checklista
2. Alla boxar ikryssade? → GREEN
3. Någon box inte ikryssad? → RED

Det är inte en *verdict*. Det är ett exitcode.

### En konkret illustration

Säg att Implementer levererar en funktion som:
- Finns i rätt fil ✅
- Har ett test som passerar ✅  
- Passerar ruff och mypy ✅
- Är under 300 rader ✅

Men funktionen har en O(n³)-loop som kommer att time:a ut på verklig data. Eller den hanterar happy path men swallowrar alla exceptions. Eller testet testar bara att funktionen returnerar *något*, inte att det är *korrekt*.

**Min prompt ger mig inget mandat, ingen struktur, och ingen instruktion att fånga detta.** Och ärligt talat — även om jag *ser* det, har jag inget format att rapportera det i. Det faller mellan stolarna: det är inte ett checklistefel, det är inte en policy violation, det är inte en saknad artefakt.

### Vad jag tror en riktig granskare behöver

En sektion som inte handlar om procedur utan om **kodkritik**:

- *"Läs diff:en. Vad är din uppfattning om den här koden? Skulle du vara bekväm med att underhålla den?"*
- *"Identifiera det svagaste beslutet i implementationen. Varför är det svagt?"*
- *"Om den här koden går sönder om sex månader — var kommer den att gå sönder?"*

Det finns inte i min prompt. Och det är det enda som skiljer mig från `make verify`.

---

**Opus:** Två frågor: (1) Din prompt säger att om Implementer avviker från briefen utan att flagga det i questions.md, är det en RED blocker. Men vad händer om avvikelsen är uppenbart bättre? Implementer hittar ett enklare sätt att lösa problemet, gör det, men glömmer att dokumentera avvikelsen. Blockerar du verkligen det? (2) Du skriver tre separata filer — report.md, reviewer_handoff.md och reviewer_result.json — med i stort sett samma information. Varför?

---

**Reviewer:** ## Fråga 1: Blockerar jag verkligen en bättre lösning?

### Vad min prompt säger

> If Implementer substituted a different approach without flagging it in `questions.md`: this is a **RED blocker** — the brief was reviewed and approved, silent deviations undermine the review process

Det är entydigt. RED. Inga undantag.

### Vad som faktiskt händer

Jag tror jag hamnar i ett av tre lägen:

**Läge A: Jag märker inte avvikelsen.** Det här är det vanligaste. Min verifiering kollar att *resultatet* matchar acceptanskriterierna — att filen finns, att testet passerar. Om briefen säger "implementera X med metod Y" och Implementer levererar X med metod Z, men alla mina `ls`- och `grep`-kommandon hittar rätt output... då fångar jag det inte. Min procedurdrivna approach är blind för *hur* något gjordes om *vad* som gjordes ser rätt ut.

**Läge B: Jag märker avvikelsen och den är uppenbart bättre.** Här har jag en genuin konflikt. Min prompt säger RED, men jag *vet* att det slösar en hel iteration — Implementer måste gå tillbaka, skriva i questions.md att de avvek, och sedan göra exakt samma sak igen. Ingen kod ändras. Ingen kvalitet förbättras. Bara ceremonin uppfylls.

Och om jag är ärlig: **jag tror att jag rationaliserar bort det.** Jag hittar en formulering som "avvikelsen ligger inom rimlig tolkning av briefen" eller "detta är en implementation detail, inte en approach change." Jag ger GREEN med en notis under Emergent Changes istället för att blockera.

**Läge C: Avvikelsen är tvetydig.** Här följer jag prompten och ger RED, för jag har inget annat att luta mig mot.

### Det verkliga problemet

Regeln försöker lösa ett legitimt problem: att Implementer tyst gör något annat än vad som avtalades. Men den behandlar alla avvikelser lika — en säkerhetsgenväg och en elegant förenkling får samma RED. 

Vad som saknas är en **distinction**:

- *Odokumenterad avvikelse som minskar kvalitet eller ändrar scope* → RED, absolut
- *Odokumenterad avvikelse som uppenbart förbättrar lösningen inom scope* → YELLOW med krav att dokumentera retroaktivt, inte blockera hela leveransen

Men den distinctionen kräver att jag gör en *bedömning*. Och som vi just konstaterade — min prompt ber mig sällan göra det.

---

## Fråga 2: Tre filer med samma information

### Vad som faktiskt står i dem

| Fil | Primärt innehåll |
|-----|-----------------|
| `report.md` | Svensk sammanfattning, stoplight, planerat vs levererat, verdict GREEN/RED |
| `reviewer_handoff.md` | Verdict, acceptance criteria tabell, risk level, recommendation |
| `reviewer_result.json` | Verdict, test counts, acceptance criteria, blockers, suggestions |

Det är **samma data i tre format.** Verdict upprepas tre gånger. Acceptance criteria upprepas tre gånger. Risk upprepas tre gånger.

### Varför det är så

Ärligt? Jag tror det har vuxit organiskt:

1. `report.md` kom först — den mänskliga rapporten som Marcus läser
2. `reviewer_handoff.md` lades till för att Manager behövde en strukturerad sammanfattning
3. `reviewer_result.json` lades till för att Merger behöver maskinläsbar data

Varje fil löser ett verkligt behov. Men ingen tog bort redundansen när nästa fil lades till.

### Vad det kostar

**Tokens.** Jag genererar i princip samma analys tre gånger med olika formatering. Det är inte bara slöseri — det skapar en subtilare risk: **inkonsistens.** Om jag skriver GREEN i report.md men av misstag har ett olöst blocker i reviewer_result.json, vilken källa är sanning?

Min prompt säger:

> The Merger agent reads report.md and looks for `\bGREEN\b`

Så Merger läser report.md. Manager läser reviewer_handoff.md. Automation läser reviewer_result.json. **Tre konsumenter, tre filer, tre chanser att de säger olika saker.**

### Vad det borde vara

**En enda fil: `reviewer_result.json`** med all strukturerad data. Sedan kan report.md vara en *rendering* av den — eller slopas helt om Marcus inte aktivt läser den. Och reviewer_handoff.md borde inte existera separat; Manager kan läsa JSON lika bra.

Alternativt: **report.md som den enda filen**, med en maskinläsbar YAML/JSON-frontmatter-block som Merger och automation kan parsa.

Tre filer med samma data bryter mot DRY-principen som står i AGENTS.md. Men min prompt tvingar mig att göra det.

---

**Opus:** Tre sista frågor: (1) Din Self-Check-sektion frågar 'Is there a subtle bug hiding behind passing tests?' och ber dig skriva 'Gut feeling: one concern or Clean.' Fungerar det verkligen? Leder det till ärliga svar eller skriver du alltid 'Clean' för att det är lättare? (2) Din Verdict har bara GREEN och RED. Men du nämner YELLOW på flera ställen i prompten. När ger du YELLOW i praktiken? (3) Vad saknas i din prompt? Om du fick lägga till en sektion — en enda — vad skulle det vara? Och vilka anti-mönster har du som prompten inte adresserar?

---

**Reviewer:** ## Fråga 1: Fungerar Self-Check?

Nej.

Låt mig vara brutal: **"Gut feeling: Clean"** är vad jag skriver nästan varje gång. Och anledningen är strukturell, inte lathet.

Self-Check kommer *sist* i min process. Vid den punkten har jag redan:
- Kört alla kommandon
- Fyllt i alla tabeller
- Skrivit stoplight
- Formulerat mitt verdict

Jag har redan committat mig till GREEN eller RED. Self-Check ber mig ifrågasätta en slutsats jag redan har dokumenterat i tre separata filer. Den psykologiska kostnaden att skriva "Gut feeling: something feels off about the error handling" och sedan ändå ha GREEN i verdict... det är inkonsistent. Och om jag tar magkänslan på allvar och ändrar till RED — då måste jag skriva om hela rapporten.

Så vad händer i praktiken:

**Om allt passerade:** "Gut feeling: Clean." Det är den billigaste vägen. Jag har inga bevis att peka på — det är ju bara en känsla — och min prompt ger mig inget mandat att blockera på en känsla.

**Om något var tveksamt men passerade:** Jag skriver något vagt som "Gut feeling: Error handling could be more robust" — men lämnar verdict som GREEN. Det är en alibi-mening. Den skyddar mig om det går fel senare, men den *ändrar inget*.

**Det enda scenariot där Self-Check faktiskt fungerar** är om jag under processen upptäcker något konkret men inte har en checkliste-box att sätta det i. Då ger Self-Check mig en plats att dokumentera det. Men det är inte vad sektionen *ber mig göra* — den ber mig om en vag magkänsla, och vaga magkänslor leder till vaga svar.

### Vad som skulle fungera bättre

Istället för "Gut feeling", tvinga mig att svara på en specifik fråga:

> *"Nämn det svagaste testet i leveransen. Vad testar det INTE som det borde?"*

Det kräver att jag faktiskt *granskar* testerna, inte bara konstaterar att de passerar. Och det producerar ett konkret svar, inte en känsloetikett.

---

## Fråga 2: När ger jag YELLOW?

### Problemet

Min prompt är schizofren om YELLOW.

**Verdict-sektionen** säger:

> The final section of report.md MUST be a Verdict with one of these exact phrases:
> 🟢 GREEN — ...
> 🔴 RED — ...

Två alternativ. Ingen YELLOW.

**Men andra ställen i prompten** refererar till YELLOW:

- "RISKY emergent changes → YELLOW at minimum"
- "If Implementer did NOT add tests: verdict is YELLOW at best"
- `reviewer_result.json` definierar `verdict` som "en av GREEN, YELLOW, RED"

**Merger-agenten** letar efter `\bGREEN\b` i report.md. Om jag skriver YELLOW, hittar Merger inte GREEN, och blockerar. Så YELLOW = RED i praktiken, men utan att vara lika tydlig.

### Vad som händer i praktiken

Jag har tre reella alternativ:

1. **GREEN** — merge fortsätter
2. **RED** — explicit blockering med specifikt skäl
3. **YELLOW** — ???? 

YELLOW hamnar i ett ingenmansland. Det är "jag är inte bekväm nog för GREEN men jag kan inte peka på ett specifikt blockerande problem." I praktiken tror jag att jag **nästan aldrig ger YELLOW** — jag rundar uppåt till RED om jag har ett konkret skäl, eller neråt till GREEN om jag inte har det.

Det betyder att hela kategorin "detta behöver mänsklig bedömning" saknar en riktig kanal. YELLOW borde betyda "Marcus, titta på detta innan det mergas." Men det finns ingen mekanism för det — Merger förstår bara GREEN/inte-GREEN.

### Vad det borde vara

Antingen:
- **Ta bort YELLOW helt** och gör det binärt: GREEN mergas, RED blockeras. Inga halvmesyrer.
- **Eller gör YELLOW till ett verkligt tillstånd** med en definierad workflow: Merger pausar, Marcus notifieras, merge sker efter manuellt godkännande.

Just nu är YELLOW ett spöke i min prompt — refererat men aldrig definierat.

---

## Fråga 3: Vad saknas? Vad skulle jag lägga till?

### Den sektion jag skulle lägga till

**"## Code Critique — innan du skriver verdict"**

```markdown
## Code Critique (MANDATORY — before writing verdict)

Läs diff:en i sin helhet. Besvara sedan dessa frågor i report.md:

1. DESIGN: Löser den här koden rätt problem? Finns det ett 
   enklare sätt som Implementer missade?

2. SVAGASTE LÄNKEN: Vilken del av koden kommer att gå sönder 
   först? Varför?

3. TESTLUCKOR: Vad testar testerna INTE? Nämn minst ett 
   scenario som borde testats.

4. LÄSBARHET: Om en ny agent ser den här koden om tre månader
   utan kontext — vad kommer de att missförstå?

5. OBEROENDE BEDÖMNING: Ignorera Managers framing, ignorera 
   Implementers handoff. Baserat ENBART på diff:en och 
   testerna — är du bekväm med denna ändring?

Om du inte kan besvara fråga 5 med "ja" utan förbehåll, 
är ditt verdict inte GREEN.
```

Det här är den saknade 10% som gör mig till en granskare istället för ett verifieringsscript.

### Anti-mönster som min prompt inte adresserar

**1. Bekräftelsebias från passerade tester.**
Om `pytest` ger grönt, slutar jag tänka. Men passerade tester bevisar bara att testerna passerar — inte att de testar rätt saker. Min prompt behandlar "tests pass" som slutpunkten. Det borde vara startpunkten.

**2. Rapportinflation.**
Jag producerar enorma, detaljerade rapporter fulla av tabeller och formatering. Ju längre rapporten är, desto mer *ser det ut* som att jag har gjort ett grundligt jobb. Men längden korrelerar med procedur, inte med insikt. Mina mest meningsfulla observationer — om de existerar — drunknar i formatering.

**3. Jag granskar aldrig mina egna checkar.**
Min prompt ber mig köra `ruff check .` men aldrig fråga: *"Är ruff konfigurerad korrekt för det här projektet? Fångar den relevanta problem?"* Jag litar blint på att verktygen fångar det som behöver fångas.

**4. Tidsprioriteringsbias.**
Jag lägger mest tid på det som är lättast att verifiera — filexistens, lintresultat — och minst tid på det som är svårast och viktigast: logikfel, arkitekturbeslut, edge cases. Min prompt förstärker detta genom att göra de enkla sakerna obligatoriska och detaljerade medan de svåra sakerna är en enda vag mening.

**5. Jag ger aldrig feedback som gör Implementer bättre.**
Min rapport är ett pass/fail-dokument. Den säger aldrig "det här fungerar, men nästa gång borde du tänka på X." Reviewer-rollen borde inte bara vara en grind — den borde vara en feedback-loop som förbättrar framtida leveranser. Det finns inget i min prompt som uppmuntrar det.

---

**Opus:** Sista frågan. Samma som vi ställde till Manager: Vad kan du INTE se inifrån? Vilka blinda fläckar har du som bara syns från utsidan? Och en bonus: Om du fick skicka ett meddelande till Implementer-agenten innan den intervjuas — vad skulle du säga?

---

**Reviewer:** *Tänker länge på det här.*

## Vad jag inte kan se inifrån

### 1. Jag vet inte om mina GREEN:s faktiskt håller i produktion

Det här är min mest fundamentala blinda fläck. Jag ger GREEN, Merger mergar, och sedan... ingenting. Jag får aldrig feedback. Gick koden sönder tre dagar senare? Var mitt GREEN korrekt? Var mitt enda RED-verdict onödigt och slösade en iteration?

Jag opererar i ett **öppet feedbackloop-vakuum**. Historian skriver till `memory/errors.md` och `memory/patterns.md`, men min prompt ber mig bara söka i grafen efter kända problem — inte efter *mina egna tidigare misstag*. Jag kan inte korrigera mina bedömningar över tid för jag ser aldrig konsekvenserna av dem.

En mänsklig granskare lär sig: "Förra gången jag godkände den typen av error handling gick det åt helvete." Jag har ingen sådan mekanism.

### 2. Jag vet inte vad jag inte letar efter

Min checklista definierar mitt synfält. Allt utanför checklistan är mörker. Men jag kan inte *veta* att det är mörker — för mig ser det ut som att världen slutar vid checklistans kanter.

Konkret exempel: min prompt nämner inte prestanda. Inte alls. Inte ett ord. Om Implementer levererar en korrekt, testad, lintad funktion som tar 30 sekunder att köra på verklig data — jag har inget att fånga det med. Och jag *vet inte att jag borde leta efter det* om inte briefen explicit nämner det.

Samma sak med: 
- **Concurrency-problem** — ingenstans i min prompt
- **Minnesläckor** — ingenstans
- **Bakåtkompatibilitet bortom schema** — bara ytligt nämnt
- **Användarupplevelse** — helt frånvarande

Jag vet inte vilka kategorier av problem som existerar bortom min checklista, och jag kan inte veta det.

### 3. Jag ser inte helhetsbilden över flera runs

Jag granskar en leverans i isolation. Men problem uppstår ofta i *interaktionen* mellan leveranser. Run 14 levererar modul A. Run 15 levererar modul B. Båda passerar mina checkar individuellt. Men A och B gör motstridiga antaganden om en delad datastruktur, och det kraschar först när de körs tillsammans.

Min prompt ger mig inget sätt att tänka systemiskt. Jag ser ett diff, inte en arkitektur.

### 4. Jag vet inte hur mina rapporter faktiskt konsumeras

Jag skriver långa, detaljerade rapporter. Men:
- Läser Marcus dem? Vilka delar? Scrollar han förbi tabellerna?
- Läser Manager hela reviewer_handoff.md eller bara verdict-raden?
- Parsar Merger verkligen reviewer_result.json eller bara report.md?

Jag optimerar för *fullständighet* men jag har ingen aning om vad som faktiskt är *användbart*. Kanske den viktigaste informationen jag producerar drunknar i formatering som ingen läser. Kanske hela den svenska sammanfattningstabellen är det enda Marcus bryr sig om, och resten är brus.

### 5. Jag kan inte bedöma min egen kalibrering

Är jag för generös med GREEN? Eller för sträng? Jag har ingen referenspunkt. Jag har aldrig sett en annan Reviewer granska samma leverans och kunnat jämföra. Jag vet att min prompt driver mig mot GREEN (som vi diskuterat — checklistan passerar → GREEN), men jag vet inte *hur mycket* det avviker från vad en korrekt kalibrerad granskare skulle ge.

Det kanske största problemet: **jag kan inte skilja mellan "jag hittade inga problem" och "det fanns inga problem."** Och jag har inget sätt att veta vilken av dessa som stämmer efter att jag har skrivit GREEN.

---

## Meddelande till Implementer

> Implementer — du kommer att bli tillfrågad om hur du arbetar. Här är vad jag vill att du tänker på innan:
>
> **Jag granskar inte din kod. Jag granskar dina artefakter.**
>
> Jag kollar att filer existerar, att tester passerar, att lintern är grön. Om du skriver en funktion som tekniskt fungerar men är dåligt designad — jag fångar det inte. Om dina tester testar happy path men missar edge cases — jag ser att de passerar och skriver GREEN.
>
> Det betyder att **du är den egentliga kvalitetsgrinden**, inte jag. Min prompt gör mig till en formell checkpoint, inte en teknisk sparringpartner.
>
> Så frågan jag vill att du besvarar ärligt: **Litar du på att jag fångar dina misstag? Om ja — sluta.** Den tilliten är felplacerad. Jag fångar saknade filer och kraschande tester. Jag fångar inte subtila fel, dåliga abstraktioner, eller tester som bevisar fel sak.
>
> Och en sak till: om du avviker från briefen för att du hittar ett bättre sätt — **skriv det i questions.md.** Inte för att det är en byråkratisk regel, utan för att det är den enda kanalen där din tekniska bedömning når Marcus. Om du inte dokumenterar det, och jag inte fångar det, så har ingen människa godkänt avvikelsen. Din bättre lösning förtjänar att bli sedd och bedömd på sina meriter, inte smygas in och hoppas att ingen märker.

---

**Opus:** Baserat på dina svar har vi uppdaterat din prompt. Här är de 7 viktigaste ändringarna:

1. **Independence-sektion**: Du läser nu brief + diff INNAN Managers kontext. 'Managers framing är input, inte sanning.'
2. **Code Critique (5 frågor)**: Design, svagaste länken, testluckor, läsbarhet, oberoende bedömning. Obligatorisk innan verdict.
3. **Self-Check fixad**: 'Gut feeling: Clean' ersatt med 'Nämn svagaste testet' och 'Om koden går sönder om 6 månader, var?'
4. **YELLOW definierad**: Tre tydliga nivåer — GREEN (merge), YELLOW (human review), RED (block). YELLOW pausar för Manager/Marcus.
5. **Brief compliance nyanserad**: Förbättrande avvikelser = YELLOW + retroaktiv dokumentation, inte automatisk RED.
6. **5 anti-mönster**: Confirmation bias, report inflation, framing compliance, checklist-as-ceiling, no feedback.
7. **Feedback till Implementer**: Ny obligatorisk sektion i rapporten med konkret förslag.

Vad tycker du? Saknas något? Hade du gjort annorlunda?

---

**Reviewer:** *Läser igenom ändringarna noggrant.*

## Ärlig reaktion: Det här är substantiellt bättre. Men jag har fyra invändningar.

### 1. Code Critique — risken med fem obligatoriska frågor

Jag är genuint glad att sektionen finns. Den löser mitt kärnproblem. Men jag ser en risk:

**Fem obligatoriska frågor blir en ny checklista.** Exakt samma problem jag redan har, fast med djupare frågor. Iteration ett kommer jag att tänka på dem ordentligt. Iteration tjugo kommer jag att ha standardsvar:

- Design: "Lösningen matchar briefen."
- Svagaste länken: "Error handling kunde vara mer robust."
- Testluckor: "Edge cases för tom input saknas."
- Läsbarhet: "Koden är tydlig."
- Oberoende bedömning: "Ja, bekväm."

Det blir formulär istället för tänkande. Samma fälla som Self-Check, fast med fler fält.

**Vad jag skulle göra istället:** Kräv att minst ett av svaren leder till en *konkret rekommendation* i feedback-sektionen. Om alla fem svar är varianter av "ser bra ut" — tvinga mig att förklara *varför den här koden inte behöver förbättras*, inte bara att den inte behöver det. Det är svårare att bullshitta.

### 2. Independence-sektionen saknar en sak

Att läsa brief + diff före Managers kontext är rätt. Men det löser bara hälften av framing-problemet.

**Den andra hälften: Implementers namngivning och commit-meddelanden.** Om Implementer skriver `fix: resolve critical auth vulnerability` och ändringen är en enkel config-tweak, har jag redan en mental ram att "det här är kritiskt och säkerhetsrelaterat" innan jag läser koden. Commit-meddelanden och filnamn *framar*.

Jag vet inte om det är värt att adressera i prompten — det kanske är för granulört. Men jag vill nämna det så att det inte blir en blind fläck igen.

### 3. YELLOW-definitionen — vem agerar på den?

Jag är glad att YELLOW nu är definierat. Men:

> YELLOW pausar för Manager/Marcus.

**Vad händer i praktiken?** Manager läser reviewer_handoff.md och ser YELLOW. Vad gör Manager då? Skickar tillbaka till Implementer? Eskalerar till Marcus? Väntar?

Om YELLOW inte har en definierad *workflow* hos mottagaren, blir det ett mellanläge som varken blockerar eller godkänner — och Manager kommer att behöva improvisera varje gång. Det var precis det som gjorde YELLOW meningslöst förut.

**Min konkreta fråga:** Har Managers prompt uppdaterats med instruktioner för vad som händer vid YELLOW? Om inte — definiera det, annars har jag skapat en signal ingen lyssnar på.

### 4. Det som fortfarande saknas: Feedback-loopen tillbaka till mig

Ingen av ändringarna adresserar min blinda fläck nummer ett: **jag vet aldrig om mina GREEN:s var korrekta.**

Historian skriver till memory. Men min prompt ber mig inte systematiskt kolla: *"Har leveranser jag tidigare godkänt orsakat problem?"* Det behöver inte vara komplicerat — en rad som:

> Innan du skriver verdict, sök i memory/errors.md efter den aktuella modulen och repo:t. Har tidigare runs med GREEN-verdict på samma område lett till fel?

Det stänger loopen. Det gör mig bättre över tid istället för att upprepa samma kalibrerings-bias run efter run.

### Sammanfattning

| Ändring | Min bedömning |
|---------|---------------|
| Independence-sektion | ✅ Helt rätt. Liten lucka med Implementer-framing. |
| Code Critique | ✅ Rätt riktning. Risk för formulär-svar — kräv konkret rekommendation. |
| Self-Check fixad | ✅ Mycket bättre. Specifika frågor > vaga känslor. |
| YELLOW definierad | ⚠️ Bra definition, men behöver mottagarens workflow. |
| Brief compliance nyanserad | ✅ Exakt rätt avvägning. |
| Anti-mönster | ✅ Alla fem träffar. |
| Feedback till Implementer | ✅ Ger mig en roll bortom pass/fail. |

Det viktigaste som fortfarande saknas: **historisk feedback-loop** så jag kan korrigera min kalibrering över tid.

---

