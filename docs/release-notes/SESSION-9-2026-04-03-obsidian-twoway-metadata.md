---
session: 9
datum: 2026-04-03
tags: [release-note, obsidian, metadata, provenance, taggar, talare]
---

# Session 9 — Obsidian tvåvägs-metadata

Session 9 levererade alla 5 arbetspaket från planen som skrevs i session 8. Det var den mest produktiva sessionen hittills mätt i funktioner: metadata flödar nu i båda riktningarna mellan Aurora och Obsidian, varje kunskapsartefakt vet hur den skapades, och du kan korrigera talare i videoinspelningar direkt från Obsidian. Alla 142 tester passerar.

## Vad är nytt?

- **Taggar flödar nu i båda riktningarna.** Tidigare var Obsidian ett fönster du kunde titta in i men inte redigera. Nu kan du lägga till, ta bort eller ändra taggar direkt i en Obsidian-antecknings frontmatter, köra importen, och ändringarna skrivs tillbaka till Aurora-grafen. Det löste också en specifik bugg: taggar som innehåller mellanslag (t.ex. "job displacement") bröt det interna formatet. Nu omsluts sådana taggar automatiskt med citattecken vid export, vilket gör att de tolkas som en fras snarare än två separata taggar.

- **Provenance-spårning på varje kunskapsartefakt.** Från och med nu registrerar Aurora hur varje nod skapades. Tre fält sparas: "källa_typ" beskriver vem som skapade det (System = automatisk pipeline, Person = du manuellt, LLM = en AI-modell), "källa_agent" anger vilket program eller verktyg som utförde arbetet (t.ex. Aurora-pipelinen, Hermes), och "källa_modell" specificerar exakt vilken AI-modell som användes om en sådan var inblandad (t.ex. whisper för transkription av ljud, qwen3-vl för bildanalys av PDF-sidor, paddleocr för OCR). Dessa tre fält visas i Obsidian-frontmatter och kan importeras tillbaka. Det gör att du alltid kan se, för varje faktum i Aurora, varifrån det egentligen kom.

- **Speaker identities med titel och organisation.** Talaridentiteter (de noder som representerar en specifik person i Aurora) kan nu bära mer information: titel (t.ex. "VD", "Forskare", "Journalist") och organisation. Dessa fält exporteras i Obsidian-frontmatter och kan redigeras och importeras tillbaka, precis som taggar.

- **Segment-korrektioner via Obsidian.** När Aurora transkriberar och diariserar en video (dvs. delar upp vem som pratar när) kan det hända att en talare identifieras fel. Nu kan du korrigera det utan att behöva röra terminalerna. Öppna tidslinje-anteckningen för videon i Obsidian, ändra talarnamnets rubrik för ett segment, kör importen, och Aurora flyttar alla diarization-segment (med upp till 5 sekunders tolerans för matchning) till rätt talare i grafen.

## Hur använder jag det?

```bash
# Exportera Aurora till Obsidian med all ny metadata
pnpm neuron obsidian-export

# Redigera taggar, talare eller annan metadata direkt i Obsidian-filerna

# Importera ändringarna tillbaka till Aurora
pnpm neuron obsidian-import
```

Provenance-fälten (källa_typ, källa_agent, källa_modell) fylls i automatiskt vid ingest. Du behöver inte göra något.

## Vad saknas fortfarande?

- PageDigest, möjligheten att se exakt vad PDF-pipelinen gjorde per sida (vilken metod, hur många tecken, om OCR behövdes), är planerat och levereras i session 10.
