---
session: 10
datum: 2026-04-03
---

# Session 10 — Dev Notes

## Ändringar

| Fil                                      | Ändring                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/aurora/ocr.ts`                      | Ny `PageDigest` interface (exported). `ingestPdfRich()` bygger `PageDigest[]` per sida och skickar med i metadata. Ny `diagnosePdfPage()` kör pipeline på en sida utan ingest. `truncateDigestText()` helper (max 2000 chars). |
| `src/cli.ts`                             | Nytt kommando `aurora:pdf-diagnose <path> --page <N>` med lazy import.                                                                                                                                                         |
| `src/commands/obsidian-export.ts`        | Ny `PageDigestData` interface + `buildPageDigestSection()` renderar Obsidian callout-tabell. Anropas i standard (icke-video) export-path.                                                                                      |
| `tests/aurora/ocr.test.ts`               | +5 nya tester: 3 `ingestPdfRich` PageDigest, 2 `diagnosePdfPage`. Fixat pre-existing provenance-test. Mock för `vision.js` tillagd.                                                                                            |
| `tests/commands/obsidian-export.test.ts` | +2 nya tester: PageDigest-tabell renderas / utelämnas korrekt.                                                                                                                                                                 |

## Beslut och tradeoffs

| Beslut                                                    | Motivering                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `garbled` flagga propageras per-dokument, inte per-sida   | `isTextGarbled()` körs på hela texten. Per-sida kräver pålitlig page-splitting som inte finns ännu. Acceptabel approximation. |
| `truncateDigestText()` max 2000 chars                     | Förhindrar att stora PageDigest-arrayer spränger node properties i Postgres. Plan-risken med låg sannolikhet.                 |
| `ocrText` sparas separat från `extractedText`             | Behövs för att kunna visa OCR-fallback-data per sida i digest, medan `extractedText` skrivs över vid OCR.                     |
| `visionModels[]` array parallell med `pageDescriptions[]` | `analyzeImage` returnerar `modelUsed` — vi fångar den nu per sida istället för att anta samma modell överallt.                |
| Pipe-char i vision-description escaped till `∣`           | Markdown-tabeller går sönder av `                                                                                             | ` i cellinnehåll. |

## Testdelta

- `tests/aurora/ocr.test.ts`: 16 → 21 (+5 nya, 1 pre-existing fix)
- `tests/commands/obsidian-export.test.ts`: 19 → 21 (+2 nya)
- `pnpm typecheck`: clean

## Kända risker

- Text-splitting med `\n{2,}` mappar inte 1:1 till PDF-sidor. Pypdfium2 producerar inte alltid dubbla newlines mellan sidor. PageDigest-page kan ha text från "fel" sida.
- `diagnosePdfPage()` extraherar hela PDF:en och splitar — ineffektivt för stora PDFs. Framtida optimering: per-page extraction via worker.
- Vision-timeout i `diagnosePdfPage()` ärvs från Ollama default — kan vara lång för stora bilder.

## LLM-handoff

Se: [HANDOFF-2026-04-03T1900](../handoffs/HANDOFF-2026-04-03T1900-opencode-session9-obsidian-twoway-metadata.md) (session 9 handoff, session 10 plan beskrivs i slutet).
