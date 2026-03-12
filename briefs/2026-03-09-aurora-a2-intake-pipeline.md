# Brief: A2 — Python workers + intake-pipeline

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a2-intake-pipeline.md --hours 2
```

## Bakgrund

A1 och A1.1 skapade Aurora-skelettet: tabeller, scheman, CRUD, dual-write, semantisk
sökning, MCP-tools, confidence decay. Nu behövs **intake** — möjligheten att mata in
innehåll (URL:er och dokument) som automatiskt extraheras, chunkas, embedbas och
sparas som `aurora_nodes`.

Python behövs för textextrahering (trafilatura för URL:er, pypdfium2 för PDF:er) —
dessa bibliotek är markant bättre än TS-alternativ. TypeScript hanterar resten:
chunking, embeddings, graf-operationer, CLI och MCP.

## Problem

1. **Ingen intake-pipeline** — det går inte att mata in dokument i Aurora-minnet
2. **Inget sätt att anropa Python** — det saknas en subprocess-bridge
3. **Ingen textchunking** — stora texter behöver delas upp innan embedding

## Lösning

Skapa en intake-pipeline: URL/fil → Python-worker extraherar text → TypeScript
chunkar → Ollama embeddrar → `aurora_nodes` skapas.

### Arkitektur

```
CLI/MCP                          TypeScript                    Python
───────                          ──────────                    ──────
aurora:ingest <url>  ──→  intake.ts orchestrator  ──→  worker-bridge.ts
                              │                           │
                              │                    spawn python -m aurora_workers
                              │                           │
                              │                    JSON stdin → stdout
                              │                           │
                              ├── chunker.ts              │
                              │   (split text)            │
                              │                           │
                              ├── autoEmbedAuroraNodes    │
                              │   (Ollama 1024-dim)       │
                              │                           │
                              └── addAuroraNode           │
                                  (dual-write)            │
```

## Uppgifter

### 1. Python-workers (`aurora-workers/`)

Skapa ett minimalt Python-paket med JSON stdin/stdout-protokoll.

**Katalogstruktur:**

```
aurora-workers/
  __init__.py          # tom
  __main__.py          # dispatcher: läser JSON från stdin, anropar rätt extraktor
  extract_url.py       # URL → text via trafilatura
  extract_pdf.py       # PDF → text via pypdfium2
  extract_text.py      # .txt/.md → text (passthrough med encoding-hantering)
  requirements.txt     # trafilatura, pypdfium2
```

**Protokoll (stdin/stdout JSON):**

```json
// Input (stdin, en rad JSON):
{
  "action": "extract_url" | "extract_pdf" | "extract_text",
  "source": "<url eller filsökväg>"
}

// Output (stdout, en rad JSON):
{
  "ok": true,
  "title": "Extracted document title",
  "text": "Full extracted text content...",
  "metadata": {
    "source_type": "url" | "pdf" | "text",
    "word_count": 1234,
    "language": "en"
  }
}

// Fel (stdout, en rad JSON):
{
  "ok": false,
  "error": "Beskrivning av felet"
}
```

**`__main__.py` (~40 rader):**

```python
"""Aurora workers — JSON stdin/stdout dispatcher."""
import json
import sys

from .extract_url import extract_url
from .extract_pdf import extract_pdf
from .extract_text import extract_text

HANDLERS = {
    "extract_url": extract_url,
    "extract_pdf": extract_pdf,
    "extract_text": extract_text,
}

def main():
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
        action = request.get("action", "")
        source = request.get("source", "")

        if action not in HANDLERS:
            print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))
            sys.exit(1)

        result = HANDLERS[action](source)
        print(json.dumps({"ok": True, **result}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
```

**`extract_url.py` (~50 rader):**

```python
"""Extract main text content from a URL using trafilatura."""
import trafilatura

def extract_url(url: str) -> dict:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Could not fetch URL: {url}")

    text = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
    )
    if not text:
        raise ValueError(f"Could not extract text from URL: {url}")

    metadata = trafilatura.extract_metadata(downloaded)
    title = metadata.title if metadata and metadata.title else url
    language = metadata.language if metadata and metadata.language else "unknown"

    words = text.split()
    return {
        "title": title,
        "text": text,
        "metadata": {
            "source_type": "url",
            "word_count": len(words),
            "language": language,
        },
    }
```

**`extract_pdf.py` (~50 rader):**

```python
"""Extract text from PDF using pypdfium2."""
import pypdfium2 as pdfium

def extract_pdf(file_path: str) -> dict:
    pdf = pdfium.PdfDocument(file_path)
    pages = []
    for i in range(len(pdf)):
        page = pdf[i]
        text = page.get_textpage().get_text_range()
        if text.strip():
            pages.append(text)

    full_text = "\n\n".join(pages)
    if not full_text.strip():
        raise ValueError(f"No text extracted from PDF: {file_path}")

    words = full_text.split()
    # Use filename as title
    import os
    title = os.path.splitext(os.path.basename(file_path))[0]

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "source_type": "pdf",
            "word_count": len(words),
            "page_count": len(pdf),
            "language": "unknown",
        },
    }
```

**`extract_text.py` (~30 rader):**

```python
"""Read plain text or markdown files."""
import os

def extract_text(file_path: str) -> dict:
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    if not text.strip():
        raise ValueError(f"File is empty: {file_path}")

    title = os.path.splitext(os.path.basename(file_path))[0]
    words = text.split()

    return {
        "title": title,
        "text": text,
        "metadata": {
            "source_type": "text",
            "word_count": len(words),
            "language": "unknown",
        },
    }
```

**`requirements.txt`:**

```
trafilatura>=1.8.0
pypdfium2>=4.0.0
```

### 2. Worker bridge (`src/aurora/worker-bridge.ts`)

TypeScript-modul som kör Python-workers via `child_process.execFile`.

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execFileAsync = promisify(execFile);

// Protokoll-typer
export interface WorkerRequest {
  action: 'extract_url' | 'extract_pdf' | 'extract_text';
  source: string;
}

export interface WorkerResult {
  ok: true;
  title: string;
  text: string;
  metadata: {
    source_type: 'url' | 'pdf' | 'text';
    word_count: number;
    language?: string;
    page_count?: number;
  };
}

export interface WorkerError {
  ok: false;
  error: string;
}

export type WorkerResponse = WorkerResult | WorkerError;

/**
 * Kör en Python aurora-worker via subprocess.
 *
 * @param request - action + source
 * @param options - timeout (default 60s), pythonPath (default 'python3')
 * @returns WorkerResponse
 */
export async function runWorker(
  request: WorkerRequest,
  options?: {
    timeout?: number;      // ms, default 60000
    pythonPath?: string;   // default 'python3'
  }
): Promise<WorkerResponse> {
  const timeout = options?.timeout ?? 60000;
  const pythonPath = options?.pythonPath ?? process.env.AURORA_PYTHON_PATH ?? 'python3';
  const workersDir = resolve(__dirname, '../../aurora-workers');

  const { stdout, stderr } = await execFileAsync(
    pythonPath,
    ['-m', 'aurora_workers'],
    {
      cwd: workersDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }
  );
  // Notera: request skickas via stdin, se implementation nedan

  // Parsning av JSON-output
  // Validera med Zod
  // Hantera stderr som warning (inte error — Python skriver ibland dit)
}

/**
 * Kontrollerar att Python och aurora-workers är tillgängliga.
 */
export async function isWorkerAvailable(): Promise<boolean> {
  // Kör: python3 -c "import aurora_workers; print('ok')"
  // Returnerar true om det lyckas, false annars
}
```

**OBS om stdin:** `execFile` stöder inte stdin direkt. Använd `child_process.spawn`
istället, skriv JSON till `stdin`, läs `stdout`, vänta på `close`:

```typescript
import { spawn } from 'child_process';

export function runWorker(request: WorkerRequest, options?: WorkerOptions): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, ['-m', 'aurora_workers'], {
      cwd: workersDir,
      timeout,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Worker failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Worker returned invalid JSON: ${stdout}`));
      }
    });

    proc.on('error', (err) => reject(err));

    proc.stdin.write(JSON.stringify(request));
    proc.stdin.end();
  });
}
```

### 3. Text chunker (`src/aurora/chunker.ts`)

Ren TypeScript-modul som delar upp text i överlappande chunks.

```typescript
export interface ChunkOptions {
  maxWords?: number;    // default 200
  overlap?: number;     // default 20 (antal ord som överlappar mellan chunks)
  minWords?: number;    // default 10 (ignorera chunks kortare än detta)
}

export interface Chunk {
  index: number;        // 0-baserat
  text: string;
  wordCount: number;
  startOffset: number;  // teckenposition i originaltexten
  endOffset: number;
}

/**
 * Delar upp text i överlappande chunks.
 *
 * Försöker bryta vid meningsgränser (., !, ?) inom maxWords.
 * Faller tillbaka till ordgräns om ingen meningsbrytning hittas.
 */
export function chunkText(text: string, options?: ChunkOptions): Chunk[];
```

**Algoritm:**
1. Dela text i ord (behåll whitespace-info för offset-beräkning)
2. Gå genom orden i steg om `maxWords - overlap`
3. För varje chunk: leta bakåt från `maxWords` efter meningsgräns (`.`, `!`, `?`)
4. Om hittad: bryt där. Annars: bryt vid `maxWords`
5. Overlap: nästa chunk börjar `overlap` ord före slutet av föregående
6. Filtrera bort chunks med `wordCount < minWords`

### 4. Intake orchestrator (`src/aurora/intake.ts`)

Koordinerar hela flödet: extract → chunk → embed → skapa noder.

```typescript
import { runWorker, isWorkerAvailable } from './worker-bridge';
import { chunkText } from './chunker';
import { addAuroraNode, addAuroraEdge, loadAuroraGraph, saveAuroraGraph } from './aurora-graph';
import { AuroraNode, AuroraNodeType, AuroraScope } from './aurora-schema';

export interface IngestOptions {
  type?: AuroraNodeType;   // default: auto-detect (url → 'document', pdf → 'document')
  scope?: AuroraScope;     // default: 'personal'
  maxChunks?: number;      // default: 100
  chunkMaxWords?: number;  // default: 200
  chunkOverlap?: number;   // default: 20
}

export interface IngestResult {
  documentNodeId: string;   // huvud-nodens ID
  chunkNodeIds: string[];   // alla chunk-noders ID:n
  title: string;
  wordCount: number;
  chunkCount: number;
}

/**
 * Ingesterar en URL och skapar aurora_nodes.
 *
 * Flöde:
 * 1. Kör Python worker (extract_url) → text + title + metadata
 * 2. Skapa en 'document'-nod (sammanfattning, source_url, metadata)
 * 3. Chunka texten
 * 4. Skapa en 'document'-nod per chunk (med referens till huvud-nod)
 * 5. Skapa 'derived_from'-kanter chunk → dokument
 * 6. Spara grafen (dual-write + auto-embed)
 */
export async function ingestUrl(
  url: string,
  options?: IngestOptions
): Promise<IngestResult>;

/**
 * Ingesterar en lokal fil (text, markdown, PDF).
 *
 * Flöde:
 * 1. Detektera filtyp (.txt/.md → extract_text, .pdf → extract_pdf)
 * 2. Kör Python worker → text + title + metadata
 * 3. Samma flöde som ingestUrl steg 2-6
 */
export async function ingestDocument(
  filePath: string,
  options?: IngestOptions
): Promise<IngestResult>;

/**
 * Intern hjälpfunktion — gemensamt flöde efter textextrahering.
 */
async function processExtractedText(
  title: string,
  text: string,
  sourceUrl: string | null,
  metadata: Record<string, unknown>,
  options: IngestOptions
): Promise<IngestResult> {
  // 1. Generera document-nod ID: `doc_${sha256(text).slice(0, 12)}`
  // 2. Skapa huvud-nod (type: options.type ?? 'document')
  // 3. Chunka text
  // 4. För varje chunk: skapa nod med ID `doc_${hash}_chunk_${index}`
  //    - title: `${title} [chunk ${index+1}/${total}]`
  //    - properties: { text: chunk.text, chunkIndex, totalChunks, wordCount, parentId }
  //    - sourceUrl: samma som huvud-nod
  //    - confidence: 0.5 (default)
  // 5. Skapa 'derived_from'-kanter: chunk → huvud-nod
  // 6. Spara graf (triggar auto-embed)
}
```

**ID-generering:** Använd `createHash('sha256').update(text).digest('hex').slice(0, 12)`
för deterministisk, dedup-vänlig ID-generering. Samma text → samma ID → ingen duplett.

### 5. CLI-kommando: `aurora:ingest` (`src/commands/aurora-ingest.ts`)

```typescript
// npx tsx src/cli.ts aurora:ingest https://example.com/article
// npx tsx src/cli.ts aurora:ingest ./document.pdf
// npx tsx src/cli.ts aurora:ingest ./notes.md --scope shared --type research
//
// Output:
// Ingesting: https://example.com/article
// Extracting text... done (1234 words)
// Chunking... 7 chunks
// Creating nodes... done
// Embedding... done (8 nodes)
//
// ✅ Ingested "Article Title"
//   Document node: doc_a1b2c3d4e5f6
//   Chunks: 7
//   Scope: personal
//
// Options:
//   --scope <personal|shared|project>   Scope (default: personal)
//   --type <document|research|...>      Node type (default: document)
//   --max-chunks <N>                    Max chunks (default: 100)
```

Registrera i `src/cli.ts` som `program.command('aurora:ingest')`.

### 6. MCP-tools (`src/mcp/tools/aurora-ingest.ts`)

Två MCP-tools i samma fil:

```typescript
// Tool 1: aurora_ingest_url
// Input: { url: string, scope?: string, type?: string }
// Output: IngestResult som JSON
// Registreras som 'aurora_ingest_url' i server.ts

// Tool 2: aurora_ingest_doc
// Input: { path: string, scope?: string, type?: string }
// Output: IngestResult som JSON
// Registreras som 'aurora_ingest_doc' i server.ts
//
// Båda anropar ingestUrl / ingestDocument från intake.ts
```

Registrera i `src/mcp/server.ts`.

### 7. Tester

**Nya testfiler:**

- `tests/aurora/worker-bridge.test.ts`:
  - `runWorker` skickar JSON på stdin, läser JSON från stdout
  - Timeout hanteras korrekt
  - Ogiltigt JSON från worker → error
  - Worker som returnerar `ok: false` → WorkerError
  - `isWorkerAvailable` returnerar false om python3 saknas
  - **Mock:** Använd en enkel Node.js-script som mock-worker istället för Python
    (skriv `tests/fixtures/mock-worker.js` som läser stdin, svarar JSON)

- `tests/aurora/chunker.test.ts`:
  - Tom text → tom array
  - Kort text (< maxWords) → en chunk
  - Lång text → flera chunks med korrekt overlap
  - Meningsbrytning respekteras
  - `minWords`-filter fungerar
  - Offset-beräkning stämmer med originaltexten
  - Specialtecken/unicode hanteras

- `tests/aurora/intake.test.ts`:
  - `ingestUrl` skapar document-nod + chunk-noder + kanter
  - `ingestDocument` detekterar filtyp korrekt (.txt, .md, .pdf)
  - Dedup: samma text → samma nod-ID, inga dubbletter
  - `scope` och `type` parametrar propageras
  - `maxChunks` begränsar antal chunks
  - Felhantering: worker-fel → tydligt felmeddelande
  - **Mock:** Mocka `runWorker` för att undvika Python-beroende i tester

- `tests/commands/aurora-ingest.test.ts`:
  - CLI-output innehåller titel, chunk-antal, scope
  - Felmeddelande vid ogiltig URL/filsökväg
  - `--scope` och `--type` flaggor fungerar

- `tests/mcp/tools/aurora-ingest.test.ts`:
  - `aurora_ingest_url` returnerar IngestResult
  - `aurora_ingest_doc` returnerar IngestResult
  - Felhantering vid worker-problem

**Alla befintliga 1077 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen YouTube-intake** — skapas i A5 (kräver whisper + pyannote)
- **Ingen OCR** — skapas i A5 (kräver PaddleOCR/pytesseract)
- **Ingen denoising** — skapas i A5 (kräver deepfilternet)
- **Inga agenter** — IntakeAgent skapas i A6
- **Ingen ask-pipeline** — skapas i A3
- **Ingen jobbkö** — enkelt synkront flöde. Jobbkö tillkommer om det behövs
- **Python-workers installeras manuellt** — `pip install -r aurora-workers/requirements.txt`

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering (efter körning + pip install)

```bash
# Installera Python-beroenden
pip install -r aurora-workers/requirements.txt

# Testa worker direkt
echo '{"action":"extract_text","source":"README.md"}' | python3 -m aurora_workers
# Förväntat: JSON med ok:true, title, text

# Testa CLI
npx tsx src/cli.ts aurora:ingest README.md
# Förväntat: ✅ Ingested "README" + chunk-info

# Testa med URL (kräver internet)
npx tsx src/cli.ts aurora:ingest https://en.wikipedia.org/wiki/TypeScript
# Förväntat: ✅ Ingested "TypeScript" + chunk-info

# Verifiera i DB
psql neuron -c "SELECT id, type, title FROM aurora_nodes LIMIT 10;"
# Förväntat: document-noder + chunks

# Verifiera embeddings
npx tsx src/cli.ts aurora:status
# Förväntat: N noder, embedding-täckning
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `aurora-workers/` Python-paket med 3 extraktorer | Filstruktur |
| JSON stdin/stdout-protokoll fungerar | Worker-bridge test (mock) |
| `worker-bridge.ts` kör Python subprocess | Enhetstest |
| `chunker.ts` delar text med overlap och meningsbrytning | Enhetstest |
| `ingestUrl` skapar document + chunk-noder + kanter | Enhetstest |
| `ingestDocument` hanterar .txt, .md, .pdf | Enhetstest |
| Dedup via SHA256-baserat ID | Enhetstest |
| CLI `aurora:ingest` visar korrekt output | Enhetstest |
| MCP `aurora_ingest_url` + `aurora_ingest_doc` fungerar | Enhetstest |
| Auto-embed triggas efter sparning | Enhetstest (mock) |
| 1077 befintliga tester passerar | `pnpm test` |

## Risk

**Låg-Medel.** Mest additivt, men med externa beroenden:

1. **Python-beroende** — kräver Python 3 + pip install. Alla tester mockar Python
   så CI fungerar utan Python installerat
2. **Nya filer** — `aurora-workers/` och `src/aurora/` utökas, inget befintligt ändras
3. **Nätverksanrop** — `extract_url` gör HTTP-anrop. Alla tester mockar detta.
4. **Filsystem** — `extract_pdf` och `extract_text` läser filer. Validera sökvägar.

**Rollback:** `git revert <commit>` + `pip uninstall trafilatura pypdfium2`

## Förberedelse (manuellt innan körning)

```bash
# Kontrollera Python
python3 --version
# Ska visa Python 3.10+

# Kontrollera Postgres (ska redan finnas från D1)
psql neuron -c "SELECT count(*) FROM aurora_nodes;"
```
