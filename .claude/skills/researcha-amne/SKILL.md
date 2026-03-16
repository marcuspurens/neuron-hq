---
name: researcha-amne
description: Djupforska ett ämne genom att söka i kunskapsbasen,
  identifiera luckor, föreslå forskning och generera en briefing.
  Använd denna skill när användaren vill förstå ett ämne på djupet.
---

# Researcha ämne

## När ska denna skill användas?
- Användaren frågar "vad vet vi om X?"
- Användaren vill ha en djupgående analys av ett ämne
- Användaren ber om forskningsförslag
- Användaren vill identifiera kunskapsluckor inom ett område

## Steg

### 1. Sök i kunskapsbasen
Använd `aurora_search` med ämnet som query. Notera antal träffar och relevans.

### 2. Identifiera luckor
Använd `aurora_gaps` för att hitta obesvarade frågor relaterade till ämnet.

> **Quick-läge stannar här.** Om depth är `quick`, presentera sökresultat och identifierade luckor direkt.

### 3. Föreslå forskning
Om luckor finns, använd `aurora_suggest_research` för att generera konkreta forskningsförslag baserade på de identifierade luckorna.

### 4. Generera briefing
Använd `aurora_briefing` med ämnet för en sammanfattande rapport som väver ihop sökresultat, luckor och forskningsförslag.

### 5. (Valfritt) Syntetisera artikel
Om det finns tillräckligt med material, fråga användaren om de vill skapa en syntesartikel via `neuron_knowledge_library` med action `synthesize`. Detta skapar en strukturerad kunskapsartikel i biblioteket.

## Input
- **topic** (obligatoriskt): Ämnet att researcha
- **depth** (valfritt): `quick` (steg 1–2) eller `full` (steg 1–5, standard)

## Output
Presentera en strukturerad rapport med:
- Vad vi vet (med källor)
- Vad vi inte vet (luckor)
- Föreslagna nästa steg
- Confidence-nivå för våra kunskaper

## Mönster
- **Sequential Workflow** — fast stegordning där data flödar mellan stegen
- **Multi-MCP Coordination** — orkestrerar verktyg från flera MCP-servrar

## MCP-servrar som används
- `aurora-search` — sökning i kunskapsbasen
- `aurora-memory` — identifiera kunskapsluckor
- `aurora-insights` — forskningsförslag och briefing
- `aurora-library` — syntesartikel (valfritt steg)
