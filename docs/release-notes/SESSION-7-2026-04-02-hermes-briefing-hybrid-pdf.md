---
session: 7
datum: 2026-04-02
tags: [release-note, hermes, briefing, pdf, vision, media]
---

# Session 7 — Morgonbriefing via Hermes + Hybrid PDF-pipeline

Session 7 expanderade Aurora på två fronter. Hermes fick förmågan att aktivt nå ut till Marcus varje morgon, istället för att bara svara på frågor. Och PDF-pipelinen byttes ut mot en mycket mer avancerad version som kan hantera verkliga dokument med komplicerat innehåll.

## Vad är nytt?

- **Morgonbriefing levereras automatiskt kl 08:00 via Telegram.** Aurora har nu ett schemalagt jobb (konfigurerat via cron, Macs inbyggda schemaläggare, med hjälp av biblioteket croniter) som körs varje morgon klockan åtta. Det söker i Aurora-grafen med `aurora-insights`-scope, plockar ut den mest relevanta och intressanta kunskapen, och skickar en sammanfattning direkt till dig i Telegram. Det är som att ha en assistent som läst igenom hela kunskapsbasen och serverar det viktigaste med morgonkaffet.

- **Indexera YouTube-videos och PDF:er direkt via Telegram-chatten.** Hermes fick 8 nya MCP-verktyg (MCP är det protokoll som låter Hermes anropa Aurora-funktioner). Du kan nu skicka en YouTube-länk eller sökvägen till en PDF till boten och den startar indexeringen. Resultaten hamnar i Aurora asynkront (i bakgrunden) via en jobbkö, så boten svarar direkt utan att hänga medan arbetet sker.

- **Hybrid PDF-pipeline med tre nivåer av förståelse.** Den gamla PDF-pipelinen extraherade bara rå text och hoppades att det räckte. Den nya pipelinen kör tre steg per sida: (1) pypdfium2 (ett snabbt bibliotek för textextraktion ur PDF) körs först. (2) Om texten som extraherades verkar trasig — för få tecken, konstiga symboler, skannad bild — aktiveras OCR-fallback via PaddleOCR 3.x (ett datorseendesystem som "läser" text ur bilder). PaddleOCR 3.x hade gjort en API-ändring sedan sist; det var tvunget att anpassas (från gammal till ny anropsmetod, med fallback till v2 om v3 misslyckas). (3) Varje sida skickas dessutom till qwen3-vl (en lokal multimodal AI-modell som både "ser" och "läser"), som analyserar tabeller, diagram och visuell layout som ren textextraktion missar. De tre resultaten kombineras till en rik nod i Aurora.

- **Talarseparation i videotranskription är fixad.** Pyannote (ett bibliotek för diarization, dvs. att avgöra vem som pratar när i en video) fungerar nu på Apples ARM-chip via MPS-accelerator (Macs inbyggda GPU). Det krävde att NumPy (ett matematikbibliotek) nedgraderades till version 1.26.4 för att undvika en inkompatibilitet. Med detta på plats kan Aurora skilja på olika talare i ett YouTube-transkript.

- **PDF-noder i Obsidian innehåller nu källans URL.** `source_url` läggs till i frontmatter-metadatan så du vet var PDF:en kom ifrån.

## Hur använder jag det?

**Indexera en YouTube-video:**

```bash
pnpm neuron aurora:ingest-video https://youtube.com/watch?v=...
```

**Skicka till Hermes i Telegram:**
Skicka YouTube-länken direkt till @hermesaurora_bot — boten startar indexeringen och bekräftar.

Morgonbriefingen skickas automatiskt kl 08:00 i Telegram. Inget krävs.

## Vad saknas fortfarande?

- Den hybrid PDF-pipelinen är byggd men inte testad end-to-end med en riktig komplex PDF. Koden finns, men verifieringen återstår. Den testas i session 8 och 9.
- Telegram-leveransen av briefingen kunde inte verifieras i sessionen. LiteLLM-proxyn (kommunikationslagret mot Claude) hade connection errors under sessionsslutets test. Status oklart om det är ett nätverksproblem eller konfigurationsfel.
