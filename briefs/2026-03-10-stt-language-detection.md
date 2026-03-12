# Brief: STT-förbättringar — Språkdetektering & automatiskt modelval

## Bakgrund

Video-pipelinen (C1) transkriberar ljud med `faster-whisper` men använder alltid
samma modell ("small" via env `WHISPER_MODEL`). Whisper detekterar redan språk men
informationen ignoreras — den skickas bara i metadata utan att påverka modelval.

Dessutom finns `whisperModel`-parametern i CLI (`--whisper-model`), MCP-tool
(`whisper_model`) och `VideoIngestOptions` — men den **skickas aldrig vidare**
till Python-workern. Den accepteras men kastas bort.

Svenska transkriptioner blir märkbart sämre med `small`-modellen. KBLab har
släppt `KBLab/kb-whisper-large` — en svensk-optimerad Whisper-modell kompatibel
med `faster-whisper` via CTranslate2 — som ger mycket bättre resultat på svenska.

## Problemanalys

Dataflödet idag:

```
CLI/MCP → whisperModel i options → ingestVideo() → runWorker({action, source})
                                                     ↑ whisperModel kastas bort!
                                                     ↓
Python __main__.py → transcribe_audio(source)  ← bara source, inga options
                     ↓
                     WhisperModel(env.WHISPER_MODEL ?? "small")  ← alltid samma
```

**Tre problem:**
1. `WorkerRequest` har bara `action` + `source` — inget sätt att skicka extra options
2. Python-dispatchern skickar bara `source` till handlers
3. `transcribe_audio.py` ignorerar allt utom env-variabeln `WHISPER_MODEL`

## Uppgifter

### 1. Utöka WorkerRequest med options

**Fil:** `src/aurora/worker-bridge.ts`

Lägg till ett valfritt `options`-fält i `WorkerRequest`:

```typescript
export interface WorkerRequest {
  action: 'extract_url' | 'extract_pdf' | 'extract_text' | 'extract_video' | 'extract_youtube' | 'transcribe_audio' | 'diarize_audio';
  source: string;
  /** Optional key-value options forwarded to the Python handler. */
  options?: Record<string, unknown>;
}
```

`JSON.stringify(request)` på rad 100 serialiserar redan hela objektet — inga
andra ändringar i filen behövs.

### 2. Python-dispatcher: vidarebefordra options

**Fil:** `aurora-workers/__main__.py`

Ändra dispatchern så att `options` från JSON-requesten vidarebefordras till
handlers som accepterar ett andra argument:

```python
import inspect

# I main(), efter rad 33:
options = request.get("options", {})
handler = HANDLERS[action]

# Forward options to handlers that accept a second argument
sig = inspect.signature(handler)
if len(sig.parameters) > 1:
    result = handler(source, options)
else:
    result = handler(source)
```

Bakåtkompatibelt — befintliga handlers (`extract_url`, `extract_pdf`, etc.)
har bara `source`-parameter och påverkas inte.

### 3. Skriv om transcribe_audio.py med språkdetektering

**Fil:** `aurora-workers/transcribe_audio.py`

Ny signatur: `transcribe_audio(source: str, options: dict | None = None)`

Implementera:

```python
"""Transcribe audio files using faster-whisper with language-aware model selection."""
import os
from faster_whisper import WhisperModel

# Language → model mapping. Override via env vars.
LANG_MODEL_MAP = {
    "sv": os.environ.get("WHISPER_MODEL_SV", "KBLab/kb-whisper-large"),
}
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "small")
DETECT_MODEL = os.environ.get("WHISPER_MODEL_DETECT", "tiny")


def transcribe_audio(source: str, options: dict | None = None) -> dict:
    opts = options or {}
    explicit_model = opts.get("whisper_model")
    explicit_language = opts.get("language")

    if explicit_model:
        # User explicitly chose a model — respect it
        model_id = explicit_model
        detected_language = explicit_language
    elif explicit_language:
        # User specified language — pick best model for it
        model_id = LANG_MODEL_MAP.get(explicit_language, DEFAULT_MODEL)
        detected_language = explicit_language
    else:
        # Auto-detect language with tiny model, then pick model
        detect_model = WhisperModel(DETECT_MODEL)
        _, detect_info = detect_model.transcribe(
            source,
            beam_size=1,
            best_of=1,
            without_timestamps=True,
        )
        detected_language = detect_info.language if detect_info else None
        model_id = LANG_MODEL_MAP.get(detected_language, DEFAULT_MODEL) if detected_language else DEFAULT_MODEL

    # Full transcription with chosen model
    model = WhisperModel(model_id)
    transcribe_kwargs = {}
    if detected_language:
        transcribe_kwargs["language"] = detected_language

    raw_segments, info = model.transcribe(source, **transcribe_kwargs)
    # ... (segment processing same as current)

    return {
        "title": title,
        "text": full_text,
        "metadata": {
            "segments": segments,
            "segment_count": len(segments),
            "language": language,
            "model_used": model_id,       # ← NYTT: vilken modell som användes
            "source_type": "audio_transcription",
        },
    }
```

**Prioritetsordning:**
1. Explicit `whisper_model` i options → använd den rakt av
2. Explicit `language` i options → välj modell för det språket ur `LANG_MODEL_MAP`
3. Inget angivet → snabb detection med `tiny`-modell, välj modell baserat på resultat

**Env-variabler:**
- `WHISPER_MODEL` — default modell (standard: `small`)
- `WHISPER_MODEL_SV` — svensk modell (standard: `KBLab/kb-whisper-large`)
- `WHISPER_MODEL_DETECT` — modell för språkdetektering (standard: `tiny`)

### 4. Skicka options från ingestVideo till worker

**Fil:** `src/aurora/video.ts`

a) Lägg till `language` i `VideoIngestOptions`:

```typescript
export interface VideoIngestOptions {
  scope?: 'personal' | 'shared' | 'project';
  maxChunks?: number;
  diarize?: boolean;
  whisperModel?: string;
  /** Language code (e.g. "sv", "en") — skips auto-detection when set. */
  language?: string;
}
```

b) Lägg till `modelUsed` i `VideoIngestResult`:

```typescript
export interface VideoIngestResult {
  // ... befintliga fält ...
  /** The Whisper model that was actually used for transcription. */
  modelUsed?: string;
}
```

c) Bygg options-objekt och skicka med i `runWorker`-anropet (rad 174-180):

```typescript
const transcribeOptions: Record<string, unknown> = {};
if (options?.whisperModel) {
  transcribeOptions.whisper_model = options.whisperModel;
}
if (options?.language) {
  transcribeOptions.language = options.language;
}

const transcribeResult = await runWorker(
  {
    action: 'transcribe_audio',
    source: extractMeta.audioPath as string,
    ...(Object.keys(transcribeOptions).length > 0 ? { options: transcribeOptions } : {}),
  },
  { timeout: 600_000 },
);
```

d) Fånga `modelUsed` från transcribe-metadata och inkludera i retur-objektet:

```typescript
const modelUsed = (transcribeMeta.model_used as string) ?? undefined;
// I return-objektet:
modelUsed,
```

### 5. CLI: --language flagga

**Fil:** `src/cli.ts`

Lägg till option på aurora:ingest-video-kommandot:

```typescript
.option('--language <lang>', 'Language code (e.g. sv, en) — skip auto-detection')
```

**Fil:** `src/commands/aurora-ingest-video.ts`

Lägg till `language` i cmdOptions-typen och vidarebefordra:

```typescript
export async function auroraIngestVideoCommand(
  url: string,
  cmdOptions: { diarize?: boolean; scope?: string; maxChunks?: string; whisperModel?: string; language?: string },
): Promise<void> {
  const options: VideoIngestOptions = {
    // ... befintliga ...
    language: cmdOptions.language,
  };
```

Visa modelUsed i output:

```typescript
if (result.modelUsed) {
  console.log(`    Model used: ${result.modelUsed}`);
}
```

### 6. MCP-tool: language-parameter

**Fil:** `src/mcp/tools/aurora-ingest-video.ts`

Lägg till i Zod-schema:

```typescript
language: z
  .string()
  .optional()
  .describe('Language code (e.g. "sv", "en") — skip auto-detection'),
```

Vidarebefordra i handler:

```typescript
const options: VideoIngestOptions = {
  diarize: args.diarize,
  scope: args.scope,
  whisperModel: args.whisper_model,
  language: args.language,
};
```

### 7. Tester

**`tests/aurora/video.test.ts`** — lägg till i ingestVideo-blocket:

- `passes whisperModel to transcribe worker options` — verifiera att `mockRunWorker`
  tar emot `{ action: 'transcribe_audio', source: ..., options: { whisper_model: 'large' } }`
- `passes language to transcribe worker options` — verifiera `options: { language: 'sv' }`
- `passes both whisperModel and language when both specified`
- `does not include options key when no whisperModel or language` — bakåtkompatibilitet
- `includes modelUsed in result when returned by worker` — verifiera att `modelUsed`
  propageras från transcribe-metadata

**`tests/commands/aurora-ingest-video.test.ts`**:

- `passes language option to ingestVideo`
- `shows model used in output when available`

**`tests/mcp/tools/aurora-ingest-video.test.ts`**:

- `passes language option to ingestVideo`

**Befintliga ~1502 tester ska passera oförändrade.**

## Avgränsningar

- **Bara `LANG_MODEL_MAP` för svenska** — stöd för fler språk (norska, danska) kan
  läggas till genom att utöka dictet, men ingår inte i denna brief.
- **KBLab-modellen laddas ner automatiskt** — `faster-whisper` hanterar
  HuggingFace-nedladdning vid första användning (~3 GB). Ingår inte att pre-ladda.
- **Detektionens overhead** — `tiny`-modellen tar 5-10 sekunder att ladda och köra
  på de första 30 sekunderna. Kan kringgås med `--language sv`.
- **Inga Python-tester** — projektet använder vitest, inte pytest. Python-koden
  testas indirekt via TypeScript-tester med mockad `runWorker`.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `WorkerRequest` har `options?`-fält | TypeScript-kompilering |
| Python-dispatcher vidarebefordrar options | Indirekt via integrationstester |
| `transcribe_audio` accepterar options-argument | Indirekt via integrationstester |
| `whisperModel` når Python-workern | Enhetstest (mock runWorker) |
| `language` når Python-workern | Enhetstest (mock runWorker) |
| Auto-detection väljer rätt modell | Verifieras manuellt |
| `modelUsed` returneras i resultat | Enhetstest |
| `--language` CLI-flagga fungerar | Enhetstest |
| MCP `language`-parameter fungerar | Enhetstest |
| Befintliga 1502 tester passerar | `pnpm test` |

## Risk

**Låg.** Ändringarna är additiva:
1. `WorkerRequest.options` är valfritt — befintliga anrop påverkas inte
2. Python-dispatcher kollar `inspect.signature` — befintliga handlers ignoreras
3. `transcribe_audio` default till `None` options — identiskt beteende utan options
4. `VideoIngestOptions.language` och `VideoIngestResult.modelUsed` är valfria fält
5. CLI och MCP är bakåtkompatibla

**Rollback:** `git revert <commit>`
