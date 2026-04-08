---
session: 1
datum: 2026-03-29
tags: [release-note, aurora, pipeline, bugfix, youtube]
---

# Session 1 — Aurora fungerar end-to-end

Första sessionen med OpenCode + LiteLLM (ersätter VS Code + Opus). Fokus: bevisa att Aurora-pipelinen fungerar från URL till sökbart svar.

## Vad är nytt?

- **URL-indexering fungerar.** Du kan ge Aurora en webbadress — systemet hämtar sidan med Trafilatura (ett Python-bibliotek som extraherar artikeltext och ignorerar menyer/reklam), delar upp texten i chunks (delar om ~200 ord), genererar sökbara vektorer via Ollama (`snowflake-arctic-embed`), och sparar allt i PostgreSQL. Testat med en RAG-artikel — sökbar med citatreferenser efteråt.

- **YouTube-indexering fungerar.** En YouTube-länk laddas ner med yt-dlp, ljudet transkriberas med OpenAI Whisper (körs lokalt, modellen "small"), texten delas i chunks och indexeras. Testat med 3Blue1Brown "But what is a neural network?" — 19 minuter, 3370 ord, 21 chunks. Allt sökbart.

- **Embedding-bugg hittad och delvis fixad.** Aurora omvandlar text till vektorer (embeddings) genom att skicka den till en AI-modell i Ollama. Koden skickade hela JSON-objektet med all metadata — tusentals tecken — istället för bara texten. Modellen klarar max 512 tokens, så den kraschade på alla längre dokument med HTTP 400. Fixat genom att bara skicka den faktiska texten och trunkera till 2000 tecken. Dessutom faller batch-anrop nu tillbaka till individuella anrop om en batch misslyckas. (Kvarstår: 2000 tecken är fortfarande för högt för svensk text — fixas i session 2.)

- **YouTube temp-dir bugg fixad.** Python-koden som laddar ner video använde `TemporaryDirectory` som automatiskt raderar sig själv. Ljudfilen försvann innan transkriberingen hann läsa den. Bytte till `mkdtemp` (persistent) — TypeScript-sidan städar upp efteråt.

## Hur använder jag det?

```bash
pnpm neuron aurora:ingest https://example.com/article
pnpm neuron aurora:ingest-video https://youtube.com/watch?v=...
pnpm neuron aurora:ask "Vad vet jag om neurala nätverk?"
```

`aurora:ask` söker i kunskapsbasen och returnerar ett svar med citatreferenser till källnoderna.

## Vad saknas fortfarande?

- PDF-ingest otestat (textextraktion finns men ingen har kört det med en riktig fil).
- En nod (vid-4fc93ffbb1cd) har specialtecken som fortfarande ger embedding-fel.
- Morgonbriefing otestad.
- Gemma 3 (modellen för transkript-polering) inte installerad.
- `AURORA_PYTHON_PATH` inte satt i `.env` — kräver manuell export varje session.
