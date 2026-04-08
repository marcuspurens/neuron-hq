# PLAN: Facit-driven PDF Eval Loop

**Session**: 11
**Datum**: 2026-04-04
**Mål**: Bygg ett utvärderingssystem där Marcus skapar facit per PDF-sida, pipelinen körs och jämförs automatiskt, och prompts kan itereras tills kvaliteten förbättras.

---

## Bakgrund

Session 10 levererade `diagnosePdfPage()` som visar exakt vad varje pipeline-steg producerar. Men bedömningen om resultatet är _bra_ görs manuellt. Marcus vill kunna:

1. Skapa facit: "Sida 30 innehåller ett stapeldiagram med 7 kategorier, dessa procentsatser, på svenska"
2. Köra pipelinen automatiskt
3. Få en score: "Vision-steg hittade 5/7 kategorier, 80% av procentsatserna korrekta"
4. Ändra prompten, köra igen, se om scoren förbättras

---

## WP1: Facit-format (YAML)

Skapa `tests/fixtures/pdf-eval/` med facitfiler per PDF+sida:

```yaml
# tests/fixtures/pdf-eval/ungdomsbarometern-p30.yaml
source: '© Ungdomsbarometern - Arbetsliv 2025 - SVT.pdf'
page: 30
language: sv

text_extraction:
  should_contain:
    - 'leda andra'
    - 'Skalfråga'
  min_chars: 500
  garbled: false

vision:
  page_type: 'bar chart'
  title_contains: 'ställer sig unga'
  data_points:
    - label: 'Med att leda andra'
      values: ['11%', '56%']
    - label: 'Med teknik'
  language: sv
  should_not_contain:
    - 'I cannot'
    - 'unclear'
```

**Effort**: 30 min (Marcus skapar 3-5 facit-sidor från Ungdomsbarometern)

## WP2: Eval Runner

Ny fil `src/aurora/pdf-eval.ts`:

```typescript
export interface EvalResult {
  page: number;
  textScore: number; // 0.0-1.0
  visionScore: number; // 0.0-1.0
  combinedScore: number; // weighted average
  details: {
    textContains: { expected: string; found: boolean }[];
    visionType: { expected: string; actual: string; match: boolean };
    dataPoints: { label: string; expected: string[]; found: string[]; accuracy: number }[];
  };
}

export async function evalPdfPage(pdfPath: string, facitPath: string): Promise<EvalResult>;
```

Funktionen:

1. Läser facit-YAML
2. Kör `diagnosePdfPage()` på angiven sida
3. Jämför resultat mot facit
4. Returnerar scores + detaljer

**Effort**: 1-2 timmar

## WP3: CLI-kommando

```bash
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/ungdomsbarometern-p30.yaml
pnpm neuron aurora:pdf-eval tests/fixtures/pdf-eval/   # kör alla facitfiler
```

Output:

```
📊 Eval: Ungdomsbarometern sid 30
   Text:   0.85 (17/20 expected strings found)
   Vision: 0.70 (page_type: ✓, title: ✓, data: 5/7)
   Combined: 0.78

📊 Eval: Ungdomsbarometern sid 10
   Text:   0.90
   Vision: 0.60
   Combined: 0.75

━━━━━━━━━━━━━━━━━━━━━━━
Average: 0.77 (2 pages)
```

**Effort**: 30 min

## WP4: Prompt Iteration Workflow

CLI-stöd för att jämföra prompts:

```bash
pnpm neuron aurora:pdf-eval-compare \
  --facit tests/fixtures/pdf-eval/ \
  --prompt-a "current" \
  --prompt-b "src/aurora/prompts/pdf-vision-v2.txt"
```

Output:

```
Prompt A (current):  avg 0.77
Prompt B (v2):       avg 0.84 (+0.07)
  Vision improved on 3/5 pages
  Vision degraded on 0/5 pages
```

**Effort**: 1 timme

---

## Sekvens

```
WP1 (facit) → WP2 (eval runner) → WP3 (CLI) → WP4 (prompt comparison)
```

WP1 kräver Marcus input (skapa facit). WP2-4 är ren implementation.

## Marcus förbereder innan session 11

1. Välj 3-5 sidor ur Ungdomsbarometern med varierat innehåll:
   - En sida med bara text
   - En sida med stapeldiagram
   - En sida med tabell
   - En sida med cirkeldiagram eller infographic
2. Skriv facit i YAML-format (se WP1 ovan) eller beskriv fritt vad varje sida innehåller — agenten kan omvandla till YAML.

## Risker

| Risk                                    | Åtgärd                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Cold start timeout (>120s)              | Pre-ladda qwen3-vl vid session-start                                     |
| Facit-format för strikt                 | Börja med `should_contain` (substring match), lägg till exakthet gradvis |
| Vision-output varierar mellan körningar | Kör eval 3 gånger, ta median-score                                       |
