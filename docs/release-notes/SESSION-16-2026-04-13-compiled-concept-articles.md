---
session: 16
datum: 2026-04-13
tags: [release-note, koncept-artiklar, kunskapsgraf, compilation]
---

# Session 16 — Kompilerade koncept-artiklar

## Vad är nytt?

- **Aurora kan nu sammanfatta allt den vet om ett ämne till en läsbar artikel.** Funktionen `compile_concept` tar ett koncept (t.ex. "AI" eller "Machine Learning"), samlar alla kopplade artiklar, fakta och kunskapsluckor från grafen, och ber en LLM skriva en sammanhängande sammanfattning. Artikeln markerar tydligt vad som är säkert (flera källor), vad som är osäkert (en källa), och vad vi inte vet. Artikeln cachas — nästa gång behövs inget LLM-anrop.

- **Kunskapsgrafen växer automatiskt vid ingest.** Varje ny URL eller PDF som indexeras får nu sina koncept extraherade av en lokal LLM (Ollama). Koncepten skapas med rätt kategori (ämne, person, metod, verktyg) och hierarki ("Machine Learning" under "AI"). Förut kopplades dokument bara till platta nyckelord.

- **Svar kan sparas som artiklar.** `aurora_ask` har en ny `save_as_article`-flagga. När du ställer en fråga och får ett bra svar kan det sparas direkt i kunskapsbiblioteket — inklusive konceptkoppling. Kunskapen återanvänds vid framtida frågor utan nytt LLM-anrop.

## Hur använder jag det?

```
# Kompilera allt Aurora vet om ett koncept
neuron_knowledge_library action=compile_concept conceptName="AI"

# Läs den kompilerade artikeln (gratis, ingen LLM)
neuron_knowledge_library action=concept_article conceptName="AI"

# Se vilka koncept som finns och deras status
neuron_knowledge_library action=concept_index

# Spara ett bra svar som artikel
aurora_ask question="Vad vet vi om embeddings?" save_as_article=true
```

## Vad saknas fortfarande?

- **Kvaliteten på kompilerade artiklar är oprövad** mot riktiga koncept. Risken finns att de blir platta sammanfattningar. Behöver testas med 3-5 riktiga koncept och iterera prompten — naturlig del av prompt-tuning-spåret.
- **WP4/WP5 bör testas end-to-end** med en riktig Ollama-instans och PDF-ingest.
