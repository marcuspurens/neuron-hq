# Brief: C3 OCR — bildtextextraktion med PaddleOCR

## Bakgrund

Aurora kan idag ta in text (txt/md), PDF (pypdfium2), URL (trafilatura) och
video/ljud (yt-dlp + faster-whisper). Men **bilder** stöds inte ännu.

Dessutom har PDF-extraktion en svaghet: vissa PDF:er har trasig fontkodning
(inbäddade typsnitt med intern teckentabell), vilket gör att pypdfium2 ger
felaktig text ("upprä3hålla" istället för "upprätthålla"). OCR löser detta
genom att läsa texten *visuellt* — precis som en människa.

**PaddleOCR** är ett gratis, lokalt OCR-bibliotek med bra stöd för svenska
och många andra språk. Kräver ingen API-nyckel.

## Uppgifter

### 1. Installera PaddleOCR

```bash
/opt/anaconda3/bin/pip install paddleocr paddlepaddle
```

OBS: PaddleOCR kräver `paddlepaddle` som bas-dependency.

### 2. Python worker: `aurora-workers/extract_ocr.py`

```python
"""Extract text from images using PaddleOCR."""
import os
from paddleocr import PaddleOCR


def extract_ocr(file_path: str, options: dict | None = None) -> dict:
    """Extract text from an image file using OCR.

    Args:
        file_path: Path to image file (.png, .jpg, .jpeg, .webp, .tiff, .bmp).
        options: Optional dict with:
            - language: OCR language hint (default: 'en').
              Common values: 'en', 'sv' (mapped to PaddleOCR lang codes).

    Returns:
        Dict with extracted text and metadata.
    """
    opts = options or {}

    # Map common language codes to PaddleOCR lang codes
    lang_map = {
        'sv': 'latin',    # Swedish uses latin character set
        'en': 'en',
        'de': 'german',
        'fr': 'french',
        'es': 'es',
        'no': 'latin',    # Norwegian
        'da': 'latin',    # Danish
        'fi': 'latin',    # Finnish
    }
    lang_input = opts.get('language', 'en')
    lang = lang_map.get(lang_input, lang_input)

    ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
    result = ocr.ocr(file_path, cls=True)

    # Extract text lines from OCR result
    lines = []
    confidence_scores = []
    for page in result:
        if page is None:
            continue
        for line in page:
            text = line[1][0]       # Recognized text
            conf = line[1][1]       # Confidence score
            lines.append(text)
            confidence_scores.append(conf)

    full_text = '\n'.join(lines)
    if not full_text.strip():
        raise ValueError(f"No text extracted from image: {file_path}")

    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    words = full_text.split()
    title = os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "image_ocr",
            "word_count": len(words),
            "line_count": len(lines),
            "avg_confidence": round(avg_confidence, 3),
            "language": lang_input,
            "ocr_engine": "paddleocr",
        },
    }
```

### 3. PDF-fallback worker: `aurora-workers/ocr_pdf.py`

En separat worker som renderar PDF-sidor som bilder och kör OCR.
Används som fallback när `extract_pdf` ger trasig text.

```python
"""Extract text from PDF using OCR (fallback for broken font encoding)."""
import os
import pypdfium2 as pdfium
from paddleocr import PaddleOCR


def ocr_pdf(file_path: str, options: dict | None = None) -> dict:
    """Extract text from PDF by rendering pages as images and running OCR.

    Args:
        file_path: Path to PDF file.
        options: Optional dict with:
            - language: OCR language hint (default: 'en').
            - dpi: Render resolution (default: 200).

    Returns:
        Dict with OCR-extracted text and metadata.
    """
    opts = options or {}
    lang_input = opts.get('language', 'en')
    dpi = int(opts.get('dpi', 200))

    # Map language codes
    lang_map = {'sv': 'latin', 'en': 'en', 'de': 'german', 'fr': 'french',
                'no': 'latin', 'da': 'latin', 'fi': 'latin'}
    lang = lang_map.get(lang_input, lang_input)

    pdf = pdfium.PdfDocument(file_path)
    ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)

    pages_text = []
    confidence_scores = []

    for i in range(len(pdf)):
        page = pdf[i]
        # Render page as image (PIL)
        bitmap = page.render(scale=dpi / 72)
        pil_image = bitmap.to_pil()

        # Save temp image for PaddleOCR
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            pil_image.save(tmp.name)
            result = ocr.ocr(tmp.name, cls=True)
            os.unlink(tmp.name)

        page_lines = []
        for page_result in (result or []):
            if page_result is None:
                continue
            for line in page_result:
                page_lines.append(line[1][0])
                confidence_scores.append(line[1][1])

        if page_lines:
            pages_text.append('\n'.join(page_lines))

    full_text = '\n\n'.join(pages_text)
    if not full_text.strip():
        raise ValueError(f"OCR extracted no text from PDF: {file_path}")

    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    words = full_text.split()
    title = os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "pdf_ocr",
            "word_count": len(words),
            "page_count": len(pdf),
            "avg_confidence": round(avg_confidence, 3),
            "language": lang_input,
            "ocr_engine": "paddleocr",
            "dpi": dpi,
        },
    }
```

### 4. Registrera i dispatcher

I `aurora-workers/__main__.py`:

```python
from extract_ocr import extract_ocr
from ocr_pdf import ocr_pdf

HANDLERS["extract_ocr"] = extract_ocr
HANDLERS["ocr_pdf"] = ocr_pdf
```

### 5. Uppdatera worker-bridge

I `src/aurora/worker-bridge.ts`, lägg till i `WorkerRequest.action` union:

```typescript
action: '...' | 'extract_ocr' | 'ocr_pdf';
```

### 6. Intake-integration: `src/aurora/ocr.ts`

Ny modul som hanterar bild-ingest + PDF-OCR-fallback:

```typescript
import { runWorker } from './worker-bridge.js';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'];

/**
 * Ingest an image file via OCR.
 */
export async function ingestImage(
  filePath: string,
  options?: IngestOptions & { language?: string },
): Promise<IngestResult> {
  const ext = extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}. Supported: ${IMAGE_EXTENSIONS.join(', ')}`);
  }

  const absolutePath = resolve(filePath);
  const result = await runWorker({
    action: 'extract_ocr',
    source: absolutePath,
    options: { language: options?.language ?? 'en' },
  });

  return processExtractedText(result, absolutePath, {
    ...options,
    sourceType: 'image_ocr',
  });
}

/**
 * Re-extract text from a PDF using OCR (fallback for broken encoding).
 */
export async function ocrPdf(
  filePath: string,
  options?: IngestOptions & { language?: string; dpi?: number },
): Promise<IngestResult> {
  const absolutePath = resolve(filePath);
  const result = await runWorker({
    action: 'ocr_pdf',
    source: absolutePath,
    options: {
      language: options?.language ?? 'en',
      dpi: options?.dpi ?? 200,
    },
  });

  return processExtractedText(result, absolutePath, {
    ...options,
    sourceType: 'pdf_ocr',
  });
}

/**
 * Detect if extracted PDF text is likely garbled (broken font encoding).
 * Heuristic: high ratio of unexpected characters in word positions.
 */
export function isTextGarbled(text: string): boolean {
  if (!text || text.length < 50) return false;
  // Count words that contain digits or special chars mid-word
  // (e.g., "upprä3hålla", "distribu:onen", "?ll")
  const words = text.split(/\s+/);
  let suspiciousCount = 0;
  for (const word of words) {
    // Skip pure numbers, URLs, dates
    if (/^\d+$/.test(word) || word.includes('://') || /^\d{4}-\d{2}/.test(word)) continue;
    // Flag: digit or ?:; inside an otherwise alphabetic word
    if (/[a-zåäöA-ZÅÄÖ][0-9?:;][a-zåäöA-ZÅÄÖ]/.test(word)) {
      suspiciousCount++;
    }
  }
  const ratio = suspiciousCount / words.length;
  return ratio > 0.03; // More than 3% suspicious words = likely garbled
}
```

### 7. Smart PDF-ingest med auto-fallback

Uppdatera `src/aurora/intake.ts` — vid PDF-extraktion, kontrollera om texten
ser trasig ut och erbjud/kör OCR-fallback:

```typescript
// I ingestDocument, efter extract_pdf:
if (ext === '.pdf') {
  const result = await runWorker({ action: 'extract_pdf', source: absolutePath });

  // Check if text looks garbled
  if (isTextGarbled(result.text)) {
    console.log('  ⚠️  Text looks garbled — falling back to OCR...');
    return ocrPdf(absolutePath, options);
  }

  return processExtractedText(result, absolutePath, options);
}
```

### 8. CLI-kommando: `aurora:ingest-image`

Skapa `src/commands/aurora-ingest-image.ts`:

```typescript
/**
 * CLI command: aurora:ingest-image
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:ingest-image <path>
 *   npx tsx src/cli.ts aurora:ingest-image <path> --language sv
 */
```

Output:

```
📷 Ingesting image via OCR...
  File: screenshot.png
  Language: sv

  ✅ Ingested!
    Title: screenshot
    Words: 342
    Lines: 28
    Confidence: 0.921
    Chunks: 4
    Cross-refs: 2
```

### 9. CLI-kommando: `aurora:ocr-pdf`

Skapa `src/commands/aurora-ocr-pdf.ts`:

```typescript
/**
 * CLI command: aurora:ocr-pdf
 *
 * Force OCR extraction of a PDF (for broken font encoding).
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:ocr-pdf <path>
 *   npx tsx src/cli.ts aurora:ocr-pdf <path> --language sv --dpi 300
 */
```

Registrera båda i `src/cli.ts`.

### 10. MCP-tools

#### `src/mcp/tools/aurora-ingest-image.ts`

```typescript
server.tool(
  'aurora_ingest_image',
  'Extract text from an image using OCR (PaddleOCR)',
  {
    filePath: z.string().describe('Path to image file (.png, .jpg, .jpeg, .webp)'),
    language: z.string().optional().default('en')
      .describe('Language hint for OCR (en, sv, de, fr, etc.)'),
  },
  async (args) => { /* ... */ },
);
```

#### `src/mcp/tools/aurora-ocr-pdf.ts`

```typescript
server.tool(
  'aurora_ocr_pdf',
  'Re-extract text from a PDF using OCR (for broken font encoding)',
  {
    filePath: z.string().describe('Path to PDF file'),
    language: z.string().optional().default('en')
      .describe('Language hint for OCR'),
    dpi: z.number().optional().default(200)
      .describe('Render resolution (higher = better quality, slower)'),
  },
  async (args) => { /* ... */ },
);
```

Registrera i `src/mcp/server.ts`.

### 11. Tester

#### `tests/aurora/ocr.test.ts` — core-tester

- `ingestImage calls extract_ocr worker with language option`
- `ingestImage throws on unsupported file type`
- `ingestImage flows through processExtractedText`
- `ocrPdf calls ocr_pdf worker with language and dpi`
- `ocrPdf flows through processExtractedText`
- `isTextGarbled returns true for garbled text`
- `isTextGarbled returns false for clean text`
- `isTextGarbled returns false for short text`
- `isTextGarbled ignores pure numbers and URLs`
- `isTextGarbled detects mixed digit-in-word patterns`

#### `tests/commands/aurora-ingest-image.test.ts`

- `shows OCR result with confidence`
- `passes language option to worker`
- `shows error for unsupported file type`

#### `tests/commands/aurora-ocr-pdf.test.ts`

- `shows OCR result for PDF`
- `passes dpi option to worker`

#### `tests/mcp/tools/aurora-ingest-image.test.ts`

- `extracts text from image`
- `returns error for invalid path`

#### `tests/mcp/tools/aurora-ocr-pdf.test.ts`

- `extracts text from PDF via OCR`
- `passes language and dpi options`

**Befintliga ~1589 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen bildnedladdning** — kräver lokal fil. URL-till-bild kan läggas till senare.
- **Auto-fallback i intake** — vid PDF-ingest körs `isTextGarbled` heuristik.
  Fungerar bra för de vanligaste problemen men kan missa exotiska fall.
- **PaddleOCR första körning laddar modell** — ~100 MB, sker automatiskt.
- **Inga Python-tester** — testas indirekt via mockad runWorker.

## Verifiering

```bash
pnpm test
pnpm typecheck
# Manuellt:
npx tsx src/cli.ts aurora:ingest-image /path/to/image.png --language sv
npx tsx src/cli.ts aurora:ocr-pdf /path/to/broken.pdf --language sv
# Testa auto-fallback:
npx tsx src/cli.ts aurora:ingest /path/to/broken.pdf
```

## Risk

**Låg.** Mestadels nya filer. Befintlig kod ändras:
1. `aurora-workers/__main__.py` — 2 nya handlers
2. `src/aurora/worker-bridge.ts` — 2 nya actions i union
3. `src/aurora/intake.ts` — auto-fallback vid garbled PDF (liten ändring)
4. `src/cli.ts` — 2 nya `.command()`
5. `src/mcp/server.ts` — 2 nya imports + registreringar

**Rollback:** `git revert <commit>`
