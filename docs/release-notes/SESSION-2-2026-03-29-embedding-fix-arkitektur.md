---
session: 2
datum: 2026-03-29
tags: [release-note, bugfix, dokumentation, arkitektur]
---

# Session 2 — Embedding-bugg fixad + arkitekturdokumentation

## Vad är nytt?

- **Embedding-buggen som bröt indexering av längre texter är fixad.** Aurora använder en AI-modell som heter `snowflake-arctic-embed` (körs lokalt via Ollama) för att omvandla text till sökbara vektorer. Modellen klarar max 512 "tokens" (orddelar). Problemet: systemet skickade upp till 2000 tecken — och svensk text tar _fler_ tokens per tecken än engelska (ÅÄÖ, sammansatta ord). Resultatet var att svensk text ofta sprängde 512-gränsen och Ollama svarade med HTTP 400. Fixat genom att sänka maxgränsen till 1500 tecken och lägga till progressiv trunkering som krymper texten steg för steg om den fortfarande är för lång. Dessutom faller systemet nu tillbaka till individuella anrop om en hel batch misslyckas, istället för att kasta hela gruppen.

- **Arkitekturdokumentation i tre versioner.** En komplett kartläggning av alla 38 filer i Aurora-systemet — dataflöden, databas-schema, hur allt hänger ihop. Finns i tre versioner: en för dig (svensk prosa, beslutsbakgrund), en för en ny utvecklare (onboarding-guide med setup-steg), och en för AI-agenter (modulkartor och filreferenser). Alla tre nås via en indexfil.

- **Gemma 3 installerad för transkript-polering.** Gemma 3 är en lokal AI-modell (3.3 GB, körs i Ollama). Den används i "polish"-steget efter att Whisper transkriberat en video — den rättar stavfel, fixar namn som Whisper hörde fel, och förbättrar interpunktion. Var inte installerad förut, så polish-steget kraschade tyst. Nu fungerar det.

## Hur använder jag det?

Embedding-fixen är automatisk — alla nya indexeringar använder den.

Arkitekturdokumentation:

```
docs/ARKITEKTUR-AURORA.md                    — indexfil med länkar till alla tre
docs/ARKITEKTUR-AURORA-MARCUS-2026-03-29.md  — din version (beslut, bakgrund)
docs/ARKITEKTUR-AURORA-DEV-2026-03-29.md     — utvecklarversion (setup, konventioner)
```

Transkript-polering körs automatiskt vid video-ingest. Testa manuellt:

```
pnpm neuron aurora:polish <nodeId>
```

## Vad saknas fortfarande?

- PDF-ingest otestat end-to-end. Textextraktion finns men ingen har kört det med en riktig PDF.
- En Aurora-nod (vid-4fc93ffbb1cd) har specialtecken som fortfarande ger embedding-fel — behöver debuggas separat.
- Dubbla filer (`crossref.ts` och `cross-ref.ts`) gör samma sak — teknisk skuld som bör städas.
