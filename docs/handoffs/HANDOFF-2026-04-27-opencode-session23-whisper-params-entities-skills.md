# Handoff — Session 23

**Datum:** 2026-04-27
**Scope:** WhisperX parameter-exponering, entity extraction MCP-tool, dokumentation, skills-audit

---

## Vad som gjordes

### 1. WhisperX — nya exponerade parametrar

`aurora-workers/mcp_server.py` — `transcribe_audio` fick tre nya MCP-parametrar:

- **`compute_type`** (`float32`/`float16`/`int8`) — default ändrad från `int8` till `float32` (kvalitet framför hastighet)
- **`beam_size`** (int) — sökbredd, default 5
- **`initial_prompt`** (string) — domäntermer som guidar Whispers decoder

`MediaState` trackar nu `whisper_compute_type` — modellen laddas bara om vid faktisk ändring.

`src/aurora/media-client.ts` — `transcribeAudio()` wrapper uppdaterad med `computeType`, `beamSize`, `initialPrompt`.

### 2. Nytt MCP-tool: `extract_entities`

`aurora-workers/mcp_server.py` — nytt tool som anropar Gemma 4 (26B) via Ollama för att extrahera egennamn, förkortningar och tekniska termer ur text.

Designat för tvåstegs-transkribering:
1. Snabb draft → `extract_entities` → initial_prompt → full kvalitet

`src/aurora/media-client.ts` — `extractEntities()` wrapper, `MediaAction` utökad.

### 3. Dokumentation — fyra varianter

| Fil | Målgrupp |
|---|---|
| `docs/aurora-media-mcp-LLM.md` | LLM/Skills — parameterval baserat på user intent |
| `docs/aurora-media-mcp-DEV.md` | Utvecklare — arkitektur, env-vars, gotchas |
| `docs/aurora-media-mcp-MARCUS.md` | Marcus — prompt-exempel för att styra kvalitet |
| `docs/aurora-media-mcp-WORKSHOP.md` | Workshop-deltagare — hjärna/nervsystem/händer-metafor, Mermaid-diagram |

### 4. Extern workshop-aktivitet (ej Neuron HQ-kod)

- Fork: `marcuspurens/gaia-workshop-2026` (TReqs AUTOSAR immobilizer-modell)
- Repo: `marcuspurens/sw-trace` (graph-constrained RAG pipeline)
- Fork: `marcuspurens/MiroFish` (referens, ej installerat)
- UNECE R155 impact analysis med Mermaid-subgraph

---

## Vad som INTE gjordes

- Ingen `transkribera/SKILL.md` skapad — beslut att göra det som del av bredare skills-refactoring
- Inget faktiskt test av `extract_entities` mot Ollama
- `initial_prompt` 224-teckens-gräns ej verifierad mot WhisperX-källkod
- Inga tester skrivna för nya parametrar

---

## Plan: Code Review — Skills-refactoring

### Mål

Flytta hardkodad LLM-beteendelogik från TypeScript till editerbara `.md`-filer (skills och prompter).

### Tier 1 — Högst prioritet (nästa session)

| Fil | Extrahera till | Effort |
|---|---|---|
| `aurora/video.ts` — 12-stegs pipeline | `.claude/skills/transkribera/SKILL.md` (pipeline som skill) | Medium |
| `aurora/ask.ts` — SYSTEM_PROMPT + learnFromAnswer | `prompts/aurora-ask.md` | Låg |
| `aurora/semantic-split.ts` — 3 promptar | `prompts/semantic-split.md` (sektioner) | Låg |
| `aurora/vision.ts` — system + default prompt | `prompts/aurora-vision.md` | Låg |
| `aurora/intake.ts` — metadata-taxonomi | `prompts/aurora-intake.md` | Låg |

### Tier 2 — Bra kandidater (session efter)

| Fil | Extrahera till |
|---|---|
| `aurora/transcript-polish.ts` prompt | `prompts/transcript-polish.md` |
| `aurora/transcript-tldr.ts` prompt | `prompts/transcript-tldr.md` |
| `aurora/speaker-guesser.ts` prompt | `prompts/speaker-guesser.md` |
| `aurora/morning-briefing.ts` fråge-prompt | `prompts/morning-briefing.md` |
| `aurora/briefing.ts` pipeline | `.claude/skills/briefing/SKILL.md` |
| `aurora/memory.ts` kontradiktionsprompt | `prompts/memory-contradiction.md` |
| `aurora/gap-brief.ts` prompt | `prompts/gap-brief.md` |
| `aurora/ocr.ts` prompt + pipeline | `prompts/ocr-vision.md` |

### Tier 3 — Konfiguration (separat fil)

Skapa `config/llm-defaults.yaml` för:
- Modellval per uppgift (haiku/opus/ollama)
- max_tokens per uppgift
- temperature-inställningar
- Tröskelvärden (similarity, confidence)

16 ställen i koden har hardkodade sådana värden.

### Mönster för extraktion

Befintligt mönster i `knowledge-gaps.ts`:
```typescript
const promptPath = resolve(__dirname, '../../prompts/emergent-gaps.md');
const systemPrompt = readFileSync(promptPath, 'utf-8');
```

Samma mönster för alla Tier 1/2-extraheringar. Koden ändras minimalt.

### Verifiering per extrahering

1. Extrahera prompt till `.md`
2. Byt `const SYSTEM_PROMPT = "..."` mot `readFileSync(promptPath)`
3. Kör `pnpm typecheck`
4. Kör relaterade tester
5. Verifiera att beteendet är identiskt

---

## Risker / Oklarheter

- `initial_prompt` 224-teckens-gräns: troligen korrekt (Whisper context window = 448 tokens ≈ 224 tecken) men bör verifieras
- `extract_entities` Ollama-timeout 120s: kan vara för kort för väldigt långa transkript
- Video-pipelinen (`video.ts`) är komplex — 928 rader, 12 steg med conditions. Skill-extrahering kräver noggrann design.

---

## Rekommenderad nästa åtgärd

1. **Testa `extract_entities`** mot Ollama med ett riktigt transkript
2. **Skapa `transkribera/SKILL.md`** — tvåstegs-pipelinen som skill
3. **Börja Tier 1-extrahering** med `aurora/ask.ts` (enklast, högst impact)
