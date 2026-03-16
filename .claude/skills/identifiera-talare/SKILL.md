---
name: identifiera-talare
description: Interaktivt arbetsflöde för att identifiera, bekräfta och tagga talare i mediefiler via iterativ förfining.
---

# Identifiera talare

## När ska denna skill användas?

- När användaren vill identifiera okända talare i en video eller ljudfil
- När det finns otaggade talarsegment som behöver namn
- När användaren vill granska och korrigera automatiska talarförslag
- När man vill köra auto-tagging efter att ha byggt upp tillräckligt med bekräftade identifieringar

## Steg

### 1. Hämta talargalleri

Använd `aurora_speakers` med action `gallery` för att hämta alla kända talarprofiler med ansiktsbilder och röstprofiler. Detta ger en referensbas att matcha mot.

### 2. Hämta förslag

Använd `aurora_speakers` med action `suggest` för att få systemets automatiska förslag på talaridentifiering. Varje förslag innehåller en konfidensnivå och matchningsgrund (ansikte, röst, eller båda).

### 3. Presentera matchningar för användaren

Visa förslagen i ett tydligt format:

- Talarnamn (föreslaget)
- Konfidensnivå (hög/medel/låg)
- Tidskod i median
- Matchningsgrund

**Fråga användaren**: "Stämmer dessa? Vill du bekräfta, avvisa eller korrigera något förslag?"

### 4. Bekräfta eller avvisa

Baserat på användarens svar, använd `aurora_speakers` med action `confirm` för bekräftade identifieringar och action `reject` för felaktiga förslag. Upprepa steg 2–4 om nya förslag genereras efter avvisningar.

### 5. Auto-tagga resterande

När användaren är nöjd med de bekräftade identifieringarna, använd `aurora_speakers` med action `auto_tag` för att automatiskt tagga alla återstående segment som matchar de bekräftade profilerna.

## Input

- **media_id** (obligatoriskt): ID för mediefilen som ska analyseras
- **confidence_threshold** (valfritt): Minsta konfidensnivå för automatiska förslag. Standard: 0.7

## Output

- Lista med bekräftade talaridentifieringar (namn, tidskoder, konfidenstyp)
- Antal auto-taggade segment
- Eventuella kvarstående oidentifierade segment med tidskoder

## Mönster

**Iterative Refinement** — Steg 2–4 upprepas tills användaren är nöjd med resultatet. Varje iteration förfinar identifieringarna genom mänsklig feedback.

## MCP-servrar som används

- `aurora-media` — `aurora_speakers` (alla actions: gallery, suggest, confirm, reject, auto_tag)
