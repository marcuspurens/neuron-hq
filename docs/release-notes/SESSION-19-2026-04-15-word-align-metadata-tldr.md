---
session: 19
datum: 2026-04-15
tags: [release-note, obsidian, metadata, tldr, speaker-alignment]
---

# Session 19 — Ordnivå-talardelning, rikare metadata och AI-sammanfattning

## Vad är nytt?

- **Ordnivå-talardelning**: Whisper (transkriberingmotorn) sparar nu tidsstämplar för varje enskilt ord. När två personer pratar i samma mening hittar systemet exakt var talarbytet sker — ord för ord — istället för att gissa via interpunktion. Resultat: markant bättre precision vid snabba talarbyten.

- **YouTube-metadata i Obsidian**: Varje videofil visar nu kanal, visningar, likes, prenumeranter, thumbnail och fullständig beskrivning. Tags hämtas från YouTube-hashtags (#a2a, #aiagents) istället för generiska interna taggar. Fältet `källa:` ersatt med `videoUrl:` för tydlighet. Kapitelmarkeringar visas som en tidskodad lista.

- **AI-genererad sammanfattning (tldr)**: Varje video får en 2-3 meningars sammanfattning som genereras av Ollama (gemma3) från transkriptet. Ersätter den gamla "sammanfattningen" som bara var första meningen i YouTubes beskrivningstext — som oftast var en reklamlänk.

- **Fallback-talare**: Om talaridentifiering misslyckas eller inte körs skapas alltid minst en `Speaker_01` i talartabellen — så du alltid kan döpa om talaren i Obsidian.

## Hur använder jag det?

Alla nya videor som ingesterats via `aurora:ingest-video` får automatiskt de nya fälten. Befintliga videor behöver re-ingesterats för att få metadata (radera noden först, sedan `aurora:ingest-video <url>`).

Exportera till Obsidian som vanligt: `neuron obsidian-export`

## Vad saknas fortfarande?

- Befintliga videor i grafen har inte de nya metadata-fälten (views, likes etc) — kräver re-ingestion.
- `loadAuroraGraph` laddar från DB först — manuell borttagning av noder kräver SQL-delete, inte bara filredigering.
- Speaker guesser prompt-tuning (kvarstår sedan session 17).
- Diarization kraschade under E2E-test med `AudioDecoder`-fel i pyannote — existerande infraproblem.
