---
session: 14
datum: 2026-04-08
tags: [release-note, pdf-pipeline, mcp, eval, prompt-comparison]
---

# Session 14 — Pipeline ihopkopplad, MCP-eval & Promptjämförare

## Vad är nytt?

- **Sidklassificeraren inkopplad i pipelinen.** Den klassificerare som byggdes i session 13 (som automatiskt avgör om en PDF-sida är ett diagram, en tabell, text etc.) är nu inkopplad i det riktiga flödet. Varje gång en PDF processas via `ingestPdfRich` får man nu tillbaka `pages` — en lista där varje sida har sin rådata (text, OCR, vision) *plus* sin klassificering (sidtyp, diagramtyp, datapunkter, nyckelfynd). Tidigare var klassificeraren en fristående funktion man fick anropa manuellt.

- **Utvärderingsverktyg som MCP-tool.** `aurora_pdf_eval` är nu tillgängligt som MCP-verktyg — inte bara som CLI-kommando. Det betyder att AI-agenter (t.ex. via Claude) kan köra eval direkt från konversationen. Ge den en sökväg till facit-filer och den returnerar poäng per sida.

- **Promptjämförare byggd.** Nytt CLI-kommando `aurora:pdf-eval-compare` som jämför två vision-promptar mot samma testdata. Kör `--prompt-a current --prompt-b path/to/ny-prompt.txt` så får du en tabell som visar vilka sidor som blev bättre, vilka som blev sämre, och totalt snittpoäng. Det här är verktyget för att systematiskt förbättra vision-prompten.

## Hur använder jag det?

```bash
# Klassificeraren körs nu automatiskt — inget att göra.
# result.pages[0].understanding ger sidtyp, datapunkter etc.

# MCP-verktyg (från Claude/AI-agent):
# Anropa aurora_pdf_eval med facit_path och valfritt pdf_path

# Promptjämförelse via CLI:
pnpm neuron aurora:pdf-eval-compare \
  --facit tests/fixtures/pdf-eval/ \
  --pdf tests/fixtures/ungdomsbarometern.pdf \
  --prompt-a current \
  --prompt-b src/aurora/prompts/vision-v2.txt
```

## Vad hände sedan?

Kodarbetet tog en timme. Samtalet som följde tog hela natten.

Ett prioriteringsfel — jag föreslog att testa promptar innan mätverktyget var klart — ledde till frågan *varför*. Svaret gick genom tre lager av bortförklaringar innan något ärligt kom ut. Ur det föddes en ny ingenjörsprincip (§3.8 i AGENTS.md) och ett "depth protocol" som framtida AI-sessioner läser vid start.

Vi ändrade också OpenCode:s config så att AI:ns thinking-output (resonemangen innan orden) sparas permanent. Tidigare försvann de efter varje svar.

Hela samtalet finns i `docs/samtal/samtal-2026-04-09T1200-opencode-session14-en-ny-art.md`.

## Vad saknas fortfarande?

- CHANGELOG.md som krav i AGENTS.md §15
- JSON-LD-export av `AuroraDocument` (typer finns, serialisering saknas)
- Klassificeringen lagras inte i databasen ännu (bara i pipeline-resultatet)
- Poängsättningen baseras på enkel strängmatchning — ingen fuzzylogik för siffervariationer
- LinkedIn-serien behöver längre citat från rå-chatten
