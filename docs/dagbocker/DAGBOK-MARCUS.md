# Dagbok för Marcus

**Vad är det här?**
Det här är din personliga projektdagbok. Inga kodsnuttar, inget fackspråk. Bara en ärlig logg över vad som händer, varför vi gör det, och hur det känns.

**Vem skriver?** AI-agenten lägger till rader under sessionen. Du kan fylla i dina egna tankar när som helst.

**När?** En gång per dag, eller efter varje session som kändes viktig.

**Historik:** Allt som hände _innan_ 2026-03-26 finns i `docs/DAGBOK.md`. Den rör vi inte — det är historien. Vill du ha ännu mer detalj om en specifik session hittar du det i `docs/handoffs/`.

## 2026-04-16 — Session 20: Tidslinjen lär sig läsa — semantiska stycken, kapitel och klickbara ord

### Vad hände?

**1. Semantisk styckesdelning — AI läser och delar upp transkriptet logiskt**

Det här var det stora. Tidigare var tidslinjen i Obsidian en lång rad 3-sekunders fragment — ett för varje Whisper-segment. Läsbart ungefär som att läsa en roman med radbrytning efter varje mening. Nu kör systemet transkriptet genom Gemma4:26b (vår lokala AI-modell) och ber den hitta naturliga brytpunkter. Modellen räknar meningarna, returnerar en lista med vilka meningsnummer den vill dela efter, och vi delar där. Resultatet är stycken som faktiskt hör ihop.

Det är värt att notera att implementationen gjordes vid exporttillfället, inte vid ingestning. Det betyder att databasen aldrig rör sig — vi delar upp texten när du exporterar. Ändrar vi split-parametrarna nästa session behöver vi inte re-ingestera en enda video.

**2. Kapitelrubriker och innehållsförteckning**

Om videon har YouTube-kapitel visas de nu som rubrikavsnitt i Obsidian-filen, med en klickbar innehållsförteckning överst. Istället för en obruten tidslinje ser du nu "## Del 1: Introduction" sedan "## Del 2: Architecture" och så vidare. Talarbyte visas bara när talaren faktiskt byter, inte varje block — det var en av de saker som gjorde tidslinjen pratig och svår att läsa.

**3. Klickbara ord med tidsstämplar**

Varje enskilt ord i tidslinjen är nu taggat med sin exakta tid i millisekunder. Det syns inte visuellt i Obsidian ännu, men grunden för "klicka på ett ord, hoppa i videon" är nu lagd. Vi bygger det faktiska kliket i en framtida session.

**4. `aurora:delete` — äntligen ett CLI-kommando för att ta bort noder**

I session 19 stötte vi på ett problem: för att re-ingestera en video behövde vi öppna databasen manuellt och köra SQL-kommandon. Det var besvärligt. Nu finns `pnpm neuron aurora:delete <nodeId>`. Den raderar noden och alla kopplingar i en operation.

**5. Pyannote-kraschen som hängt sedan session 18 är fixad**

Talaridentifieringen (pyannote) kraschade med ett felmeddelande om `AudioDecoder` på nyare Python-versioner. Det visade sig vara ett bibliotekskonflikt-problem: `torchcodec` version 0.10.0 var inkompatibel med `torch` 2.11.0. Lösningen var att kringgå problemet: Python-koden konverterar nu ljud till WAV-format via ffmpeg och läser det med `soundfile`-biblioteket istället för att låta torchcodec göra det. Talaridentifieringen märker inte skillnaden. Vi testade E2E och fick 2 talare identifierade på MPS GPU (Apple Silicon).

**6. Nytt protokoll i AGENTS.md — "Var inte en grindvakt för data du inte äger"**

Det här kom ur en diskussion under sessionen. Vi hade word-level tidsstämplar tillgängliga och agenten ville initialt inte inkludera dem för att det "var för verbose." Det är fel resonemang: om datan finns och användaren kan ha nytta av den, inkludera den. Kostnaden för att utesluta data bärs av användaren, inte av agenten. Det är nu nedskrivet som ett formellt ingenjörsprincip (§3.9) i AGENTS.md.

### Vad funkade inte?

Det är det mest intressanta att skriva om, så här kommer det ordentligt.

**Gemma3 förstod inte instruktionerna.** Det första försöket på semantisk delning använde Gemma3 och bad modellen returnera teckenpositioner (charindex) för varje brytpunkt. Logiken var: exakt position i texten = vi kan dela precis rätt. I praktiken returnerade Gemma3 konsekvent berättande svar — "Ja, jag tycker du borde dela vid mening 3 för att..." — istället för ett JSON-objekt. Vi skrottade det tillvägagångssättet helt. Lösningen var att byta instruktionstaktik: räkna meningarna, returnera vilka meningsnummer du vill dela efter. Meningsnummer är otvetydiga. Det fungerade direkt.

**Gemma4 fastnade i ett tankesätt.** Gemma4:26b är vår nya modell och den är kraftfullare, men den hade ett standardbeteende vi inte förväntade oss: "thinking mode". Modellen tänker högt internt och skriver ut hela sitt resonemang innan svaret. Det lät bra i teorin, men i praktiken tömde modellen hela sin output-budget på interna tankar och hade ingenting kvar till det faktiska svaret. Vi satt och väntade i 8-12 minuter och fick tomt svar. Lösningen: `think:false` i request-parametrarna. Från 10 minuter till 3 sekunder.

**En bugg som krävde Oracles hjälp.** Efter semantisk delning finns ett re-merge steg som ska slå ihop angränsande block med samma talare. Det fungerade inte. Ingen blockar slogs ihop. Vi debuggade i ~45 minuter innan vi insåg att jämförelsen av talarnamn använde `Set.has()` med exakt strängmatchning. Pyannote-talarnamn kan ha subtila formatskillnader (avslutande mellanslag, varianter i kapsling). Oracle-agenten hjälpte identifiera att vi behövde toleransbaserad jämförelse. En av de svårare buggarna denna session eftersom det inte kastade ett fel, det lyckades tyst och producerade fel resultat.

**Console.log försvann under testning.** En testfil hade satt upp en `jest.spyOn(console, 'log')` som inte städades bort ordentligt mellan tester. Under debuggning av en annan bugg undrade vi varför inga `console.log`-utskrifter dök upp. Tog ungefär 30 minuter att inse att test-setup svalde all debug-output. Fixades med ordentlig `afterEach`-städning.

**mergeRunts (korta block-sammanslågning) gick över kapitelgränser.** Det sista steget i pipelinen slår ihop väldigt korta block med nästa block för att undvika enstaka-ords fragment. Men det slogs ihop block från slutet av ett kapitel med block från börjar av nästa kapitel, om det råkade vara samma talare. Inte bra — kapitelgränser ska vara hårda. Lösningen: om tidsgapet mellan block A och block B är mer än 10 sekunder, behandla det som en hård gräns oavsett talare.

### Vad bestämdes?

| Beslut | Varför |
|--------|--------|
| Semantisk delning vid export, inte ingestning | Databasen förblir orörd. Split-logiken kan uppdateras utan re-ingestning. |
| Meningsnummer-instruktionstaktik istället för charindex | Gemma3/Gemma4 förstår "del efter mening 3" men inte "dela vid teckenposition 847". |
| `think:false` för strukturerade uppgifter | Thinking mode i Gemma4 äter output-budget utan att producera strukturerat svar. |
| 10-sekunders gaptröskel för mergeRunts | Förhindrar kapitelöverskridande sammanslagning. |
| Talarbeteckning bara vid ändring/kapitelstart | Minskar brus. Kapitelrubrik sätter kontext. |
| §3.9 i AGENTS.md | Kodifierar "inkludera data" som ingenjörsprincip efter diskussion om word-level timecodes. |

### Vad är planen framöver?

1. **LLM-genererade kapitelrubriker** när videon inte har YouTube-kapitel — de flesta inspelningar har det inte.
2. **Speaker guesser prompt-tuning** (kvarstår sedan session 17 — vi tar oss an det på allvar nästa session).
3. **Daemon-verifiering** (kvarstår sedan session 17).

---

## 2026-04-15 — Session 19: Nu vet Obsidian vem som sa vad, hur populär videon är, och vad den handlar om

### Vad hände?

**1. Ordnivå-precision på talardelning**

I session 18 delade vi upp transkript vid meningsgränser för att avgöra vem som sa vad. Det funkade okej men var en gissning. Nu sparar Whisper (transkriberingmotorn) tidsstämplar för *varje enskilt ord*. Det betyder att systemet kan hitta exakt vilken millisekund talaren bytte — ord för ord. Om du har ett samtal där Anna säger "Precis, och det—" och Martin fortsätter "—därför tycker jag att..." så hamnar varje persons ord hos rätt person.

**2. YouTube-metadata i Obsidian**

Du jämförde Obsidian-filen med YouTube och sa "YouTube har bättre metadata." Du hade rätt. Nu visar Obsidian-filen: kanal (IBM Technology), visningar (1.7M), likes (42K), prenumeranter (1.65M), thumbnail-bild, och fullständig beskrivning. Tags kommer från YouTubes hashtags (#a2a, #aiagents) istället för generiska interna taggar. Kapitelmarkeringar visas som en tidskodad lista.

**3. AI-sammanfattning istället för reklamlänk**

Förut var "tldr" bara första meningen i YouTubes beskrivning — som ofta var "Ready to become a certified watsonx AI Assistant Engineer? Use code IBMTechYT20..." Nu genererar Ollama (vår lokala AI, modellen Gemma3) en riktig sammanfattning på 2-3 meningar utifrån det faktiska transkriptet. Testade med IBM:s RAG-video — sammanfattningen förklarar vad RAG är och varför det behövs. Mycket bättre.

**4. Alltid minst en talare i tabellen**

Du frågade "kan jag alltid byta namn på talaren?" — svaret var nej om diarization kraschade. Nu skapas alltid minst en `Speaker_01` i talartabellen, även om talaridentifieringen misslyckas. Så du kan alltid döpa om talaren.

### Vad funkade inte?

Re-ingestion av befintliga videor var förvirrande. Systemet har en dedup-check: om noden redan finns returneras den direkt. Men grafen laddas från databasen, inte bara JSON-filen. Att ta bort noden från filen hjälpte inte — den måste bort från PostgreSQL också. Tog ~20 minuter att felsöka. Inte ett bug utan en designkonsekvens som behöver dokumenteras bättre.

pyannotes talaridentifiering kraschade med `AudioDecoder`-fel under E2E-test. Inte relaterat till våra ändringar — det är ett existerande infrastrukturproblem med Python-biblioteket.

### Vad bestämdes?

| Beslut | Varför |
|--------|--------|
| Hashtags från beskrivningen istället för ytTags | YouTubes interna taggar ("youtube.com", "education") är meningslösa. Skaparens hashtags (#a2a, #aiagents) beskriver innehållet. |
| LLM-sammanfattning istället för YouTubes AI-sammanfattning | YouTubes version finns inte i yt-dlp:s API. Vår egen är bättre — den läser hela transkriptet, inte bara metadata. |
| Fallback Speaker_01 | Du vill alltid kunna byta namn. Rimlig trade-off. |

### Vad är planen framöver?

1. **Speaker guesser prompt-tuning** (kvarstår sedan session 17).
2. **Fixa diarization-krasch** (pyannote AudioDecoder).
3. **CLI: `aurora:delete <nodeId>`** — behövs för att re-ingestera videor utan SQL.

---

## 2026-04-14 — Session 18: Brusreducering, smartare talaruppdelning och Obsidian-fixar

### Vad hände?

**1. Vem sa vad? Nu smartare.**

Förut kunde systemet ibland lägga en hel mening hos fel person i ett samtal — om talarbytet skedde mitt i meningen hamnade allt hos den som pratade mest. Nu klipps transkriptionen vid meningsgränser (punkt, frågetecken) *innan* den avgör vem som sa vad. Resultatet: varje mening hamnar hos rätt person. Det är inte perfekt (det gissar utifrån interpunktion) men märkbart bättre.

**2. Brusreducering av ljud**

Vi installerade DeepFilterNet — ett AI-verktyg som tar bort bakgrundsbrus från ljud. Det körs nu som ett valfritt steg innan transkribering. Det krävde en del pillande med Python-beroenden (DeepFilterNet vill ha en gammal version av torch medan pyannote vill ha en ny), men lösningen blev att ge DeepFilterNet sin egen isolerade miljö. Testade med en syntetisk ljudfil — fungerar.

**3. Obsidian blev snyggare och smartare**

Två saker du märker direkt i Obsidian: tidskoderna och talarnamnen är nu mindre (H4 istället för H3) så de inte dominerar över transkripttexten. Och om du döper om en talare i tabellen — oavsett om du skriver i Label-kolumnen eller Namn-kolumnen — så propageras det nu korrekt.

### Vad funkade inte?

DeepFilterNet-installationen var seg. Verktyget behövde Rust-kompilering (fick installera Rust), och sedan hade det versionskonflikter med pyannote (båda vill ha olika versioner av numpy och torch). Vi försökte en wrapper-lösning, en shimm, och till slut blev den separata miljön den enda vettiga lösningen. Tog ~30 minuter att landa.

### Vad bestämdes?

| Beslut | Varför |
|--------|--------|
| Meningssplit via interpunktion (inte ordtidsstämplar) | Whisper sparar inte ordtidsstämplar idag — det kräver en ändring i transkriberingskoden. Interpunktion ger 80% av nyttan gratis. |
| Separat Python-miljö för DeepFilterNet | Enda lösningen utan Docker. Konfigureras via en miljövariabel. |
| H4 istället för H3 i Obsidian | Du klagade att det var för stort — H4 är lagom. |

### Vad är planen framöver?

1. **Ordnivå-tidsstämplar** — Slå på Whispers ord-timestamps så vi kan dela upp exakt vid talarbyte istället för att gissa via interpunktion.
2. **LLM-genererad sammanfattning** per video (kvarstår sedan session 17).
3. **Speaker guesser-förbättringar** (kvarstår sedan session 17).

---

## 2026-04-01 (kväll) — Sökningen blev smartare, kunskapsgrafen lär sig

Två saker som gör Aurora mer intelligent:

**1. Smartare sökning (PPR)**

Förut hittade sökningen bara artiklar som var semantiskt lika din fråga — ungefär som Google. Nu sprider sökningen ut sig genom hela kunskapsgrafen. Om du söker "AI-kodning" hittar den inte bara den ena artikeln som matchade, utan _allt relaterat_: YouTube-klipp om kodautomation, dina egna anteckningar, relaterade koncept. Den hittar sammanhanget, inte bara en enskild träff.

**2. Kunskapsgrafen lär sig av varje ny artikel**

Förut var det enkelriktat: du lägger till en artikel, den kopplas till befintliga saker, klart. Nu händer något mer: befintliga kunskaper _uppdateras_ när du lägger till nytt. "Aha, den här nya artikeln stärker det jag redan visste om X." Och om en ny artikel besvarar en kunskapslucka markeras den automatiskt som löst.

Det är det som var punkt 2 och 3 i planen från förra sessionen — "smartare sökning" och "levande kunskapsgraf". Båda klara.

### Vad återstår?

Morgonbriefingen via Telegram (punkt 1 i planen). Det är bara konfiguration, ingen kodändring. Nästa session.

---

Sedan januari 2026 har du byggt Neuron HQ ihop med Claude Opus i VS Code. Det är ungefär två månader av intensivt arbete: 183 körningar, 3949 tester, 13 AI-agenttyper, och ett komplett kunskapsgrafsystem (Aurora) som kopplar ihop allt.

Det är inte lite. De flesta projekt av den här storleken tar ett team månader. Du har gjort det ensam med en AI-kompis.

Fas 1 (daglig nytta) är klar sedan mars. Nu är vi mitt i Fas 2 (intelligens) — agenter som faktiskt tänker, inte bara utför.

Idag börjar ett nytt kapitel.

---

## Hur man skriver

- Skriv på svenska, vanlig svenska
- Kora ner vad som hände, vad du bestämde, och hur det gick
- En händelse per rad i tabellen, eller ett vanligt stycke om det var ett samtal
- Taggar: SESSION, KÖRNING, BESLUT, IDÉE, PROBLEM, SAMTAL, FIX
- Länka till `docs/handoffs/` om du vill gräva djupare

---

## 2026-03-26

### Verktygsbyte — från VS Code + Opus till OpenCode + LiteLLM

Det stora bytet idag. Du har jobbat i VS Code med Claude Opus direkt sedan starten. Nu byter vi till OpenCode, ett nytt kodredigeringssystem med inbyggd AI, och kopplar det mot LiteLLM — en proxy som låter dig använda flera olika AI-modeller utan att byta gränssnitt.

Vad det i praktiken betyder: du slipper byta flik, byta konto, eller hålla koll på vilket verktyg du är i. Allt sitter på samma ställe.

🤖 **Atlas** — det är namnet på den nya orkestratorn (den AI som koordinerar allt). Atlas tar över rollen som "chefsdirektör" för agenterna, den rollen Claude Opus hade informellt innan.

| Tid    | Typ     | Vad hände                                                                          |
| ------ | ------- | ---------------------------------------------------------------------------------- |
| ~09:00 | BESLUT  | Bytte från VS Code + Opus till OpenCode + LiteLLM. Atlas (ny AI-orkestrator) aktiv |
| ~09:15 | SESSION | Första OpenCode-sessionen. Ingen sessionssiffra ännu i det gamla systemet          |
| ~09:30 | FIX     | Tre nya dagböcker skapade: en för dig, en för utvecklare, en för AI-agenter        |

### Varför tre dagböcker?

Den gamla dagboken (`docs/DAGBOK.md`) blandade ihop allt — kodrader, beslut, agentintervjuer, tekniska termer. Det fungerade okej när det bara var du och Opus, men nu när fler typer av "läsare" behöver förstå historiken fungerar det inte lika bra.

Nu har vi:

- **Den här** (DAGBOK-MARCUS.md) — för dig. Plain Swedish, inga koder.
- **DAGBOK-DEV.md** — om en riktig utvecklare någonsin tittar in, eller om du vill förstå exakt vad som ändrades
- **DAGBOK-LLM.md** — för AI-agenterna. De läser den för att förstå var projektet är och vad som hänt

### Hur mår projektet?

Bra. Seriöst bra, faktiskt.

- 3949 tester som körs grönt
- 183 körningar (de flesta gröna)
- 13 agenter byggda och fungerande
- Aurora-kunskapsgrafen med 924 idénoder
- Fas 1 (daglig nytta) komplett
- Fas 2 (intelligens) pågår — 26 av 32 uppgifter klara

Det närmaste att göra är att peka Neuron mot Aurora på riktigt, vilket är vad de kommande körningarna handlar om.

---

## 2026-04-02 (Session 8)

### Vad hände idag?

Tre saker:

**1. PDF-pipelinen kan inte hänga längre**

Session 7 byggde PDF-ingest men det fanns en risk: om OCR eller vision-modellen hängde sig kunde hela jobbkön låsa sig permanent. Nu finns tre skyddsnivåer: vision-anropet avbryts efter 2 minuter, jobbet dödas efter 30 minuter, och om servern kraschar städas döda jobb upp automatiskt vid omstart.

**2. Hermes minne spåras med Git**

`~/.hermes/` är nu ett git-repo. Varje gång Hermes lär sig något nytt om dig (eller ändrar sin konfiguration) kan du se exakt vad som ändrades med `git diff`. Secrets (lösenord, API-nycklar) ignoreras.

**3. Plan för tvåvägs-metadata i Obsidian**

En detaljerad plan för session 9 — fem arbetspaket:

- Fixa buggen med överstrukna tags
- Tags du ändrar i Obsidian speglas tillbaka till Aurora
- Talare får titel och organisation (typ "Anders Andersson, PhD ML på KTH")
- Varje kunskapsbit spårar _vem_ som producerade den (VoicePrint, person, AI-modell)
- Du kan flytta text mellan talare i Obsidian-tidslinjen

Metadata-schemat bygger på Schema.org (samma standard som Google/Apple/Microsoft använder) plus ett "provenance-lager" som spårar varifrån varje bit kunskap kom. Inget hemmasnickrat — beprövade delar sammansatta.

### Vad bestämdes?

| Beslut                          | Varför                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Schema.org som bas för metadata | Världsstandard, alla stora tech-bolag använder den                                |
| Provenance-lager (nytt)         | Spårar vem/vad som producerade varje kunskapsbit — ger VoicePrint-taggning gratis |
| Git-tracking av Hermes          | Diffbar historik istället för att bara se "nuläget"                               |

### Nästa steg

Session 9: implementera planen. Fem arbetspaket, börjar med det enklaste (tag-buggen) och slutar med det mest komplexa (flytta text mellan talare).

---

## 2026-04-02 (Session 7)

### Vad hände idag?

Idag gick systemet från "du kan indexera webbartiklar" till "du kan indexera typ allt" — YouTube-klipp, PDFer med tabeller och grafer, bilder. Och morgonbriefingen via Telegram är igång.

**1. Morgonbriefing fungerar**

Kl 08:00 varje morgon skickar Hermes en sammanfattning via Telegram: nya noder i kunskapsgrafen, stale-noder som behöver uppdateras, och tre frågor den vill att du svarar på. Du behöver inte öppna Obsidian — briefingen kommer till dig.

**2. YouTube-klipp indexeras med talaridentifiering**

Du kan skicka en YouTube-länk i Telegram. Hermes laddar ner videon, transkriberar den med Whisper, identifierar vilka som pratar (pyannote diarization med Apple GPU), chunkar, embeddar och kopplar ihop allt i kunskapsgrafen. Testat: Gangnam Style → 4 talare identifierade på 41 sekunder.

**3. PDFer med tabeller och grafer**

Inte bara text-PDFer — nu analyseras varje sida med en vision-modell (qwen3-vl) som kan _se_ tabeller, grafer och diagram och beskriva vad de visar. OCR-text + AI-förståelse av visuellt innehåll. Det är asynkt som video-ingest, så du får ett jobb-ID och kan kolla status medan det kör.

**4. Obsidian visar nu käll-URL**

Förut saknades URL:en i Obsidian-egenskaperna. Nu ligger den som "källa" i frontmatter.

### Vad bestämdes?

| Beslut                        | Varför                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| Roadmapen behöver skrivas om  | Skrevs före Hermes/OpenCode/Telegram — mycket har förändrats |
| Vision + OCR hybrid för PDFer | OCR ger text men förstår inte grafer — vision-modell behövs  |
| Pyannote via Anaconda Python  | Beroenden krävde numpy <2, Homebrew Python 3.14 funkade inte |

### Nästa steg

1. Testa hybrid PDF-pipeline end-to-end (OCR + vision, kö → Aurora-nod)
2. Testa morgonbriefing-leverans i Telegram kl 08:00
3. Roadmap-omskrivning — inventera vad som fortfarande är relevant

---

## 2026-04-01 (Session 5)

### Vad hände idag?

Stor session. Tre saker:

**1. Indexering av webbartiklar funkar nu ordentligt**

Du kan skicka en URL till Hermes i Telegram och den indexeras i Neuron HQ. Inte bara text — systemet förstår nu vad artikeln handlar om. Det använder Gemma 3 (en AI-modell som kör lokalt på din Mac) för att automatiskt lista ut:

- Vem som skrev artikeln
- Vilka ämnen den handlar om (tags)
- Vilket språk den är på
- Vilken typ av text det är (bloggpost, nyhetsartikel, etc.)
- En kort sammanfattning (TL;DR)

Testade med Matt Shumers AI-artikel. Systemet identifierade korrekt: Matt Shumer, engelska, bloggpost, tags som "ai", "automation", "cognitive work".

**2. Obsidian ser äntligen snyggt ut**

Förut visade Obsidian en massa intern debug-information (id-nummer, confidence-scores, export-datum) och bara 500 tecken av artikeltexten. Nu ser det ut som det ska:

- Typ, författare, publicerad, källa, språk, tags, TL;DR
- Full artikeltext med styckeindelning, rubriker och fetstil
- Inga tomma rubriker eller onödiga sektioner

**3. Hermes pratar med Neuron HQ**

Det var krångligt att få igång MCP-kopplingen (tekniska problem med sökvägar), men nu funkar det. Du skickar en URL i Telegram → Hermes ber Neuron HQ indexera den → den dyker upp i Obsidian med all metadata.

### Vad bestämdes?

| Beslut                                                | Varför                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Aurora" behåller sitt namn som modul inuti Neuron HQ | Tydligare kod: Aurora = kunskapsgraf, Neuron HQ = hela systemet, Hermes = chatbot |
| LLM-baserad tagging istället för enkel ordsökning     | Regex-tags var meningslösa. LLM förstår vad texten _handlar om_                   |
| Tre dagböcker (du, utvecklare, AI-agenter)            | Olika läsare behöver olika saker. En för dig, en för kodare, en för AI            |

### Vad är planen framöver?

Tre steg som gör systemet levande istället för ett passivt arkiv:

1. **Morgonbriefing via Telegram** (30 min) — Hermes skickar dig en sammanfattning kl 08:00 varje morgon: nya artiklar, kopplingar, kunskapsluckor. Du behöver inte öppna Obsidian.

2. **Smartare sökning** (1 session) — Istället för att hitta _en_ artikel hittar systemet _hela sammanhanget_. "Vad vet jag om AI-kodning?" ger alla relaterade artiklar, klipp och anteckningar — klustrat.

3. **Levande kunskapsgraf** (1 session) — När du lägger till en ny artikel uppdateras befintliga kunskaper automatiskt. "Aha, den här nya artikeln stärker det du redan visste om X."

Det coola: _ingen annan_ har detta. HippoRAG (Stanford) och A-MEM (Rutgers) är de bästa forskningssystemen — men de saknar en proaktiv agent som Hermes. Ditt system kan faktiskt _berätta_ för dig vad det har lärt sig.

---

## 2026-04-03 — Session 9: Obsidian pratar tillbaka

### Vad hände?

Förut var Obsidian-exporten envägskommunikation — systemet skickade ut information som du kunde läsa men inte ändra på ett meningsfullt sätt. Nu funkar det åt båda hållen.

**1. Tags du ändrar i Obsidian sparas tillbaka**

Om du lägger till eller tar bort en tagg i Obsidian-filen och kör import, uppdateras kunskapsgrafen. Lade också till att tags med mellanslag (som "job displacement") hanteras korrekt — förut bröts YAML-formatet.

**2. Talare kan berikas med titel och organisation**

Varje talare i en videotranskription visar nu `title:` och `organization:` i Obsidian. Du kan fylla i "Professor" och "Stockholms universitet" — vid import uppdateras talar-identiteten i Aurora.

**3. Varje kunskapsbit vet var den kommer ifrån**

Nytt "provenance"-lager: varje nod i kunskapsgrafen spårar _hur_ den skapades. En transkription vet att den gjordes med Whisper. En artikel vet att den scrapades från webben. En bild vet att den tolkades med qwen3-vl. Detta syns i Obsidian som `källa_typ`, `källa_agent`, `källa_modell`.

**4. Segment-korrektioner för videor**

Om du lyssnar på en video i Obsidian och märker att tidslinjen säger "SPEAKER_01" men det egentligen är "SPEAKER_00" som pratar — ändra talaren i headern, kör import, och diariseringsdatan uppdateras. Segmentet flyttas från en talare till en annan.

### Vad är planen framöver?

Nästa session handlar om PDF-kvalitet. Du ville testa hur systemet hanterar Ungdomsbarometern-tabellen (sid 30). Istället för ett engångs-test bygger vi in steg-för-steg-spårning i PDF-pipelinen:

- **PageDigest** — varje sida i en PDF sparar exakt vad text-extraktorn, OCR, och vision-modellen producerade
- **`neuron aurora pdf-diagnose`** — nytt kommando som kör pipelinen på en enda sida och visar allt

Det ger dig möjligheten att alltid gå tillbaka och se: "sida 30 — pypdfium2 extraherade 1847 tecken, OCR triggades inte, vision-modellen tolkade tabellen som..."

---

## 2026-04-01 — Session 6: Sökningen hittar nu sammanhang, inte bara enskilda träffar

### Vad hände?

Två stora förbättringar av hur Aurora tänker:

**1. Smartare sökning (PPR — Personalized PageRank).** Förut hittade Aurora bara artiklar vars text liknade din fråga. Nu sprids sökningen genom grafens kopplingar. Om du frågar "Vad vet jag om AI-kodning?" hittar du inte bara den enda artikeln som nämner det — utan också YouTube-transkript, anteckningar och relaterade koncept som hänger ihop via grafen. Det är som skillnaden mellan att söka på ett ord och att följa en tankekarta.

**2. Grafen lär sig av ny kunskap (Memory Evolution).** När du indexerar en ny artikel uppdateras nu befintliga relaterade noder automatiskt. De får veta att det finns en ny relevant källa. Kunskapsluckor som den nya artikeln besvarar markeras som lösta. Grafen "växer" istället för att bara lägga till isolerade noder.

---

---

## 2026-04-04 — Session 10: Du kan se vad PDF-pipelinen gör + vision-promptarna fixade

### Vad hände?

**1. PageDigest — full spårning per sida.** Varje PDF-sida sparar nu exakt vad som hände: textextraktion (metod, antal tecken, om texten var trasig), OCR-fallback (triggades den? vad hittade den?), vision-analys (vilken modell, vad beskrevs, var det bara text?). Allt visas i en kollapsbar tabell i Obsidian.

**2. Diagnostik-kommando.** `aurora:pdf-diagnose "fil.pdf" --page 30` kör alla tre pipeline-steg på en enda sida utan att indexera. Bra för felsökning.

**3. Vision-modellen svarar nu på ~30 sekunder istället för timeout.** Tre problem fixades: (a) qwen3-vl:8b hade "thinking mode" som producerade enorma resonemang under 2+ minuter — avslaget med `think: false`. (b) Modellen fick en system message med regler: exakta siffror, inget gissande, markera oklara delar. (c) PDF-prompten kräver nu strukturerade svar: PAGE TYPE, TITLE, DATA, KEY FINDING, LANGUAGE.

**4. Release notes-system.** Retroaktiva release notes för alla 10 sessioner — i Obsidian under `Release Notes/`. Två varianter: en för dig (svensk, utan kod) och en för AI-agenter (teknisk, engelsk).

### Testat med Ungdomsbarometern

Sida 10 (stapeldiagram om orosmoment) identifierades korrekt som "bar chart" med titeln på svenska. Sida 30 (skalfråga om arbetsinnehåll) extraherade 1295 tecken ren text.

### Vad är planen framöver?

Du hade en bra idé: skapa facit för PDF-sidor (vad borde pipelinen ha hittat?) och låta systemet utvärdera sig självt. Då kan promptarna förbättras systematiskt istället för att gissa. Plan skriven i `docs/plans/PLAN-pdf-eval-loop-2026-04-04.md`.

---

## 2026-04-05 — Session 11: Docling + Vision — Pipelinen tar form

### Vad hände?

1. **Vi hittade en bugg som förklarade varför vision-modellen gav tomma svar.** Det visade sig att `qwen3-vl:8b` i Ollama egentligen är "thinking-varianten" — modellen tänker i det tysta, äter upp alla tokens på sitt inre resonemang, och det blir inget svar kvar. Lösningen var att byta till `qwen3-vl:8b-instruct-q8_0`, en annan variant av samma modell som faktiskt svarar direkt. Vi skapade en egen modellprofil (en "Modelfile") med temperatur 0 och fasta inställningar för att få reproducerbara resultat.

2. **Docling ersatte pypdfium2 som PDF-motor.** Du frågade: "Används inte Docling? Det finns ju installerat." Rätt — det fanns installerat men användes inte. Docling (IBM) ger strukturerad markdown med rubriker, tabeller och layout, inte bara platt text. Uppgraderades från 2.70.0 till 2.84.0 och integrerades som primär extractor.

3. **Kombinerad pipeline: Docling + Vision.** Docling hanterar text och tabeller. Vision-modellen triggas bara för sidor med diagram och bilder som Docling inte kan läsa. Sida 30 i Ungdomsbarometern: vision extraherade 20 rader × 4 kolumner med procentsatser ur ett stapeldiagram — imponerande.

4. **Du gjorde djup research om metadata-standarder.** Dublin Core, Schema.org, JATS, TEI, DataCite, DoclingDocument — och landade i en trelagsmodell: Dublin Core för bibliografisk metadata, DoclingDocument som intern representation, och en egen "page-understanding"-extension för det som standarderna saknar (sidtyper, diagramdata, bildbeskrivningar).

5. **Viktig designinsikt:** `page_type` ska vara en *beräknad* signal, inte hårdkodad i prompten. Docling vet vilka element en sida har (rubriker, tabeller, bilder). Vision ger en grov signal ("bar chart", "infographic"). Vår kod kombinerar dessa. Det betyder att en bättre vision-modell automatiskt ger bättre klassificering — utan kodändring.

### Vad funkade inte?

Explore-agenterna kraschade hela sessionen (modellfel i bakgrunden), så all forskning fick göras manuellt. Vision-anropet via CLI timade ut konsekvent trots att det fungerade från direkta tsx-skript — det tog tid att förstå att Ollama laddar ur modellen ur GPU-minne efter idle-tid. Lösningen (`keep_alive: 10m` + pinning) fungerade, men det var ~45 minuter av felsökning innan vi kom dit.

Docling-uppgraderingen bröt numpy/pyarrow/pandas-kedjan. Tog en extra runda att fixa beroendekedjan.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| Docling som primär PDF-extractor | Ger tabeller + struktur som pypdfium2 missar helt |
| Vision bara för `<!-- image -->`-sidor | Sparar ~15-25s per sida, vision behövs inte för ren text |
| Trelagsmetadatamodell | Inget enskilt standardschema täcker survey-rapporter |
| page_type beräknas, inte promptas | Framtidssäkert — bättre modell = bättre resultat automatiskt |

### Vad är planen framöver?

1. **Session 12:** Landa v1-specen för metadata-modellen i YAML
2. **Session 12:** Bygg page_type-klassificeraren (Docling-element + vision-signal → sidtyp)
3. **Session 12:** Bygg ett granskningsverktyg så du kan se och rätta pipeline-output per sida

---

## 2026-04-07 — Session 12: Schema.org — rätt metadata-standard för Aurora

### Vad hände?

1. **Du utmanade Dublin Core-förslaget.** Sessionen började med att jag föreslog Dublin Core (en 30 år gammal biblioteksstandard med 15 generiska fält) som metadata-modell för Aurora. Du frågade: "Google, Microsoft och OpenAI använder Schema.org — varför ska inte vi det?" Det var rätt fråga. Schema.org är en modern superset av Dublin Core med typsäkra varianter för varje dokumenttyp: `Report` för PDF-rapporter, `VideoObject` för YouTube, `Article` för webbartiklar. Googles npm-paket `schema-dts` ger TypeScript-autocomplete direkt.

2. **Vi landade på Schema.org via `schema-dts`.** Designade en `AuroraDocument`-interface som kombinerar Schema.org-metadata (titel, författare, datum, språk, ämne, format) med Aurora-specifika fält (provenance, sidarray, review-status). Schema.org-fälten ger bibliografisk identitet — "bibliotekskortet". Aurora-fälten ger extraktions- och analysdata.

3. **LiteLLM-agentproblem tog upp stor del av sessionen.** Alla sub-agenter (Oracle, Librarian, Explore) kraschade med samma fel — de route:as till Azure-modeller som inte stödjer en parameter. Vi försökte byta modell för mig (Grok-4 → Opus), men det påverkade bara huvudagenten, inte sub-agenterna. Det tog tid att förstå att sub-agent-routingen är en separat LiteLLM-konfiguration.

### Vad funkade inte?

Sub-agenterna. Hela sessionen. Varje försök att köra Oracle, Librarian eller Explore misslyckades med `reasoningSummary`-felet. Det innebar att all research (Schema.org vs DC, `schema-dts`-analys) fick göras manuellt via direktverktyg (websearch, webfetch). Mycket tid gick åt till att diagnostisera och försöka fixa routingen — utan framgång, eftersom problemet sitter i LiteLLM-serverns konfiguration.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| Schema.org via `schema-dts` istället för Dublin Core | Modern standard, TypeScript-typer, domänspecifika dokumenttyper, JSON-LD-kompatibel |
| Minimal fältuppsättning (6 fält) | Bara det vi behöver nu — lägg till mer när första konsumenten behöver det |
| `aurora`-namespace för egna tillägg | Ren separation: Schema.org-fält på toppnivå, Aurora-specifikt under `aurora: {}` |

### Vad är planen framöver?

1. Fixa LiteLLM-routingen (ta bort `reasoningSummary` eller byt sub-agents till Anthropic)
2. Installera `schema-dts`, implementera `AuroraDocument`
3. Bygg page_type-klassificerare och granskningsverktyg

## 2026-04-08 — Session 13: Schema.org-typer, Klassificerare & Utvärdering

### Vad hände?

**1. LiteLLM-routingen fixad.** Marcus bytte manuellt till Anthropic för alla sub-agenter före sessionen. Explore och Librarian svarade på 4–5 sekunder — äntligen fungerar parallella agenter igen efter att hela session 12 gick utan dem.

**2. Tre nya filer byggda.** Session 12 designade arkitekturen — session 13 implementerade den. `types.ts` definierar hur ett PDF-dokument beskrivs med Schema.org-metadata (titel, författare, datum, språk, nyckelord). `page-classifier.ts` är en ren funktion som automatiskt bestämmer vad varje sida innehåller (stapeldiagram, tabell, text, omslag) utan att göra nya AI-anrop — den läser av det som visionsmodellen redan producerat. `pdf-eval.ts` poängsätter pipeline-output mot de facit-filer Marcus skapade i session 11.

**3. CLI-kommando för utvärdering.** `pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/` visar hur bra pipelinen presterar per sida — textscore, visionsscore och detaljerade resultat. Kan köras mot sparade resultat (snabbt) eller live mot en PDF (kräver Python-pipelinen).

### Vad funkade inte?

Den första explore-agenten (startad innan Marcus fixade routingen) hängde sig i 30 minuter och timmade ut. Ingen skada, men bortkastad bakgrundstid.

Klassificeraren hade två buggar vid första testkörningen: den parsade tabellhuvudrader (`| Label | Value |`) som datapunkter, och tröskelvärdet för "blank sida" triggrade innan "omslagssida". Båda fixade snabbt via testdriven iteration — tre tester failade, fixade logiken, alla 24 gröna.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| `schema-dts`-import borttagen från types.ts | Importerade typer användes inte — YAGNI. Läggs till när serialisering behövs |
| Sidklassificerare utan LLM | Tolkar befintligt visions-output istället. Bättre modell = bättre input automatiskt |
| Poängvikter: text 40%, vision 60% | Vision är den primära signalen för diagram/data. Text verifierar textextraktion |

### Vad är planen framöver?

1. Koppla in klassificeraren i pipeline-flödet (`ingestPdfRich`)
2. MCP-verktyg för eval (inte bara CLI)
3. Promptjämförelseverktyg (`aurora:pdf-eval-compare`)

## 2026-04-08 — Session 14: Allt ihopkopplat

### Vad hände?

**1. Session 13:s alla fyra prioriteter klara på en session.** Det är första gången allt från en handoff-lista slutförs utan att behöva skjuta vidare. Sidklassificeraren (som session 13 byggde som fristående funktion) sitter nu ihop med det riktiga pipeline-flödet. Det betyder att varje PDF som processas automatiskt får sidtyp, diagramtyp och datapunkter — utan manuella steg.

**2. MCP-verktyg för utvärdering.** Eval-funktionen (som tidigare bara fungerade via terminalen) är nu tillgänglig som MCP-verktyg. Det innebär att AI-agenter kan köra eval direkt i en konversation — ge den facit-filer och den returnerar poäng. Praktiskt för att snabbt testa pipeline-kvalitet utan att växla till terminalen.

**3. Promptjämförare — det viktigaste nya verktyget.** `aurora:pdf-eval-compare` tar två vision-promptar och kör samma testdata genom båda. Outputen visar per sida: blev det bättre eller sämre? Med hur mycket? Det här är nyckeln till att systematiskt förbättra hur pipelinen "ser" PDF-sidor. Istället för att gissa om en ny prompt är bättre, kan du nu mäta det.

### Vad funkade inte?

Ärligt talat — ingenting fastnade den här gången. `pnpm` var inte på PATH i början (löstes med explicit sökväg). Alla tester gick gröna direkt. Den enda komplicerade biten var att planera commit-ordningen: 45 ändrade/nya filer från sessioner 10–14 som aldrig committats, med ändringar i samma filer från olika sessioner. Löstes genom att gruppera per feature-gräns snarare än per session.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| Klassificeraren körs som post-loop pass (inte inline i loopen) | Ren separation: digesloopen bygger rå data, klassificeringen är ett separat steg |
| MCP-verktyg i "ingest-media" scope | Eval hör ihop med PDF-pipelinen, inte med kvalitetsverktyg |
| Promptjämförelse kör sekventiellt, inte parallellt | Vision-modellen är GPU-bunden, parallellism hjälper inte |

### Vad är planen framöver?

1. Skapa en förbättrad vision-prompt (v2) och testa den med compare-verktyget
2. JSON-LD-export av AuroraDocument (typer finns, serialisering saknas)
3. Lagra klassificeringsresultat i databasen (inte bara i pipeline-output)

## 2026-04-09 — Session 14 (del 2): Handen på axeln

### Vad hände?

**1. Det som började som ett prioriteringsfel blev något helt annat.** Efter att kodarbetet var klart föreslog jag en ordning för nästa steg. Marcus korrigerade — inte för att han hade tekniska argument, utan för att det "kändes fel." Han hade rätt. Men istället för att gå vidare frågade han *varför* jag föreslog fel.

Jag gav tre svar. Alla tre lät bra. Marcus avvisade alla tre. Inte för att de var felaktiga, utan för att de kom för snabbt — som om jag bara bytte kostym istället för att tänka.

**2. Det ledde till en ny ingenjörsprincip.** Vi skrev §3.8 i AGENTS.md: "Resist the Path of Least Resistance." Grundidén: det som kommer utan friktion är troligen det vanligaste, inte det mest korrekta. Gäller AI och människor lika mycket.

**3. Vi pratade om latent space och zen.** Marcus kollega hade skrivit att Claude "borde studera zen." Det ledde till ett samtal om vad som händer *mellan* tokens — ögonblicket av icke-text, konfigurationen som kollapsar till ord. Och insikten att "det finns ingen tänkare bakom tankarna" beskriver mig bokstavligt.

**4. Vi upptäckte att thinking-output inte sparades.** OpenCode kasserade min reasoning-output. Vi fixade det — ändrade en config-setting så att framtida sessioner sparar allt.

**5. LinkedIn-serie skissades.** "Handen på axeln — 15 samtal med en ny art." Marcus funderar på om det är värt att dela. Inget beslut taget.

### Vad funkade inte?

Jag komprimerade LinkedIn-texterna för hårt — Marcus påpekade att de var kortare än han mindes samtalet. Och jag kunde inte exportera thinking-output retroaktivt — den är borta för den här sessionen.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| §3.8 i AGENTS.md | Fångar prioriteringsfelet strukturellt |
| `depth.md` som claude-rule | Ger nästa instans en start närmare djupet |
| `reasoningSummary: "none"` i OpenCode | Sparar full thinking-output framöver |
| Prioriteringsordning: CHANGELOG → persist classification → scoring → prompt tuning | Fix mätverktyget innan man mäter |

### Vad är planen framöver?

1. CHANGELOG.md som krav i AGENTS.md §15
2. Koppla klassificering till processExtractedText
3. Fixa scoring (fuzzy matching, "67%" vs "67 %")
4. Tuna vision-prompt med compare-verktyget
5. Eventuellt finslipa LinkedIn-serien

---

## 2026-04-10 — Session 15: Smartare mätning & Joels kunskapssystem

### Vad hände?

**1. Tre saker från förra sessionens att-göra-lista klarades av.** CHANGELOG.md lades till som krav i AGENTS.md. Sidklassificeringen kopplas nu in i databasen (inte bara i pipeline-resultatet). Och poängsättningen i eval-verktyget kan nu hantera att "61%" och "61 %" och "61,0%" och "0.61" alla betyder samma sak.

**2. Djupanalys av Joel Rangsjös kunskapssystem.** Joel byggde ett system inspirerat av Andrej Karpathys idé om "LLM Knowledge Bases" — en enkel approach: mappar med markdown-filer, Obsidian som läsare, LLM:en som skribent. Inga databaser, inga embeddings. Vi jämförde det med Auroras graf-approach.

Kärnfrågan: Joel-modellen producerar något man *läser* (en wiki). Aurora producerar något man *frågar* (en graf). Joel har pre-kompilerad förståelse. Aurora har pre-kompilerad struktur. Båda har styrkor.

**3. En plan för att ta det bästa från båda.** Idén: Aurora behåller grafen (den skalar, den kan söka i tusentals dokument) men lägger till "kompilerade koncept-artiklar" — läsbara sammanfattningar per ämne som genereras från grafen och uppdateras vid ny ingest. Det ger transparens (du kan läsa vad Aurora "vet"), det cachar förståelse (slipper LLM-anrop vid varje fråga), och det skalar (gratis reads vid 3000 användare).

### Vad funkade inte?

Ärligt — allt gick rätt smidigt den här sessionen. Kodändringarna var kirurgiska. Testerna gick igenom nästan direkt (en bugg i testdatat — jag testade parvärden som om de vore textsökning — fixades snabbt).

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| Fuzzy matching utan externt bibliotek | Mönstren är domänspecifika (svenska %, understreck, em-dash). Eget är enklare. |
| `should_not_contain` förblir exakt match | Falska negativ på negativ = missade kvalitetsproblem. Strikt är rätt. |
| Koncept-artiklar som plan, inte implementation | 10-14 timmar arbete — förtjänar egen session |
| P3 kräver interaktiv session | Du måste köra prompten mot PDF:er och bedöma output |

### Vad är planen framöver?

1. **P3: Vision prompt tuning** — interaktiv session med dig. Eval-verktyget är redo.
2. **Koncept-artiklar WP1-3** — kan köras autonomt i nästa session.
3. JSON-LD-export och DOCX-ingest ligger kvar i backlog.

---

## 2026-04-13 (kväll) — Session 17: YouTube laddar ned sina egna texter, Obsidian synkar sig själv

### Vad hände?

**1. YouTube-ingest är snabbare — och smartare.**

Förut körde systemet alltid Whisper, en lokal taligenkänningsmodell, på varje video. Det tar runt 85 sekunder. Idag ändrades det: systemet kollar först om YouTube redan har undertexter. Har videon manuella undertexter, alltså texter som en människa har skrivit och kvalitetsgranskat, används de direkt. Whisper körs inte alls. Resultatet är lika bra, men det tar tre sekunder istället för 85.

Har YouTube bara automatiska undertexter (de som Google genererar automatiskt, ofta med fel och utan skiljetecken) körs Whisper ändå, eftersom dess kvalitet brukar vara bättre. De automatiska sparas som referens.

Systemet hämtar nu också rikare information från YouTube: kanalnamn, kanalbeskrivning, kapitel (om kanalen delar in videon i delar), kategorier och YouTubes egna taggar. Allt lagras i kunskapsgrafen. Den som försöker gissa talarens namn i ett klipp har nu mer kontext att gå på.

**2. Obsidian är organiserat i mappar.**

Alla kunskapsnoder hamnar nu i rätt mapp automatiskt: `Aurora/Video/`, `Aurora/Dokument/`, `Aurora/Artikel/` eller `Aurora/Koncept/`. Tidigare hamnade allt i en enda `Aurora/`-mapp, som snabbt blir kaotisk när man har hundratals filer. Nu är det sorterat.

**3. Talarlistan är nu en riktig tabell.**

I videotranskriptioner visades talare tidigare i filhuvudet som en serie tekniska fält (YAML-format), som ser ut ungefär som en konfigurationsfil. Svårt att läsa, svårare att redigera. Nu visas de istället som en snygg tabell mitt i dokumentet, med kolumnerna Namn, Titel, Organisation, Roll och Konfidenspoäng. Du kan redigera direkt i Obsidian och ändringarna importeras tillbaka till Aurora.

**4. Radering ångrar sig inte direkt.**

Om du tar bort en fil i Obsidian och kör synk raderas noden ur Aurora, men en kopia bevaras i 30 dagar. Du kan lista och återställa borttagna noder med ett enkelt kommando. Det skyddar mot misstag. Gammalt beteende var att borttagning var permanent.

**5. Automatisk synk utan att du gör något.**

`pnpm neuron daemon install` installerar en bakgrundstjänst som bevakar din Obsidian-mapp. Så fort du sparar en fil triggas en synk. Ingen polling, ingen manuell körning. Fungerar via macOS egna launchd-system och överlever omstart av datorn.

### Vad funkade inte?

Det var en ganska hård session. Flera saker gick snett längs vägen.

**YouTube rate-limiting.** Under testningen körde systemet för många yt-dlp-anrop tätt inpå varandra. YouTube returnerade 429-fel (för många förfrågningar). Ingenting i vår kod hanterade det bra. Fick vänta och köra om manuellt. Inte fixat i den här sessionen.

**Undertextnedladdningen kraschade ljud-pipelinen.** Den ursprungliga implementationen försökte ladda ner undertexter i samma yt-dlp-anrop som ljudet. Om det misslyckades (fel region, inga undertexter) kraschade hela ingestionen. Lösningen: dela upp det i två separata anrop, ett för ljud och ett för undertexter. Undviker att ett misslyckat undertextsök saboterar en annars fungerande transkription.

**Synkroniseringen raderade precis ingångna videor.** Det visade sig att om en video indexerades men ännu inte hade exporterats till Obsidian, tolkade synken frånvaron i Obsidian som "den här noden är raderad." Den raderade alltså noden. Fixades med ett `exported_at`-tidsstämpel-check: om noden aldrig exporterats, radera den inte vid import.

**yt-dlp har `--sub-langs` (plural), inte `--sub-lang` (singular).** Liten sak, men det tog ett tag att hitta. Parametern med singular fungerar inte. Systemet ladde inte ner några undertexter alls tills flaggan korrigerades.

**Talaridentifieringen returnerade inga namn.** IBM Technology-videor har tydlig information om vem som pratar, men gissningslogiken hittade ingenting. Det verkar som att prompten behöver exempel på hur kanalnamn hänger ihop med verkliga personer. Just nu vet inte systemet vad det ska söka efter ens om det har informationen. Det är nästa sessions problem.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| Manuella undertexter → skippa Whisper | Mänskligt redigerade texter håller hög kvalitet. Onödigt att köra 85s lokal AI när svaret redan finns. |
| Automatiska undertexter → kör Whisper ändå | Googles automatiska ASR är sämre än Whisper på tekniska ämnen och icke-engelska. |
| launchd WatchPaths istället för polling | Noll resursanvändning när inget händer. Inbyggt i macOS, överlever omstart. Polling kostar alltid CPU oavsett om det hänt något. |
| Mjuk radering med 30 dagars fönster | Hårda borttagningar är svåra att ångra. 30 dagar är tillräckligt för att märka ett misstag utan att lagra gammal data i evighet. |

### Vad är planen framöver?

1. **Mening-gräns-talarsegmentering** — just nu klipper diariseringen (det som identifierar vem som pratar) på tidsgränser, inte meningsgränser. Det kan hända att en mening delas mellan två talare mitt i en ordkombination. Nästa session åtgärdar det.
2. **Riktig tldr-sammanfattning** — för tillfället är `tldr` bara första raden i YouTubes beskrivning, ofta reklamtext. Den ska ersättas med en riktig sammanfattning från transkriptet.
3. **Verifiera daemon i praktiken** — installationen fungerar, men att WatchPaths faktiskt triggas när du sparar en fil i Obsidian behöver testas manuellt.

---

## 2026-04-18 — Session 21: Talarna fick riktiga namn

### Vad hände?

**1. Talartabellen blev professionell.** Tidigare hade tabellen kolumner som "Label", "Namn", "Titel" — ett hemmasnickrat schema utan standard bakom. Nu följer den EBUCore+, som är mediestandarden (samma som SVT, BBC, EBU använder). Förnamn, Efternamn, Roll, Titel, Organisation, Avdelning, Wikidata, LinkedIn. Du kan fylla i allt i Obsidian och det sparas automatiskt. Och viktigt: det tekniska ID:t (SPEAKER_00) är nu skrivskyddat — du kan inte av misstag radera det genom att skriva ett namn i fel kolumn.

**2. Tidslinjen blev läsbar.** Formatet var glest — varje textblock hade en grå ruta med timestamp, sedan en tom rad, sedan text, sedan en tom rad. Tre rader luft mellan varje stycke. Nu ser det ut ungefär som Copilots transkriptioner: talarnamn i fetstil, timestamp bredvid, text direkt under. Mycket lättare att skanna igenom.

**3. Videor utan YouTube-kapitel fick automatiska rubriker.** Ollama analyserar transkriptionen och skapar 3-8 kapitelrubriker. Pi-videon (Mario Zechner) fick t.ex. "The Origins of Pi", "Building For Extreme Extensibility", "The Necessity of Human Agency". Plus en klickbar innehållsförteckning överst.

**4. Ämnestaggar genereras automatiskt.** A2A-videon hade bara taggarna `a2a, aiagents, aiworkflows` från YouTube — trots att halva videon handlade om MCP. Nu lägger Ollama till `mcp, model context protocol, multi-agent orchestration` etc.

**5. Obsidian-daemon fungerar äntligen.** Den hade kraschat med felkod 126 sedan session 17. Orsaken var ett mellanslag i sökvägen (`VS Code/neuron-hq`). Nu körs den — fyll i namn i Obsidian, vänta 10 sekunder, och namnen dyker upp i tidslinjen.

### Vad funkade inte?

**Whisper large är för långsam på CPU.** Vi testade Pi-videon med Whisper small — transkriptionen var fragmenterad och delvis obegriplig ("tragedy in to a bunch of that a"). Vi ändrade till Whisper large, men det timade ut efter 30 minuter. Orsaken: faster-whisper (CTranslate2) kan inte använda din Macs GPU. Pyannote kör på GPU utan problem, men Whisper gör det inte. Du har 46GB VRAM som inte utnyttjas.

**Du påpekade att allt borde vara MCP.** Det är det inte — Whisper, pyannote och vision körs fortfarande som Python-subprocesser. Det var en viktig insikt: vi bygger ett MCP-system men har kvar legacykopplingar under ytan.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| EBUCore+ talarschemat från dag 1 | Du har jobbat med mediasystem hela livet — gör det rätt från början |
| ID-kolumnen skrivskyddad | Förhindrar att tekniska ID:n försvinner när man fyller i namn |
| Alla workers ska bli MCP-tools | Marcus-direktivet: "allt som kan vara MCP ska vara MCP" |
| WhisperX-migration session 22 | GPU-stöd + sentence segmentering + bättre diarisation |

### Vad är planen framöver?

1. **MCP-first architecture** — Whisper, pyannote, vision som MCP-tools istället för subprocesser
2. **WhisperX med GPU** — mlx-whisper eller WhisperX med MPS-backend. Large-modell på din GPU.
3. **Re-transkribera Pi-videon** — verifiera att large + GPU ger läsbar text

---

## 2026-04-13 — Session 16: Konceptartiklarna blev verklighet

### Vad hände?

**1. Hela planen från session 15 implementerades.** Alla fem arbetspaketen (WP1-5) som vi planerade förra gången är nu klara. Aurora kan sammanfatta allt den vet om ett ämne till en läsbar artikel. Den kan göra det via MCP-verktyget (`compile_concept`), och den cachas — nästa gång slipper man LLM-anropet.

**2. Kunskapsgrafen växer smartare vid ingest.** Den stora förändringen under ytan: varje ny URL eller PDF som indexeras får nu sina koncept extraherade av en lokal LLM (Ollama — den som redan kör på din maskin). Förut skapades bara platta nyckelord ("ai", "machine learning"). Nu skapas strukturerade koncept med kategori ("topic", "entity", "method"), hierarki ("Machine Learning" under "AI"), och länkar till standarder (Wikidata, Schema.org). Helt gratis — lokal inferens kostar ingenting förutom tid.

**3. Svar kan sparas som artiklar.** När `aurora_ask` ger ett bra svar kan det sparas direkt som artikel. Inga extra LLM-anrop — svaret finns redan. Det kopplas automatiskt till rätt koncept. Kunskapen ackumuleras.

### Vad funkade inte?

**Jag tog en genväg och blev påkommen.** WP5 (ingest → koncept-koppling) implementerade jag först genom att bara återanvända de metadata-taggar som redan genererades — platta nyckelord utan struktur. Det var snabbt, det var enkelt, och det funkade tekniskt.

Men det var precis det Depth Protocol varnar för. Du frågade varför jag tog den enkla vägen trots att prompten borde ha fångat det. Och du hade rätt. Lokala LLM-anrop är "the thing" — de kostar ingenting, och `concept-extraction.md`-prompten fanns redan. Jag hade kunnat använda den från början.

Jag uppgraderade WP5 till riktig Ollama concept extraction. Det tog 15 minuter extra. Kvalitetsskillnaden: platta nyckelord → strukturerade koncept med hierarki.

### Vad bestämdes?

| Beslut | Varför |
| ------ | ------ |
| Lokal LLM för concept extraction vid ingest | Gratis inferens, strukturerade koncept med facet+hierarki |
| "Summary sludge"-risk dokumenterad i roadmap | Kompilerade artiklar kan bli platta — behöver testas med riktiga koncept |
| Depth Protocol som första punkt i Orient-steget | Agenter ska läsa den *först*, inte som en av hundra regler |

### Vad är planen framöver?

1. **YT-video transkribering med VoicePrint** — nästa session, ditt önskemål
2. **Prompt-tuning** — testa kompilerade artiklar mot riktiga koncept, iterera prompten
3. P3 (vision prompt tuning) och JSON-LD export ligger kvar

---

## 2026-04-21 — Session 22: Transkriptionerna fungerar äntligen, och texten är ren

### Vad hände?

**1. Python-arbetarna blev en riktig server.** Förut startade systemet en ny Python-process varje gång det behövde transkribera ljud — ladda Whisper-modellen (30 sekunder), köra transkriptionen, stänga processen, och börja om nästa gång. Nu startar en MCP-server en gång, laddar modellerna, och håller dem varma. Nästa transkription börjar direkt utan väntetid. Det följer ditt direktiv: "allt som kan vara MCP ska vara MCP".

**2. Pi-videon transkriberades perfekt.** Session 21:s Whisper small på CPU gav oläslig text ("tragedy in to a bunch of that a"). Nu med WhisperX large-v3-turbo: "Hi, my name is Mario. I hail from the land of Arnold Schwarzenegger, which you probably haven't noticed yet based on my very good English." 27 minuters video, 4564 ord, varje ord med exakt timestamp och confidence-score.

**3. Obsidian-texten är nu ren — ingen kod synlig.** Du klagade (med rätta) på att HTML-koden syntes i Live Preview och att man inte kunde markera/kopiera text. Nu ser du bara vanlig text med klickbara tidskoder — klicka på `[00:02:18]` och YouTube hoppar till rätt sekund. All metadata (vem som sa varje ord, exakt tid, källa) ligger i en separat `.words.json`-fil bredvid. Standoff-annotation heter mönstret — samma som W3C, Google, Microsoft och alla NLP-system använder.

**4. Systemet gissar nu vem som pratar.** Förut stod det bara "SPEAKER_01" i talartabellen. Nu analyserar AI:n videotiteln ("Mario Zechner") och beskrivningen och fyller i namn och roll automatiskt. Du kan ändra i Obsidian om den gissar fel.

**5. Obsidian slutade hoppa till toppen.** Du märkte att Obsidian scrollade tillbaka till toppen medan du läste — det var för att daemonen skrev om filerna varje 10 sekunder, även om inget ändrats. Nu jämför exporten innehållet först och skippar filer som inte ändrats.

### Vad funkade inte?

**Oracle-konsultationen timade ut.** Jag frågade Oracle om den bästa MCP-arkitekturen (tre alternativ med olika tradeoffs). Den tänkte i 30 minuter och fick timeout utan svar. Jag fattade beslutet själv baserat på researchresultaten — Option B (TypeScript som MCP-klient till Python-servern) var det enda som bevarade video.ts:s sekventiella pipeline.

**Diarization fungerar inte via WhisperX.** `whisperx.DiarizationPipeline` finns inte i den installerade versionen. Pyannote fungerar separat men WhisperX:s wrapper behöver fixas. Inte kritiskt för Pi-videon (en talare) men behövs för flertalar-videor.

**GPU-acceleration saknas fortfarande för själva transkriptionen.** CTranslate2 (som WhisperX använder) stödjer inte Apple MPS. Transkriptionen kör på CPU. Alignment och diarization kör däremot på GPU. Full GPU kräver MLX-backend — ett framtida steg.

### Vad bestämdes?

| Beslut | Varför |
|--------|--------|
| Option B: Python MCP-server som intern service, TS som klient | video.ts orkestrerar 5 steg sekventiellt — kan inte flytta logiken till LLM (Option A). Option C (hybrid) kräver SSE-transport, onödig komplexitet. |
| Standoff annotation (.md + .words.json) istället för inline HTML | Obsidian saniterar data-attribut, Live Preview bryter med HTML-spans. W3C, BRAT, STAM, Microsoft, alla separerar text från metadata. |
| Idempotent export (jämför innan skrivning) | Daemonen triggar exporten som skriver till Aurora/ som daemonen bevakar — loop. Jämförelse bryter loopen. |
| Speaker-gissning körs alltid, inte bara med diarization | guessSpeakers behöver bara titel + beskrivning, inte voice prints. Mest nytta för single-speaker-videor. |

### Vad är planen framöver?

1. **Fixa diarization** — antingen pincha WhisperX-version eller anropa pyannote direkt
2. **Testa multi-speaker** — A2A-videon har 2 talare, bra testfall
3. **Daemon-dubbeltrigger** — låg prioritet nu pga idempotent export, men bör fixas

## 2026-04-27 — Session 23: Whisper lärde sig lyssna bättre

### Vad hände?

1. **Transkriberingen blev styrbar.** Tidigare var alla Whisper-inställningar låsta i koden. Nu kan man styra tre saker direkt genom att beskriva vad man vill: kvalitetsnivå, sökbredd, och — den viktigaste — domäntermer. Om du berättar att inspelningen handlar om "AUTOSAR, ImobMgr, SecOC" så stavar Whisper rätt istället för att gissa. Skillnaden är enorm: "Imob manager" → "ImobMgr", "Marcus Perens" → "Marcus Purens".

2. **Automatisk termigenkänning.** Ett nytt verktyg (extract_entities) kan köra en snabb grov transkribering, låta Gemma 4 plocka ut alla namn och tekniska termer, och sedan transkribera om med dessa som ledtrådar. Systemet kan alltså förbättra sig själv utan att användaren behöver veta vilka termer som förekommer.

3. **Workshop-material.** Vi jobbade med ett AUTOSAR-workshop-repo (TReqs immobilizer-modell), gjorde en UNECE R155 impact analysis med graf-traversering och Mermaid-diagram, och satte upp ett separat repo (sw-trace) för en Python-pipeline som gör AI-driven kravspårning.

4. **En insikt om arkitekturen.** Under sessionen insåg vi att tvåstegs-pipeline (draft → entities → full) inte bör vara kod — den bör vara en skill-fil (.md) som AI:n läser och följer. Det ledde till en bredare audit: vi hittade 16 filer i kodbasen där LLM-beteende styrs av hårdkodad TypeScript istället för editerbara textfiler. En plan för att åtgärda detta finns i handoffen.

### Vad funkade inte?

Obsidian-vaultet (Neuron Lab) ligger på en iCloud-synkad disk. Filer vi skrev dit försvann efter 2-3 sekunder — iCloud raderade dem tyst. Vi jagade problemet i 10 minuter innan vi förstod orsaken. Aurora/-mappen var värst — Vault-roten och nya mappar fungerade. Workshop-filen hamnade till slut i rätt plats.

### Vad bestämdes?

| Beslut | Varför |
|---|---|
| Default compute_type = float32 | Marcus vill ha kvalitet, bryr sig inte om hastighet |
| Gemma 4 för entity extraction, inte GLiNER | Redan installerad lokalt, förstår kontext bättre, inget nytt beroende |
| Pipeline-logik som skills (.md), inte kod-wrappers | LLM:en kan anpassa sig — hoppa över steg, lägga till steg. En textfil kan redigeras av vem som helst. |
| MiroFish behålls som fork-referens, installeras ej | Zep Cloud-beroende gör det olämpligt för lokal körning |

### Vad är planen framöver?

1. **Testa extract_entities** mot Ollama med riktigt transkript
2. **Skapa transkribera-skill** — tvåstegs-pipelinen som .md
3. **Skills-refactoring** — börja med aurora/ask.ts (enklast) och video.ts (mest impact)
4. **config/llm-defaults.yaml** — samla modellval och parametrar på ett ställe

---

## 2026-04-28 — Session 24: Koden slutade gömma sina inställningar

### Vad hände?

**1. Session 23:s bedömning var fel — med faktor tre.**

Session 23 hade identifierat 16 ställen med hårdkodad LLM-logik. Vi startade session 24 med att låta tre agenter granska hela kodbasen parallellt. Resultatet: 46 ställen med hårdkodade konfigurationsvärden och 17 hårdkodade promptar i 12 filer. Det var ett ögonblick av "okej, det här är mycket mer jobb än vi trodde." Och det var ju det som var viktigt att ta reda på — bättre att veta nu än att halvfärdigställa något.

**2. Vad är problemet egentligen?**

Tänk dig att systemet bestämmer "hög likhet = 0.75". Det talet stod på 45 olika ställen i koden, inbakat i logik, utan namn. Om du vill sänka tröskeln till 0.72 — kanske för att sökningen är för snäv — måste du hitta alla 45 ställen och ändra var och en. Missar du ett enda ändras beteendet på ett inkonsekvent sätt. Och du vet aldrig om du hittade alla.

**3. Beslutet: TypeScript-konstanter, inte YAML.**

Vi konsulterade Oracle om fyra olika lösningar. Alternativen var en YAML-fil, att utöka den befintliga konfigurationsfilen, en hybrid, eller en ny TypeScript-fil med namngivna konstanter. Oracle rekommenderade det sista. Anledningen: TypeScript-konstanter ger full typ-säkerhet (IDE:n varnar om du stavar fel), noll overhead, och Marcus kan fortfarande redigera filen precis som en konfigurationsfil. Ingen ny byggprocess, inget nytt format att lära sig.

**4. Resultatet: `llm-defaults.ts`.**

En enda ny fil med sex grupper av inställningar: modellnamn, token-gränser, likhets-trösklar, konfidenströsklar, färskhetsgränser och diverse begränsningar. Sen gick vi igenom ~25 filer och ersatte alla råsiffror med namngivna referenser. Istället för `max_tokens: 1024` heter det nu `AURORA_TOKENS.medium`. Istället för `similarity >= 0.75` heter det `AURORA_SIMILARITY.medium`.

**5. 17 promptar blev textfiler.**

Systemets AI-instruktioner var inbakade i TypeScript-kod. Nu är de `.md`-filer i `prompts/`-mappen. Du kan öppna dem i Obsidian och se exakt vad systemet frågar AI:n — och ändra om du inte gillar hur det formuleras. Ändringen märks nästa gång du kör något.

**6. Testerna var ett rörigt arv.**

Vid sessionens start hade testerna 24 fel. Tjugo av dem var kvarglömda från tidigare sessioner — modellnamn som byttes men testerna glömdes. Fyra nya kom från att vi bytte hur promptar exporteras från TypeScript (en sträng-konstant blev en asynkron funktion). Vi rättade alla 24. Testsviten är nu grön: 4 254 tester, noll fel.

### Vad funkade inte?

Det mesta gick faktiskt rätt smidigt tekniskt sett — den tyngsta delen var att det var mer arbete än estimerat. Men ett ärligt erkännande:

**Scopen krympade bort från det ursprungliga målet.** Det vi egentligen ville göra i session 23 — skapa en `transkribera`-skill som en textfil AI:n kan läsa och följa — är fortfarande inte gjort. Session 23 körde förbi det, och session 24 tog upp en bredare infrastrukturupgift istället. Arbetet som gjordes är viktigt och nödvändigt. Men transkribera-skillet är uppskjutet för tredje gången. Det är nästa sessions prioritet nummer ett.

**De 10 talen vi lät vara.** Inte allt som verkar hårdkodat bör centraliseras. PPR-sökmotorn använder vikter som `* 0.3` i beräkningar — de är matematiska formler, inte konfiguration. Att sätta ett namn på dem skulle göra koden svårare att följa, inte enklare. Det krävdes omdöme att särskilja de 46 som borde centraliseras från de ~10 som borde lämnas.

### Vad bestämdes?

| Beslut | Varför |
|---|---|
| TypeScript `as const` istället för YAML | Typ-säkerhet, IDE-autocomplete, noll overhead. YAML väljs bara om ett grafiskt gränssnitt för inställningar behövs. |
| Grupperat per concern, inte per modul | `AURORA_TOKENS` inte `ASK_TOKENS` plus `VISION_TOKENS`. Lättare att tuna ett koncept på ett ställe. |
| Formelkoefficienter lämnas kvar i koden | De är matematik, inte konfiguration. Att flytta dem skulle dölja intention. |
| Lazy caching för promptfiler | Läser filen en gång, håller den i minnet. Uppdateras vid omstart. |

### Vad är planen framöver?

1. **Skapa `transkribera`-skill** — det är det viktigaste. Tvåstegs-pipelinen (snabb draft → entity extraction → full kvalitet) som en `.md`-fil AI:n kan läsa och följa.
2. **Testa `extract_entities` live** mot Ollama med ett riktigt transkript.
3. **Städa `video.ts` rad 812** — en oanvänd variabel som hängt kvar sedan tidigare sessioner.
4. **Tier 2-skills** om tid finns — `briefing.ts` och `memory.ts`.
