---
session: 25
datum: 2026-04-28
tags: [release-note, skill, transkribering, whisperx, ollama, bugfix]
---

# Session 25 — Transkribera-skill och Gemma4-fix

## Vad är nytt?

- **Ny skill: tvåstegs-transkribering.** Systemet kan nu automatiskt göra en snabb första transkribering, använda en AI-modell (Gemma 4) för att plocka ut alla egennamn och facktermer ur utkastet, och sedan köra en andra transkribering av hög kvalitet där Whisper vet hur alla namn stavas. Istället för "Marcus Perens" och "seco-skyddat" får du "Marcus Purens" och "SecOC-skyddat". Du kan även granska och korrigera termerna innan den slutgiltiga transkriberingen körs.

- **Buggfix: entitetsextraktionen fungerar nu.** `extract_entities`-verktyget (från session 23) testades för första gången mot en riktig Ollama-instans — och kraschade. Gemma 4 fastnade i en oändlig loop och producerade korrupt data. Problemet var att modellens "tänkläge" (thinking mode) åt upp hela svarsbudgeten internt. Vi stängde av tänkläget för just denna uppgift och satte ett tak på svarslängden. Nu extraheras 10–28 termer rent och korrekt på under en minut.

- **Städning: en oanvänd variabel borttagen.** En kodsnutt i videofilen (`videoDesc`) som deklarerades men aldrig användes har tagits bort. Liten ändring, men testerna och typkontrollerna är nu helt rena.

## Hur använder jag det?

Transkribera-skillen aktiveras automatiskt av AI-agenten när du ber om en transkribering. Du behöver inte göra något speciellt — agenten läser skillfilen och följer stegen. Om du vill granska den: `.claude/skills/transkribera/SKILL.md`.

## Vad saknas fortfarande?

- Tvåstegs-pipelinen har inte testats end-to-end på en riktig video ännu. Varje del är verifierad separat (Whisper, entity extraction, initial_prompt), men den fulla kedjan behöver köras och jämföras med en enstegs-transkribering.
- Gränsen på 224 tecken för `initial_prompt` (antalet tecken Whisper accepterar som ledtråd) är uppskattad men inte verifierad mot WhisperX:s källkod.
