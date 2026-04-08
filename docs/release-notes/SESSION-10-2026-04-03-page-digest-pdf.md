---
session: 10
datum: 2026-04-03
tags: [release-note, pdf, pipeline, diagnostik, obsidian]
---

# Session 10 — Nu kan du se vad PDF-pipelinen gör per sida

Session 10 handlade om transparens. Den hybrid PDF-pipeline som byggdes i session 7 och skyddades i session 8 är nu smart, men den var ett svart hål: du indexerade en PDF och fick ett resultat, men visste aldrig vad som faktiskt hände längs vägen. Tog textextraktionen text från sida 15? Behövde sidan 30 OCR? Vad beskrev vision-modellen i det diagram på sidan 42? Nu kan du se allt det. 42 nya tester skrevs och passerar.

## Vad är nytt?

- **Hela PDF-pipelines arbete sparas nu per sida i Aurora.** Tidigare körde pipelinen sina tre steg (textextraktion, OCR-fallback, vision-analys) och slängde alla mellanresultat. Bara sluttexten sparades. Nu skapar pipelinen ett "PageDigest" (en sammanfattning av ett sidas bearbetning) för varje sida. I varje PageDigest finns: vilken metod som extraherade texten (pypdfium2 textextraktion eller OCR), hur många tecken som hämtades, om OCR aktiverades och i så fall vad den hittade, och exakt vad vision-modellen qwen3-vl sa om sidans innehåll. Dessa digests sparas som egenskaper på Aurora-noden och trunkeras till max 2000 tecken per fält för att inte svälla för mycket. Du har nu en komplett processdagbok för varje indexerad PDF.

- **Nytt diagnostik-kommando för att felsöka enskilda sidor.** Om en PDF-sida ser konstig ut i Aurora (t.ex. ger tom text, konstiga tecken, eller verkar sakna ett diagram) kan du nu köra pipelines tre steg på exakt den sidan utan att indexera om hela dokumentet. Kommandot visar i terminalen vad textextraktionen hittade, om sidan klassificerades som "garbled" (trasig), om OCR kördes och gav ett bättre resultat, och vad vision-modellen tolkade. Det gör det möjligt att snabbt avgöra om problemet är i PDF:en, i textextraktionssteget, eller i vision-analysen.

- **Kollapsbar pipeline-tabell i Obsidian-export.** PDF-dokument som exporteras till Obsidian visar nu en kollapsbar sektion längst ned i anteckningen, märkt "Pipeline-detaljer per sida". Den innehåller en tabell med en rad per sida: text-metod, antal extraherade tecken, OCR-status, och vision-modellens beskrivning. Det är ihopvikt som standard så det inte stör läsningen, men du kan öppna det när du vill förstå varför en sida ser ut som den gör i Aurora.

## Hur använder jag det?

**Diagnostisera en specifik sida i en PDF utan att indexera:**

```bash
pnpm neuron aurora:pdf-diagnose "min-fil.pdf" --page 30
```

**Se pipeline-detaljer för en redan indexerad PDF i Obsidian:**

```bash
pnpm neuron obsidian-export
```

Öppna sedan PDF-noden i Obsidian och scrolla till botten. Klicka på "Pipeline-detaljer per sida" för att öppna tabellen.

**Hämta sparad per-sida-data direkt:**

```bash
pnpm neuron aurora:show <nodeId>
```

- **Vision-promptarna totalt omgjorda — modellen producerar nu strukturerade svar istället för fri text.** Tidigare fick vision-modellen (qwen3-vl:8b) en vag prompt: "Describe this PDF page". Resultatet var oförutsägbart — ibland bra, ofta tomt eller repetitiv "thinking" som tog 2+ minuter. Tre saker fixades: (1) Modellen får nu en system message som sätter regler — exakta siffror, inget gissande, markera oklara partier med [unclear]. (2) PDF-prompten kräver nu strukturerade svar: PAGE TYPE, TITLE, DATA, KEY FINDING, LANGUAGE. (3) En teknisk bugg fixades: qwen3-vl:8b har en "thinking mode" som producerade enorma resonemang innan svaret. Med `think: false` och en cap på 800 tokens svarar modellen nu på ~30 sekunder istället för att timeouta.

- **Testat med Ungdomsbarometern.** Sida 10 (stapeldiagram om ungas orosmoment) och sida 30 (skalfråga om arbetsinnehåll) kördes genom pipelinen. Sida 10 identifierades korrekt som "bar chart" med titeln på svenska. Textextraktion hämtade 1297 tecken ren text. Vision-modellen beskrev diagrammets struktur.

## Hur använder jag det?

**Diagnostisera en specifik sida i en PDF utan att indexera:**

```bash
AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3 pnpm neuron aurora:pdf-diagnose "min-fil.pdf" --page 30
```

**Se pipeline-detaljer för en redan indexerad PDF i Obsidian:**

```bash
pnpm neuron obsidian-export
```

Öppna sedan PDF-noden i Obsidian och scrolla till botten. Klicka på "Pipeline-detaljer per sida" för att öppna tabellen.

## Vad saknas fortfarande?

- **Cold start timeout.** Första vision-anropet efter att Ollama startats om tar >120 sekunder (modellen laddas in i minnet). Efterföljande anrop tar ~30 sekunder. Lösning: pre-ladda modellen vid session-start.
- **Garbled-detektion per sida.** Kontrollen om texten verkar trasig körs på hela dokumentet. Per-sida detektion behövs för att fånga enskilda problematiska sidor.
- **Text-splitting opålitlig.** Pypdfium2 producerar inte alltid dubbla newlines mellan sidor, så PageDigest kan ha text från "fel" sida.
