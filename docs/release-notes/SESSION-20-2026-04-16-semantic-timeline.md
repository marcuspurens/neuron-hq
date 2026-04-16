---
session: 20
datum: 2026-04-16
tags: [release-note, obsidian, semantic-split, timeline, chapters, gemma4]
---

# Session 20 — Semantisk tidslinje med kapitel och klickbara ord

## Vad är nytt?

- **Semantisk styckesdelning**: Transkriptet delas nu upp i meningsfulla stycken istället för råa Whisper-segment. En lokal AI-modell (Gemma4:26b, som kör på din Mac) läser transkriptet och hittar naturliga brytpunkter — som var ett ämnesskifte sker eller när ett resonemang avslutas. Resultatet är en tidslinje i Obsidian som är faktiskt läsbar, inte en vägg av 3-sekunders meningsfragment.

- **Kapitelavsnitt i tidslinjen**: Om videon har YouTube-kapitel visas de nu som rubriker i Obsidian-filen med en klickbar innehållsförteckning överst. Varje kapitel är ett eget avsnitt. Talarbyte visas bara vid avsnittsbörjan eller när talaren faktiskt byter, inte på varje rad.

- **Klickbara tidskoder per ord**: Varje ord i tidslinjen är nu taggat med sin exakta tidsstämpel i millisekunder. Det lägger grunden för att klicka på ett ord och hoppa till rätt ögonblick i videon (den funktionen kommer i en framtida session).

- **`aurora:delete` — ta bort noder utan SQL**: Nytt CLI-kommando: `pnpm neuron aurora:delete <nodeId>`. Raderar en nod och alla dess korsreferenser i en operation. Behövdes för att re-ingestera videor utan att behöva öppna databasen manuellt.

- **Pyannote-kraschen är fixad**: I sessions 18-19 kraschade talaridentifieringen (`pyannote`) med ett felmeddelande om `AudioDecoder` på nyare Python. Det berodde på ett versionskonflikts-problem (torchcodec 0.10.0 mot torch 2.11.0). Lösningen är en tre-stegsfix: Python-koden konverterar nu ljud till WAV via ffmpeg och läser det med `soundfile` istället, TypeScript-koden fångar kraschar och fortsätter med tomma talardata, och beroendekontrollfilen varnar om inkompatibla versioner.

- **Uppgradering till Gemma4:26b**: Ersätter Gemma3. En nyare AI-modell (26 miljarder parametrar total, 3.8 miljarder aktiva vid en given tidpunkt tack vare MoE-arkitektur — en teknik som liknar att ha ett expertnätverk där bara relevanta experter aktiveras per fråga). Genererar ~58 tokens per sekund på Apple Silicon. Kräver Ollama version 0.20 eller senare.

## Hur använder jag det?

Exportera som vanligt: `neuron obsidian-export`. Semantisk delning körs automatiskt vid export om Ollama körs lokalt med gemma4:26b.

Ta bort och re-ingestera en video: `pnpm neuron aurora:delete <nodeId>` följt av `pnpm neuron aurora:ingest-video <url>`.

Kontrollera att du har rätt Ollama-version: `ollama --version` (behöver vara 0.20+). Hämta modellen om du inte har den: `ollama pull gemma4:26b`.

## Vad saknas fortfarande?

- Klick-att-spela-funktionen för tidskodade ord är inte byggd än — taggarna finns, men ingen länkning till mediaspelaren.
- Speaker guesser prompt-tuning (kvarstår sedan session 17). Teknisk YouTubers som IBM Technology returnerar fortfarande generiska talarnamn.
- Daemon-verifiering (kvarstår sedan session 17). Installeras korrekt men inte testat under verkliga förhållanden.
- Om ingen YouTube-kapiteldata finns skapas inga kapitelrubriker. LLM-genererade kapitelrubriker från transkriptets innehåll är nästa steg.
