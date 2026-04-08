---
session: 13
datum: 2026-04-08
tags: [release-note, schema-org, page-classifier, eval-runner, pdf-pipeline]
---

# Session 13 — Schema.org-typer, Sidklassificerare & Utvärderingsverktyg

## Vad är nytt?

- **Schema.org-metadata implementerat.** Session 12 designade, Session 13 byggde. Det nya typbiblioteket (`src/aurora/types.ts`) definierar `AuroraDocument` — ett metadata-kuvert som följer Schema.org-standarden (samma som Google, Microsoft och OpenAI använder). Varje PDF som processas kan nu beskrivas med titel, författare, publiceringsdatum, språk och nyckelord i ett format som är kompatibelt med JSON-LD export. Paketet `schema-dts` (Googles TypeScript-typer för Schema.org) installerades som utvecklingsberoende.

- **Sidklassificerare byggd.** En ren funktion (`classifyPage`) som automatiskt avgör vad varje PDF-sida innehåller — stapeldiagram, tabell, text, omslag, etc. — utan att göra några nya AI-anrop. Den tolkar visions-outputen som redan finns i pipeline-resultatet och klassar sidtyp, diagramtyp, datapunkter och nyckelfynd. Om vision saknas faller den tillbaka på textbaserade heuristiker (antal tecken, nummertäthet, punktlistor).

- **Utvärderingsverktyg klart.** `aurora:pdf-eval` — ett CLI-kommando som poängsätter pipeline-output mot Marcus facit-YAML-filer. Kör `pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/` för att se hur bra pipelinen presterar på varje sida. Textscore och visions-score visas separat med detaljer om vilka värden som hittades och missades.

## Hur använder jag det?

```bash
# Utvärdera alla facit-filer mot sparad pipeline-output
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/

# Utvärdera en enskild sida
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/ungdomsbarometern-p10.yaml

# Kör live mot en PDF (kräver Python-pipeline)
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/ungdomsbarometern-p10.yaml --pdf tests/fixtures/ungdomsbarometern.pdf

# Rå JSON-output
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/ --json
```

## Vad saknas fortfarande?

- ~~Promptjämförelse~~ — implementerat i Session 14 (`aurora:pdf-eval-compare`)
- ~~Klassificeraren inkopplad i pipeline~~ — implementerat i Session 14 (`ingestPdfRich` returnerar nu `pages: AuroraPageEntry[]`)
- ~~MCP-verktyg för eval~~ — implementerat i Session 14 (`aurora_pdf_eval`)
- ~~Obsidian-kopior av release notes~~ — kopierat i Session 14
