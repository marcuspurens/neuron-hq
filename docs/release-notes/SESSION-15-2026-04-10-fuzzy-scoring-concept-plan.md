---
session: 15
datum: 2026-04-10
tags: [release-note, pdf-eval, fuzzy-matching, knowledge-management]
---

# Session 15 — Smartare poängsättning & Plan för kunskapsartiklar

## Vad är nytt?

- **Sidklassificering sparas nu i grafen.** Förra sessionen kopplades klassificeraren in i pipelinen, men resultatet (sidtyp, diagramtyp, datapunkter) försvann efter körningen. Nu lagras `pages`-arrayen direkt på dokumentnoden i databasen. Det betyder att du kan se vad Aurora "tyckte" om varje sida även i efterhand.

- **Smartare poängsättning i utvärderingsverktyget.** Tidigare matchade eval-verktyget strängar exakt — "61%" hittades bara om vision-modellen skrev exakt "61%". Nu hanteras variationer: "61 %" (mellanslag), "61,0%" (svenskt decimalkomma), "0.61" (decimalform), och "61" (utan procent). Dessutom normaliseras text så att streck-varianter (–/—/-), citattecken och understreck/mellanslag behandlas lika. Det gör mätningarna mer rättvisa och redo för promptjämförelser.

- **Plan för kunskapsartiklar.** En djupanalys av Joel Rangsjös kunskapssystem (inspirerat av Karpathys "LLM Knowledge Bases") jämfördes med Auroras graf-approach. Slutsats: Aurora saknar *läsbara sammanfattningar* — den har kunskap men producerar ingen text man kan bläddra i. En plan med 5 arbetspaket (10-14 timmar) finns nu för att bygga "kompilerade koncept-artiklar" — syntetiserade sammanfattningar per ämne som uppdateras automatiskt vid ny ingest.

## Hur använder jag det?

```bash
# Sidklassificering — automatisk, inget att göra
# result.pages[N].understanding.pageType ger sidtypen

# Eval med fuzzy scoring — samma kommandon, bättre resultat
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/ungdomsbarometern-p10.yaml

# Promptjämförelse (redo för P3)
pnpm neuron aurora:pdf-eval-compare \
  --facit tests/fixtures/pdf-eval/ \
  --prompt-a current \
  --prompt-b path/to/ny-prompt.txt
```

## Vad saknas fortfarande?

- **Vision prompt v2** — eval-verktyget är redo, men själva promptförbättringen kräver en interaktiv session
- **Koncept-artiklarna** — planerade, inte byggda ännu
- JSON-LD-export av AuroraDocument
