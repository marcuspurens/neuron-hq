---
session: 6
datum: 2026-04-01
tags: [release-note, ppr, memory-evolution, sökning]
---

# Session 6 — Smartare sökning + Grafen lär sig

Session 6 implementerade de två funktioner som identifierades som Auroras viktigaste luckor i session 5: PPR-sökning (inspirerad av HippoRAG-forskning) och memory evolution (inspirerad av A-MEM). Båda handlar om att Aurora ska bli bättre på att _koppla ihop_ kunskap, inte bara hitta isolerade träffar. 15 nya tester skrevs och passerade.

## Vad är nytt?

- **PPR-sökning: Aurora hittar nu kunskap via sina egna kopplingar.** Tidigare fungerade sökning i Aurora som en enkel likhetsmatchning: systemet hittade de noder vars text var närmast din fråga rent vektormässigt. Det missen noder som är _indirekt_ relevanta via relationer i grafen. Nu används Personalized PageRank, en algoritm som ursprungligen uppfanns för att ranka webbsidor men som visat sig fungera utmärkt för kunskapsgrafnavigering. Processen: (1) de semantiskt bäst matchande noderna hittas som vanligt, (2) dessa används som startpunkter och algoritmen "sprider sig" längs grafrkanterna i båda riktningarna, (3) upp till 5 extra noder som hittats via grafrelationer läggs till svaret. Resultatet är att en fråga om "AI-kodning" nu kan hitta ett YouTube-transkript som inte explicit nämner frasen men som är kopplat till en artikel om det. PPR är aktivt som standard, ingen konfiguration krävs.

- **Memory evolution: grafen uppdaterar sig själv vid ingest.** Varje gång en ny nod läggs till Aurora händer nu tre saker automatiskt i bakgrunden. Först söker systemet upp de 5 befintliga noder som är mest semantiskt lika den nya (med ett tröskelvärde på 0.6 i likhet). Sedan uppdateras dessa nodernas "relaterat kontext" med titeln och sammanfattningen från den nya noden, så de "vet" att ny relaterad kunskap finns. Slutligen kontrolleras om den nya noden svarar på någon befintlig kunskapslucka i grafen. Om en lucka besvaras markeras den automatiskt som löst. Det gör att grafen aktivt förbättras av varje ny indexering, istället för att bara stapla på noder.

## Hur använder jag det?

```bash
# Ställ en fråga — PPR-sökning används automatiskt
pnpm neuron aurora:ask "Vad vet jag om AI-kodning?"
```

Du får nu svar som inkluderar noder hittade via grafrelationer, inte bara de med högst textuell likhet. Svaret kan alltså innehålla noder du inte visste var relevanta.

Memory evolution sker automatiskt varje gång du indexerar något nytt. Det krävs inget extra kommando.

## Vad saknas fortfarande?

- Morgonbriefing via Hermes är fortfarande inte konfigurerad. Hermes skickar inga automatiska dagliga meddelanden ännu. Det löses i session 7.
- Consolidator (ett planerat verktyg för att hitta och slå ihop dubblettnoder) har inte fått PPR-förstärkning ännu. Det är noterat som en framtida förbättring.
