---
name: syntesartikel
description: Skapa en strukturerad syntesartikel om ett ämne genom
  att generera en briefing, syntetisera kunskapen till en artikel
  och exportera den som JSON-LD för delning och arkivering.
---

# Skapa syntesartikel

## När ska denna skill användas?
- Användaren vill sammanfatta ett ämne som en formell artikel
- Användaren behöver en exporterbar kunskapsartikel
- Användaren vill skapa JSON-LD-metadata för ett ämne
- Användaren ber om en strukturerad sammanställning av vad vi vet

## Steg

### 1. Generera briefing
Använd `aurora_briefing` med ämnet som topic. Detta samlar ihop alla relevanta kunskapsnoder, källor och kopplingar till en sammanfattande rapport. Granska resultatet — det utgör underlaget för syntesartikeln.

### 2. Syntetisera artikel
Använd `neuron_knowledge_library` med action `synthesize` och ämnet. Verktyget skapar en strukturerad kunskapsartikel baserad på allt indexerat material. Artikeln får:
- Titel och sammanfattning
- Strukturerade sektioner
- Källhänvisningar
- Confidence-nivå

### 3. Exportera som JSON-LD
Använd `neuron_knowledge_library` med action `export_jsonld` för att exportera den skapade artikeln i JSON-LD-format. Detta ger ett maskinläsbart, länkbart format som följer Schema.org-standarden.

> **Tips:** JSON-LD-exporten kan användas för att dela artikeln med andra system, publicera på webben, eller arkivera i ett kunskapsbibliotek.

## Input
- **topic** (obligatoriskt): Ämnet att skapa en syntesartikel om

## Output
- En strukturerad syntesartikel med källor och confidence-nivå
- JSON-LD-export redo för delning eller arkivering

## Mönster
- **Sequential Workflow** — fast stegordning där varje steg bygger på föregående

## MCP-servrar som används
- `aurora-insights` — generera briefing som underlag
- `aurora-library` — syntetisera artikel och exportera som JSON-LD
