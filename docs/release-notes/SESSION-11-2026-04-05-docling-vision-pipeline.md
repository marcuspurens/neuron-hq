---
session: 11
datum: 2026-04-05
tags: [release-note, pdf, docling, vision, pipeline]
---

# Session 11 — Docling + Vision: Ny PDF-pipeline

## Vad är nytt?

- **Docling ersätter pypdfium2 som PDF-motor.** Docling (IBM:s dokumentanalysbibliotek, v2.84.0) ger strukturerad markdown med rubriker, tabeller och layoutförståelse — inte bara platt text. 53 sidor processas på ~38 sekunder. Den hittar 15 tabeller i Ungdomsbarometern som pypdfium2 missade helt.

- **Vision-modellen byttes till rätt variant.** Vi körde `qwen3-vl:8b` som i praktiken är thinking-varianten — den "tänker" i det tysta och returnerar tomt svar. Bytet till `qwen3-vl:8b-instruct-q8_0` (9.8 GB, q8-kvantisering) via en egen Modelfile-wrapper med temperatur 0 löste problemet. Vision fungerar nu 100% tillförlitligt.

- **Kombinerad pipeline: Docling + Vision.** Docling hanterar text, rubriker och tabeller. Vision-modellen triggas bara för sidor med diagram/bilder som Docling inte kan läsa. Sida 30 i Ungdomsbarometern: vision extraherade 20 rader × 4 kolumner med procentsatser ur ett stapeldiagram.

## Hur använder jag det?

```bash
# Säkerställ att vision-modellen finns:
ollama list | grep aurora-vision-extract

# Kör diagnose på en PDF-sida:
AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3 npx tsx src/cli.ts aurora:pdf-diagnose "din-fil.pdf" --page 10 --language sv
```

Pipeline-output sparas i `tests/fixtures/pdf-eval/` — öppna `*_pipeline.json` för att se full output, öppna `*.yaml` för att rätta facit.

## Vad saknas fortfarande?

- **Metadata-modellen** (v1-spec med Dublin Core + DoclingDocument + page-understanding) — ska landas i session 12
- **Page-type-klassificerare** — beräknad signal från Docling-element + vision, inte hårdkodad
- **Granskningsverktyg** — Marcus behöver ett enklare sätt att se och rätta pipeline-output sida för sida
