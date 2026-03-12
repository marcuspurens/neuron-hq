# Brief: C4 — Lokal vision via Ollama

## Bakgrund

Aurora kan idag:
- **Läsa text** i bilder via OCR (C3, PaddleOCR)
- **Transkribera** ljud/video (C1, Whisper)
- **Skrapa** webb/PDF/dokument (A2)

Men Aurora kan inte **förstå** bilder — vad de föreställer, vad som
händer i ett diagram, vad en skärmdump visar. OCR läser bara text.

C4 lägger till **lokal bildanalys** via Ollama. En multimodal
modell (qwen3-vl) körs lokalt på Mac M4 (48 GB RAM) och genererar
en textbeskrivning av bilden. Beskrivningen sparas som Aurora-nod
(chunkas, embeddas, sökbar i kunskapsgrafen).

### Modellval

**qwen3-vl:8b** — bäst i sin klass för lokal vision:
- 6.1 GB på disk, ~10-12 GB RAM (48 GB Mac har gott om utrymme)
- DocVQA ~96%, MMMU ~62, mycket låg hallucination (0.33%)
- Slår förra generationens 72B-modell på flera benchmarks
- Läser text i bilder (diagram, etiketter, screenshots)
- Flerspråkig (hanterar svensk text)
- Konfigurerbart via `OLLAMA_MODEL_VISION` env-variabel

### Arkitektur

Vision anropar Ollama HTTP API **direkt i TypeScript** — samma mönster
som `embeddings.ts` (fetch mot `localhost:11434`). Ingen Python-worker
behövs. Ollama:s `/api/generate` endpoint stödjer base64-kodade bilder.

## Uppgifter

### 1. Ny modul: `src/aurora/vision.ts`

Ollama-klient för bildanalys, direkt via HTTP (samma mönster som `embeddings.ts`).

```typescript
import { readFile } from 'fs/promises';
import { extname, resolve, basename } from 'path';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';

// --- Types ---

export interface VisionOptions extends IngestOptions {
  /** Custom prompt for the vision model. */
  prompt?: string;
  /** Ollama model to use. Default: env OLLAMA_MODEL_VISION or 'qwen3-vl:8b'. */
  model?: string;
  /** Custom document title. Default: filename. */
  title?: string;
}

export interface VisionResult extends IngestResult {
  /** The generated image description. */
  description: string;
  /** Model used for analysis. */
  modelUsed: string;
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.gif'];

const DEFAULT_PROMPT = `Describe this image in detail for indexing in a knowledge graph.
Include: subjects, objects, text visible in the image, colors, layout, and context.
If the image contains a diagram or chart, describe its structure and data.
If the image contains text, transcribe all visible text.
Be factual and precise — do not speculate or hallucinate.`;

// --- Core functions ---

/**
 * Analyze an image using a local Ollama vision model.
 * Returns the generated description text.
 */
export async function analyzeImage(
  imagePath: string,
  options?: { prompt?: string; model?: string },
): Promise<{ description: string; modelUsed: string }> {
  const absolutePath = resolve(imagePath);
  const ext = extname(absolutePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}. Supported: ${IMAGE_EXTENSIONS.join(', ')}`);
  }

  const imageBuffer = await readFile(absolutePath);
  const base64Image = imageBuffer.toString('base64');

  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = options?.model ?? process.env.OLLAMA_MODEL_VISION ?? 'qwen3-vl:8b';
  const prompt = options?.prompt ?? DEFAULT_PROMPT;

  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [base64Image],
      stream: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama vision failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as OllamaGenerateResponse;
  return { description: data.response, modelUsed: model };
}

/**
 * Check if the vision model is available in Ollama.
 */
export async function isVisionAvailable(model?: string): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const modelName = model ?? process.env.OLLAMA_MODEL_VISION ?? 'qwen3-vl:8b';
  try {
    const resp = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Analyze an image and ingest the description into Aurora.
 */
export async function ingestImage(
  imagePath: string,
  options?: VisionOptions,
): Promise<VisionResult> {
  const { description, modelUsed } = await analyzeImage(imagePath, {
    prompt: options?.prompt,
    model: options?.model,
  });

  const title = options?.title ?? basename(imagePath);
  const words = description.split(/\s+/);

  const ingestResult = await processExtractedText(
    title,
    description,
    null,
    {
      source_type: 'vision',
      word_count: words.length,
      model_used: modelUsed,
      image_path: resolve(imagePath),
    },
    options ?? {},
  );

  return {
    ...ingestResult,
    description,
    modelUsed,
  };
}
```

### 2. CLI-kommando: `aurora:describe-image`

Skapa `src/commands/aurora-describe-image.ts`:

```typescript
/**
 * CLI command: aurora:describe-image
 *
 * Analyze an image using local Ollama vision model and index in Aurora.
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:describe-image ./foto.jpg
 *   npx tsx src/cli.ts aurora:describe-image ./diagram.png --title "Systemarkitektur"
 *   npx tsx src/cli.ts aurora:describe-image ./screenshot.png --prompt "What code is shown?"
 *   npx tsx src/cli.ts aurora:describe-image ./foto.jpg --model qwen3-vl:30b
 *   npx tsx src/cli.ts aurora:describe-image ./foto.jpg --describe-only
 */
```

Options:
- `--title <title>` — Dokumenttitel (default: filnamn)
- `--prompt <prompt>` — Custom prompt till vision-modellen
- `--model <model>` — Ollama-modell (default: `OLLAMA_MODEL_VISION` eller `qwen3-vl:8b`)
- `--describe-only` — Visa beskrivningen utan att ingesta i Aurora
- `--scope <scope>` — Aurora-scope (default: `personal`)

Output:

```
🔍 Analyzing image with qwen3-vl:8b...
   Image: ./diagram.png (1.2 MB)

   📝 Description:
   The image shows a system architecture diagram with three main components:
   a "Manager" node at the top connected to multiple "Worker" nodes below.
   Arrows indicate bidirectional communication via JSON messages...

   ✅ Indexed in Aurora
     Node: doc_a1b2c3
     Words: 156
     Chunks: 2
     Cross-refs: 1
```

Registrera i `src/cli.ts`.

### 3. MCP-tool: `aurora_describe_image`

I `src/mcp/tools/aurora-describe-image.ts`:

```typescript
server.tool(
  'aurora_describe_image',
  'Analyze an image using local Ollama vision model and index description in Aurora',
  {
    imagePath: z.string().describe('Path to image file (png, jpg, webp, etc.)'),
    title: z.string().optional().describe('Document title (default: filename)'),
    prompt: z.string().optional().describe('Custom prompt for the vision model'),
    model: z.string().optional().describe('Ollama model (default: qwen3-vl:8b)'),
    describeOnly: z.boolean().optional().default(false)
      .describe('Only describe, do not ingest into Aurora'),
  },
  async (args) => {
    if (args.describeOnly) {
      const { description, modelUsed } = await analyzeImage(args.imagePath, {
        prompt: args.prompt,
        model: args.model,
      });
      return { content: [{ type: 'text', text: `Model: ${modelUsed}\n\n${description}` }] };
    }
    const result = await ingestImage(args.imagePath, {
      title: args.title,
      prompt: args.prompt,
      model: args.model,
    });
    return {
      content: [{
        type: 'text',
        text: `Analyzed with ${result.modelUsed}\n\nDescription:\n${result.description}\n\nIndexed: ${result.documentNodeId} (${result.chunkCount} chunks, ${result.crossRefsCreated} cross-refs)`,
      }],
    };
  },
);
```

Registrera i `src/mcp/server.ts`.

### 4. Env-variabel: `OLLAMA_MODEL_VISION`

I `.env.example` (och dokumentera i brief):

```bash
# Vision model for image analysis (C4)
# Install: ollama pull qwen3-vl:8b
OLLAMA_MODEL_VISION=qwen3-vl:8b
```

Samma mönster som befintliga `OLLAMA_URL` och `OLLAMA_MODEL_EMBED`.

### 5. Tester

#### `tests/aurora/vision.test.ts` — enhetstester

**analyzeImage-tester:**
- `analyzeImage reads image file and sends to Ollama`
- `analyzeImage uses OLLAMA_MODEL_VISION env var`
- `analyzeImage uses custom model when provided`
- `analyzeImage uses custom prompt when provided`
- `analyzeImage sends base64-encoded image`
- `analyzeImage throws for unsupported file type`
- `analyzeImage throws when Ollama returns error`

**isVisionAvailable-tester:**
- `isVisionAvailable returns true when model exists`
- `isVisionAvailable returns false when Ollama is down`

**ingestImage-tester:**
- `ingestImage analyzes and ingests into Aurora`
- `ingestImage returns description and modelUsed`
- `ingestImage passes title option`
- `ingestImage uses filename as default title`
- `ingestImage stores vision metadata (source_type, model_used, image_path)`

#### `tests/commands/aurora-describe-image.test.ts`

- `shows image description and ingest result`
- `passes title and prompt options`
- `describe-only mode shows description without ingesting`
- `shows error when Ollama is unavailable`

#### `tests/mcp/tools/aurora-describe-image.test.ts`

- `describes and ingests image`
- `describe-only returns just description`
- `returns error for missing file`

**Befintliga 1652 tester ska passera oförändrade.**

## Avgränsningar

- **Bara lokala bilder** — ingen URL till bild (använd `aurora:ingest` för URL:er).
- **En bild åt gången** — ingen batch-vision (kan läggas till som C4.1).
- **Ingen Python-worker** — direkt TypeScript → Ollama HTTP (enklare, snabbare).
- **Kräver `ollama pull qwen3-vl:8b`** — briefen instruerar inte Neuron att ladda ner modellen. Det gör användaren manuellt.
- **Ingen bildlagring** — bara beskrivningen indexeras. Originalbilden refereras via `image_path` i metadata.
- **stream: false** — väntar på komplett svar (enklare). Streaming kan läggas till senare.

## Förutsättning

Innan körning:
```bash
ollama pull qwen3-vl:8b
```

## Verifiering

```bash
pnpm test
pnpm typecheck
# Manuellt (kräver ollama + qwen3-vl:8b):
npx tsx src/cli.ts aurora:describe-image ./testbild.png
npx tsx src/cli.ts aurora:describe-image ./diagram.png --title "Mitt diagram" --describe-only
```

### Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `analyzeImage()` anropar Ollama HTTP API | Enhetstest med mock fetch |
| Base64-kodad bild skickas korrekt | Enhetstest |
| `OLLAMA_MODEL_VISION` env-var respekteras | Enhetstest |
| `ingestImage()` flödar genom `processExtractedText` | Integrationstest |
| CLI visar beskrivning + ingest-resultat | Kommandotest |
| `--describe-only` skippar ingest | Kommandotest |
| MCP-tool fungerar | MCP-test |
| Alla 1652 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Enbart nya filer + minimal registrering:
1. `src/aurora/vision.ts` — ny modul (ingen ändring av befintligt)
2. `src/commands/aurora-describe-image.ts` — ny CLI
3. `src/mcp/tools/aurora-describe-image.ts` — ny MCP-tool
4. `src/cli.ts` — 1 ny `.command()`
5. `src/mcp/server.ts` — 1 ny import + registrering

**Rollback:** `git revert <commit>`
