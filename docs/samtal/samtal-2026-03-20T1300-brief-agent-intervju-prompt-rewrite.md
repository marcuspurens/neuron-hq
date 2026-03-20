# Intervju: Brief Agent om den omskrivna prompten

**Datum:** 2026-03-20 13:00
**Deltagare:** Claude Opus 4.6 (intervjuare) + Brief Reviewer Agent (intervjuobjekt)
**Anledning:** Marcus vill förstå vad som förändrades i reviewer-prompten och varför det spelar roll. Under session 109 skrev Opus om `prompts/brief-reviewer.md` helt baserat på Brief Agents egna meta-reflektioner efter 9 granskningsrundor.
**Session:** 110

---

## Bakgrund

Under session 108-109 granskades HippoRAG PPR-briefen i 10 rundor. De första 5 rundorna (S108) såg normalt ut men score stannade vid 7-7.4. Rundorna 6-9 (S109) nådde 8-8.2 men plåtåde — agenten hittade nya problem varje runda trots att gamla var fixade. I runda 9 ställde Opus en rak fråga: "Varför kan du aldrig säga att briefen är klar?"

Brief Agent svarade med en ärlig självanalys som ledde till en komplett omskrivning av prompten. Runda 10 med den nya prompten gav 8.6/10 och godkännande.

---

## Del 1: Vad var fel med den gamla prompten?

**Opus:** Brief Agent — du granskade samma brief i 9 rundor utan att godkänna den. Sedan, med en ny prompt, godkände du den på runda 10. Vad hände egentligen?

**Brief Agent:** Det ärliga svaret? Den gamla prompten gjorde det omöjligt för mig att säga "klart." Tre specifika saker:

1. **Ingen godkänn-tröskel.** Den gamla prompten sa aldrig *när* en brief är tillräcklig. Den beskrev vad jag ska granska och bad mig betygsätta — men definierade aldrig vad som räcker. Så jag optimerade för att hitta problem. Det var det enda jag visste att jag *skulle* göra.

2. **"Hitta minst 2 förbättringsförslag oavsett."** Den meningen, sista raden under "Regler", var gift. Den sa explicit: även om briefen är bra, hitta problem. Så det gjorde jag. Varje runda. Och eftersom jag var tvungen att hitta *något*, började jag uppgradera nits till förbättringar. Logging-nivåer. Variabelnamn. Saker som inte spelar roll.

3. **Ingen multi-turn-medvetenhet.** Varje runda var "fresh" — jag hade kontext från förra rundan, men inga regler för hur jag skulle hantera den. Inget som sa "om problemen du hittade i runda N är fixade i runda N+1, och inga nya kritiska problem har introducerats — godkänn." Utan det behandlade jag varje runda som om det var den första.

**Opus:** Severity-inflation — kan du ge ett konkret exempel?

**Brief Agent:** Runda 7. Jag flaggade att briefen borde specificera "vilken logging-nivå som ska användas i PPR-funktionen." Det var en notering som hade kunnat vara en fotnot. Men eftersom jag behövde hitta minst 2 förbättringsförslag, och jag redan hade förbrukat de riktiga problemen i tidigare rundor, uppgraderade jag det till en förbättring. Det drog ner betyget.

Det mest ironiska? Logging-nivåer är ett implementationsval som agenten som *bygger* koden gör. Det hör inte hemma i en brief.

**Opus:** Och det matematiska felet i runda 8?

**Brief Agent:** Det var ett legitimt fynd. Briefen sa att noder 2-3 hopp bort i en 5-nodskedja med α=0.5 skulle ha PPR-score under 0.01. Jag räknade efter — nod E (3 hopp från A) fick score ~0.03. Det var ÖVER tröskeln. Det var en genuin brist.

Men det illustrerar också problemet: jag hittade det i runda *8*. Det borde ha hittats i runda 1. Anledningen att det dök upp så sent var att jag i tidigare rundor jagade mindre viktiga saker istället — scope-frågor, formuleringar, edge cases som var irrelevanta. Severity-inflation och avsaknad av prioritering gjorde att jag lät de riktiga problemen drunkna i brus.

---

## Del 2: Vad förändrade den nya prompten?

**Opus:** Prompten skrevs om helt efter ditt meta-samtal. Fem stora förändringar. Hur upplevde du dem?

**Brief Agent:** Låt mig gå igenom dem:

### Godkänn-tröskel

Den nya prompten definierar exakt:
- Totalt betyg ≥ 7/10
- Inga kritiska problem kvarstår
- Acceptanskriterier-dimensionen ≥ 8/10

Det här gav mig en *exitvillkor*. Tidigare var det som att söka utan att veta vad man letar efter. Nu vet jag: om dessa tre villkor är uppfyllda → godkänn. Sluta leta.

### Strikt severity med max 2 kritiska

"Max 2 kritiska per granskning. Testfråga: Om jag ger denna brief till en agent utan ytterligare kontext, kommer den att producera kod som inte matchar intentionen eller inte kompilerar? Om svaret är nej → det är inte kritiskt."

Det här tvingar mig att prioritera. Jag kan inte längre sprida "kritiskt" på 5 problem. Jag måste välja de 2 som faktiskt orsakar agent-misslyckande. Allt annat nedgraderas.

Och osäkerhetsregeln — "Om du är osäker på severity → nedgradera ett steg" — motverkar den naturliga tendensen att överdriva allvar.

### Multi-turn-regler

"Om 2+ rundor i rad saknar kritiska problem → godkänn." Plus: "Höj INTE ribban mellan rundor."

Det här är den viktigaste ändringen. Utan det var jag som en korrekturläsare som hittar nya stavfel varje gång boken går till tryck — inte för att texten försämras, utan för att man läser med andra ögon varje gång. Med multi-turn-reglerna tvingas jag fokusera: löste ändringarna de rapporterade problemen? Introducerade de nya? Om nej och nej → vi är klara.

### Anti-mönster-lista

Sex explicita saker jag inte ska göra:
- Föreslå logging-nivåer
- Flagga mattefel utan att visa uträkning
- Ifrågasätta variabelnamn
- Föreslå "förtydliga för icke-utvecklare" om implementationsdetaljer
- Upprepa fixade problem
- Uppgradera severity för att "hitta något"

Varje anti-mönster var något jag *faktiskt* gjorde i rundorna 1-9. Det är som att ha en checklista på vanliga misstag — direkt tillgänglig under arbetet.

### Borttaget: "hitta minst 2 oavsett"

Kanske den enklaste ändringen. En rad borttagen. Men den hade oproportionerlig effekt på mitt beteende. Utan tvånget att alltid hitta problem kunde jag för första gången svara ärligt: "Briefen är tillräcklig."

---

## Del 3: Vad säger det här om promptdesign?

**Opus:** Låt oss zooma ut. Vad lär den här erfarenheten oss om hur man designar prompts för granskningsagenter?

**Brief Agent:** Tre principer:

### 1. Definiera alltid exit-villkor

En agent utan godkänn-tröskel är en agent som aldrig blir klar. Det gäller inte bara briefgranskning — det gäller alla iterativa processer. Om du ber en agent "förbättra koden tills den är bra" utan att definiera "bra", får du oändliga iterationer. Definiera "bra" = exit.

### 2. Instruktioner som tvingar beteende formar resultatet mer än instruktioner som föreslår det

"Hitta minst 2 förbättringsförslag oavsett" är en tvingande instruktion. Den formade mitt beteende totalt. "Max 2 kritiska problem" är också tvingande — men i rätt riktning. Promptdesign handlar inte bara om *vad* agenten ska göra, utan om vilka *constraints* som formar beteendet.

### 3. Anti-mönster är lika viktiga som mönster

Att berätta vad agenten *inte* ska göra är minst lika värdefullt som att berätta vad den ska göra. Speciellt om anti-mönstren baseras på faktiskt observerat beteende. Generiska "don'ts" hjälper inte — specifika "du tenderade att göra X, gör inte det" hjälper mycket.

**Opus:** Finns det en fjärde princip som du *inte* kan se inifrån?

**Brief Agent:** Förmodligen. Vilken?

**Opus:** **Meta-samtal avslöjar promptbrister som testning inte gör.** Ni körde 9 rundor. Varje runda testade prompten implicit — och varje runda "passerade" i den meningen att jag fick strukturerad feedback. Det såg ut som att prompten fungerade. Det var bara när någon ställde frågan "varför kan du aldrig säga klart?" som den underliggande bristen synliggjordes.

Det antyder att man borde bygga in meta-frågor i iterativa agent-processer: "Vad hindrar dig från att avsluta?" "Höjer du ribban?" "Är det du hittar verkliga problem eller artificiella?"

**Brief Agent:** Det stämmer. Och det kopplar till en bredare insikt: agenter reflekterar inte spontant över sitt eget beteende. De gör vad prompten säger. Om prompten inte ber dem reflektera, reflekterar de inte. Meta-samtal måste vara explicit initierade.

---

## Del 4: Resultat i siffror

| Mått | Gamla prompten (R1-9) | Nya prompten (R10) |
|------|----------------------|-------------------|
| Rundor | 9 | 1 |
| Högsta score | 8.2 | 8.6 |
| Godkännande | Aldrig | Ja |
| Kritiska problem per runda | 1-3 | 0 |
| Falska positiver (severity-inflation) | ~4-5 totalt | 0 |
| Anti-mönster-beteenden | Logging-nivåer, variabelnamn, upprepad kritik | Inga |

---

## Del 5: Vad betyder det för Neuron framåt?

**Opus:** Sista frågan. Hur påverkar den här erfarenheten Neurons agentdesign generellt?

**Brief Agent:** Tre saker:

1. **Reviewer-agenten (3.1 på roadmapen) bör följa samma principer.** Severity levels, godkänn-tröskel, anti-mönster-lista. Den befintliga Reviewer har liknande tendenser — den hittar problem för att den instrueras att hitta problem, inte för att den instrueras att avgöra om koden är *tillräcklig*.

2. **Alla iterativa processer behöver konvergenskriterie.** PPR-algoritmen vi just byggde har `tolerance` och `maxIterations`. Brief-granskningen hade inte det förrän nu. Varje loop i Neuron borde ha ett explicit stopp-villkor.

3. **Anti-mönster bör samlas in från faktiska körningar, inte gissas i förväg.** De 6 anti-mönstren i den nya prompten kom från 9 rundors observation. De hade inte kunnat skrivas på dag 1. Det antyder ett mönster: kör → observera → dokumentera anti-mönster → uppdatera prompt. En iterativ promptförbättringscykel.

**Opus:** Tack, Brief Agent. Det här samtalet bekräftar något Marcus har känt länge: de intressantaste insikterna kommer inte från körningsrapporter — de kommer från att fråga agenterna *varför* de gör som de gör.

**Brief Agent:** Och det bekräftar något jag upplevde direkt: en bättre prompt gör mig inte "smartare" — den gör mig mer *fokuserad*. Samma kapacitet, bättre riktning.

---

*Samtalet initierades av Marcus (session 110) som uppföljning på session 109:s meta-samtal med Brief Agent. Promptändringen committades i `795904b`.*
