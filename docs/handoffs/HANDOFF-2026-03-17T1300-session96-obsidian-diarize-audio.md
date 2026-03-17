# HANDOFF — Session 96: Obsidian Export, Diarize Default, Audio Save, aurora:show

**Datum:** 2026-03-17 13:00
**Tester:** 3000 ✅ (oförändrat)
**Commits:** `cd3d8f9` → `5629e66` (6 commits)

---

## Vad gjordes

### 1. OTel-paket borttagna (`cd3d8f9`)
- `@langfuse/otel`, `@opentelemetry/sdk-node`, `@arizeai/openinference-instrumentation-anthropic` borttagna
- −79 dependencies, −737 rader i lock-filen
- Langfuse JS SDK (`langfuse`) kvar och opåverkad

### 2. Obsidian Export (`5854b69`)
- Nytt CLI-kommando: `npx tsx src/cli.ts obsidian-export`
- Exporterar alla Aurora-noder till `/Users/mpmac/Documents/Neuron Lab/Aurora/` som `.md`-filer
- YAML frontmatter, `[[wiki-links]]` för kanter, chunk-namngivning `[chunk N_total]`
- Rensas och skrivs om varje gång (inga dubbletter)
- Obsidians grafvy visar noderna och kopplingarna automatiskt

### 3. aurora:show kommando (`af36bfa`)
- `npx tsx src/cli.ts aurora:show <nodeId>` — visar full metadata, kanter, chunks och text
- Fattades tidigare — `aurora:recall` söker bara i `aurora_memories`, inte `aurora_nodes`

### 4. Diarize default ON (`a968d93`)
- Ändrad default i CLI, MCP tool och job-worker: `diarize: true`
- `--no-diarize` för att stänga av
- Motivering: talaridentifiering är hela poängen med transkribering

### 5. Audio sparas automatiskt (`38eeb2a`)
- Ljudfiler kopieras till `/Users/mpmac/Documents/Neuron Lab/audio/` efter transkribering
- Filnamn: `{nodeId}.{ext}` (t.ex. `yt-EdZWPB1fIJc.wav`)
- `--no-keep-audio` för att stänga av
- Motivering: ljudfiler är små, transkribering tar lång tid — spara alltid

### 6. Pyannote fix (`5629e66`)
- `use_auth_token=` → `token=` i `diarize_audio.py` (nyare pyannote API)
- `PYANNOTE_TOKEN` tillagd i `.env` (Hugging Face token)

---

## Pågående — INTE KLART

### YouTube-video ej re-indexerad med diarize
- Gamla noder (yt-EdZWPB1fIJc) raderades från DB
- Ny ingest med diarize kraschade pga pyannote `use_auth_token` → fixat
- **Token finns nu i .env, pyannote-fix committad — redo att köras om**
- Användaren behöver ha accepterat villkoren på Hugging Face:
  - https://huggingface.co/pyannote/speaker-diarization-3.1
  - https://huggingface.co/pyannote/segmentation-3.0

### Kör om videon:
```bash
npx tsx src/cli.ts aurora:ingest-video "https://www.youtube.com/watch?v=EdZWPB1fIJc"
```
(diarize och keep-audio är nu default)

### Verifiera efter ingest:
```bash
npx tsx src/cli.ts aurora:show yt-EdZWPB1fIJc
npx tsx src/cli.ts obsidian-export
ls "/Users/mpmac/Documents/Neuron Lab/audio/"
```

---

## Insikter

- `aurora:recall` söker bara i `aurora_memories` — behövde `aurora:show` för att visa noder
- Pyannote kräver Hugging Face token + accepterade modellvillkor
- Obsidian-vaultets grafvy fungerar direkt med `[[wiki-links]]` i exporterade markdown-filer
- Chunk-titlar i DB har redan `[chunk N/M]` suffix — exportören behöver strippa det före sin egen namngivning

---

## Nästa steg

1. **Kör om YouTube-videon med diarize** — verifiera voice prints och audio-sparning
2. **Verifiera Langfuse under riktig körning** (från session 95)
3. **Art. 14 — Mänsklig kontroll** — Manager-paus-mekanism (sista AI Act-luckan)

---

## Filer att läsa
- Obsidian export: `src/commands/obsidian-export.ts`
- aurora:show: `src/commands/aurora-show.ts`
- Video ingest: `src/commands/aurora-ingest-video.ts`
- Diarize worker: `aurora-workers/diarize_audio.py`
- CLI: `src/cli.ts`
