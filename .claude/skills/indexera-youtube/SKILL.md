---
name: indexera-youtube
description: Indexera en YouTube-video genom att starta asynkron
  ingestning, bevaka jobbstatus och generera en briefing när
  transkription och indexering är klar.
---

# Indexera YouTube-video

## När ska denna skill användas?
- Användaren delar en YouTube-länk och vill indexera den
- Användaren vill transkribera och söka i videoinnehåll
- Användaren ber om en sammanfattning av en YouTube-video

## Steg

### 1. Starta videoingestning
Använd `aurora_ingest_video` med YouTube-URL:en. Verktyget returnerar ett jobb-ID (`job_id`) eftersom videoprocessning sker asynkront.

### 2. Kontrollera jobbstatus
Använd `aurora_jobs` med action `status` och det returnerade jobb-ID:t. Möjliga statusar:
- **queued** — jobbet väntar i kö
- **processing** — transkription och indexering pågår
- **completed** — klart, innehållet är sökbart
- **failed** — något gick fel, kontrollera felmeddelande

### 3. Vänta och kontrollera igen
Om statusen är `queued` eller `processing`, vänta 15–30 sekunder och kontrollera igen med `aurora_jobs`. Videoprocessning tar typiskt 1–5 minuter beroende på videolängd.

> **Tips:** Informera användaren om uppskattad väntetid. Korta videos (< 10 min) tar ca 1–2 minuter. Längre videos kan ta upp till 10 minuter.

### 4. Generera briefing
När jobbet har status `completed`, använd `aurora_briefing` med videons titel eller huvudämne som topic. Detta ger en sammanfattande rapport baserad på det nyligen indexerade innehållet.

## Input
- **url** (obligatoriskt): YouTube-URL (t.ex. `https://www.youtube.com/watch?v=...`)

## Output
- Bekräftelse att videon är indexerad
- Briefing med sammanfattning av videoinnehållet
- Information om identifierade talare (om tillämpligt)

## Mönster
- **Sequential Workflow** — fast stegordning med asynkront väntesteg

## MCP-servrar som används
- `aurora-ingest-media` — starta videoingestning
- `aurora-media` — bevaka jobbstatus
- `aurora-insights` — generera briefing från indexerat innehåll
