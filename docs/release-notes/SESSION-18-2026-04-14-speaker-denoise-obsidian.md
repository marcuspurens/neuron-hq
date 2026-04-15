---
session: 18
datum: 2026-04-14
tags: [release-note, speaker-alignment, denoising, obsidian]
---

# Session 18 — Brusreducering, smartare talaruppdelning och Obsidian-fixar

## Vad är nytt?

- **Brusreducering av ljud** — Innan transkribering och talaridentifiering kan ljud nu renas från bakgrundsbrus med DeepFilterNet (ett AI-baserat brusreduceringsverktyg). Det körs automatiskt om du sätter `denoise: true` när du indexerar en video. Om DeepFilterNet inte är installerat hoppar systemet över steget utan att något går sönder.

- **Smartare uppdelning av vem som sa vad** — Förut kunde hela meningar hamna hos fel talare om ett talarbyte skedde mitt i en mening. Nu splittas transkriptionen vid meningsgränser (punkt, frågetecken, utropstecken) innan talartilldelning, så varje mening hamnar hos rätt person.

- **Obsidian: Mindre tidskodrubriker** — Tidskod + talarnamn i transkript renderades för stort (H3-rubrik). Nu är det H4 — mindre och mer i proportion med brödtexten.

- **Obsidian: Talarnamn uppdateras** — Tidigare kunde man bara döpa om talare genom att skriva i Namn-kolumnen i tabellen. Nu fungerar det även att ändra direkt i Label-kolumnen (byta ut `SPEAKER_01` mot "Ada"). Ändringen propageras vid nästa export.

## Hur använder jag det?

**Brusreducering** kräver att DeepFilterNet är installerat i en egen Python-miljö:
```bash
# Redan gjort på din maskin — .venvs/denoise/ finns
# DEEPFILTERNET_CMD pekar på rätt binary i .env
```

Indexera med brusreducering:
```bash
pnpm aurora ingest-video "https://youtube.com/watch?v=..." --denoise
```

**Talarnamn i Obsidian** — ändra antingen Label-kolumnen eller Namn-kolumnen i talartabellen, kör sedan Obsidian-export (`pnpm aurora obsidian-export`).

## Vad saknas fortfarande?

- Uppdelningen av vem som sa vad baseras på interpunktion (punkt, frågetecken). Nästa session ska den istället använda exakta ordtidstämplar från Whisper, vilket blir ännu mer precist.
- Brusreduceringsverktyget (DeepFilterNet) har en versionskoppling som gör att det behöver sin egen Python-miljö — lite bräckligt men fungerar.
