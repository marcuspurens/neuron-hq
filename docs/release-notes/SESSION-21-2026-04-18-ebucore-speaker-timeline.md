---
session: 21
datum: 2026-04-18
tags: [release-note, ebucore, speaker-identity, timeline, obsidian, daemon]
---

# Session 21 — EBUCore+ Talarschema & Tidslinjeformat

## Vad är nytt?

- **Talare har riktiga metadata nu.** Talartabellen i Obsidian har fått EBUCore+-fält: Förnamn, Efternamn, Roll, Titel, Organisation, Avdelning, Wikidata, LinkedIn. Fyll i fälten i Obsidian — inom 10 sekunder dyker namnen upp i tidslinjen automatiskt. Det tekniska ID:t (SPEAKER_00) är kvar som referens men ändras aldrig.

- **Tidslinjen är mycket lättare att läsa.** Formatet har bytts från glesa blockquotes till ett kompakt format inspirerat av Copilots transkriptioner: `**Anna Gutowska** 00:00:42` följt av text direkt under. Videor med bara en talare visar inga speaker-namn alls — bara timestamps.

- **Videor utan YouTube-kapitel får AI-genererade rubriker.** Ollama analyserar transkriptionen och skapar 3-8 kapitelrubriker som renderas som `### Rubrik` med en klickbar innehållsförteckning. Videor som redan har YouTube-kapitel använder dem istället.

- **AI-genererade ämnestaggar.** Varje video får 5-10 relevanta taggar genererade från titel och sammanfattning. Exempelvis fick A2A-videon nu taggarna "mcp", "model context protocol", "multi-agent orchestration" som saknades i YouTubes egna taggar.

- **Obsidian-daemon fungerar igen.** Den kraschade med felkod 126 på grund av ett mellanslag i sökvägen. Nu synkar den automatiskt vid varje filändring i Obsidian.

## Hur använder jag det?

1. Öppna en videofil i Obsidian (t.ex. `Aurora/Video/A2A vs MCP.md`)
2. Fyll i **Förnamn** och **Efternamn** i talartabellen
3. Vänta ~10 sekunder — daemon synkar automatiskt
4. Tidslinjen visar nu `**Martin Keen** 00:00:47` istället för `**SPEAKER_00**`

Kapitelrubriker och ämnestaggar genereras automatiskt vid export — inget att göra manuellt.

## Vad saknas fortfarande?

- **Whisper kör på CPU, inte GPU.** faster-whisper (CTranslate2) stödjer inte Apple MPS. Nästa session byter till en GPU-kompatibel backend (mlx-whisper eller WhisperX). Du har 46GB VRAM som inte används.
- **Workers är inte MCP-tools ännu.** Whisper, pyannote och vision körs som subprocesser. Session 22 exponerar dem som MCP-tools.
- **Transkriptionskvalitet varierar.** Videor utan undertexter transkriberas med Whisper small → fragmenterad text. Behöver large-modell + GPU.
