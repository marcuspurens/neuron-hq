---
name: indexera-och-lar
description: Indexerar en URL, verifierar att innehållet sparades korrekt, memorerar nyckelfakta och kontrollerar om nya kunskapsluckor uppstått.
---

# Indexera och lär

## När ska denna skill användas?

- När användaren delar en URL och vill att systemet ska lära sig innehållet
- När man vill säkerställa att en ny källa inte bara indexeras utan också integreras i kunskapsbasen
- När användaren säger "läs den här" eller "spara den här artikeln"
- Som steg i ett större forskningsarbetsflöde där man behöver indexera enskilda källor

## Steg

### 1. Indexera URL

Använd `aurora_ingest_url` för att indexera innehållet från den angivna URL:en. Verktyget hämtar sidan, extraherar text, metadata och struktur, och sparar allt i kunskapsgrafen.

### 2. Verifiera indexering

Använd `aurora_search` för att söka efter innehåll från den nyligen indexerade URL:en. Kontrollera att:

- Källan finns i sökresultaten
- Nyckelinnehåll är sökbart
- Metadata (titel, datum, författare) har extraherats korrekt

Om verifieringen misslyckas, rapportera felet till användaren och avbryt inte — fortsätt med vad som finns.

### 3. Memorera nyckelfakta

Använd `aurora_memory` med action `remember` för att spara de viktigaste faktapunkterna från det indexerade innehållet. Välj 3–5 nyckelfakta som är mest relevanta och unika för denna källa.

### 4. Kontrollera nya luckor

Använd `aurora_gaps` för att kontrollera om det nya innehållet har avslöjat nya kunskapsluckor. Ny information kan peka på relaterade ämnen som systemet ännu inte har täckning för.

## Input

- **url** (obligatoriskt): Den URL som ska indexeras och läras in.

## Output

- Bekräftelse att URL:en indexerats (med extraherad titel och metadata)
- Verifieringsresultat — om innehållet är sökbart
- Lista med memorerade nyckelfakta
- Eventuella nya kunskapsluckor som identifierats

## Mönster

**Sequential Workflow** — Stegen utförs i fast ordning. Varje steg bygger på resultatet av föregående steg. Inga iterativa loopar.

## MCP-servrar som används

- `aurora-ingest-text` — `aurora_ingest_url`
- `aurora-search` — `aurora_search`
- `aurora-memory` — `aurora_memory`, `aurora_gaps`
