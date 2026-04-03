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
