# R1.1: Robust Input-Pipeline

**Datum:** 2026-03-19
**Target:** neuron-hq
**Estimerad risk:** MEDIUM
**Estimerad storlek:** ~400 rader (ny kod + ändringar)
**Roadmap:** Fas 1, punkt 1.1

---

## Bakgrund

Aurora har en fungerande input-pipeline (`aurora:ingest-video`, `aurora:ingest-url`) med 12-stegs video-flöde, asynkron jobbkö, chunkning, embedding och korsreferenser. Tekniken fungerar — det som saknas är:

1. **Felmeddelanden som en icke-utvecklare förstår** — idag skickas Python-tracebacks rakt ut
2. **Detaljerad steg-för-steg-feedback** — idag ser användaren bara start/slut per steg, inte vad som händer inuti
3. **Retry vid tillfälliga fel** — embedding-batch som faller skippas permanent
4. **Sammanfattande pipeline-rapport** — efter ingest finns ingen överblick av vad som hände

---

## Mål

"Här är en länk → allt händer" — med tydlig feedback och begripliga felmeddelanden.

---

## Acceptanskriterier

### Del A: Mänskliga felmeddelanden

Alla 6 pipeline-steg som kan falla (`extract_video`, `transcribe_audio`, `diarize_audio`, `extract_url`, `autoEmbedAuroraNodes`, `findNeuronMatchesForAurora`) ska ha:

1. **Ett svenskt felmeddelande** som förklarar vad som gick fel, utan teknisk jargong
2. **En förslag-text** som säger vad användaren kan prova (t.ex. "Kontrollera att URL:en är giltig" eller "Starta Ollama med `ollama serve`")
3. **Teknisk detalj sparad i logg** — full error stack finns kvar i logger för felsökning

**Konkret implementation:**
- Skapa en `src/aurora/pipeline-errors.ts` med en `PipelineError`-klass och en mappning steg → svensk förklaring
- Wrappa varje pipeline-steg i en try-catch som konverterar till `PipelineError`
- CLI och MCP-tools visar det svenska meddelandet, inte rå-felet

**Kriterier:**
- [ ] Alla 6 listade pipeline-steg har svensk felbeskrivning + förslag
- [ ] Vid fel ser användaren t.ex. `❌ Transkribering misslyckades: Ljudfilen kunde inte hittas. Prova: kontrollera att yt-dlp laddade ner videon korrekt.`
- [ ] Rå Python-tracebacks når aldrig CLI-output (loggas med `logger.debug`)
- [ ] Tester verifierar att varje steg producerar rätt `PipelineError` vid simulerat fel

### Del B: Detaljerad progress-feedback (enbart video-pipeline)

Utöka `onProgress`-callbacken i `ingestVideo()` (`video.ts`) med mer granulär information. **OBS:** `intake.ts` saknar `onProgress` idag — URL/fil-ingest får progress-förbättringar i en framtida brief.

**Under varje steg**, visa:
```
[1/7] ⬇️  Laddar ner video... OK (245 MB, 34s)
[2/7] 🎤 Transkriberar med KBLab/kb-whisper-large... OK (847 ord, 12:34 längd)
[3/7] 👥 Diarization (pyannote 3.1)... OK (3 talare identifierade)
[4/7] ✂️  Chunkning... OK (23 chunks, snitt 120 ord, 20 ord overlap)
[5/7] 🧮 Embedding (snowflake-arctic-embed, 1024 dim)... OK (23 vektorer)
[6/7] 🔗 Korsreferenser... OK (4 kopplingar till befintlig kunskap)
[7/7] 💾 Sparat till databas
```

**Detaljnivå:** Stegen ska ha sammanfattande metadata (filstorlek, antal ord, antal talare, antal chunks, antal vektorer, antal korsreferenser). Denna information gör att Marcus lär sig vad pipeline gör.

**Kriterier:**
- [ ] CLI visar stegnummer, emoji, stegnamn, och sammanfattande metadata vid lyckad körning
- [ ] Vid fel visas steg + felmeddelande (från Del A) + vilka steg som kvarstod
- [ ] MCP-tool returnerar samma information i text-format
- [ ] `onProgress` i `video.ts` utökas med metadata-objekt (typ, steg-nummer, sammanfattning)

### Del C: Retry för embedding-batchar

Idag: om en 20-nods embedding-batch faller, loggas det och noderna skippas.
Nytt: retry med exponentiell backoff (2s, 4s). Om alla retry faller, logga vilka noder som missade embedding.

**Kriterier:**
- [ ] `autoEmbedAuroraNodes()` har retry-loop (max 2 retries, exponentiell backoff 2s → 4s)
- [ ] Vid slutligt misslyckande: logga node IDs som saknar embedding
- [ ] Test som simulerar embedding-fel och verifierar retry-beteende

### Del D: Pipeline-rapport efter ingest

Efter avslutad ingest (video eller URL), skapa en sammanfattande rapport som sparas på noden:

```json
{
  "pipeline_report": {
    "steps_completed": 7,
    "steps_total": 7,
    "duration_seconds": 145,
    "details": {
      "download": {"status": "ok", "size_mb": 245, "duration_s": 34},
      "transcribe": {"status": "ok", "words": 847, "model": "KBLab/kb-whisper-large", "language": "sv"},
      "diarize": {"status": "ok", "speakers": 3},
      "chunk": {"status": "ok", "chunks": 23, "avg_words": 120},
      "embed": {"status": "ok", "vectors": 23, "retries": 0},
      "crossref": {"status": "ok", "matches": 4},
      "save": {"status": "ok"}
    }
  }
}
```

**Vid partiellt fel:** Rapporten sparas med alla lyckade steg som `"status": "ok"`, det fallerade steget som `"status": "error", "message": "..."`, och efterföljande steg som `"status": "skipped"`. Rapporten sparas *alltid*, även vid fel — så att man kan se hur långt pipeline kom.

**Kriterier:**
- [ ] `pipeline_report` sparas som property på transcript-/doc-noden
- [ ] Rapporten inkluderar status + metadata per steg
- [ ] Vid partiellt fel: lyckade steg = "ok", fallet steg = "error" + meddelande, resterande = "skipped"
- [ ] `aurora:show <nodeId>` visar pipeline-rapporten om den finns

---

## Berörda filer

**Nya filer:**
- `src/aurora/pipeline-errors.ts` — PipelineError-klass + steg→felmeddelande-mappning
- `tests/aurora/pipeline-errors.test.ts` — tester för felmeddelanden och retry

**Ändrade filer:**
- `src/aurora/video.ts` — wrappa steg i PipelineError, utöka onProgress med metadata, bygga pipeline-rapport
- `src/aurora/intake.ts` — wrappa steg i PipelineError, spara pipeline-rapport på doc-noder
- `src/aurora/aurora-graph.ts` — retry-loop i `autoEmbedAuroraNodes()`
- `src/commands/aurora-ingest-video.ts` — visa svenska felmeddelanden, utökad progress-vy
- `src/commands/aurora-ingest.ts` — visa svenska felmeddelanden
- `src/commands/aurora-show.ts` — visa pipeline_report om den finns på noden
- `src/mcp/tools/aurora-ingest-video.ts` — returnera pipeline-rapport i tool-result
- `src/mcp/tools/aurora-ingest.ts` — returnera pipeline-rapport i tool-result
- `tests/aurora/video.test.ts` — utöka med progress-metadata-tester
- `tests/aurora/intake.test.ts` — utöka med retry + pipeline-rapport-tester

---

## Tekniska krav

- `PipelineError` ska vara en vanlig Error-subklass med properties: `step`, `userMessage`, `suggestion`, `originalError`
- Svenska felmeddelanden hårdkodas i en mappning (inte i18n-ramverk — onödigt komplext)
- Pipeline-rapport byggs progressivt under körning (inte retroaktivt)
- Retry använder `setTimeout` — inga externa retry-bibliotek
- Befintlig error-propagation i video.ts och intake.ts ska bevaras — PipelineError wrappas *utanpå*, inte istället för

---

## Vad detta INTE inkluderar

- Batch-ingest (flera URL:er i en kö) — separat brief
- OB-1c Obsidian-synk — separat brief
- Pause/resume av jobb — för komplext för denna brief
- Ändring av chunkning-algoritmen — den fungerar bra
- Progress-feedback för URL/fil-ingest (`intake.ts` saknar `onProgress`) — framtida brief
- PipelineError för image- och book-ingest — separat brief

---

## Risker

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| PipelineError-wrapping bryter befintliga try-catch-kedjor | Medium | Testa varje steg individuellt, behåll befintlig error-propagation |
| Progress-metadata kräver ändringar i worker-bridge return-typer | Låg | Worker-bridge returnerar redan metadata, behöver bara forwarda |
| Retry-loop i embedding fördröjer pipeline vid rate-limit | Låg | Exponentiell backoff (2s, 4s), max 6s extra worst case |
| Svenska felmeddelanden kan bli inaktuella när pipeline ändras | Låg | Meddelandemappningen är en enda fil — enkel att uppdatera |

---

## Commit-meddelande

```
feat(aurora): robust pipeline with Swedish errors, progress metadata, retry & report
```

---

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-19-r11-robust-input-pipeline.md --hours 2
```
