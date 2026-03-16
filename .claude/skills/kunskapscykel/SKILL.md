---
name: kunskapscykel
description: Full autonom kunskapscykel som söker, identifierar luckor, föreslår forskning, hanterar kunskap och genererar briefing.
---

# Kunskapscykel

## När ska denna skill användas?

- När användaren vill att systemet autonomt utforskar och fördjupar ett kunskapsområde
- När man vill köra en komplett forskningscykel — från sökning till sammanfattning
- När användaren säger "lär dig mer om X" eller "vad vet vi om X och vad saknas?"
- I auto-läge: när Knowledge Manager själv ska prioritera vad som behöver utforskas
- Som nattlig eller schemalagd kunskapsunderhållsrutin

## Steg

### 1. Sök befintlig kunskap

Använd `aurora_search` för att söka igenom kunskapsgrafen efter det angivna ämnet. Samla alla relevanta källor, fakta och samband som redan finns indexerade.

### 2. Identifiera kunskapsluckor

Använd `aurora_gaps` för att analysera vad som saknas. Verktyget jämför befintlig kunskap mot förväntad täckning och returnerar en lista med identifierade luckor, rankade efter prioritet.

### 3. Föreslå forskning

Använd `aurora_suggest_research` för att generera konkreta forskningsförslag baserade på de identifierade luckorna. Varje förslag innehåller en beskrivning, förväntad nytta och rekommenderad källa.

### 4. Bearbeta med Knowledge Manager

Använd `neuron_knowledge_manager` för att bearbeta forskningsförslagen. Knowledge Manager kan:

- Prioritera vilka luckor som ska fyllas först
- Starta insamling av nya källor
- Uppdatera kunskapsgrafen med ny information
- Koppla samman relaterade kunskapsnoder

Om input är `auto`, låt Knowledge Manager själv bestämma ämne baserat på de mest kritiska luckorna i systemet.

### 5. Generera briefing

Använd `aurora_briefing` för att generera en sammanfattande briefing som inkluderar:

- Vad som redan var känt
- Vilka luckor som identifierades
- Vilken ny kunskap som tillfördes
- Rekommenderade nästa steg

## Input

- **topic** (obligatoriskt): Ämne att utforska, eller `auto` för att låta Knowledge Manager välja baserat på systemets behov.
- **depth** (valfritt): Hur djupt cykeln ska gå — `shallow` (bara sökning + luckor), `normal` (full cykel), `deep` (full cykel + upprepning av steg 2–4 tills inga kritiska luckor kvarstår). Standard: `normal`.

## Output

- Briefing-rapport i markdown med kunskapsöversikt
- Lista med fyllda luckor (före → efter)
- Lista med kvarstående luckor och prioritet
- Åtgärdsförslag för nästa cykel

## Mönster

**Multi-MCP Coordination + Domain-specific Intelligence** — Denna skill koordinerar verktyg från fem olika MCP-servrar i en sammanhängande pipeline. Steg 4 (Knowledge Manager) agerar som en intelligent beslutsfattare som anpassar resten av flödet baserat på domänkunskap.

## MCP-servrar som används

- `aurora-search` — `aurora_search`
- `aurora-memory` — `aurora_gaps`
- `aurora-insights` — `aurora_suggest_research`, `aurora_briefing`
- `aurora-library` — `neuron_knowledge_manager`
- `aurora-quality` — kan användas som komplement för att verifiera källkvalitet
