# Brief: A5 — YouTube + röst

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a5-youtube-voice.md --hours 2
```

## Bakgrund

A1–A4 byggde Aurora MVP: intake, sökning, ask-pipeline och minne. Nu behövs
**YouTube-pipeline** — möjligheten att ingestea YouTube-videor, transkribera dem,
identifiera talare och spara som Aurora-noder.

Alla byggstenar finns:
- `worker-bridge.ts` kör Python-subprocess med JSON stdin/stdout (A2)
- `aurora-workers/` har 3 workers: `extract_url`, `extract_pdf`, `extract_text`
- `chunker.ts` chunkar text med overlap + meningsbrytning (A2)
- `intake.ts` orchestrerar extract → chunk → embed → noder (A2)
- `aurora-schema.ts` har nodtyperna `transcript` och `voice_print` (A1)
- Aurora-swarm-lab har fungerande YouTube-pipeline att referera (`app/clients/`)

**OBS:** Python-beroendena (yt-dlp, faster-whisper, pyannote) kräver manuell
installation efter körningen. Denna brief bygger TypeScript-koden + Python-workers
som anropar dem, men testerna mockar alla Python-anrop.

## Problem

1. **Ingen YouTube-support** — `aurora:ingest` hanterar bara URL/fil, inte YouTube
2. **Ingen transkribering** — ingen integration med Whisper
3. **Ingen talaridentifiering** — ingen integration med pyannote/diarisering
4. **Inga voice_print-noder** — nodtypen finns men används inte

## Lösning

Utöka intake-pipelinen med YouTube-stöd: URL-detektion → ljudextrahering →
transkribering → (valfri) diarisering → chunking → noder.

### Arkitektur

```
YouTube-URL
    │
    ▼
isYouTubeUrl(url) → true
    │
    ▼
extract_youtube (Python worker)
    │  → yt-dlp: ladda ner ljud som .m4a
    │  → returnera: { title, duration, videoId, audioPath }
    ▼
transcribe_audio (Python worker)
    │  → faster-whisper: transkribera .m4a → text + segment[]
    │  → returnera: { text, segments: [{start, end, text}] }
    ▼
chunker.ts (befintlig)
    │  → chunka transkription med tidsstämplar
    ▼
aurora_nodes (transcript + chunks + derived_from-kanter)
    │
    ▼ (valfritt, om pyannote finns)
diarize_audio (Python worker)
    │  → pyannote: identifiera talare → speaker labels
    ▼
aurora_nodes (voice_print-noder, en per talare)
```

## Uppgifter

### 1. Nya Python workers (`aurora-workers/`)

**`aurora-workers/extract_youtube.py`:**

```python
"""Extract audio from YouTube video using yt-dlp."""
import json
import subprocess
import tempfile
from pathlib import Path

def extract_youtube(source: str) -> dict:
    """
    Input: YouTube URL
    Output: { ok, title, text, metadata: { videoId, duration, audioPath, source_type } }

    Kör yt-dlp med FFmpeg postprocessor för att extrahera ljud som .m4a.
    Sparar till tempdir, returnerar sökväg.
    """
    # Använd yt-dlp Python API eller subprocess
    # yt-dlp -x --audio-format m4a -o <output_path> <url>
    # Extrahera metadata: titel, längd, video-ID
    pass
```

**`aurora-workers/transcribe_audio.py`:**

```python
"""Transcribe audio using faster-whisper."""

def transcribe_audio(source: str) -> dict:
    """
    Input: sökväg till ljudfil (.m4a, .mp3, .wav)
    Output: { ok, title, text, metadata: { segments: [{start_ms, end_ms, text}],
              segment_count, language, source_type } }

    Använder faster-whisper (eller whisper CLI som fallback).
    Returnerar fulltext + segmentlista med tidsstämplar.
    """
    pass
```

**`aurora-workers/diarize_audio.py`:**

```python
"""Identify speakers using pyannote.audio."""

def diarize_audio(source: str) -> dict:
    """
    Input: sökväg till ljudfil
    Output: { ok, title, text, metadata: { speakers: [{speaker, start_ms, end_ms}],
              speaker_count, source_type } }

    Använder pyannote.audio för talaridentifiering.
    Om pyannote inte är installerat: returnera stub med SPEAKER_1.
    Kräver PYANNOTE_TOKEN i miljön.
    """
    pass
```

**Uppdatera `aurora-workers/__main__.py`:**
- Lägg till `extract_youtube`, `transcribe_audio`, `diarize_audio` i `HANDLERS`-dict.
- Import: `from extract_youtube import extract_youtube` etc.

### 2. YouTube intake (`src/aurora/youtube.ts`)

```typescript
import { runWorker } from './worker-bridge.js';
import { chunkText } from './chunker.js';
import { loadAuroraGraph, saveAuroraGraph, addAuroraNode, addAuroraEdge } from './aurora-graph.js';
import { AuroraNode, AuroraEdge } from './aurora-schema.js';

export interface YouTubeIngestOptions {
  /** Scope för noderna. Default: 'personal'. */
  scope?: 'personal' | 'shared' | 'project';
  /** Max antal chunks. Default: 100. */
  maxChunks?: number;
  /** Kör diarisering (talaridentifiering). Default: false. */
  diarize?: boolean;
  /** Whisper-modell att använda. Default: 'small'. */
  whisperModel?: string;
}

export interface YouTubeIngestResult {
  /** Transcript-nodens ID. */
  transcriptNodeId: string;
  /** Antal chunk-noder skapade. */
  chunksCreated: number;
  /** Voice print-noder skapade (om diarize=true). */
  voicePrintsCreated: number;
  /** Videons titel. */
  title: string;
  /** Videons längd i sekunder. */
  duration: number;
  /** Video-ID. */
  videoId: string;
}

/**
 * Kontrollera om en URL är en YouTube-URL.
 */
export function isYouTubeUrl(url: string): boolean;

/**
 * Extrahera video-ID från YouTube-URL.
 * Stödjer: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/
 */
export function extractVideoId(url: string): string | null;

/**
 * Ingestea en YouTube-video i Aurora.
 *
 * Flöde:
 * 1. Extrahera ljud via yt-dlp (Python worker)
 * 2. Transkribera via Whisper (Python worker)
 * 3. (Valfritt) Diarisera via pyannote (Python worker)
 * 4. Chunka transkriptionen
 * 5. Skapa transcript-nod + chunk-noder + derived_from-kanter
 * 6. (Om diarize) Skapa voice_print-noder
 */
export async function ingestYouTube(
  url: string,
  options?: YouTubeIngestOptions,
): Promise<YouTubeIngestResult>;
```

**YouTube URL-detektion:** Stöd för:
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://youtu.be/dQw4w9WgXcQ`
- `https://www.youtube.com/shorts/dQw4w9WgXcQ`
- `https://m.youtube.com/watch?v=dQw4w9WgXcQ`

**Transcript-nod:**
```typescript
{
  id: `yt-${videoId}`,
  type: 'transcript',
  title: videoTitle,
  properties: {
    text: fullTranscript,
    videoId,
    videoUrl: url,
    duration,
    language: detectedLanguage,
    segmentCount,
  },
  confidence: 0.9,
  scope: options.scope ?? 'personal',
  sourceUrl: url,
}
```

**Voice print-nod (om diarize=true):**
```typescript
{
  id: `vp-${videoId}-${speakerLabel}`,
  type: 'voice_print',
  title: `Speaker: ${speakerLabel}`,
  properties: {
    speakerLabel,
    videoId,
    segmentCount: speakerSegments.length,
    totalDurationMs: sum(segments.map(s => s.end_ms - s.start_ms)),
  },
  confidence: 0.7,
  scope: 'personal',
  sourceUrl: url,
}
```

**Dedup:** Om `yt-${videoId}` redan finns som nod, returnera tidigt med
meddelande att videon redan ingestats.

### 3. Uppdatera intake.ts

Uppdatera `ingestUrl()` att detektera YouTube-URLs och dirigera till
`ingestYouTube()` istället:

```typescript
import { isYouTubeUrl, ingestYouTube } from './youtube.js';

export async function ingestUrl(url: string, options?: IngestOptions): Promise<IngestResult> {
  if (isYouTubeUrl(url)) {
    const result = await ingestYouTube(url, {
      scope: options?.scope,
      maxChunks: options?.maxChunks,
    });
    return {
      documentNodeId: result.transcriptNodeId,
      chunksCreated: result.chunksCreated,
      title: result.title,
      alreadyExists: false,
    };
  }
  // ... befintlig URL-logik
}
```

**Minimal ändring** — bara en if-check i början av `ingestUrl`.

### 4. CLI-kommando: `aurora:ingest-youtube` (`src/commands/aurora-ingest-youtube.ts`)

```typescript
// npx tsx src/cli.ts aurora:ingest-youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ
// npx tsx src/cli.ts aurora:ingest-youtube https://youtu.be/abc123 --diarize
//
// Output:
// 🎬 Ingesting YouTube video...
//   URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
//
// ⬇️  Extracting audio... done (3m 42s)
// 🎤 Transcribing... done (142 segments, language: en)
// 🗣️  Diarizing... done (3 speakers)  [om --diarize]
// 📝 Chunking... done (35 chunks)
//
// ✅ YouTube video ingested!
//   Title: "Never Gonna Give You Up"
//   Transcript node: yt-dQw4w9WgXcQ
//   Chunks: 35
//   Voice prints: 3  [om --diarize]
//
// Options:
//   --diarize           Run speaker identification
//   --scope <scope>     personal | shared | project (default: personal)
//   --max-chunks <N>    Max chunks (default: 100)
//   --whisper-model <m> Whisper model: tiny|small|medium|large (default: small)
```

Registrera i `src/cli.ts` som `program.command('aurora:ingest-youtube')`.

### 5. MCP-tool: `aurora_ingest_youtube` (`src/mcp/tools/aurora-ingest-youtube.ts`)

```typescript
export function registerAuroraIngestYouTubeTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_youtube',
    'Ingest a YouTube video: extract audio, transcribe, optionally identify speakers, and store in Aurora knowledge base.',
    {
      url: z.string().url().describe('YouTube video URL'),
      diarize: z.boolean().optional().default(false)
        .describe('Run speaker identification (requires pyannote)'),
      scope: z.enum(['personal', 'shared', 'project']).optional().default('personal')
        .describe('Scope for the nodes'),
      whisper_model: z.enum(['tiny', 'small', 'medium', 'large']).optional().default('small')
        .describe('Whisper model to use for transcription'),
    },
    async (args) => {
      // Anropa ingestYouTube(args.url, { diarize, scope, whisperModel })
      // Returnera { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  );
}
```

Registrera i `src/mcp/server.ts`.

### 6. MCP-tool: `aurora_voice_gallery` (`src/mcp/tools/aurora-voice-gallery.ts`)

```typescript
export function registerAuroraVoiceGalleryTool(server: McpServer): void {
  server.tool(
    'aurora_voice_gallery',
    'List all voice prints in the Aurora knowledge base with speaker metadata.',
    {},
    async () => {
      // Hämta alla voice_print-noder via findAuroraNodes({ type: 'voice_print' })
      // Returnera formaterad lista
    },
  );
}
```

### 7. Exportera från `src/aurora/index.ts`

Lägg till exports:
- `ingestYouTube`, `isYouTubeUrl`, `extractVideoId` från `./youtube.js`
- `YouTubeIngestOptions`, `YouTubeIngestResult` från `./youtube.js`

### 8. Tester

**Nya testfiler:**

- `tests/aurora/youtube.test.ts`:
  - `isYouTubeUrl()` detekterar alla YouTube-format
  - `isYouTubeUrl()` avvisar icke-YouTube-URLs
  - `extractVideoId()` extraherar video-ID korrekt
  - `extractVideoId()` returnerar null för ogiltiga URLs
  - `ingestYouTube()` skapar transcript-nod + chunks
  - `ingestYouTube()` med diarize skapar voice_print-noder
  - `ingestYouTube()` dedup — redan ingstad video returnerar tidigt
  - `ingestYouTube()` hanterar worker-fel gracefully
  - **Mock:** Mocka `runWorker` (inga riktiga yt-dlp/whisper-anrop)

- `tests/commands/aurora-ingest-youtube.test.ts`:
  - CLI visar progress och resultat
  - `--diarize` flaggan fungerar
  - Felmeddelande vid ogiltig URL
  - **Mock:** Mocka `ingestYouTube`

- `tests/mcp/tools/aurora-ingest-youtube.test.ts`:
  - MCP-tool returnerar YouTubeIngestResult
  - Hanterar alla parametrar
  - Hanterar ogiltig URL

- `tests/mcp/tools/aurora-voice-gallery.test.ts`:
  - MCP-tool returnerar voice_print-noder
  - Hanterar tom databas

**Alla befintliga 1231 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen riktigt ljudbearbetning i tester** — alla Python-workers mockas
- **Ingen brusreducering** — ljud skickas direkt till Whisper
- **Ingen automatisk talarnamngivning** — voice_prints får SPEAKER_1, SPEAKER_2 etc.
- **Ingen voice matching** — varje video skapar nya voice_print-noder (matching tillkommer senare)
- **Inget voice gallery UI** — bara MCP-tool som returnerar JSON
- **Python-beroenden installeras manuellt** efter körningen

## Python-beroenden (manuell installation)

```bash
# Dessa installeras EFTER körningen, inte av agenterna
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
$AURORA_PYTHON_PATH -m pip install yt-dlp faster-whisper
# Valfritt (för diarisering):
$AURORA_PYTHON_PATH -m pip install pyannote.audio
# ffmpeg behövs för yt-dlp:
brew install ffmpeg  # om inte redan installerat
```

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering (kräver Python-beroenden)

```bash
# Testa med kort video
npx tsx src/cli.ts aurora:ingest-youtube "https://www.youtube.com/watch?v=jNQXAC9IVRw"
# Förväntat: "Me at the zoo" transkriberas, 1-2 chunks

# Verifiera att noden finns
npx tsx src/cli.ts aurora:ask "What is the first YouTube video about?"
# Förväntat: svar baserat på transcript-noden

# Vanlig URL ska fortfarande funka
npx tsx src/cli.ts aurora:ingest https://en.wikipedia.org/wiki/TypeScript
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `isYouTubeUrl()` detekterar YouTube-URLs korrekt | Enhetstest |
| `extractVideoId()` extraherar video-ID | Enhetstest |
| `ingestYouTube()` skapar transcript + chunks | Enhetstest (mock) |
| `ingestYouTube()` med diarize skapar voice_print-noder | Enhetstest (mock) |
| Dedup vid upprepad ingest | Enhetstest |
| `ingestUrl()` dirigerar YouTube-URLs till `ingestYouTube()` | Enhetstest |
| CLI `aurora:ingest-youtube` visar progress + resultat | Enhetstest |
| MCP `aurora_ingest_youtube` returnerar YouTubeIngestResult | Enhetstest |
| MCP `aurora_voice_gallery` listar voice_prints | Enhetstest |
| Python workers har korrekt stdin/stdout-protokoll | Enhetstest (mock) |
| Fallback vid worker-fel | Enhetstest |
| 1231 befintliga tester passerar | `pnpm test` |

## Risk

**Låg-medel.** Mest additivt men med Python-beroenden:

1. **Nya filer** — `youtube.ts`, 3 Python workers, CLI, 2 MCP-tools
2. **Minimal ändring** — bara `intake.ts` (YouTube-detektion) + `server.ts` + `cli.ts` + `index.ts`
3. **Python-beroenden** — yt-dlp, faster-whisper, pyannote installeras manuellt
4. **Alla tester mockar workers** — inga riktiga nedladdningar/transkribering

**Rollback:** `git revert <commit>`
