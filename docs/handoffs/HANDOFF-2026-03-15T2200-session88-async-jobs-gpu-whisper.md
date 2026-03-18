# HANDOFF-2026-03-15T2200 — Session 88: Async Jobs + GPU Whisper + MCP Fix

## Sammanfattning

Session 88: 1 körning (139) 🟢 GREEN + manuella fixar. +36 tester (2319 → 2355).
Fokus: GPU-acceleration, MCP-server stabilitet, asynkron video-pipeline.

## Körningar

| # | Brief | Tester | Nyckel |
|---|-------|--------|--------|
| 139 | TD-2 Async Video Ingest | +36 | Jobb-kö, status, stats, cancel, metadata pre-fetch |

## Vad levererades

### Manuella fixar (innan körning)

1. **GPU-acceleration: mlx-whisper**
   - Installerade `mlx-whisper 0.4.3` + `MLX 0.31.1` (Apple Metal)
   - Uppdaterade `aurora-workers/transcribe_audio.py` — föredrar GPU, faller tillbaka CPU
   - MLX backend bekräftad: `Device(gpu, 0)`
   - Estimerad speedup: 5-10x jämfört med faster-whisper CPU

2. **Höjda timeouts i `video.ts`**
   - Nedladdning: 5 min → 10 min
   - Transkribering: 10 min → 30 min
   - Diarisering: 10 min → 20 min

3. **MCP JSON-RPC-fix: dotenv stdout-förorening**
   - **Rotorsak:** `dotenv@17.3.1` skrev `[dotenv] injecting env...` till stdout vid varje start
   - Stdout = JSON-RPC transport → Claude Desktop kunde inte parsa → "Invalid JSON-RPC message"
   - **Fix:** `config({ quiet: true })` i `src/cli.ts`
   - Också: `console.log` → `console.error` i `video.ts` och `intake.ts`

4. **Migreringsfixar**
   - `010_composite_indexes.sql`: `confidence_audit.created_at` → `"timestamp"` (rätt kolumnnamn)
   - `010_composite_indexes.sql`: `run_statistics` → `run_beliefs` (rätt tabellnamn)
   - Kopierade migrationer 013-016 från `migrations/` till `src/core/migrations/` (rätt katalog)
   - Alla 16 migrationer applicerade (010-016 var pending)

### Körning 139 — TD-2 Async Video Ingest (GREEN, +36 tester)

- `src/aurora/job-runner.ts` — jobb-CRUD, kö (max 1 samtidig), dedup, stats, cleanup
- `src/aurora/job-worker.ts` — bakgrundsprocess via `child_process.fork()`
- `migrations/016_aurora_jobs.sql` — jobbtabell med status, timing, backend, PID
- MCP: `aurora_ingest_video` returnerar nu omedelbart med jobb-ID
- MCP: `aurora_job_status` — kontrollera progress, steg, ETA, backend
- MCP: `aurora_jobs` — lista senaste jobb
- MCP: `aurora_job_stats` — aggregerad statistik
- MCP: `aurora_cancel_job` — avbryt köad/pågående
- Quick metadata: `yt-dlp --dump-json --no-download` för titel+längd på <1 sek
- Dedup: samma URL kan inte köas dubbelt
- 37/37 acceptance criteria, 35 nya tester

### Obsidian-beslut

- `obsidian-mcp-client` (prefrontalsys) finns inte längre på GitHub
- Alternativen (`AzureMaples/obsidian-mcp-client`) är proof-of-concept, 1 stjärna, osäkert
- **Beslut:** Använd Claude Desktop som MCP-klient, Obsidian som anteckningsyta
- Ny vault skapad: "Neuron Lab" i `/Users/mpmac/Documents/Neuron Lab`

## Vad som INTE blev klart

Brief `TD-2b` skriven men ej körd — 4 deferred features:
1. **Passiv "klart!"-notis** — wrapper runt alla MCP-tools som kollar nyligen klara jobb
2. **CLI-kommandon** `jobs` och `job-stats`
3. **Riktig progress-tracking** — `onProgress` callback i `ingestVideo()`
4. **Temp-filstädning** — auto-radera video/ljud, logga bytes

## Nästa steg (session 89)

1. **Kör TD-2b** (`briefs/2026-03-15-td2b-job-polish.md`) — passiv notis, CLI, progress, cleanup
2. **Testa video-ingest i Claude Desktop** — verifiera att async + dotenv-fix fungerar
3. **Indexera YouTube-klipp** med GPU-transkribering
4. **Testa voice print-flödet** med riktigt innehåll

## Kommando för nästa session

Kör TD-2b:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-15-td2b-job-polish.md --hours 1
```

## MCP-server (45 tools)

Starta om Claude Desktop för att plocka upp alla ändringar:
```bash
npx tsx src/cli.ts mcp-server
```

41 befintliga + 4 nya: `aurora_job_status`, `aurora_jobs`, `aurora_job_stats`, `aurora_cancel_job`

## Briefs

- `briefs/2026-03-15-td2-async-video-ingest.md` (körd → 139)
- `briefs/2026-03-15-td2b-job-polish.md` (ej körd — nästa session)
