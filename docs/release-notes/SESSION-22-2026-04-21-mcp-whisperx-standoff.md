---
session: 22
datum: 2026-04-21
tags: [release-note, aurora, mcp, whisperx, obsidian, standoff-annotation]
---

# Session 22 — MCP-arkitektur, WhisperX och ren text i Obsidian

## Vad är nytt?

- **Transkription som faktiskt fungerar.** Whisper-motorn har bytts från faster-whisper (CPU, 30 min timeout, obegriplig text) till WhisperX via en ny Python MCP-server. Pi-videon (Mario Zechner, 27 minuter) transkriberades felfritt: "Hi, my name is Mario. I hail from the land of Arnold Schwarzenegger..." — jämfört med session 21:s "tragedy in to a bunch of that a". Modellen laddar en gång och hålls varm mellan anrop.

- **Ren text i Obsidian — ingen kod synlig.** Tidslinjen har gått från HTML-spans (`<span data-t="2636">Hi,</span>`) till ren markdown. Tidskoder är klickbara YouTube-länkar som hoppar till rätt sekund. All per-ord-metadata (tid, talare, källa, confidence) sparas i en separat `.words.json`-fil bredvid `.md`-filen — 4564 ord med full provenance, utan att störa läsningen.

- **AI gissar talarnamn automatiskt.** Vid ingest analyserar LLM videotitel och beskrivning och fyller i talarnamn. SPEAKER_01 blir "Mario Zechner" automatiskt (du kan ändra i Obsidian).

## Hur använder jag det?

Indexera en ny video som vanligt via MCP-toolen `aurora_ingest_video`. Transkription + speaker-gissning + Obsidian-export sker automatiskt.

För att se resultatet i Obsidian: öppna `Aurora/Video/` — filen har ren läsbar text med klickbara tidskoder. Sidecar-filen (`.words.json`) ligger bredvid för programmatisk åtkomst.

## Vad saknas fortfarande?

- **Diarization** (vem pratar när) fungerar inte ännu via WhisperX — pyannote-wrappern i WhisperX behöver fixas. Pyannote fungerar separat.
- **GPU (MPS)** — WhisperX ASR kör på CPU (CTranslate2 stödjer inte Apple MPS). Alignment och diarization kör på MPS. Full MPS-acceleration kräver MLX-backend.
- **Daemon** triggar fortfarande dubbelt (export skriver till Aurora/ som daemonen bevakar), men exporten är nu idempotent — inga onödiga omskrivningar.
