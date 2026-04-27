---
session: 23
date: 2026-04-27
variant: llm
---

# Session 23 — Whisper Parameter Exposure + Entity Extraction Tool

## Changes

| File | Change |
|---|---|
| `aurora-workers/mcp_server.py` | Added `compute_type`, `beam_size`, `initial_prompt` params to `transcribe_audio`; changed default compute_type from int8 to float32; added `whisper_compute_type` tracking to `MediaState` for reload optimization; added `extract_entities` tool calling Gemma 4 via Ollama |
| `src/aurora/media-client.ts` | Added `computeType`, `beamSize`, `initialPrompt` to `transcribeAudio()` options; added `extractEntities()` wrapper; added `'extract_entities'` to `MediaAction` union |
| `docs/aurora-media-mcp-LLM.md` | New — LLM reference for all media MCP tools with parameter selection guidance |
| `docs/aurora-media-mcp-DEV.md` | New — developer reference with architecture, env vars, model lifecycle |
| `docs/aurora-media-mcp-MARCUS.md` | New — Swedish user guide with prompt examples and before/after NER demos |
| `docs/aurora-media-mcp-WORKSHOP.md` | New — non-technical explainer with brain/nervous-system/hands Mermaid diagrams |

## New/Changed Interfaces

```typescript
// media-client.ts — transcribeAudio options expanded
transcribeAudio(audioPath: string, options?: {
  whisperModel?: string;
  language?: string;
  computeType?: 'int8' | 'float16' | 'float32';  // NEW — default float32
  beamSize?: number;                                // NEW — default 5
  initialPrompt?: string;                           // NEW
}, callOptions?: MediaToolCallOptions): Promise<WorkerResponse>

// media-client.ts — new function
extractEntities(text: string, options?: {
  model?: string;  // default gemma4:26b
}, callOptions?: MediaToolCallOptions): Promise<WorkerResponse>

// MediaAction union — extended
type MediaAction = ... | 'extract_entities';
```

```python
# mcp_server.py — MediaState extended
@dataclass
class MediaState:
    whisper_compute_type: str = "float32"  # NEW — tracks loaded compute_type
    ...

# mcp_server.py — extract_entities tool
# Calls Ollama API, returns {ok, title, text (initial_prompt string), metadata: {entities, entity_count, model_used}}
```

## Design Decisions

| Decision | Rationale |
|---|---|
| Default compute_type changed to float32 | User prioritizes quality over speed. float32 is marginally better than float16 but user explicitly requested it. |
| MediaState tracks compute_type | Avoids expensive model reload when same compute_type is used across calls |
| extract_entities uses Ollama not GLiNER | Gemma 4 already available locally, understands context better than zero-shot NER, no new dependency |
| initial_prompt truncated at 224 chars | Whisper context window is 448 tokens ≈ 224 chars. Not verified against WhisperX source — flagged as risk. |
| No transcribe_audio_smart wrapper | User decided pipeline logic should be a skill (.md file), not hardcoded Python/TypeScript |

## Test Delta

No new tests written. Python syntax verified. TypeScript LSP diagnostics clean. No runtime test against Ollama performed.

## Known Issues

- `extract_entities` untested against live Ollama
- initial_prompt 224-char limit is estimated, not verified
- Two-pass pipeline (draft→entities→full) requires LLM orchestration — no automation yet
- Code review identified 16 files with hardcoded LLM prompts that should be .md files (plan in handoff)

## Verification

- Python syntax: `ast.parse()` — OK
- TypeScript: `lsp_diagnostics` — no errors
- Typecheck: not available in shell environment (node not in PATH)

## Next

1. Test extract_entities against Ollama
2. Create `.claude/skills/transkribera/SKILL.md` for two-pass pipeline
3. Begin Tier 1 skills extraction (ask.ts, semantic-split.ts, vision.ts, intake.ts)
4. Create `config/llm-defaults.yaml` for centralized model/token config

Handoff: `docs/handoffs/HANDOFF-2026-04-27-opencode-session23-whisper-params-entities-skills.md`
