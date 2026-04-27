"""Aurora Media MCP Server — WhisperX transcription, diarization, denoising, video extraction.

Replaces the stdin/stdout JSON worker protocol with a proper MCP server.
Models are loaded once at startup and kept warm between calls.

Usage:
    python mcp_server.py                    # stdio transport (for MCP clients)
    python mcp_server.py --check            # verify dependencies and exit

Env vars:
    WHISPER_MODEL       — Whisper model ID (default: large-v3-turbo)
    WHISPER_MODEL_SV    — Swedish-specific model (default: KBLab/kb-whisper-large)
    WHISPER_MODEL_DETECT — Language detection model (default: tiny)
    WHISPER_BATCH_SIZE  — Batch size for inference (default: 8)
    WHISPER_THREADS     — CPU threads for CTranslate2 (default: 8)
    PYANNOTE_TOKEN      — HuggingFace token for pyannote gated models
    DEEPFILTERNET_CMD   — Path to deep-filter CLI (default: deep-filter)
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from mcp.server.fastmcp import Context, FastMCP

# ---------------------------------------------------------------------------
#  Logging — stderr only (stdout is MCP JSON-RPC)
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="[%(name)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("aurora-media")

# ---------------------------------------------------------------------------
#  Configuration from env
# ---------------------------------------------------------------------------

DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
LANG_MODEL_MAP = {
    "sv": os.environ.get("WHISPER_MODEL_SV", "KBLab/kb-whisper-large"),
}
DETECT_MODEL = os.environ.get("WHISPER_MODEL_DETECT", "tiny")
BATCH_SIZE = int(os.environ.get("WHISPER_BATCH_SIZE", "8"))
THREADS = int(os.environ.get("WHISPER_THREADS", "8"))
PYANNOTE_TOKEN = os.environ.get("PYANNOTE_TOKEN")


# ---------------------------------------------------------------------------
#  Lifespan state — models loaded once, reused across calls
# ---------------------------------------------------------------------------

@dataclass
class MediaState:
    """Holds pre-loaded models for the server lifetime."""
    whisper_model: Any = None           # FasterWhisperPipeline (WhisperX)
    whisper_model_id: str = ""
    whisper_compute_type: str = "float32"
    align_models: dict = field(default_factory=dict)  # lang → (model, metadata)
    diarize_pipeline: Any = None
    device: str = "cpu"                 # CTranslate2 device (always cpu for MPS)
    align_device: str = "cpu"           # PyTorch device for alignment/diarization


@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[MediaState]:
    """Load WhisperX model at startup. Alignment models loaded lazily per language."""
    import torch

    align_device = "mps" if torch.backends.mps.is_available() else "cpu"
    log.info(f"PyTorch device: {align_device} (alignment + diarization)")
    log.info(f"CTranslate2 device: cpu (WhisperX ASR — MPS not supported by CTranslate2)")

    state = MediaState(
        device="cpu",
        align_device=align_device,
    )

    # Load Whisper model in background thread (blocking, 10-30s)
    loop = asyncio.get_running_loop()
    log.info(f"Loading WhisperX model: {DEFAULT_MODEL} ...")

    def _load_whisper():
        import whisperx
        return whisperx.load_model(
            DEFAULT_MODEL,
            device="cpu",
            compute_type="float32",
            threads=THREADS,
            asr_options={"word_timestamps": True},
        )

    state.whisper_model = await loop.run_in_executor(None, _load_whisper)
    state.whisper_model_id = DEFAULT_MODEL
    log.info(f"WhisperX model loaded: {DEFAULT_MODEL}")

    # Pre-load diarization pipeline if token is available
    if PYANNOTE_TOKEN:
        log.info("Loading pyannote diarization pipeline ...")
        def _load_diarize():
            import whisperx
            return whisperx.DiarizationPipeline(
                token=PYANNOTE_TOKEN,
                device=align_device,
            )
        try:
            state.diarize_pipeline = await loop.run_in_executor(None, _load_diarize)
            log.info("Diarization pipeline loaded")
        except Exception as e:
            log.warning(f"Diarization pipeline failed to load: {e}")
    else:
        log.info("PYANNOTE_TOKEN not set — diarization will be unavailable")

    try:
        yield state
    finally:
        log.info("Aurora Media MCP server shutting down")


# ---------------------------------------------------------------------------
#  Server
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "aurora-media",
    lifespan=lifespan,
    log_level="INFO",
)


# ---------------------------------------------------------------------------
#  Helper: get or load alignment model for a language
# ---------------------------------------------------------------------------

async def _get_align_model(state: MediaState, language: str, loop: asyncio.AbstractEventLoop):
    """Lazily load and cache alignment model per language."""
    if language in state.align_models:
        return state.align_models[language]

    import whisperx
    log.info(f"Loading alignment model for '{language}' ...")

    def _load():
        return whisperx.load_align_model(
            language_code=language,
            device=state.align_device,
        )

    model, metadata = await loop.run_in_executor(None, _load)
    state.align_models[language] = (model, metadata)
    log.info(f"Alignment model loaded for '{language}'")
    return model, metadata


# ---------------------------------------------------------------------------
#  Tool: transcribe_audio
# ---------------------------------------------------------------------------

@mcp.tool()
async def transcribe_audio(
    audio_path: str,
    language: str | None = None,
    whisper_model: str | None = None,
    batch_size: int | None = None,
    align: bool = True,
    compute_type: str | None = None,
    beam_size: int | None = None,
    initial_prompt: str | None = None,
    ctx: Context = None,
) -> dict:
    """Transcribe audio with word-level timestamps using WhisperX.

    Args:
        audio_path: Absolute path to audio file (wav/mp3/m4a/flac).
        language: BCP-47 language code (e.g. 'en', 'sv'). None = auto-detect.
        whisper_model: Override model ID. None = use server default.
        batch_size: Inference batch size. None = use server default.
        align: Whether to run word-level alignment (default True).
        compute_type: CTranslate2 quantization — 'float32' (best quality,
            default), 'float16' (nearly identical quality, faster), or
            'int8' (fastest, lower quality). Use int8 only for quick drafts.
        beam_size: Beam search width. Higher = better quality, slower.
            Default 5. Use 1 for fast draft transcriptions.
        initial_prompt: Domain-specific terms to guide Whisper's decoder,
            e.g. 'AUTOSAR, immobilizer, ECU' to improve spelling of
            technical terms. Comma-separated or natural language.

    Returns:
        Dict with title, text, metadata (segments with word timestamps).
    """
    if not os.path.isfile(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")

    state: MediaState = ctx.request_context.lifespan_context
    loop = asyncio.get_running_loop()
    bs = batch_size or BATCH_SIZE
    ct = compute_type or "float32"

    await ctx.info(f"Transcribing: {os.path.basename(audio_path)}")

    model = state.whisper_model
    model_id = state.whisper_model_id
    needs_reload = (
        (whisper_model and whisper_model != state.whisper_model_id)
        or (ct != state.whisper_compute_type)
    )
    if needs_reload:
        load_model_id = whisper_model or state.whisper_model_id
        await ctx.info(f"Loading model: {load_model_id} (compute_type={ct})")
        import whisperx
        def _load():
            return whisperx.load_model(
                load_model_id,
                device=state.device,
                compute_type=ct,
                threads=THREADS,
            )
        model = await loop.run_in_executor(None, _load)
        model_id = load_model_id
        state.whisper_model = model
        state.whisper_model_id = model_id
        state.whisper_compute_type = ct

    if language and not whisper_model and not needs_reload:
        lang_model = LANG_MODEL_MAP.get(language)
        if lang_model and lang_model != state.whisper_model_id:
            await ctx.info(f"Loading language-specific model: {lang_model} (compute_type={ct})")
            import whisperx
            def _load_lang():
                return whisperx.load_model(
                    lang_model,
                    device=state.device,
                    compute_type=ct,
                    threads=THREADS,
                )
            model = await loop.run_in_executor(None, _load_lang)
            model_id = lang_model
            state.whisper_model = model
            state.whisper_model_id = model_id
            state.whisper_compute_type = ct

    # Step 1: Transcribe
    await ctx.info("Running ASR ...")

    import whisperx

    asr_options: dict[str, Any] = {}
    if beam_size is not None:
        asr_options["beam_size"] = beam_size
    if initial_prompt is not None:
        asr_options["initial_prompt"] = initial_prompt

    def _transcribe():
        return model.transcribe(
            audio_path,
            batch_size=bs,
            language=language,
            print_progress=False,
            **asr_options,
        )

    result = await loop.run_in_executor(None, _transcribe)
    detected_lang = result.get("language", language or "unknown")
    segments = result.get("segments", [])

    await ctx.info(f"ASR complete: {len(segments)} segments, language={detected_lang}")

    # Step 2: Word-level alignment (optional)
    if align and segments:
        try:
            align_model, align_metadata = await _get_align_model(state, detected_lang, loop)

            await ctx.info("Running word alignment ...")
            audio_array = await loop.run_in_executor(None, whisperx.load_audio, audio_path)

            def _align():
                return whisperx.align(
                    segments,
                    align_model,
                    align_metadata,
                    audio_array,
                    state.align_device,
                )

            aligned = await loop.run_in_executor(None, _align)
            segments = aligned.get("segments", segments)
            await ctx.info(f"Alignment complete")
        except Exception as e:
            log.warning(f"Alignment failed (continuing without): {e}")
            await ctx.info(f"Alignment skipped: {e}")

    # Build response in worker-bridge compatible format
    output_segments = []
    text_parts = []
    for seg in segments:
        start_ms = int(seg.get("start", 0) * 1000)
        end_ms = int(seg.get("end", 0) * 1000)
        text = seg.get("text", "").strip()
        seg_dict = {
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": text,
        }
        # Include word-level timestamps if available
        words = seg.get("words", [])
        if words:
            seg_dict["words"] = [
                {
                    "start_ms": int(w.get("start", 0) * 1000),
                    "end_ms": int(w.get("end", 0) * 1000),
                    "word": w.get("word", ""),
                    "probability": round(w.get("score", 0), 4),
                }
                for w in words
                if "start" in w  # skip unaligned words
            ]
        output_segments.append(seg_dict)
        text_parts.append(text)

    full_text = " ".join(text_parts)
    title = os.path.splitext(os.path.basename(audio_path))[0]

    return {
        "ok": True,
        "title": title,
        "text": full_text,
        "metadata": {
            "segments": output_segments,
            "segment_count": len(output_segments),
            "language": detected_lang,
            "model_used": model_id,
            "compute_type": ct,
            "beam_size": beam_size,
            "initial_prompt": initial_prompt,
            "source_type": "audio_transcription",
            "aligned": align and bool(segments),
        },
    }


# ---------------------------------------------------------------------------
#  Tool: diarize_audio
# ---------------------------------------------------------------------------

@mcp.tool()
async def diarize_audio(
    audio_path: str,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
    ctx: Context = None,
) -> dict:
    """Identify speakers and their time segments in an audio file.

    Uses pyannote speaker diarization via WhisperX.

    Args:
        audio_path: Absolute path to audio file.
        num_speakers: Known number of speakers (optional).
        min_speakers: Minimum expected speakers (optional).
        max_speakers: Maximum expected speakers (optional).

    Returns:
        Dict with speaker segments (speaker, start_ms, end_ms).
    """
    if not os.path.isfile(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")

    state: MediaState = ctx.request_context.lifespan_context
    loop = asyncio.get_running_loop()

    if state.diarize_pipeline is None:
        raise ValueError(
            "Diarization unavailable — PYANNOTE_TOKEN not set or pipeline failed to load. "
            "Set PYANNOTE_TOKEN env var with a HuggingFace token that has access to "
            "pyannote/speaker-diarization-3.1"
        )

    await ctx.info(f"Diarizing: {os.path.basename(audio_path)}")

    import whisperx

    # Convert non-WAV to WAV first (pyannote needs clean input)
    from diarize_audio import _convert_to_wav
    wav_path = await loop.run_in_executor(None, _convert_to_wav, audio_path)
    effective_path = wav_path or audio_path

    def _diarize():
        return state.diarize_pipeline(
            effective_path,
            num_speakers=num_speakers,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
        )

    await ctx.info("Running speaker diarization ...")
    diarize_segments = await loop.run_in_executor(None, _diarize)

    # Convert DataFrame to list of dicts
    speakers_set = set()
    segments = []
    for _, row in diarize_segments.iterrows():
        speaker = row.get("speaker", "UNKNOWN")
        speakers_set.add(speaker)
        segments.append({
            "speaker": speaker,
            "start_ms": int(row.get("start", 0) * 1000),
            "end_ms": int(row.get("end", 0) * 1000),
        })

    speaker_count = len(speakers_set)
    title = os.path.splitext(os.path.basename(audio_path))[0]

    await ctx.info(f"Diarization complete: {speaker_count} speakers, {len(segments)} segments")

    return {
        "ok": True,
        "title": title,
        "text": f"Diarization: {speaker_count} speakers detected",
        "metadata": {
            "speakers": segments,
            "speaker_count": speaker_count,
            "source_type": "diarization",
        },
    }


# ---------------------------------------------------------------------------
#  Tool: denoise_audio
# ---------------------------------------------------------------------------

@mcp.tool()
async def denoise_audio(
    audio_path: str,
    output_dir: str | None = None,
    ctx: Context = None,
) -> dict:
    """Denoise an audio file using DeepFilterNet.

    Falls back to passthrough if DeepFilterNet is not available.

    Args:
        audio_path: Absolute path to input audio file.
        output_dir: Directory for denoised file. Default: same as source.

    Returns:
        Dict with denoised_path and whether denoising was applied.
    """
    if not os.path.isfile(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")

    loop = asyncio.get_running_loop()
    await ctx.info(f"Denoising: {os.path.basename(audio_path)}")

    # Reuse existing denoise implementation
    from denoise_audio import denoise_audio as _denoise_sync
    options = {"output_dir": output_dir} if output_dir else None

    result = await loop.run_in_executor(None, _denoise_sync, audio_path, options)

    applied = result.get("metadata", {}).get("applied", False)
    if applied:
        await ctx.info("Denoising applied successfully")
    else:
        reason = result.get("metadata", {}).get("fallback_reason", "unknown")
        await ctx.info(f"Denoising skipped: {reason}")

    return {"ok": True, **result}


# ---------------------------------------------------------------------------
#  Tool: extract_video
# ---------------------------------------------------------------------------

@mcp.tool()
async def extract_video(
    url: str,
    skip_subtitles: bool = False,
    sub_lang: str = "en,sv",
    ctx: Context = None,
) -> dict:
    """Download audio, subtitles, and metadata from a video URL using yt-dlp.

    Supports YouTube, Vimeo, SVT, TV4, TikTok, and all yt-dlp supported sites.

    Args:
        url: Video URL.
        skip_subtitles: Skip subtitle download.
        sub_lang: Preferred subtitle languages (comma-separated).

    Returns:
        Dict with title, metadata (audioPath, duration, subtitles, etc).
    """
    loop = asyncio.get_running_loop()
    await ctx.info(f"Extracting video: {url}")

    from extract_video import extract_video as _extract_sync
    options = {
        "skip_subtitles": skip_subtitles,
        "sub_lang": sub_lang,
    }

    result = await loop.run_in_executor(None, _extract_sync, url, options)
    await ctx.info(f"Extracted: {result.get('title', 'unknown')}")

    return {"ok": True, **result}


# ---------------------------------------------------------------------------
#  Tool: extract_video_metadata
# ---------------------------------------------------------------------------

@mcp.tool()
async def extract_video_metadata(
    url: str,
    ctx: Context = None,
) -> dict:
    """Fetch video metadata without downloading using yt-dlp --dump-json.

    Args:
        url: Video URL.

    Returns:
        Dict with title and metadata (duration, uploader, upload_date).
    """
    import json
    import subprocess

    loop = asyncio.get_running_loop()

    def _fetch():
        try:
            result = subprocess.run(
                ["yt-dlp", "--dump-json", "--no-download", url],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except FileNotFoundError:
            raise ValueError("yt-dlp is not installed or not in PATH")
        except subprocess.TimeoutExpired:
            raise ValueError(f"yt-dlp metadata fetch timed out: {url}")
        if result.returncode != 0:
            raise ValueError(f"yt-dlp metadata failed: {result.stderr.strip()}")
        try:
            info = json.loads(result.stdout)
        except json.JSONDecodeError:
            raise ValueError("Could not parse yt-dlp JSON output")
        return {
            "title": info.get("title", "Unknown"),
            "text": "",
            "metadata": {
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", ""),
                "upload_date": info.get("upload_date", ""),
                "source_type": "video_metadata",
            },
        }

    result = await loop.run_in_executor(None, _fetch)
    return {"ok": True, **result}


# ---------------------------------------------------------------------------
#  Tool: extract_entities
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:26b")

ENTITY_EXTRACTION_PROMPT = """\
Extract all proper nouns, technical terms, abbreviations, and named entities from the following transcript.

Return ONLY a JSON object with this exact shape:
{"entities": ["term1", "term2", ...]}

Rules:
- Include: person names, organization names, place names, product names, technical terms, abbreviations, acronyms
- Exclude: common words, verbs, adjectives, generic nouns
- Preserve original spelling and capitalization exactly as written
- Deduplicate: if a term appears multiple times, include it once
- If the transcript contains no entities, return {"entities": []}

Transcript:
"""


@mcp.tool()
async def extract_entities(
    text: str,
    model: str | None = None,
    ctx: Context = None,
) -> dict:
    """Extract named entities and technical terms from text using a local LLM.

    Designed to produce an initial_prompt for Whisper re-transcription:
    run a fast draft transcription first, extract entities, then re-transcribe
    with the entities as initial_prompt for better spelling accuracy.

    Args:
        text: Text to extract entities from (typically a draft transcript).
        model: Ollama model to use. Default: gemma4:26b.

    Returns:
        Dict with entities list and a ready-to-use initial_prompt string.
    """
    import json as _json
    import urllib.request

    loop = asyncio.get_running_loop()
    use_model = model or OLLAMA_MODEL

    await ctx.info(f"Extracting entities via {use_model} ...")

    def _call_ollama():
        payload = _json.dumps({
            "model": use_model,
            "prompt": ENTITY_EXTRACTION_PROMPT + text,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.0},
        }).encode()

        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            return _json.loads(resp.read())

    try:
        result = await loop.run_in_executor(None, _call_ollama)
    except Exception as e:
        raise ValueError(f"Ollama call failed: {e}")

    raw_response = result.get("response", "")

    try:
        parsed = _json.loads(raw_response)
        entities = parsed.get("entities", [])
    except _json.JSONDecodeError:
        log.warning(f"Failed to parse Ollama JSON response, attempting line extraction")
        entities = [line.strip().strip('"-,') for line in raw_response.splitlines() if line.strip()]

    entities = [e for e in entities if isinstance(e, str) and len(e) >= 2]
    seen: set[str] = set()
    unique: list[str] = []
    for e in entities:
        key = e.lower()
        if key not in seen:
            seen.add(key)
            unique.append(e)

    initial_prompt = ", ".join(unique)
    if len(initial_prompt) > 224:
        initial_prompt = initial_prompt[:224].rsplit(", ", 1)[0]

    await ctx.info(f"Extracted {len(unique)} entities")

    return {
        "ok": True,
        "title": "entity_extraction",
        "text": initial_prompt,
        "metadata": {
            "entities": unique,
            "entity_count": len(unique),
            "model_used": use_model,
            "source_type": "entity_extraction",
        },
    }


# ---------------------------------------------------------------------------
#  Tool: check_deps
# ---------------------------------------------------------------------------

@mcp.tool()
async def check_deps(
    preload_models: bool = False,
    ctx: Context = None,
) -> dict:
    """Check Python dependency availability for Aurora workers.

    Args:
        preload_models: If True, also attempt to load ML models.

    Returns:
        Dict with dependency status.
    """
    loop = asyncio.get_running_loop()
    await ctx.info("Checking dependencies ...")

    from check_deps import check_deps as _check_sync
    result = await loop.run_in_executor(None, _check_sync, "", {"preload_models": preload_models})

    return {"ok": True, **result}


# ---------------------------------------------------------------------------
#  Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if "--check" in sys.argv:
        # Quick dependency check without starting the server
        print("Checking dependencies ...", file=sys.stderr)
        try:
            import whisperx
            print(f"  whisperx: OK", file=sys.stderr)
        except ImportError as e:
            print(f"  whisperx: MISSING ({e})", file=sys.stderr)
            sys.exit(1)
        try:
            import torch
            mps = torch.backends.mps.is_available()
            print(f"  torch: OK (MPS={mps})", file=sys.stderr)
        except ImportError as e:
            print(f"  torch: MISSING ({e})", file=sys.stderr)
        try:
            from mcp.server.fastmcp import FastMCP
            print(f"  mcp: OK", file=sys.stderr)
        except ImportError as e:
            print(f"  mcp: MISSING ({e})", file=sys.stderr)
            sys.exit(1)
        print("All OK", file=sys.stderr)
        sys.exit(0)

    mcp.run(transport="stdio")
