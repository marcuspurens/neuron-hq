# HANDOFF-2026-04-04 — OpenCode Session 10: PageDigest + Vision Prompt Overhaul

> **Datum**: 2026-04-04
> **Föregående**: Session 9 (Obsidian tvåvägs-metadata)
> **Nästa**: Session 11 (Facit-driven PDF eval loop)

---

## Levererat

### 1. PageDigest interface + ingestPdfRich refaktor

Ny `PageDigest` interface i `src/aurora/ocr.ts` — per-sida diagnostisk data som sparas i node properties:

```typescript
export interface PageDigest {
  page: number; // 1-indexed
  textExtraction: {
    method: 'pypdfium2' | 'ocr' | 'none';
    text: string;
    charCount: number;
    garbled: boolean;
  };
  ocrFallback: {
    triggered: boolean;
    text: string | null;
    charCount: number | null;
  } | null;
  vision: {
    model: string;
    description: string;
    textOnly: boolean;
    tokensEstimate: number;
  } | null;
  combinedText: string;
  combinedCharCount: number;
}
```

`ingestPdfRich()` bygger nu `PageDigest[]` per sida. Varje digest sparas i node properties via `processExtractedText()` metadata. `RichPdfResult` utökad med `pageDigests`.

`truncateDigestText()` — helper som capar text till 2000 chars per fält (förhindrar enorma node properties).

### 2. diagnosePdfPage() + CLI

`diagnosePdfPage(filePath, page, options)` — kör pipelinen på en enda sida utan ingest/chunks/embeddings. Returnerar `PageDigest`.

CLI: `aurora:pdf-diagnose <path> --page <N> [--language <lang>] [--dpi <dpi>]`

### 3. Obsidian export: Pipeline-detaljer

`buildPageDigestSection()` i `src/commands/obsidian-export.ts` — renderar en kollapsbar Obsidian callout-tabell:

```markdown
> [!info]- Pipeline-detaljer per sida
> | Sida | Text-metod | Tecken | Garbled | OCR | Vision-modell | Vision |
> |------|-----------|--------|---------|-----|--------------|--------|
> | 1 | pypdfium2 | 1847 | nej | — | qwen3-vl:8b | Table with... |
```

### 4. Vision prompt-overhaul (STOR FIX)

**Problem**: `analyzeImage()` använde `/api/generate` (Ollama) utan system message, med vag prompt. qwen3-vl:8b med thinking mode producerade enorm chain-of-thought + timeout/tom output.

**Fix — tre delar:**

1. **API-byte**: `/api/generate` → `/api/chat` med `system` + `user` roles
2. **System message**: `VISION_SYSTEM_MESSAGE` — regler för exakthet, språk, inga gissningar
3. **Ollama-parametrar**: `think: false` + `options: { num_predict: 800 }`

**Problem 2**: `ensureOllama()` blockerade — Promise-gate + modell-pull slukade timeout-budget.

**Fix**: `isVisionAvailable()` bytt från `ensureOllama(model)` till `isModelAvailable(model)` (enkel ping utan pull).

**Resultat**: ~30 sekunder per sida istället för timeout. Strukturerad output.

**PDF-prompt omskriven:**

```
Analyze this PDF page.

If the page contains ONLY plain text with no visual elements, respond with exactly: TEXT_ONLY

Otherwise, describe the visual content:
1. PAGE TYPE: table / bar chart / line chart / pie chart / diagram / infographic / mixed
2. TITLE: The heading or title of this page, exactly as shown.
3. DATA: List ALL numbers, percentages, and labels visible.
4. KEY FINDING: One sentence summarizing the main takeaway.
5. LANGUAGE: The language used in the document.
```

**DEFAULT_PROMPT (bild) omskriven** med 5-punkts struktur: LAYOUT, TEXT, DATA, STRUCTURE, CONTEXT.

### 5. Release notes-system

- `AGENTS.md` sektion 15: Release notes-instruktion (tre varianter: Marcus, LLM, Dev)
- 21 filer i `docs/release-notes/` — retroaktiva notes för session 1-10 (Marcus + LLM)
- Kopierade till Obsidian `Neuron Lab/Release Notes/`

### 6. Pre-existing test fix

`tests/aurora/ocr.test.ts` — `ingestImage` test uppdaterad att förvänta provenance-metadata (session 9 rest).

---

## Filer ändrade

| Fil                                      | Ändring                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/aurora/ocr.ts`                      | +PageDigest, refaktorerad ingestPdfRich(), +diagnosePdfPage(), +truncateDigestText(), ny PDF_VISION_PROMPT |
| `src/aurora/vision.ts`                   | /api/chat, VISION_SYSTEM_MESSAGE, think:false, num_predict:800, isModelAvailable istf ensureOllama         |
| `src/cli.ts`                             | +aurora:pdf-diagnose kommando                                                                              |
| `src/commands/obsidian-export.ts`        | +PageDigestData, +buildPageDigestSection(), pipeline-tabell i export                                       |
| `tests/aurora/ocr.test.ts`               | +5 nya tester (3 ingestPdfRich, 2 diagnosePdfPage), +1 fix, +vision mock                                   |
| `tests/commands/obsidian-export.test.ts` | +2 nya tester (PageDigest tabell)                                                                          |
| `AGENTS.md`                              | +sektion 15: Release Notes                                                                                 |
| `docs/release-notes/*`                   | 21 nya filer (retroaktiva + session 10)                                                                    |

## Verifiering

```
pnpm typecheck: clean
tests/aurora/ocr.test.ts: 21/21 pass
tests/commands/obsidian-export.test.ts: 21/21 pass
E2E: Ungdomsbarometern sid 10+30, qwen3-vl:8b, ~30s/sida
```

---

## Session 11 — Plan: Facit-driven PDF Eval Loop

Se: `docs/plans/PLAN-pdf-eval-loop-2026-04-04.md`

**Koncept**: Marcus skapar facit per PDF-sida (vad borde pipelinen hittat?). Pipelinen körs, jämförs mot facit, scorer beräknas. Prompts itereras tills scorer förbättras.

---

## Öppna items

1. **Cold start timeout**: Första vision-anropet efter Ollama-omstart tar >120s (modell-laddning). `num_predict` cap hjälper men cold start är fortfarande ett problem.
2. **Garbled-detektering per sida**: `isTextGarbled()` körs på hela dokumentet, inte per sida. Per-sida kräver pålitlig page-splitting.
3. **Text-splitting**: `\n{2,}` mappar inte 1:1 till PDF-sidor. Pypdfium2 producerar inte alltid dubbla newlines mellan sidor.
4. **Roadmap rewrite**: `docs/ROADMAP.md` är stale (flaggat sedan session 7).
