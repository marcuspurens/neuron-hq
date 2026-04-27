# Aurora Media MCP Server — Developer Reference

## Architecture

```
┌─────────────────────────────────┐
│  TypeScript (Neuron HQ)         │
│  src/aurora/media-client.ts     │
│  ─ singleton MCP client         │
│  ─ spawns Python process once   │
│  ─ JSON-RPC over stdio          │
└──────────┬──────────────────────┘
           │ MCP protocol (stdio)
┌──────────▼──────────────────────┐
│  Python (aurora-workers/)       │
│  mcp_server.py                  │
│  ─ FastMCP server               │
│  ─ Models loaded at startup     │
│  ─ Kept warm between calls      │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────────────┐
    │  WhisperX            │  ASR + word alignment
    │  pyannote            │  Speaker diarization
    │  DeepFilterNet       │  Audio denoising
    │  yt-dlp              │  Video extraction
    └─────────────────────┘
```

## Files

| File | Role |
|---|---|
| `aurora-workers/mcp_server.py` | MCP server — tool definitions, model lifecycle |
| `aurora-workers/transcribe_audio.py` | Legacy standalone transcriber (faster-whisper, pre-MCP) |
| `aurora-workers/denoise_audio.py` | DeepFilterNet wrapper |
| `aurora-workers/extract_video.py` | yt-dlp wrapper |
| `aurora-workers/check_deps.py` | Dependency checker |
| `src/aurora/media-client.ts` | TypeScript MCP client — singleton, drop-in for worker-bridge |

## Model lifecycle

Models are loaded once in `lifespan()` and cached in `MediaState`:

```python
@dataclass
class MediaState:
    whisper_model: Any          # FasterWhisperPipeline
    whisper_model_id: str       # e.g. "large-v3-turbo"
    whisper_compute_type: str   # e.g. "float32"
    align_models: dict          # lang → (model, metadata), loaded lazily
    diarize_pipeline: Any       # pyannote, loaded at startup if token present
    device: str                 # "cpu" (CTranslate2 — no MPS support)
    align_device: str           # "mps" or "cpu" (PyTorch alignment + diarization)
```

**Reload triggers:** The Whisper model is reloaded only when `model_id` or `compute_type` changes between calls. Repeated calls with the same parameters reuse the cached model.

**Language-specific models:** Swedish (`sv`) auto-switches to `KBLab/kb-whisper-large`. Other languages use the default model. Override via `WHISPER_MODEL_SV` env var.

## Environment variables

| Var | Default | Effect |
|---|---|---|
| `WHISPER_MODEL` | `large-v3-turbo` | Default ASR model |
| `WHISPER_MODEL_SV` | `KBLab/kb-whisper-large` | Swedish-specific model |
| `WHISPER_MODEL_DETECT` | `tiny` | Language detection model |
| `WHISPER_BATCH_SIZE` | `8` | Inference batch size |
| `WHISPER_THREADS` | `8` | CTranslate2 CPU threads |
| `PYANNOTE_TOKEN` | — | HuggingFace token for pyannote diarization |
| `DEEPFILTERNET_CMD` | `deep-filter` | Path to DeepFilterNet CLI |

## transcribe_audio parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `audio_path` | str | required | Absolute path |
| `language` | str \| None | auto-detect | BCP-47. `sv` triggers KBLab model. |
| `whisper_model` | str \| None | env default | Any HuggingFace model ID |
| `batch_size` | int \| None | 8 | Memory vs speed tradeoff |
| `align` | bool | True | Word-level alignment via WhisperX |
| `compute_type` | str \| None | `float32` | `float32` / `float16` / `int8` |
| `beam_size` | int \| None | 5 (WhisperX default) | 1=greedy, 10=thorough |
| `initial_prompt` | str \| None | None | Domain terms for decoder guidance |

## extract_entities — local LLM NER

Calls Gemma 4 (or any Ollama model) to extract proper nouns, abbreviations, and technical terms from text. Designed for two-pass transcription: fast draft → entity extraction → full quality re-transcription with `initial_prompt`.

| Env var | Default | Effect |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `gemma4:26b` | Default model for entity extraction |

Response includes `text` (comma-separated terms, truncated to 224 chars for Whisper) and `metadata.entities` (full list).

Ollama must be running. The tool has a 120s timeout — Gemma 4 26B takes 2-10s depending on text length.

## Adding a new tool

1. Add `@mcp.tool()` async function in `mcp_server.py`
2. Add corresponding wrapper in `media-client.ts`
3. Add `MediaAction` type union member
4. Tool parameters become MCP schema automatically via FastMCP introspection

## Testing

```bash
# Verify dependencies
python aurora-workers/mcp_server.py --check

# Run server manually (stdio mode)
python aurora-workers/mcp_server.py

# TypeScript tests
pnpm test -- tests/aurora/video.test.ts
```

## Gotchas

- **CTranslate2 does not support MPS.** WhisperX ASR always runs on CPU. Alignment and diarization use MPS if available (via PyTorch).
- **Model reload is expensive** (10-30s). The server caches model+compute_type and only reloads on change.
- **pyannote requires gated model access.** Users need to accept the license on HuggingFace and provide their token via `PYANNOTE_TOKEN`.
- **yt-dlp breaks regularly** as platforms change their APIs. Keep it updated.
