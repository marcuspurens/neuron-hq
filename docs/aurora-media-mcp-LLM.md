# Aurora Media MCP Server — LLM Reference

You have access to the `aurora-media` MCP server for audio/video processing. This document tells you how to use it.

## Tools

### transcribe_audio

Transcribe audio to text with word-level timestamps using WhisperX.

**When to use:** User asks to transcribe, index, or process audio/video content.

**Parameters:**

| Parameter | Required | Type | Default | When to set |
|---|---|---|---|---|
| `audio_path` | yes | string | — | Absolute path to audio file |
| `language` | no | string | auto-detect | Set when user specifies language or you know it. Use BCP-47 codes: `sv`, `en`, `de`, etc. Swedish (`sv`) triggers a specialized KB-Whisper model for better quality. |
| `whisper_model` | no | string | `large-v3-turbo` | Only override if user explicitly requests a specific model. |
| `batch_size` | no | int | 8 | Lower if running out of memory. Higher for faster processing of long files. |
| `align` | no | bool | true | Set false only if user wants fast draft without word timestamps. |
| `compute_type` | no | string | `float32` | `float32` = best quality (default). `float16` = nearly identical, faster. `int8` = fast draft, lower quality. Only change if user asks for speed over quality. |
| `beam_size` | no | int | 5 | Higher = more accurate, slower. `1` = greedy decoding (fastest). `10` = thorough search. Change when user mentions quality vs speed preference. |
| `initial_prompt` | no | string | none | Domain-specific terms that help Whisper spell technical words correctly. Set this when transcribing domain content. Examples: `"AUTOSAR, ECU, ImobMgr"` for automotive, `"Kubernetes, kubectl, etcd"` for DevOps. |

**Choosing parameters based on user intent:**

| User says | Parameters to set |
|---|---|
| "transkribera den här" | Just `audio_path`. Defaults handle the rest. |
| "transkribera på svenska" | `language="sv"` — triggers KBLab/kb-whisper-large |
| "snabb transkribering" | `compute_type="int8"`, `beam_size=1`, `align=false` |
| "bästa möjliga kvalitet" | Defaults are already max quality. Optionally `beam_size=10`. |
| "det handlar om AUTOSAR" | `initial_prompt="AUTOSAR, ECU, IMMO, ImobMgr, CAN bus"` |
| "transkribera intervjun med Marcus och Helena" | `initial_prompt="Marcus, Helena"` to help with name spelling |

**Why initial_prompt matters — before/after:**

Without prompt, Whisper guesses spelling from sound alone:
- "Imob manager" → with `initial_prompt="ImobMgr"` → "ImobMgr"
- "seco-skyddat" → with `initial_prompt="SecOC"` → "SecOC-skyddat"
- "Marcus Perens" → with `initial_prompt="Marcus Purens"` → "Marcus Purens"
- "et cetera" (when speaker said "etcd") → with `initial_prompt="etcd"` → "etcd"
- "UNISA regulation" → with `initial_prompt="UNECE"` → "UNECE Regulation"

**Rule: Always set initial_prompt when you know the domain.** Extract proper nouns, abbreviations, and technical terms from the user's message or conversation context. This is the single highest-impact parameter for transcription accuracy.

**Warning: Only include terms that actually appear in the audio.** Whisper's decoder is biased toward reproducing initial_prompt tokens. If you include a name or term that nobody says in the recording, Whisper may hallucinate it into the transcript. When uncertain whether a term appears, leave it out.

### extract_entities

Extract named entities and technical terms from text using a local LLM (Gemma 4 via Ollama). Returns a ready-to-use `initial_prompt` string.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `text` | yes | string | — |
| `model` | no | string | `gemma4:26b` |

**Primary use case — two-pass transcription:**

1. `transcribe_audio(audio_path, compute_type="int8", beam_size=1)` → fast draft
2. `extract_entities(text=draft.text)` → returns `initial_prompt` string
3. `transcribe_audio(audio_path, initial_prompt=entities.text)` → high-quality result

The LLM orchestrating the pipeline should do this automatically when the user doesn't provide domain terms.

### diarize_audio

Identify who speaks when. Requires PYANNOTE_TOKEN.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `audio_path` | yes | string | — |
| `num_speakers` | no | int | auto-detect |
| `min_speakers` | no | int | none |
| `max_speakers` | no | int | none |

Set `num_speakers` when user tells you how many people are in the recording.

### denoise_audio

Remove background noise via DeepFilterNet. Call before transcription if audio is noisy.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `audio_path` | yes | string | — |
| `output_dir` | no | string | same directory |

### extract_video

Download audio + subtitles + metadata from a URL via yt-dlp.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `url` | yes | string | — |
| `skip_subtitles` | no | bool | false |
| `sub_lang` | no | string | `"en,sv"` |

## Pipeline pattern

For best results on video URLs, chain tools in this order:

1. `extract_video` — download audio from URL
2. `denoise_audio` — clean the audio (if needed)
3. `transcribe_audio` — transcribe with WhisperX
4. `diarize_audio` — identify speakers (if multi-speaker)

## Response format

All tools return `{ ok: true, title, text, metadata }` on success.
`metadata.segments` contains timestamped segments with word-level detail.
`metadata.language` tells you the detected/used language.
`metadata.model_used` tells you which Whisper model was used.
