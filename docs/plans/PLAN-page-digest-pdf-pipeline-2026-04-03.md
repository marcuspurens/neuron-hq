# Plan: PageDigest i PDF-ingestpipelinen

**Datum**: 2026-04-03  
**Session**: 10  
**Bakgrund**: Session 9 slutade med insikten att `ingestPdfRich()` producerar rich output men kastar bort steg-för-steg-datan. Man kan inte i efterhand se vad varje pipeline-steg producerade per sida.

---

## Problem

`ingestPdfRich()` (src/aurora/ocr.ts) kör 6 steg per PDF men sparar bara slutresultatet. Om vision tolkar en tabell fel, eller OCR producerar skräp, kan man inte se det utan att köra om hela pipelinen.

Marcus behöver kunna:

1. Se exakt vad pypdfium2 extraherade per sida
2. Se om OCR-fallback triggades (och vad den producerade)
3. Se vad vision-modellen sa om tabeller/diagram
4. Jämföra steg-output för att förstå kvalitet

## Lösning: `PageDigest[]` i node properties

Varje sida i en PDF-ingest producerar ett `PageDigest`-objekt. Alla PageDigest sparas i den färdiga nodens `properties.pageDigests`.

---

## WP1: PageDigest interface + ingestPdfRich refaktor

**Mål**: Varje sida i en PDF producerar en `PageDigest` med all steg-data.

### 1a. Definiera interface i `src/aurora/ocr.ts`

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
    textOnly: boolean; // true om modellen sa TEXT_ONLY
    tokensEstimate: number; // approx baserat på description.length
  } | null;
  combinedText: string; // slutresultatet för denna sida
  combinedCharCount: number;
}
```

### 1b. Refaktorera `ingestPdfRich()` steg-för-steg

Nuvarande kod blandar per-sida och per-dokument logik. Refaktorera till:

1. **Text extraction** → per-sida splitting (redan finns som `textPages = extractedText.split(/\n{2,}/)`)
2. **Garbled check** → redan globalt, men vi behöver veta per sida
3. **OCR fallback** → om garbled, producerar ny `extractedText` — nu sparas den
4. **Vision** → redan per-sida loop, `pageDescriptions[i]` — nu sparas i digest
5. **Combine** → per-sida `richParts` — nu sparas i digest

**Nyckelinsikt**: `isTextGarbled()` körs idag på hela texten. Per-sida garbled-check vore bättre men kräver att vi först splitar texten per sida. Detta är en stretch goal — för WP1 räcker det att hela-dokumentets garbled-status propageras.

### 1c. Spara `pageDigests` i node properties

I steg 6 (`processExtractedText`), lägg till i metadata:

```typescript
const ingestResult = await processExtractedText(
  title,
  combinedText,
  absolutePath,
  {
    source_type: visionUsed ? 'pdf_rich' : 'pdf',
    pageDigests, // ← NY
    // ... rest of metadata
  },
  options ?? {}
);
```

### 1d. Returnera pageDigests i `RichPdfResult`

```typescript
export interface RichPdfResult extends IngestResult {
  pageDescriptions: string[];
  pageDigests: PageDigest[]; // ← NY
  visionUsed: boolean;
  pageCount: number;
}
```

**Filer**: `src/aurora/ocr.ts`  
**Tester**: `tests/aurora/ocr.test.ts` — 3 nya tester:

- PDF med ren text → digest visar pypdfium2, ingen OCR-fallback, vision null/textOnly
- PDF med garbled text → digest visar OCR-fallback triggad
- PDF med vision → digest visar modell + description

---

## WP2: Obsidian-export av PageDigest

**Mål**: Visa steg-data i Obsidian så Marcus kan inspektera per sida.

### 2a. Exportera i `formatFrontmatter`

Om `props.pageDigests` finns och `props.source_type` börjar med `pdf`:

```yaml
---
id: doc_abc123
typ: document
källa_typ: ocr
sidor: 16
---
```

### 2b. Exportera som sektion efter huvudinnehållet

Ny sektion `## Pipeline-detaljer` (kollapsad med Obsidian callout):

```markdown
> [!info]- Pipeline-detaljer per sida
> | Sida | Text-metod | Tecken | Garbled | OCR | Vision-modell | Vision |
> |------|-----------|--------|---------|-----|---------------|--------|
> | 1 | pypdfium2 | 1847 | nej | — | qwen3-vl:8b | Tabell med 3 kolumner... |
> | 2 | pypdfium2 | 2103 | nej | — | — | TEXT_ONLY |
```

**Filer**: `src/commands/obsidian-export.ts`  
**Tester**: `tests/commands/obsidian-export.test.ts` — 1 nytt test:

- Node med pageDigests → export innehåller Pipeline-detaljer-tabell

---

## WP3: CLI-kommando `aurora pdf-diagnose`

**Mål**: Snabbt diagnostik-kommando som kör pipelinen på en enda sida och printar all steg-data.

### 3a. Ny funktion `diagnosePdfPage()` i `src/aurora/ocr.ts`

```typescript
export async function diagnosePdfPage(
  filePath: string,
  page: number, // 1-indexed
  options?: { language?: string; dpi?: number }
): Promise<PageDigest>;
```

Kör bara:

1. Renderar en sida
2. Extraherar text (pypdfium2) för den sidan
3. Kör OCR om garbled
4. Kör vision
5. Returnerar PageDigest

Ingen Aurora-ingest, inga chunks, inga embeddings. Bara diagnostik.

### 3b. CLI-kommando i `src/cli.ts`

```
neuron aurora pdf-diagnose <path> --page <N>
```

Printar PageDigest som färgad terminal-output:

```
📄 Page 30 of 48

📝 Text extraction (pypdfium2):
   1847 chars, garbled: false
   ────────────────────────────
   © Ungdomsbarometern 2025
   Tabell: Arbetsgivare...
   ────────────────────────────

🔍 OCR fallback: not triggered

👁️ Vision (qwen3-vl:8b):
   "Table with 3 columns: Rank, Employer, Score..."

📦 Combined (1847 chars):
   [Page 30]
   © Ungdomsbarometern 2025
   ...
```

**Filer**: `src/aurora/ocr.ts` (diagnosePdfPage), `src/cli.ts` (kommando)  
**Tester**: Enkel test att `diagnosePdfPage` returnerar korrekt PageDigest-struktur

---

## WP4: Testa med Ungdomsbarometern sid 30

**Mål**: Verifiera att pipelinen hanterar en tabell-heavy PDF-sida korrekt.

### 4a. Kör `neuron aurora pdf-diagnose`

```bash
neuron aurora pdf-diagnose "~/Downloads/© Ungdomsbarometern - Arbetsliv 2025 - SVT.pdf" --page 30
```

### 4b. Dokumentera resultat

Spara output i `docs/research/pdf-diagnose-ungdomsbarometern-sid30.md`:

- Vad pypdfium2 extraherade
- Vad OCR producerade (om triggad)
- Vad vision-modellen tolkade
- Kvalitetsbedömning: klarade pipelinen tabellen?

---

## Ordning

1. **WP1** (PageDigest + refaktor) — störst, kärnan
2. **WP3** (pdf-diagnose CLI) — snabb att bygga ovanpå WP1
3. **WP4** (testa med Ungdomsbarometern) — verifiering
4. **WP2** (Obsidian-export) — nice-to-have, kan skjutas till session 11

## Risker

| Risk                                                                          | Sannolikhet | Åtgärd                                                                                   |
| ----------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Per-sida text-splitting inte pålitlig (pypdfium2 delar inte alltid på `\n\n`) | Hög         | Acceptera approximation i WP1, förbättra i framtida session med PDF-sidemarkör           |
| Ollama inte igång → vision-steg skippar                                       | Medel       | Diagnostik-kommandot visar tydligt "vision: skipped (Ollama unavailable)"                |
| Stora PageDigest spränger node properties                                     | Låg         | Trunkera `textExtraction.text` och `vision.description` till max 2000 chars i PageDigest |
