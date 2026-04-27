---
session: 23
datum: 2026-04-27
tags: [release-note, whisper, mcp, entity-extraction, documentation]
---

# Session 23 — Whisper blev styrbart och fick ett minne

## Vad är nytt?

- **Tre nya parametrar för transkribering.** Du kan nu styra kvalitet (`compute_type`), sökbredd (`beam_size`) och ge domänspecifika ledtrådar (`initial_prompt`) direkt i prompten. Standardinställningen är maximal kvalitet (float32). Att berätta vilka namn och termer som förekommer i en inspelning förbättrar stavningen dramatiskt — "Imob manager" blir "ImobMgr", "Marcus Perens" blir "Marcus Purens".

- **Nytt verktyg: automatisk termigenkänning.** Ett nytt MCP-tool (`extract_entities`) använder Gemma 4 lokalt för att plocka ut egennamn och tekniska termer ur en grov transkribering. Dessa matas sedan tillbaka som ledtrådar för en högkvalitativ omtranskribering. Användaren behöver inte ange termerna manuellt — systemet kan ta reda på det själv.

- **Fyra dokumentationsvarianter.** Hur transkriberingen fungerar finns nu dokumenterat för LLM:er (parameterval), utvecklare (arkitektur), användare (prompt-exempel på svenska), och workshop-deltagare (metaforen hjärna/nervsystem/händer utan teknisk jargong).

## Hur använder jag det?

Säg bara vad inspelningen handlar om:

> "Transkribera filen. Det handlar om AUTOSAR. Termer: ImobMgr, SecOC, ECU."

Eller låt systemet ta reda på det:

> "Transkribera med bästa möjliga kvalitet"

## Vad saknas fortfarande?

- `extract_entities` är inte testat mot Ollama med riktigt material ännu.
- Tvåstegs-pipelinen (draft → entities → full) är inte automatiserad som en skill — kräver att LLM:en orkestrerar manuellt.
- En bredare skills-refactoring identifierades: 16 filer har hardkodad LLM-logik som borde vara editerbara `.md`-filer. Plan finns i handoff.
