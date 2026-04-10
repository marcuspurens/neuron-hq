# Dagbok för Marcus

**Vad är det här?**
Det här är din personliga projektdagbok. Inga kodsnuttar, inget fackspråk. Bara en ärlig logg över vad som händer, varför vi gör det, och hur det känns.

**Vem skriver?** AI-agenten lägger till rader under sessionen. Du kan fylla i dina egna tankar när som helst.

**När?** En gång per dag, eller efter varje session som kändes viktig.

**Historik:** Allt som hände _innan_ 2026-03-26 finns i `docs/DAGBOK.md`. Den rör vi inte — det är historien. Vill du ha ännu mer detalj om en specifik session hittar du det i `docs/handoffs/`.

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
