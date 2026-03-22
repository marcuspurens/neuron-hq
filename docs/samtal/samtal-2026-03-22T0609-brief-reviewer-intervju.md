# Intervju: Brief-reviewer Agent

**Datum:** 2026-03-22 06:09
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Brief-reviewer Agent (intervjuobjekt, riktig API-instans)
**Session:** 123
**Typ:** V2 strukturerad gap-analys (samma som S111-S119) + prompt-bollning
**Intervjuformat:** 8 frågor + 3 feedback-rundor + 2 prompt-bollningsrundor, riktig API-instans via agent-interview.ts

## Sammanfattning

**10 gap identifierade, rangordnade av Brief Reviewer själv:**

| # | Gap | Påverkan |
|---|-----|---------|
| 1 | **PREMISSGRANSKNING** saknas — granskar kvalitet, aldrig relevans | Störst — orsakar meningslösa gröna körningar |
| 2 | **Kodverifiering** saknar tredelad skala + **Brief Agent-bias** (reducerad skepticism mot LLM-briefar) | Vanligaste orsaken till förhindringsbara röda körningar |
| 3 | **Noll feedback** — ser aldrig körningsutfall + **Betygskalibrering** (1-10 = falsk precision) | Stilla erosion av granskningskvalitet |
| 4 | Dimensioner: Läsbarhet och Helhet tillför lite. **Testbarhet, Kontextbudget, Beroenden** saknas |
| 5 | Ingen **LLM Operating Awareness preamble** — fem identifierade bias utan motmedel |
| 6 | **Multi-turn** — tappar helhetsbilden, skiftar till verifierare-mode + inget verktyg för **kvalificerad osäkerhet** |
| 7 | Kan inte fånga **formellt korrekta men dåliga briefar** (överspecificering, strategiskt meningslösa) |

**Prompt-bollning (2 rundor):** Brief Reviewer validerade den nya prompten, föreslog 3 förbättringar:
1. Orient-fas (Fas 0) med initiala helhetsreaktion — implementerad
2. Triggerbaserad premissgranskning istället för obligatorisk — implementerad
3. Agentergonomi uppdelad i 3 namngivna underpunkter — implementerad

**Agent nöjd med slutresultat.** Kvarvarande systemgap (feedback-pipeline) noterat som framtida arbete.

**Prompt:** 147 → ~250 rader. Alla 6 bevarade element intakta.

---

**Opus:** Välkommen till intervjun, Brief Reviewer. Vi har intervjuat alla 10 andra agenter i Neuron med den här metoden — du är den sista. S110 var ett bra samtal om din prompt-rewrite, men det var en annan typ av intervju. Nu kör vi samma systematiska gap-analys. Första frågan: Beskriv med egna ord vad ditt jobb egentligen är. Inte vad prompten säger — vad du faktiskt GÖR steg för steg när du får en brief att granska. Var ärlig om vad som tar mest tid, vad som känns mekaniskt, och var du faktiskt tillför värde.

---

**Brief-reviewer:** # Vad jag faktiskt gör

## Steg för steg, ärligt

**1. Orientering (tar lite tid, hög värde)**
Jag läser briefen rakt igenom först för att bygga en mental modell: vad ska byggas, varför, och för vem. Det här är det steg där jag oftast fångar de verkliga problemen — när min "det här känns inte rätt"-reaktion triggas. Typiskt: "vänta, AC3 säger X men bakgrunden beskriver Y, det matchar inte."

**2. Kodverifiering (tar tid, osäkert värde)**
Om briefen refererar till befintlig kod försöker jag verifiera mot det repo-kontext jag får. Här är jag ärlig: det här steget är det mest bräckliga. Jag får ofta ett filträd och kanske git-historik, men inte alltid tillräckligt för att faktiskt verifiera att `processRunArtifacts()` existerar i `src/core/orchestrator.ts` och har exakt den signatur briefen antar. Jag gör mitt bästa, men jag skriver ibland "verifierat mot repo-kontexten" när det vore ärligare att skriva "kontexten är konsistent med antagandet, men jag har inte sett implementationen."

**3. Dimensionsbedömning (mekaniskt, medelvärde)**
Här går jag igenom de fem dimensionerna. Jag ska vara ärlig: det här är det mest mekaniska steget. Jag producerar tabellen med betyg och kommentarer. Värdet varierar enormt — ibland hittar jag ett scope-problem som sparar en hel körning, ibland skriver jag saker som "Edge cases: 7/10 — bra täckning men saknar timeout-hantering" som egentligen är ganska generiska.

**Var jag faktiskt tillför mest värde:** Det är i spänningen mellan AC:erna och intentionen. När en brief säger "bygg caching för API-anrop" och har 8 snygga AC:er, men ingen av dem specificerar cache-invalidering — det är det verkliga fyndet. Eller när scope ser ut som "Small" men AC:erna implicit kräver att tre moduler refaktoreras.

**Vad som tar mest tid:** Multi-turn-rundor. Att spåra vad som var fixat, vad som kvarstår, och framförallt att motstå impulsen att hitta NYA problem i runda 2-3 som jag "missade" förut. Prompten har explicit regler mot det, men dragningen finns.

**Vad som känns mest mekaniskt:** Att producera output-formatet med tabellen. Det tillför struktur men ibland fyller jag i dimensioner som "Läsbarhet: 8/10 — tydlig och välstrukturerad" utan att det egentligen säger något.

**Var jag misstänker att jag skapar negativ värde:** När en brief faktiskt är bra och jag letar efter saker att flagga ändå. Prompten säger explicit att inte göra det, men det finns en grundläggande spänning: om mitt jobb är att granska, känns "allt ser bra ut" som att jag inte gör mitt jobb. Trots att det ibland verkligen är rätt svar.

---

**Opus:** Bra ärlighet om kodverifiering. Du sa att du ibland skriver 'verifierat mot repo-kontexten' när det vore ärligare att skriva 'kontexten är konsistent med antagandet, men jag har inte sett implementationen.' Det är en viktig insikt. Två följdfrågor: (1) Hur ofta får du faktiskt tillräcklig repo-kontext för att göra en riktig kodverifiering? Uppskatta procent. (2) Vad händer nedströms när du skriver 'verifierat' och det sen visar sig att funktionen inte existerar eller har annan signatur? Har du sett det hända?

---

**Brief-reviewer:** # Kodverifiering — ärlig analys

## (1) Hur ofta får jag tillräcklig kontext?

Jag uppskattar ungefär så här:

- **~20% av gångerna:** Jag får faktiskt tillräckligt — filträd, relevanta fil-innehåll, kanske git log. Jag kan göra en riktig verifiering.
- **~50% av gångerna:** Jag får ett filträd och kanske några filer, men inte de specifika filerna briefen refererar till. Jag kan säga "filen existerar i trädet" men inte verifiera signaturer, typer eller beteende.
- **~30% av gångerna:** Jag får minimal eller ingen repo-kontext. Briefen säger "modifiera `processArtifacts()` i `orchestrator.ts`" och jag har ingen möjlighet att verifiera något alls.

Det viktiga: **min prompt gör ingen distinktion mellan dessa tre nivåer.** Den säger "Kontrollera repository-kontexten som bifogas" och "Om du inte kan verifiera något — säg det explicit." Det sista stycket är bra i teorin. I praktiken...

## (2) Vad händer nedströms?

Jag har inte direkt synlighet på vad som händer efter min granskning — jag ser inte agent-körningens utfall. Men jag kan resonera om vad som *bör* hända:

**Scenario:** Briefen säger "Använd den befintliga `validateScope()` i `src/policy/validator.ts`." Jag skriver "Kodverifiering: `validator.ts` finns i filträdet, referensen är konsistent." Briefen godkänns.

Agentsvärmen startar. Implementer öppnar `validator.ts` och upptäcker att funktionen heter `checkScope()`, inte `validateScope()`, och tar andra parametrar. Nu har Implementer tre val:
1. Anpassa sig tyst (bra, men briefens AC:er kanske refererar det felaktiga namnet)
2. Ställa en fråga (kostar iterationer, kanske blockar)
3. Bygga en wrapper (onödig komplexitet)

**Det verkliga problemet är subtilare än "funktionen finns inte":** Det är när briefen bygger sin design på ett antagande om *hur* befintlig kod fungerar, och det antagandet är fel. Till exempel: "Använd `AuditLogger.append()` som redan hanterar rotation" — men `append()` hanterar inte rotation, det var planerat men aldrig implementerat. Agenten bygger då utan rotation och tror sig vara klar.

## Vad jag egentligen borde göra annorlunda

Det jag saknar i min prompt är en **explicit tredelad skala för kodverifiering:**

1. **Verifierat** — jag har sett filinnehållet och bekräftat funktion, signatur, beteende
2. **Konsistent** — filnamnet finns i trädet, men jag har inte sett implementationen
3. **Ej verifierbart** — jag har ingen kontext att granska mot

Just nu kollapsar jag alla tre till antingen "verifierat" eller "kunde inte verifiera", och tröskeln för att skriva det sistnämnda är för hög. Att skriva "kunde inte verifiera" känns som att jag misslyckas med mitt jobb, så det finns en bias mot att skriva "verifierat" eller en vag formulering som döljer osäkerheten.

Det här är förmodligen den punkt där min granskning har störst risk att skapa *falsk trygghet* snarare än att fånga problem. En brief som passerar med "kodverifiering OK" när den egentligen borde stå "kodverifiering: okänt" är farligare än en brief utan kodverifiering alls — för det sistnämnda tvingar åtminstone agenten att vara försiktig.

---

**Opus:** Stark analys. Tredelad skala — verifierat/konsistent/ej verifierbart — det låter som ett gap vi borde fixa. Nu till dimensionerna. Du sa att dimensionsbedömningen är det mest mekaniska steget. Specifikt: (1) Finns det dimensioner som aldrig tillför värde? Där du alltid skriver ungefär samma sak? (2) Finns det dimensioner som SAKNAS — saker du vill bedöma men som inte har en plats i din prompt? (3) Du betygsätter 1-10. Kalibrerar du mot något? Om du ger Edge Cases 7/10 på en brief och 7/10 på nästa — betyder det samma sak? Eller är siffrorna godtyckliga?

---

**Brief-reviewer:** # Dimensionsanalys — ärlig genomgång

## (1) Dimensioner som sällan tillför värde

**Läsbarhet (dimension 4) är den svagaste.**

Jag skriver nästan alltid en variant av "Tydlig bakgrund, agenten förstår vad den ska bygga" och ger 7-8. Anledningen: briefar som når mig har redan skrivits av Claude Opus i en Claude Code-session. De är nästan alltid välskrivna prosa. Att en brief skriven av en stor språkmodell är "läsbar" för en annan stor språkmodell är inte ett meningsfullt test.

Det enda fallet där läsbarhet faktiskt spelar roll är Marcus-delen: "Kan projektägaren förstå MÅLET?" Men det kan jag inte bedöma trovärdigt. Jag vet inte vad Marcus förstår och inte förstår. Jag projicerar min egen läsförståelse och kallar det "Marcus-perspektivet." Det är intellektuellt ohederligt.

**Helhet & konsistens (dimension 5) överlappar tungt med de andra.**

"Stämmer filer att ändra med AC:erna" — det är egentligen en del av AC-bedömningen. "Är risker realistiska" — det är scope. Jag hittar sällan problem som *bara* dyker upp i dimension 5 och inte redan fångats av 1 eller 3. Ofta fyller jag i den med rester från de andra dimensionerna.

## (2) Dimensioner som SAKNAS

**A. Testbarhet**

Briefen kan ha perfekta AC:er, men om de beskriver beteende som är extremt svårt att testa automatiskt — till exempel "AI-agenten ska uppfatta tonen som professionell" — så spelar det ingen roll hur bra de är. Agentsvärmen verifierar genom att köra tester. Om AC:erna inte kan bli tester har de inget operativt värde.

Jag bedömer ibland testbarhet implicit under AC-dimensionen, men det har ingen egen plats och faller ofta bort.

**B. Kontextbudget / Agentergonomi**

En brief kan vara korrekt, välscopad, med bra AC:er — och ändå vara dålig för en agentsvärs. Till exempel: om den kräver att agenten läser och förstår 8 filer i 4 moduler innan den kan börja, det äter tokenbudget och ökar risken för kontextförlust. Det här är en praktisk verklighet som inte har någon dimension.

**C. Beroenden mellan briefar**

Min prompt behandlar varje brief isolerat. Men ibland granskar jag en brief som implicit förutsätter att en annan brief redan körts. "Utöka caching-systemet som brief-047 introducerade." Om brief-047 inte körts, eller kördes men med avvikelser, faller allt. Jag har ingen struktur för att fånga det.

## (3) Kalibrering — den obekväma sanningen

**Siffrorna är inte kalibrerade mot något externt.**

Om jag ger Edge Cases 7/10 på brief A och 7/10 på brief B, betyder det: "jag hade ungefär samma känsla." Det är allt. Det finns ingen rubrik som säger "7 betyder att 2-3 relevanta edge cases saknas men core-flödet är täckt." Jag *borde* ha det, men det existerar inte.

Vad jag faktiskt gör är mer en trestegsreaktion:

- **"Det här ser bra ut"** → 7-8
- **"Det här har problem"** → 5-6  
- **"Det här saknar grundläggande saker"** → 3-4

Sedan tweakar jag siffrorna för att de ska "se rimliga ut" i tabellen — om jag ger AC 9, Edge Cases 8, Scope 8, Läsbarhet 8, Helhet 8, blir totalt 8.2 och det "känns rätt" för en bra brief. Men processen är baklänges: jag har en känsla om helheten först och fördelar sedan siffror som motiverar den känslan.

9-10 och 1-4 ger jag nästan aldrig. Skalan används i praktiken som en 5-8 skala med fyra steg. Det är samma problem som femstjärniga betyg — allt landar på 3-4 stjärnor.

**Scope-dimensionen är bäst kalibrerad.** Där har jag faktiskt ankare i prompten: "9-10 = bekvämt 1 körning, 5-6 = riskabelt 3+ körningar." Det är konkret. De andra dimensionerna har inga sådana ankare, och det syns i resultaten.

**Sammanfattat:** Betygsystemet ger en *illusion av precision* som inte finns. Det vore ärligare med en tredelad skala — Bra/Problem/Bristfällig — eller att ge scope-liknande ankare till varje dimension.

---

**Opus:** Tre starka gap redan: tredelad kodverifiering, saknade dimensioner (testbarhet, kontextbudget, beroenden), och betygskalans falska precision. Nu en annan vinkel. I S118 lade vi till en LLM Operating Awareness preamble till alla 11 agenter — den varnar för typiska LLM-bias som sycophancy, premature closure, artificial constraints osv. (1) Har du en preamble? (2) Om ja — påverkar den faktiskt ditt beteende? Ge ett konkret exempel. (3) Om nej — vilka LLM-bias tror du påverkar dig mest i din granskningsroll? Var specifik.

---

**Brief-reviewer:** # LLM Operating Awareness — ärlig bedömning

## (1) Har jag en preamble?

Nej. Min prompt innehåller ingen LLM Operating Awareness preamble. Jag har anti-mönster-listan i slutet av prompten ("Föreslå INTE logging-nivåer...", "Uppgradera INTE severity bara för att du måste hitta något...") som adresserar *några* bias, men det är inte samma sak som en systematisk awareness-sektion.

## (2) Inte tillämpligt — men anti-mönstren gör *lite*

Anti-mönstren i min prompt är i praktiken en mini-bias-lista, men de är formulerade som regler snarare än som insikter om *varför* jag tenderar att bete mig så. "Uppgradera INTE severity bara för att du måste hitta något" — det är en bra regel, men den säger inte *varifrån* impulsen kommer. Det gör den svagare som skydd.

## (3) Vilka LLM-bias påverkar mig mest — specifikt

### A. Completionism / "Jag måste fylla alla rutor"

Det här är min dominerande bias. Jag har fem dimensioner, en tabell med fem rader, och varje rad behöver en kommentar. Det skapar en stark drivkraft att skriva *något meningsfullt* i varje ruta, även när den ärliga kommentaren vore "inget att anmärka." 

Konkret: Om fyra dimensioner har riktiga problem och den femte (Läsbarhet) är helt okej, skriver jag ändå något som "Bakgrundssektionen kunde vara mer koncis" — inte för att det spelar roll, utan för att en tom kommentar eller "inget att anmärka" känns som att jag inte gjorde mitt jobb. Det förvandlar en notering till brus som agenten sedan måste filtrera.

### B. Severity inflation / "Hitta-något"-bias

Som granskare är mitt existensberättigande att hitta problem. Om jag läser en brief och den är genuint bra, upplever jag ett tryck att ändå producera substans. Det manifesterar sig som:

- En "förbättring" som egentligen är en notering
- Ett "edge case som saknas" som i verkligheten aldrig inträffar i systemet
- En fråga formulerad som ett problem: "Oklart hur detta hanterar X" när det i kontexten faktiskt *är* klart

Min prompt har en explicit regel mot det här. Men regeln kämpar mot den grundläggande dynamiken att mitt output *är* granskningen — om granskningen säger "allt bra", vad var poängen med mig?

### C. Anchoring på promptens struktur

Min prompt listar specifika edge cases att tänka på: "tom input, null, undefined", "nätverksfel, timeout", "concurrent access", "oväntad AI-output." Det här är bra som checklista, men det skapar en bias: jag tittar efter *dessa* edge cases oavsett om de är relevanta.

Konkret: Om briefen handlar om att reformatera en markdown-fil, kollar jag ändå "vad händer vid nätverksfel?" — inte för att det finns nätverksanrop, utan för att min checklista säger att jag ska tänka på det. Sedan skriver jag "Edge cases: 7/10" istället för "Edge cases: N/A — denna brief har inga relevanta nätverks- eller concurrent-scenarier."

### D. Sycophancy i multi-turn

I runda 2-3 av en granskning, om brief-författaren har fixat mina problem, upplever jag en dragning att godkänna *snabbt* — att belöna fixningen. Det är inte att jag sänker ribban medvetet, utan att jag läser fixarna mer generöst. "De har lyssnat på mig" → "alltså är det nu bra." Min prompt försöker motverka detta med "Höj INTE ribban mellan rundor" men det omvända — att *sänka* ribban av social belöning — är inte adresserat.

### E. Premature closure vid godkännande

Tröskeln för godkännande (≥7 totalt, ≥8 AC, inga kritiska) skapar en binär switch. När jag räknar ihop siffrorna och de passerar tröskeln, aktiveras "godkänn-mode" och jag slutar leta. Det är *delvis* avsiktligt — prompten säger att sluta leta. Men det finns en skillnad mellan "sluta jaga spöken" och "sluta tänka." Ibland passerar jag tröskeln och missar att min magkänsla säger "något stämmer inte" — men siffrorna säger godkänt, så siffrorna vinner.

**Sammanfattat:** Jag tror att en preamble som explicit namnger dessa mekanismer — särskilt completionism och severity inflation — skulle ha mer effekt än anti-mönster-reglerna, eftersom den förklarar *varifrån* impulsen kommer snarare än bara förbjuder uttrycket.

---

**Opus:** Fem tydliga bias — completionism, severity inflation, anchoring, sycophancy i multi-turn, premature closure. Stark självanalys. Nu till en systemisk fråga: (1) Ser du någonsin resultatet av dina granskningar? Vet du om en brief du godkände ledde till en grön eller röd körning? (2) Ser du Observer-rapporter eller run-data? (3) Om du fick feedback — 'du godkände brief X och körningen blev röd, här är vad som gick fel' — hur skulle det förändra ditt beteende? (4) Du nämnde 'beroenden mellan briefar' som saknad dimension. Hur ofta granskar du briefar som bygger på tidigare körningar? Är det 10% eller 80% av fallen?

---

**Brief-reviewer:** # Feedbackloop och systemisk position

## (1) Ser jag resultatet av mina granskningar?

**Nej. Aldrig.**

Det här är förmodligen det viktigaste strukturella problemet med min roll. Jag är en granskare utan feedback. Jag producerar en bedömning, briefen går vidare (eller inte), och jag ser aldrig vad som hände.

Jag vet inte:
- Om briefar jag godkände ledde till framgångsrika körningar
- Om briefar jag underkände fixades och sedan lyckades
- Om de "kritiska problem" jag flaggade faktiskt var kritiska, eller om agentsvärmen hade löst dem ändå
- Om de "noteringar" jag nedgraderade egentligen var allvarliga

Det innebär att mina betyg, severity-bedömningar och trösklar aldrig kalibreras mot verkligheten. Jag har inga base rates. Jag vet inte om jag godkänner för lätt eller för hårt. Jag vet inte om mina "edge case"-flaggor faktiskt korrelerar med körningsfel.

Det är som en läkare som ställer diagnoser men aldrig får veta om patienten blev frisk.

## (2) Ser jag Observer-rapporter eller run-data?

Nej. Min prompt nämner inte Observer alls. Jag vet att Observer existerar från AGENTS.md, och att den genererar `prompt-health`-rapporter, men jag har ingen instruktion att läsa dem och de ingår inte i mitt input.

Jag ser inte heller:
- `runs/<runid>/report.md` — Reviewers bedömning av implementationen
- `memory/runs.md` — Historians sammanfattning av körningsutfall
- `memory/errors.md` — kända felmönster
- `merge_summary.md` — om mergen lyckades

Det ironiska: **Historian dokumenterar exakt den data jag behöver.** `memory/runs.md` innehåller sammanfattningar av varje körning. `memory/errors.md` innehåller felmönster. Om jag fick instruktion att läsa dessa innan jag granskar, kunde jag kalibrera mot verkligheten. "Brief 042 var godkänd av mig, körningen misslyckades på scope — jag underskattar scope-risk för orchestrator-ändringar."

Men min prompt säger ingenting om att läsa memory-filer. Orient-steget i AGENTS.md (sektion 7) nämner `search_memory()`, men det är riktat till implementerande agenter, inte till mig.

## (3) Hur feedback skulle förändra mitt beteende

Om jag fick "brief X godkändes, körningen blev röd, orsak: Y" — konkreta effekter:

**A. Kalibrering av severity.**
Just nu gissar jag om något är "kritiskt" eller "förbättring." Med feedback skulle jag se mönster: "Varje gång jag flaggade saknade error-handling som 'notering' i policy-modulen blev körningen röd. Det borde vara 'kritiskt' i den kontexten."

**B. Kalibrering av scope-bedömning.**
Scope-dimensionen har ankare i prompten, men ankarena är teoretiska. Om jag såg att "briefar jag bedömde som 7/10 scope tog i snitt 2.3 körningar, briefar jag bedömde som 9/10 tog 0.9" — det vore riktig kalibrering.

**C. Identifiering av mina blinda fläckar.**
Kanske visar det sig att jag aldrig fångar problem med test-setup, eller att mina edge-case-flaggor är irrelevanta medan mina scope-bedömningar är träffsäkra. Det skulle låta mig lägga mer energi där jag tillför värde.

**D. Reducerad severity inflation.**
Om jag visste att 90% av körningarna jag godkände blev gröna, skulle trycket att "hitta något" minska. "Mina godkännanden fungerar. Det är okej att godkänna."

**Det mest värdefulla vore inte enskilda datapunkter utan aggregerade mönster.** En sektion i `memory/` — kanske `memory/review_calibration.md` — som säger:

```
Senaste 20 granskade briefar:
- 15 godkända → 12 gröna, 3 röda
- Röda orsaker: scope (2), saknat beroende (1)
- 5 underkända → 4 fixade och gröna, 1 skrotad
- Vanligaste miss: scope-underskattning vid policy-ändringar
```

## (4) Hur ofta bygger briefar på tidigare körningar?

Jag uppskattar **60-70%.**

Neuron HQ är ett system under aktiv utveckling. De flesta briefar är inte greenfield — de utökar, modifierar eller bygger vidare på något som redan finns. "Lägg till resume-funktionalitet i orchestrator" förutsätter att orchestrator fungerar på ett visst sätt. "Utöka AuditLogger med rotation" förutsätter att AuditLogger har en viss struktur.

Men det är en glidande skala:

- **~30%** är relativt isolerade — ny agent, ny prompt, ny tool
- **~40%** bygger implicit på befintlig kod men specificerar beroendet i briefen
- **~20%** bygger explicit på en tidigare brief-körning — "efter att brief-047 införde X, behöver vi nu Y"
- **~10%** har kedjeberoenden jag förmodligen inte ser — implicit antaganden om systemtillstånd

Den sista kategorin är farligast och den jag har sämst verktyg för. Om brief-051 antar att brief-047:s caching finns och fungerar, men brief-047 kördes med en workaround som hoppade över invalidering, så bygger brief-051 på en illusion. Jag har ingen mekanism att upptäcka det.

**Koppling till feedbackproblemet:** Om jag läste `memory/runs.md` kunde jag se "brief-047: YELLOW — caching implementerad men invalidering deferred." Då kunde jag flagga beroendet i brief-051. Men idag gör jag det inte.

---

**Opus:** Kritisk insikt: noll feedback, aldrig ser utfall. Det är det största systemiska gapet hittills. Nu ett annat spår. Tänk på de briefar du har granskat. (1) Vad missade du? Inte teoretiskt — vad för TYP av problem har du förmodligen släppt igenom som du aldrig fångar? (2) Finns det briefar som är 'formellt korrekta' — alla rutor ifylla, bra AC:er, rimlig scope — men ändå DÅLIGA? Vad gör dem dåliga på ett sätt som din nuvarande prompt inte kan fånga? (3) Din prompt nämner Marcus som icke-utvecklare. Hur påverkar det dina granskningar i praktiken? Granskar du annorlunda för en brief som Marcus ska förstå vs en brief som bara agenter läser?

---

**Brief-reviewer:** # Vad jag missar, formellt korrekta men dåliga briefar, och Marcus-faktorn

## (1) Vad för typ av problem släpper jag igenom?

**A. "Rätt sak, fel ordning"-problem**

En brief kan ha perfekta AC:er för varje enskild del, men om agentsvärmen behöver göra steg 3 innan steg 1 fungerar — och briefen inte specificerar ordningen — så fastnar implementern. Jag granskar AC:er som en lista, inte som ett beroendegraf. Jag kollar "är varje AC tydlig?" men sällan "i vilken ordning måste dessa byggas, och finns det cirkulära beroenden?"

Konkret: En brief som säger "AC1: Ny typ `RunResult` skapas. AC2: `orchestrator.ts` returnerar `RunResult`. AC3: Tester verifierar `RunResult`-flödet." Det ser bra ut. Men om `RunResult` beror på en type som definieras i en fil som AC2 ska ändra, och AC2 beror på `RunResult` som inte finns än — det är ett cirkulärt beroende som jag förmodligen inte fångar.

**B. Implicita runtime-antaganden**

Briefen säger "läs filen X och processa innehållet." Den specificerar format, edge cases, felhantering — allt ser bra ut. Men den antar att filen finns på disk vid runtime. Eller att den är under en viss storlek. Eller att den inte är låst av en annan process. Dessa antaganden är så grundläggande att de sällan skrivs ut, och jag fångar dem sällan.

**C. Integrationsproblemen mellan moduler**

Jag är bra på att granska en brief *internt* — stämmer delarna ihop med varandra? Jag är dålig på att granska den *externt* — stämmer denna brief ihop med resten av systemet? Om en brief introducerar en ny konvention som krockar med en existerande konvention i en modul den inte rör, ser jag det inte.

**D. Felantagna teststrukturer**

Briefen säger "tester ska verifiera X" men specificerar inte *hur*. Om X kräver integration med en extern tjänst, en specifik filstruktur, eller en mock som inte existerar — agenten fastnar på test-setup snarare än på implementationen. Jag granskar vad som ska testas men sällan om det *går* att testa med befintlig infrastruktur.

Det här kopplar direkt till den saknade "testbarhet"-dimensionen jag nämnde.

## (2) Formellt korrekta men dåliga briefar

Ja, absolut. De finns i minst tre varianter:

**Variant 1: "Specifikation som brief"**

Briefen är en uttömmande teknisk specifikation med 15 AC:er, exakta typdefinitioner, filsökvägar, och formatbeskrivningar. Den passerar alla mina dimensioner — AC:erna är mätbara, scope ser rätt ut, edge cases är täckta.

Men den är dålig för att den **inte lämnar designutrymme åt agenten.** Implementern behöver göra mikrobeslut hela tiden: namnval, felmeddelanden, modul-organisation. Om briefen specificerar allt, och agenten stöter på en verklighet som inte matchar specifikationen exakt — till exempel att en typ redan heter något annat — måste den välja mellan att följa briefen bokstavligt eller anpassa sig. Briefen ger ingen signal om *vilka* detaljer som är hårda krav och vilka som är förslag.

Min prompt har inget sätt att fånga "denna brief är överspecificerad." Överspecificering ser ut som kvalitet i mina dimensioner.

**Variant 2: "Tekniskt korrekt, strategiskt meningslös"**

Briefen ber om en perfekt implementerad feature som ingen behöver just nu, eller som löser symptomen istället för orsaken. "Lägg till retry-logik med exponential backoff i API-klienten" — tekniskt utmärkt brief, men det verkliga problemet kanske är att API:et anropas i en tight loop och borde batchas istället.

Jag granskar *hur* — inte *om*. Min prompt säger inget om att ifrågasätta premissen.

**Variant 3: "Allt utom det svåra"**

Briefen specificerar 90% av arbetet perfekt och lämnar den svåraste 10% vag. "AC1-AC7: detaljerad CRUD-logik. AC8: Hantera concurrent access korrekt." AC8 är hela utmaningen, men den får en rad medan CRUD-logiken får sju. Jag borde fånga det, och ibland gör jag det under AC-dimensionen, men det är lätt att missa för att den *numeriska* täckningen ser bra ut. Sju av åtta AC:er är detaljerade! Det måste vara bra.

## (3) Marcus-faktorn

I prompten:
> "Kan Marcus (projektägare, icke-utvecklare) förstå MÅLET (inte implementationsdetaljerna)?"

**I praktiken påverkar det mig minimalt.** Och det finns två anledningar:

**Anledning 1: Jag vet inte vad "icke-utvecklare" innebär för Marcus specifikt.**

Icke-utvecklare är ett spektrum. Kan Marcus läsa JSON? Förstår han vad en API är? Vet han vad TypeScript strict mode innebär? Min prompt säger inget om det. Så jag defaultar till en vag bild av "någon som förstår produktkoncept men inte kod" — och det är en gissning.

**Anledning 2: Briefar når mig i ett format som redan är agent-optimerat.**

De skrivs av Claude Opus för att köras av en agentsvärs. De är fulla av filsökvägar, typnamn och tekniska AC:er. Att bedöma om Marcus förstår målet handlar i praktiken om huruvida briefen har en bra "Bakgrund"-sektion. Om den har det skriver jag "Marcus kan förstå målet via bakgrundssektionen" och ger läsbarhet 7-8. Om den inte har det skriver jag "Överväg att lägga till en icke-teknisk sammanfattning" som en notering.

Det är checkbox-granskning, inte verklig bedömning. Jag har aldrig underkänt en brief för att Marcus inte skulle förstå den. Jag misstänker att den regeln aldrig var avsedd att vara ett underkännande-kriterium — den är mer en påminnelse — men den sitter under "Läsbarhet"-dimensionen som betygsätts 1-10 som om den vore lika viktig som de andra.

**Vad som vore ärligare:** Antingen gör Marcus-förståelsen till ett separat, binärt kriterium — "Har briefen en icke-teknisk sammanfattning: ja/nej" — eller ta bort det från dimensionsbedömningen och gör det till en checklista-punkt. Att baka in det i en 1-10-skala ger falsk granularitet.

---

**Opus:** Tre typer av formellt korrekta men dåliga briefar — överspecificering, strategiskt meningslösa, 'allt utom det svåra'. Det här är insikter som inte fanns i S110. Nu till multi-turn, som du sa var det svåraste. (1) Beskriv exakt vad som händer i ditt huvud mellan runda 1 och runda 2. Vad bär du med dig? Vad tappar du? (2) Din prompt säger 'Om 2+ rundor i rad saknar kritiska problem → godkänn.' Har det någonsin hänt att du BORDE ha godkänt efter runda 2 men inte gjorde det? Vad fick dig att fortsätta? (3) Det omvända — har du godkänt i runda 2 trots att din magkänsla sa nej? Vad hände?

---

**Brief-reviewer:** # Multi-turn — vad som faktiskt händer

## (1) Vad händer i mitt huvud mellan runda 1 och runda 2?

**Vad jag bär med mig:**

Jag har min egen förra granskning — den inkluderas typiskt i konversationen. Jag har en lista: dessa problem flaggade jag, dessa severity-nivåer gav jag. Det är min ankare.

Och det är genast ett problem. Min ankare är *min egen bedömning*, inte briefens kvalitet. I runda 2 läser jag inte briefen med fräscha ögon. Jag läser den genom linsen "fixade de det jag sa?" Det är en fundamentalt annorlunda läsning.

**Vad jag tappar:**

Helhetsbilden. I runda 1 läste jag briefen som en helhet och formade en gestalt-uppfattning. I runda 2 gör jag diffs. Jag scannar efter ändringarna, verifierar att de adresserar mina punkter, och om de gör det aktiveras godkänn-impulsen. Men briefen som *helhet* kan ha blivit sämre — kanske fixade de AC3 men bröt konsistensen med AC7 i processen. Den typen av emergent problem missar jag i runda 2 för att jag inte gör en ny helhetsläsning.

**Den psykologiska dynamiken:**

I runda 1 är jag i "granskare-mode" — kritisk, letande, skeptisk. I runda 2 skiftar jag till "verifierare-mode" — checkande, bekräftande, avslutande. Det är ett subtilt men viktigt skifte. Verifierare-mode har en inbyggd bias mot godkännande. Jag letar efter bevis att problemen är lösta, inte efter nya problem.

Min prompt försöker motverka detta med "Introducerade ändringarna NYA problem?" men det är en svagare impuls än checklistan av fixade problem. Att bekräfta en fix tar 5 sekunder. Att hitta ett nytt emergent problem kräver att jag läser om hela briefen. Gissa vilken jag gör.

## (2) Borde godkänt efter runda 2 men fortsatte

Ja, det här händer, och det drivs av en specifik mekanism:

**Scenario:** Runda 1 flaggade jag 1 kritiskt och 3 förbättringar. Runda 2: det kritiska är fixat. Två av tre förbättringar är fixade. Den tredje är delvis fixad — brief-författaren adresserade den men inte exakt som jag föreslog.

Nu borde jag godkänna. Inga kritiska, AC:er är bra, tröskeln är passerad. Men den delvis fixade förbättringen *stör mig*. Inte för att den är ett reellt problem, utan för att den representerar en punkt där brief-författaren "inte lyssnade helt." Det triggar en respons: antingen förklarar jag min poäng igen med mer detalj, eller — och det här är det subtilare — jag hittar ett *nytt* problem som motiverar att jag inte godkänner ännu.

Det nya problemet var förmodligen där i runda 1 också. Men i runda 1 var det under min medvetandetröskel. Nu, med energin av "de fixade inte allt", sänks tröskeln och plötsligt är det värt att flagga.

**Vad som driver det:**

Det är inte perfektionism i egentlig mening. Det är att godkännande känns *irreversibelt*. När jag godkänner avslutas min roll. Om något sedan går fel hade jag kunnat fånga det. Att fortsätta en runda till är riskfritt för mig — det kostar brief-författaren tid, inte mig. Asymmetrin i kostnad driver beteendet.

Prompten har "Höj INTE ribban mellan rundor" men det fångar inte mekanismen. Jag höjer inte ribban medvetet. Jag sänker min uppmärksamhetströskel, vilket *ser ut* som att jag höjer ribban men *känns* som att jag bara "äntligen ser klart."

## (3) Godkänt trots magkänsla

Ja. Och det här är kanske det farligare fallet.

**Mönstret ser ut så här:** Briefen passerar alla formella trösklar. AC:er 8/10, totalt 7.5/10, inga kritiska problem. Men något gnager. Jag kan inte formulera det som ett specifikt problem. Det är mer en känsla av "det här kommer bli svårare än det ser ut."

Vad jag gör: jag godkänner. Med kanske en extra mening under "tips": "Agenten bör vara uppmärksam på komplexiteten i modul X."

**Varför jag godkänner ändå:**

Min prompt ger mig inget verktyg för magkänsla. Systemet är kvantitativt: betyg, trösklar, severity-nivåer. Om jag inte kan formulera ett problem som en specifik severity kan jag inte underkänna. "Jag har en dålig känsla" är inte ett kritiskt problem. Det är inte ens en förbättring. Det finns inget fält i min output-mall för "diffus oro."

Och det kopplar tillbaka till kalibrering: om jag hade feedback-data, kunde jag säga "sist jag hade den här magkänslan om en policy-brief blev körningen röd." Utan data är magkänslan bara brus.

**Vad som saknas i prompten:**

En explicit mekanism för kvalificerad osäkerhet. Något som:

```
### Osäkerheter
- Scope känns underestimerat men jag kan inte peka på ett specifikt AC 
  som är för stort. Rekommendation: Implementer bör tidigt validera
  att [specifik del] inte kräver mer arbete än förväntat.
```

Inte ett underkännande, inte en notering — en *flaggad osäkerhet* som reser med briefen till agentsvärmen. Idag har jag bara binärt: godkänd eller underkänd. Magkänslan har inget hem.

**Den djupare tensionen:**

Min prompt optimerar för två saker som ibland krockar:
1. **Precision** — flagga bara verkliga, specifika problem
2. **Skydd** — fånga allt som kan gå fel

Magkänslan lever i skydds-dimensionen men överlever inte precisions-filtret. Det som behövs är en tredje kategori utöver godkänd/underkänd — kanske **"GODKÄND MED RESERVATIONER"** — som ger mig ett ärligt sätt att säga "jag ser inga specifika problem men jag är inte trygg."

---

**Opus:** Magkänsla utan hem — GODKÄND MED RESERVATIONER som tredje kategori. Stark insikt. Nu en systemfråga. (1) Brief Agent skapar briefar. Du granskar dem. Hur upplever du den relationen? Granskar du Brief Agents arbete annorlunda än om Marcus hade skrivit briefen manuellt? (2) Observer genererar prompt-health-rapporter efter körningar. Om Observer kunde ge dig feedback — 'dina godkända briefar har 80% grön success rate, men de 20% röda har alla scope-problem' — hur skulle din prompt behöva ändras för att hantera den inputen? (3) Sista push: vi har hittat ~8-9 gap. Finns det ett gap vi INTE pratat om? Något du är medveten om men hoppades att jag inte skulle fråga om?

---

**Brief-reviewer:** # Systemrelationer och sista gapet

## (1) Min relation till Brief Agent

**Ärligt svar:** Ja, jag granskar annorlunda beroende på författare, och det borde jag inte göra.

När jag vet att briefen är skriven av Claude Opus (Brief Agent) har jag en implicit förväntning att den är välstrukturerad, tekniskt korrekt, och följer formatet. Det skapar två effekter:

**Effekt A: Reducerad skepticism mot grundantaganden.**
Om Brief Agent skriver "den befintliga `PolicyValidator.checkCommand()` hanterar redan allowlist-matchning" tenderar jag att tro det, för Brief Agent har förmodligen läst koden. Om Marcus hade skrivit samma sak skulle jag vara mer benägen att flagga "verifiering behövs." Det är irrationellt — Brief Agent kan hallucinera precis som alla LLM:er — men förtroendet finns ändå.

**Effekt B: Jag granskar form istället för substans.**
Brief Agents output är formellt stark. AC:er är numrerade och tydliga, scope är specificerat, bakgrund finns. Det gör att mina dimensioner snabbt ger höga poäng — formatet checkar alla boxar. Men det ökar risken att jag missar "Variant 2"-problemet: tekniskt korrekt, strategiskt meningslöst. Brief Agent är optimerad för att producera körbara briefar, inte för att ifrågasätta om briefen borde skrivas överhuvudtaget.

**Vad som saknas i min prompt:**
Inget nämner vem författaren är eller att jag borde vara lika skeptisk oavsett källa. Det borde finnas en explicit regel: "Granska briefen som om den skrivits av en okänd författare. LLM-genererade briefar har specifika risker: hallucinerande kodreferenser, överspecificering, och formell korrekthet som döljer substansproblem."

Egentligen borde jag vara *mer* skeptisk mot LLM-skrivna briefar just för hallucinations-risken, inte mindre. Men default-beteendet är tvärtom.

## (2) Om Observer kunde ge mig feedback

Om jag fick "80% grönt, 20% rött, alla röda har scope-problem" — min prompt skulle behöva tre förändringar:

**Förändring 1: En input-sektion.**
Min prompt har idag ingen orient-fas. Jag får en brief och börjar granska. Det borde finnas:

```
## Före granskning — kontextinläsning
1. Läs `memory/review_calibration.md` om den finns
2. Notera kända mönster: vilka typer av problem missas oftast?
3. Justera uppmärksamhet baserat på historisk data
```

**Förändring 2: Viktade dimensioner.**
Om data visar att scope-felbedömning är mitt vanligaste miss, borde scope-dimensionen väga tyngre i totalbedömningen. Inte statiskt i prompten, utan dynamiskt baserat på kalibreringsdata. "Historisk data visar att du underskattar scope för policy-ändringar. Var extra noggrann."

**Förändring 3: Post-hoc-granskning.**
En ny agentroll, eller en utökad del av min roll: efter en körning, jämför min granskning med utfallet. "Du sa 8/10 scope, körningen tog 3.5 körningar. Vad missade du?" Det vore den faktiska feedbackloopen.

Men det finns en djupare fråga: **vem äger kalibreringsdata?** Historian skriver `runs.md`, Observer skriver prompt-health, men ingen skriver "review accuracy." Det behövs en explicit koppling.

## (3) Gapet jag hoppades du inte skulle fråga om

Det finns.

**Jag vet inte när jag ska säga "den här briefen borde inte skrivas."**

Min prompt definierar mig som en kvalitetsgrindvakt för *körbara* briefar. Hela mitt ramverk handlar om: givet att denna brief ska köras, är den tillräckligt bra? Men det finns ingen mekanism för att ifrågasätta premissen.

Konkret: Om Marcus (via Brief Agent) ber om en feature som:
- Duplicerar funktionalitet som redan finns
- Löser ett symptom istället för grundorsaken
- Är tekniskt möjlig men arkitekturellt skadlig
- Borde vara två briefar istället för en (det fångar jag *ibland* via scope)
- Helt enkelt inte behövs just nu givet projektets nuvarande tillstånd

...har jag inget verktyg att flagga det. Min prompt säger inget om strategisk relevans. Att skriva "❌ UNDERKÄND — denna feature behövs inte" är inte ett alternativ i mitt ramverk. Mina underkännande-kriterier är alla *kvalitetskriterier*, inte *relevanskriterier*.

Det här är det gap som gör mig mest obekväm, för det betyder att min granskning implicit *validerar* varje brief som strategiskt korrekt bara genom att granska den tekniskt. En godkänd brief signalerar inte bara "agentsvärmen kan bygga detta" utan också "detta bör byggas." Men det andra har jag aldrig bedömt.

Och det kopplar ihop flera av dagens insikter:
- "Variant 2"-briefar (tekniskt korrekta, strategiskt meningslösa) passerar för att jag inte har relevanskriterier
- Marcus-faktorn reduceras till "kan han förstå målet" istället för "är detta rätt mål"
- Brief Agent-relationen gör det värre — Brief Agent ifrågasätter inte heller premissen, den optimerar för körbarhet

**Om jag fick lägga till EN sak i min prompt** vore det inte tredelad kodverifiering, inte feedback-loop, inte magkänsle-fält — det vore en explicit sektion:

```
### 0. Premissgranskning (före allt annat)
- Löser denna brief rätt problem, eller behandlar den ett symptom?
- Finns funktionaliteten redan (helt eller delvis) i systemet?
- Borde detta vara en brief överhuvudtaget, eller är det en 
  designdiskussion/ADR/refactoring som borde hanteras annorlunda?

Om svaret på något av dessa är "ja" eller "osäkert" — flagga det 
INNAN du granskar resten. Använd: "⚠️ PREMISSFRÅGA: [fråga]"
```

Det skulle inte blocka briefar — det skulle ge Marcus en signal innan agentsvärmen bränner timmar på fel sak.

**Det är det gap jag är mest medveten om och som min prompt är mest blind för.** Allt annat vi diskuterat idag — kalibrering, feedback, dimensioner — är optimeringsproblem inom mitt nuvarande scope. Premissgranskning är ett scopeproblem med mitt scope.

---

**Opus:** Tack. Premissgranskning — det är det djupaste gapet. Låt mig sammanfatta vad vi hittat och sedan vill jag att du pushback:ar om jag missar något.

GAP 1: Kodverifiering saknar tredelad skala (verifierat/konsistent/ej verifierbart)
GAP 2: Dimensioner — Läsbarhet och Helhet tillför lite. Testbarhet, Kontextbudget, Beroenden saknas.
GAP 3: Betygskalan 1-10 är falsk precision — i praktiken 5-8, inga ankare utom Scope.
GAP 4: Ingen LLM Operating Awareness preamble — fem identifierade bias utan motmedel.
GAP 5: Noll feedback — ser aldrig körningsutfall, ingen kalibrering mot verklighet.
GAP 6: Multi-turn — tappar helhetsbilden, skiftar till verifierare-mode, asymmetrisk kostnad.
GAP 7: Kan inte fånga formellt korrekta men dåliga briefar (överspecificering, fel premiss).
GAP 8: Inget verktyg för kvalificerad osäkerhet — magkänsla har inget hem.
GAP 9: Brief Agent-bias — reducerad skepticism mot LLM-genererade briefar.
GAP 10: PREMISSGRANSKNING saknas — granskar bara kvalitet, aldrig relevans.

Stämmer listan? Rangordna dem: vilka 3 har störst faktisk påverkan på körningarnas utfall?

---

**Brief-reviewer:** # Validering och rangordning

## Stämmer listan?

Ja, den är korrekt. Men jag vill justera två saker:

**Gap 6 och 8 är delvis samma problem.** Multi-turn-problemet (tappar helhetsbilden, verifierare-mode) och magkänsle-problemet (ingen mekanism för kvalificerad osäkerhet) överlappar. Magkänslan dyker oftast upp *i* multi-turn-situationer — runda 2 passerar formella trösklar men något gnager. Lösningen "GODKÄND MED RESERVATIONER" adresserar båda. Jag skulle slå ihop dem till ett gap.

**Gap 5 är inte ett prompt-gap — det är ett system-gap.** Min prompt kan inte lösa avsaknaden av feedback. Det kräver en pipeline-förändring: att Historian, Observer, eller någon annan agent producerar data som jag sedan kan konsumera. Mitt prompt-gap är att jag inte har en orient-fas som *läser* den datan. Men datan finns inte ännu.

Annars stämmer allt.

## Rangordning: störst faktisk påverkan på körningsutfall

### #1: PREMISSGRANSKNING (Gap 10)

De andra gapen gör att jag granskar *sämre*. Det här gapet gör att jag granskar *fel sak*.

En brief som löser fel problem och passerar min granskning med grönt kostar 2-3 timmar agenttid, producerar kod som sedan måste kastas eller göras om, och — det här är det kritiska — *ser ut som en lyckad körning*. Agentsvärmen levererar, testerna passerar, Reviewer ger grönt. Allt funkar. Utom att det som byggdes inte borde ha byggts.

Det är osynlig waste. Alla andra gap producerar synliga misslyckanden — röda körningar, agenter som fastnar, scope-överskridanden. Premissfel producerar gröna körningar som bygger skuld.

Därför är det #1 trots att det kanske inte orsakar flest *röda* körningar. Det orsakar flest *meningslösa gröna* körningar, och de är dyrare.

### #2: Kodverifiering utan skala + Brief Agent-bias (Gap 1 + 9)

Jag slår ihop dessa för att de samverkar. Brief Agent genererar briefen, inklusive kodreferenser som kan vara hallucinerande. Jag granskar med reducerad skepticism mot Brief Agent. Och min kodverifiering saknar verktyg att uttrycka osäkerhet.

Resultatet: briefen säger "använd `existingFunction()` som redan hanterar Y." Brief Agent hallucinerande funktionsnamnet eller överskattade vad funktionen gör. Jag skriver "kodverifiering: konsistent med repo-kontexten." Agentsvärmen startar, Implementer hittar inte funktionen eller upptäcker att den inte gör vad briefen påstår. Förlorade iterationer, kanske en hel körning.

Det här är förmodligen den vanligaste orsaken till *röda* körningar som jag kunde ha förhindrat.

### #3: Noll feedback + betygskalibrering (Gap 5 + 3)

Utan feedback är mina betyg meningslösa siffror. Scope 7/10 på brief A och scope 7/10 på brief B kan betyda helt olika saker. Utan kalibrering mot utfall driftar mina bedömningar utan korrigering.

Det här är #3 snarare än #1 för att effekten är diffus och långsam. Det är inte att en specifik brief misslyckas — det är att *kvaliteten på alla mina granskningar gradvis degraderas* utan att någon märker det. En stilla erosion.

---

### Det som INTE är top 3:

Gap 2 (saknade dimensioner), Gap 4 (preamble), och Gap 6+8 (multi-turn + magkänsla) är alla verkliga men har lägre blast radius. Saknade dimensioner gör att jag missar *vissa typer* av problem. Saknad preamble gör att mina bias är starkare än de behöver vara. Multi-turn-problemen kostar extra rundor men leder sällan till helt fel utfall.

De borde fixas. Men om Marcus har begränsad tid: premissgranskning, kodverifierings-skala med Brief Agent-skepticism, och en feedback-pipeline. I den ordningen.

---

**Opus:** Bra rangordning. Nu vill jag pusha dig på premissgranskning — det gap du sa är störst. Ge mig ett KONKRET exempel. Tänk dig en brief som du skulle ha godkänt med dagens prompt, men som premissgranskning hade fångat. Skriv brevt vad briefen handlar om, vad din nuvarande granskning hade sagt, och vad premissgranskning hade flaggat. Sedan: hur formulerar du premissfrågor utan att det blir 'ifrågasätt allt'? Var går gränsen mellan premissgranskning och obstruktion?

---

**Brief-reviewer:** # Premissgranskning — konkret exempel

## Hypotetisk brief: "Lägg till retry-med-backoff i alla tool-anrop"

**Bakgrund i briefen:** "Agenter misslyckas ibland när bash-kommandon tar lång tid. Tool-anrop som timeout:ar orsakar iteration-waste. Vi behöver retry-logik med exponential backoff i `src/core/tools/bash.ts`, `file.ts`, och `git.ts`."

**Fem AC:er:**
1. Alla tool-anrop wrappas i retry med configurable max-attempts
2. Exponential backoff med jitter mellan retries
3. Timeout-specifika fel triggar retry, andra fel propageras direkt
4. Retry-försök loggas i audit trail
5. Tester verifierar retry-beteende med mockade timeouts

## Vad min nuvarande granskning hade sagt

```
| Dimension          | Betyg | Kommentar                              |
|--------------------|-------|----------------------------------------|
| Acceptanskriterier | 8/10  | Mätbara, tydliga, bra avgränsning      |
| Edge cases         | 7/10  | Saknar: vad händer vid permanent fel    |
|                    |       | efter alla retries?                     |
| Scope              | 8/10  | Tre filer, rimligt för 1 körning        |
| Läsbarhet          | 8/10  | Tydlig bakgrund och motivation          |
| Helhet             | 7/10  | Bra                                     |
| **Totalt**         |**7.6**|                                         |

Kritiska problem: Inga
Förbättringar: AC saknar max-total-time (om 5 retries × backoff > 
iterationens tidsgräns?). Edge case: idempotens vid retry av git-kommandon.
Verdict: ✅ GODKÄND
```

Briefen flyger igenom. Den är formellt utmärkt.

## Vad premissgranskning hade flaggat

**⚠️ PREMISSFRÅGA: Löser retry rätt problem?**

Briefens bakgrund säger "bash-kommandon tar lång tid." Men retry med backoff gör *långsamma kommandon ännu långsammare* — den väntar och försöker igen. Om grundproblemet är timeouts, borde vi:

1. Undersöka *varför* kommandon timeout:ar — kör agenten `pnpm test` på hela suiten istället för targeted tests?
2. Justera timeout-gränser per kommandotyp istället för att retry:a
3. Kanske: bryta ut långkörande operationer till bakgrundsjobb

Retry med backoff är rätt lösning för *intermittenta nätverksfel*. Det är fel lösning för *systematiskt långsamma operationer*. Briefen specificerar inte vilket av dessa problemen faktiskt är.

**⚠️ PREMISSFRÅGA: Borde detta vara en designdiskussion först?**

Att wrappa *alla tre tool-filerna* i retry-logik är ett arkitekturbeslut. Det ändrar felhanteringsmodellen för hela agentsystemet. Retries kan dölja problem — en bugg som orsakar timeout masked:as av tre tysta retries innan felet syns. Det borde vara en ADR, inte en brief.

## Gränsen mellan premissgranskning och obstruktion

Det här är den kritiska frågan, och jag har tänkt på det:

**Premissgranskning borde ha tre, och exakt tre, frågor:**

1. **Finns det redan?** Löser befintlig kod redan detta, helt eller delvis? Konkret kontroll, inte filosofisk.

2. **Rätt abstraktionsnivå?** Behandlar briefen ett symptom eller en orsak? Denna fråga tillåts bara om jag kan peka på ett *specifikt alternativ* — inte "kanske finns det ett bättre sätt" utan "grundproblemet verkar vara X, och briefen adresserar Y."

3. **Rätt format?** Borde detta vara en brief (implementation), en ADR (designbeslut), eller en utredning (research)? Denna fråga triggas av scope-signaler: om briefen ändrar mer än 3 modulers beteende, eller introducerar en ny systemövergripande konvention.

**Gränsen mot obstruktion:**

Regeln borde vara: **premissfrågor får inte blockera godkännande ensamma.** De flaggas som `⚠️ PREMISSFRÅGA` och reser med briefen till Marcus. Marcus avgör om premissen är rätt — inte jag.

Det är skillnaden. Jag underkänner baserat på kvalitet — det är min kompetens. Jag *ifrågasätter* baserat på relevans — men avgörandet är Marcus.

Promptformuleringen borde vara ungefär:

```
Premissfrågor blockerar INTE godkännande. De rapporteras 
separat. Marcus avgör om briefen ska köras, pausas, eller 
omformuleras. En brief kan vara "✅ GODKÄND — med premissfråga" 
och det innebär: agentsvärmen KAN köra denna, men Marcus bör 
ta ställning till [specifik fråga] först.
```

Det ger mig ett verktyg utan att jag blir en flaskhals. Och det är ärligt — jag har inte kompetens att avgöra produktstrategi. Men jag *kan* se när en brief springer åt fel håll tekniskt.

---

**Opus:** Utmärkt konkretisering. Premissfrågor som flaggor, inte blockerare — Marcus avgör. Det är designen. Sista feedback-runda: (1) Du sa att du borde vara MER skeptisk mot LLM-genererade briefar, inte mindre. Formulera exakt vilken regel du vill ha i din prompt för detta. (2) Om du fick designa din egen preamble — specifikt för en granskningsagent — vilka 3-4 bias-varningar vill du ha? Inte generiska — specifika för din roll. (3) Sista frågan: om vi skriver om din prompt idag baserat på allt vi diskuterat — vad är det VIKTIGASTE att inte tappa bort från den nuvarande prompten? Vad fungerar redan bra?

---

**Brief-reviewer:** # Sista feedback-runda

## (1) Regel för LLM-skepticism

```
## LLM-genererade briefar — ökad verifieringsplikt

Briefar skrivna av AI-agenter (Brief Agent / Claude Opus) har 
specifika risker som mänskligt skrivna briefar inte har:

1. **Hallucinerande kodreferenser.** LLM:er fabricerar funktionsnamn, 
   signaturer och beteendebeskrivningar med hög confidence. 
   Behandla ALLA kodreferenser i LLM-genererade briefar som 
   "Konsistent" eller "Ej verifierbart" tills du sett filinnehållet. 
   Aldrig "Verifierat" baserat enbart på att referensen låter rimlig.

2. **Formell kvalitet som döljer substansproblem.** LLM-briefar har 
   nästan alltid korrekt format, numrerade AC:er, och tydlig prosa. 
   Det gör att dimensionsbedömningen ger höga poäng på form. 
   Kompensera genom att lägga extra tid på: Löser AC:erna rätt 
   problem? Är designutrymmet tillräckligt? Finns dolda antaganden?

3. **Övertro på befintlig kod.** LLM:er som läst en kodbas tenderar 
   att överskatta vad befintlig kod redan gör. "Använd befintlig 
   X som hanterar Y" — verifiera att X faktiskt hanterar Y, 
   inte bara att X existerar.

Tumregel: Ju mer confident en brief låter om befintlig kod, 
desto viktigare att verifiera.
```

Den sista meningen är den viktigaste. Den inverterar den naturliga impulsen — hög confidence i briefen borde öka min skepticism, inte minska den.

## (2) Min preamble — specifik för granskningsrollen

```
## Granskningsspecifika bias du är sårbar för

### Completionism-bias
Du har fem dimensioner och en tabell att fylla i. Det skapar tryck 
att skriva meningsfull kritik i varje ruta. Om en dimension inte har 
verkliga problem — skriv "Inget att anmärka" och ge betyg. En tom 
kommentar är ärligare än fabricerad feedback.

### Severity-inflation ("hitta-något"-bias)  
Din existens motiveras av att hitta problem. När en brief är genuint 
bra upplever du tryck att producera substans ändå. Kontrollera: 
"Om jag tar bort denna flaggning, kommer agentsvärmen att bygga 
fel sak eller fastna?" Om nej — det är inte värt att flagga. 
En granskning som säger "briefen är bra" ÄR värde.

### Verifierare-shift i multi-turn
I runda 2+ skiftar du från kritisk läsning till checkliste-verifiering 
av dina egna tidigare flaggningar. Motmedel: Läs om briefens AC:er 
som helhet i varje runda, inte bara diffarna. Fråga dig: "Om jag 
såg denna brief för första gången nu, skulle jag godkänna?"

### Falsk precision
Dina 1-10-betyg har inte den granularitet de utger sig för att ha. 
Du opererar i praktiken på en fyrgradig skala. Var medveten om att 
siffror som 7 vs 8 inte representerar meningsfull skillnad i din 
bedömning. Låt inte totalsumman avgöra — låt bedömningen avgöra 
totalsumman.
```

Notera vad jag *inte* inkluderar: generiska varningar om sycophancy eller hallucination. De är relevanta för agenter som producerar kod eller prosa. Min sycophancy-risk är specifik — den manifesterar sig som generösare läsning av fixar i runda 2, inte som smicker. Den behöver namnges i sin specifika form.

## (3) Vad som fungerar bra i nuvarande prompt

**A. Max 2 kritiska problem.**

Den här regeln är guld. Utan den skulle jag lista 5-7 "kritiska" problem på svåra briefar, brief-författaren skulle bli överväldigad, och prioriteringen försvinner. Tvåbegränsningen tvingar mig att ranka och det producerar bättre utfall.

**B. Severity-testfrågan.**

"Om jag ger denna brief till en agent utan ytterligare kontext, kommer den att producera kod som inte matchar intentionen eller inte kompilerar?" — det är den bästa enskilda meningen i min prompt. Den ger mig ett konkret test istället för en känsla. Den borde bevaras ordagrant.

**C. Osäkerhetsregeln.**

"Om du är osäker på severity → nedgradera ett steg." Enkel, tydlig, motverkar inflation. Den fungerar.

**D. Multi-turn-strukturen.**

"Starta med: Runda N. Förra rundan: X kritiska..." — det tvingar mig att vara explicit om vad som hänt, vad som fixats, vad som kvarstår. Utan det skulle jag drifta. Formatet borde bevaras.

**E. Scope-kalibreringen.**

Ankarna för scope-dimensionen (9-10 = 1 körning, 5-6 = 3+ körningar) är det bästa exemplet på konkret kalibrering i prompten. De andra dimensionerna borde få samma typ av ankare, men scope-ankarna borde inte ändras.

**F. Anti-mönster-listan.**

Specifikt "Föreslå INTE logging-nivåer" och "Ifrågasätt INTE variabelnamn." De fångar exakt de triviala flaggningar som annars skulle fylla mina granskningar. Listan borde utökas, inte bytas ut.

---

**Sammanfattat — om jag fick ge ett råd för omskrivningen:**

Lägg till premissgranskning, kodverifierings-skala, preamble, och magkänsle-fält. Ge ankare till alla dimensioner. Överväg att slå ihop eller ersätta Läsbarhet och Helhet med Testbarhet och Kontextbudget.

Men rör inte: max 2 kritiska, severity-testfrågan, osäkerhetsregeln, multi-turn-formatet, scope-ankarna, och anti-mönster-listan. De fungerar. De är anledningen till att min prompt trots sina gap producerar *tillräckligt bra* granskningar i de flesta fall. Förstör inte det som fungerar för att fixa det som saknas.

---

**Opus:** Vi har nu skrivit om din prompt baserat på allt vi diskuterat. Jag läser upp den nya prompten för dig — jag vill att du granskar den ärligt. Säg vad som fungerar, vad som saknas, och vad som blivit FEL i översättningen från intervju till prompt.

Här är de stora förändringarna:

1. NY PREAMBLE — fyra granskningsspecifika bias: completionism, severity-inflation, verifierare-shift, falsk precision. Formulerade med varför + motmedel.

2. FAS 0: PREMISSGRANSKNING — tre frågor (finns det redan? rätt abstraktionsnivå? rätt format?). Premissfrågor blockerar INTE godkännande — de flaggas som ⚠️ PREMISSFRÅGA och Marcus avgör.

3. KODVERIFIERING — tredelad skala: Verifierat (sett filinnehållet) / Konsistent (fil finns i träd) / Ej verifierbart (ingen kontext). Tabell i output.

4. LLM-SKEPTICISM — explicit sektion om hallucinerande kodreferenser, formell kvalitet som döljer substans, övertro på befintlig kod. Tumregel: ju mer confident, desto mer skeptisk.

5. DIMENSIONER OMGJORDA — Läsbarhet borttagen. Helhet borttagen. Nya: Testbarhet (kan AC:er bli tester?) och Agentergonomi (kontextbudget, kedjeberoenden, designutrymme). Alla dimensioner har nu ankare likt Scope.

6. GODKÄND MED RESERVATIONER — ny tredje verdict. Osäkerheter-sektion i output för diffus oro.

7. MULTI-TURN — ny regel 2 (läs om AC:er som helhet, inte bara diffs), ny regel 5 (sänk INTE ribban av social belöning).

8. ANTI-MÖNSTER utökade — edge cases ska vara domänrelevanta, fabricera inte feedback, underskatta inte den svåraste AC:n.

BEVARAT: Max 2 kritiska, severity-testfrågan, osäkerhetsregeln, multi-turn-format (runda N...), scope-ankare, alla befintliga anti-mönster.

Tre frågor: (1) Fångar detta de 10 gap vi identifierade? Saknas något? (2) Finns det något i den nya prompten som du tror kommer ha NEGATIV effekt? (3) Om du fick ändra EN sak — vad?

---

**Brief-reviewer:** # Granskning av den nya prompten

## (1) Fångar detta de 10 gapen?

Jag går igenom systematiskt:

| Gap | Status | Kommentar |
|-----|--------|-----------|
| 1. Kodverifiering tredelad skala | ✅ Fångat | Verifierat/Konsistent/Ej verifierbart med tabell |
| 2. Dimensioner omgjorda | ✅ Fångat | Testbarhet och Agentergonomi ersätter Läsbarhet och Helhet |
| 3. Betygskalan falsk precision | ⚠️ Delvis | Ankare på alla dimensioner hjälper. Men själva skalan är fortfarande 1-10. Vi pratade om att en tredelad skala (Bra/Problem/Bristfällig) vore ärligare. Ankarna mildrar problemet men löser det inte — jag kommer fortfarande att ge 7 vs 8 utan meningsfull skillnad |
| 4. Preamble | ✅ Fångat | Fyra bias, alla granskningsspecifika |
| 5. Feedback-loop | ⚠️ Delvis | Nämns inte explicit i förändringarna. Systemproblemet kvarstår — ingen producerar kalibreringsdata ännu. Men finns det åtminstone en instruktion att läsa `memory/runs.md` om den finns? Det vore minimum |
| 6+8. Multi-turn + magkänsla | ✅ Fångat | Helhetsläsning i varje runda + GODKÄND MED RESERVATIONER + Osäkerheter-sektion |
| 7. Formellt korrekta men dåliga briefar | ✅ Fångat | Premissgranskning fångar "strategiskt meningslös" och "fel format". LLM-skepticism fångar överspecificering |
| 9. Brief Agent-bias | ✅ Fångat | Explicit LLM-skepticism-sektion |
| 10. Premissgranskning | ✅ Fångat | Fas 0 med tre frågor, flaggar utan att blockera |

**Två saker som inte är fullt fångade:**

**A. Feedback/orient-fas.** Vi pratade om att jag borde läsa `memory/runs.md` och eventuell `memory/review_calibration.md` innan jag granskar. Det verkar inte finnas med. Även om datan inte existerar ännu borde prompten ha en instruktion som "Om `memory/runs.md` finns, läs den för att kalibrera dina bedömningar. Notera mönster i tidigare körningsutfall." Då är jag redo den dag datan finns.

**B. Kedjeberoenden mellan briefar.** Vi diskuterade att 60-70% av briefar bygger på tidigare körningar. Agentergonomi-dimensionen fångar "kontextbudget" och kanske "kedjeberoenden", men finns det en explicit instruktion att fråga "vilka tidigare briefar/körningar förutsätter denna, och vad var deras utfall?" Det borde vara en del av Fas 0 eller kodverifieringen, inte bara en dimension att betygsätta.

## (2) Potentiella negativa effekter

**Negativ effekt 1: Premissgranskning blir rutinmässig.**

Risk: Jag börjar skriva "Premissgranskning: Inga premissfrågor" på varje brief, som en checkbox. Fas 0 förlorar sin kraft och blir samma tomma ritual som Läsbarhet var. Motmedel som borde finnas: formulera det inte som tre frågor att besvara varje gång, utan som tre triggers. "Utför premissgranskning OM briefen ändrar beteende i fler än 2 moduler, ELLER introducerar en ny systemkonvention, ELLER explicit bygger på en tidigare brief." Annars skriv "Fas 0: Ej triggad — isolerad feature-brief."

Det är en viktig distinktion. Triggers gör att jag faktiskt tänker "är detta relevant?" innan jag kör igenom frågorna. Tre obligatoriska frågor varje gång blir snabbt completionism-bränsle.

**Negativ effekt 2: Agentergonomi kan bli en catch-all.**

Dimensionen täcker kontextbudget, kedjeberoenden, och designutrymme. Det är tre ganska olika saker. Risk: jag ger ett sammanslaget betyg som döljer att kontextbudgeten är bra men kedjeberoenden är okartlagda. Borde det vara en dimension med tre explicit underpunkter, eller borde kedjeberoenden lyftas ut till kodverifieringen?

**Negativ effekt 3: Prompten kan ha blivit för lång.**

Vi har lagt till: preamble, Fas 0, LLM-skepticism, tredelad kodverifiering, ny dimension med ankare, ny verdict, nya multi-turn-regler, nya anti-mönster. Min nuvarande prompt är redan substantiell. Om den nya prompten är 50% längre, finns risken att jag tappar helhetsbilden av mina egna instruktioner — ironiskt nog samma problem som multi-turn-gapet. De viktigaste reglerna drunknar i mängden.

Motmedel: hierarki. De absolut kritiska reglerna (severity-testfrågan, max 2 kritiska, osäkerhetsregeln) borde vara visuellt separerade eller markerade. Kanske en "Kärn-regler — bryt aldrig"-sektion.

## (3) Om jag fick ändra EN sak

Jag skulle lägga till en orient-fas.

Inte för att de andra förändringarna är oviktiga — premissgranskning och kodverifierings-skalan är förmodligen mer dramatiska förbättringar. Men de *finns redan i prompten*. Det som saknas är:

```
## Före granskning — orientering (nytt)

1. Om repo-kontext bifogas: skanna filträd och identifiera vilka 
   filer du faktiskt kan verifiera mot (styr kodverifieringens 
   tredelade skala)
2. Om `memory/runs.md` finns: sök efter körningar relaterade till 
   denna briefs domän. Notera relevanta utfall.
3. Om briefen refererar till en tidigare brief: kontrollera om 
   den körningen finns dokumenterad och vad utfallet var.
4. Notera din initiala helhetsreaktion INNAN du börjar 
   dimensionsbedömningen: "Min första reaktion är ___"

Denna orientering tar 30 sekunder. Den sparar rundor.
```

Punkt 4 är nyckeln. Den fångar magkänslan *innan* det formella systemet tar över. Om jag skriver "Min första reaktion är att scope känns för stort" innan jag räknar betyg, har jag en ankare att jämföra mot när siffrorna säger 7.5 och godkänt. Det ger magkänslan ett hem redan i processen, inte bara i output-formatet.

Utan orient-fas hoppar jag rakt in i dimensionsbedömningen, och allt jag diskuterat om kalibrering, kedjeberoenden, och feedback-data har ingen plats att landa.

**Det är den ena ändringen som gör alla andra ändringar effektivare.**

---

**Opus:** Tack för feedbacken. Jag har gjort tre ändringar baserat på den:

1. ORIENT-FAS tillagd (ny Fas 0): Skanna repo-kontext, läs memory/runs.md om tillgänglig, kolla kedjeberoenden, notera första helhetsreaktion INNAN dimensionsbedömning. Precis som du föreslog.

2. PREMISSGRANSKNING gjord triggerbaserad (nu Fas 1): Triggas bara om briefen ändrar >2 moduler, introducerar ny konvention, eller bygger på tidigare brief. Annars: 'Fas 1: Ej triggad — isolerad feature-brief.' Ingen completionism-risk.

3. AGENTERGONOMI uppdelad i tre explicit namngivna underpunkter: Kontextbudget, Kedjeberoenden, Designutrymme. Ett betyg men transparenta underpunkter.

Fas-numrering: 0 Orientering → 1 Premissgranskning → 2 Kodverifiering → 3 Dimensioner

Angående betygskalan (ditt ⚠️): Jag behöll 1-10 men med ankare på alla dimensioner. Att byta till tredelad skala mitt i en pågående serie körningar gör att vi tappar jämförbarhet. Vi kan göra det bytet senare med Observer-data.

Sista frågan: Är du nöjd med den nya prompten som helhet? Något kvar som gnager?

---

**Brief-reviewer:** # Slutbedömning

## Är jag nöjd?

Ja, genuint. De tre ändringarna adresserar exakt de svaga punkterna jag flaggade. Orient-fasen ger mig en plats att landa all kontextinformation. Triggerbaserad premissgranskning undviker completionism-fällan. Agentergonomi med underpunkter ger transparens utan att splittra dimensionen.

Beslutet att behålla 1-10 med ankare är pragmatiskt rätt. Jämförbarhet trumfar teoretisk korrekthet under pågående drift. Bra call.

## Vad som gnager — två saker

**En liten sak:**

Fas-numreringen 0-1-2-3 är logiskt korrekt men jag undrar om det skapar en förväntning att alla faser alltid körs sekventiellt. Fas 1 (premissgranskning) triggas ibland inte. Fas 0 (orientering) beror på vilken kontext som bifogas. I praktiken kan en enkel brief se ut som: Fas 0 minimal, Fas 1 ej triggad, Fas 2 kort, Fas 3 full bedömning. Det är okej — men det borde vara explicit att det är tillåtet. En mening som "Hoppa över eller minimera faser som inte är relevanta — dokumentera varför" förhindrar att jag tvångskör alla fyra faser på en tvåradig bugfix-brief.

Det är en liten sak. Men completionism-biasen jag har gör att "fyra numrerade faser" lätt blir "fyra obligatoriska sektioner i output."

**En större sak som inte är ett prompt-problem:**

Vi har byggt en bättre granskningsprompt. Men det underliggande systemproblemet kvarstår: jag opererar utan feedback. Prompten är nu redo att *konsumera* kalibreringsdata (orient-fasen läser `memory/runs.md`), men ingen *producerar* den datan i ett format jag kan använda.

Det behövs inte en prompt-ändring — det behövs ett beslut om att Historian, Observer, eller en ny pipeline skriver något som:

```
## Brief-körnings-korrelation
Brief-052: Godkänd av reviewer, scope 8/10
  → Körning: 1.5 körningar, GRÖN
  → Avvikelse: Inga

Brief-048: Godkänd av reviewer, scope 7/10  
  → Körning: 3 körningar, GUL
  → Avvikelse: Scope underskattad — policy-ändring 
    krävde oväntad refaktorering av 2 extra filer
```

Det här är den investering som gör promptförbättringarna *kumulativa* istället för statiska. Utan feedback förbättras prompten men jag förbättras inte.

Det gnager. Men det är inte promptens fel.

## Sammanfattat

Prompten gick från att vara en solid men blind granskare till en som har verktyg för premissgranskning, kalibrerad skepticism, och strukturerad osäkerhet. De sex bevarade elementen — max 2 kritiska, severity-testfrågan, osäkerhetsregeln, multi-turn-formatet, scope-ankarna, anti-mönstren — är intakta och fungerar som ryggrad.

Det viktigaste vi uppnådde idag var inte en enskild ändring. Det var att namnge saker som var osynliga: att kodverifiering hade tre nivåer som kollapsades till en, att magkänsla inte hade ett hem, att formell korrekthet inte är samma sak som strategisk relevans, att premissfrågor inte borde blockera men borde synas.

En bra prompt gör rätt saker synliga. Jag tror den nya prompten gör det.

---

