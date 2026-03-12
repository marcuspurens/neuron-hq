# Handoff: Session 74

**Datum:** 2026-03-10 11:00
**Session:** 74
**Status:** C1 🟢 — Video-pipeline generaliserad + realtestning

---

## Vad som gjordes

### C1: Video-pipeline realtestning + generalisering 🟢
- Commit: `1a69b24`
- +17 tester (1485 → 1502)

#### Timeout-fix
- `extract_video`: 60s → 5 min
- `transcribe_audio`: 60s → 10 min
- `diarize_audio`: 60s → 10 min

#### Generalisering (YouTube → alla yt-dlp-sajter)
- `youtube.ts` → `video.ts`: `isVideoUrl()`, `videoNodeId()`, `ingestVideo()`
- `extract_youtube.py` → `extract_video.py`: accepterar alla URL:er
- `aurora:ingest-youtube` → `aurora:ingest-video`
- `aurora_ingest_youtube` → `aurora_ingest_video`
- Domänlista: youtube, vimeo, svt, svtplay, tv4, tv4play, tiktok, dailymotion, twitch, rumble
- Nod-ID: YouTube `yt-{id}` (bakåtkompatibelt), övriga `vid-{sha256(url).slice(0,12)}`

#### publishedDate metadata
- Video: `upload_date` från yt-dlp → `publishedDate` (YYYY-MM-DD)
- URL: `metadata.date` från trafilatura → `publishedDate`
- Indexeringsdatum: redan `created`-fältet

#### Realtestning
- YouTube: "Only 40 lines of code" ✅ (10 chunks, 1 voice print)
- SVT: "Norge miljardsatsar i Lofoten" ✅ (3 chunks, 1 voice print, platform: svt:page)

---

## Aktuellt läge

| Mått | Värde |
|------|-------|
| Tester | 1502 ✅ |
| Körningar | 109 (alla GREEN) |
| MCP-tools | 23 (aurora_ingest_youtube → aurora_ingest_video) |
| Spår klara | A ✅ B ✅ D ✅ S ✅ C1 ✅ |
| Spår aktiva | C (C2–C4 kvar) · E (planerad) |

---

## Nästa steg

### STT-förbättringar (inför C2)
Användaren vill ha:
1. **Språkidentifiering** — Whisper kan detektera språk, men vi loggar det inte tydligt och använder det inte för modelval
2. **KW-Whisper svenska large** — bättre STT-modell för svenska, speciellt med keywords
3. **Automatiskt modelval baserat på språk** — t.ex. `large` för svenska, `small` som default

### C2: Voiceprint-redigering
- Rename SPEAKER_1 → "Marcus"
- Merge speakers (samma person, olika videos)
- Suggest matches (embedding-similarity)
- **Confidence scoring:** Efter ~5 bekräftelser → etablerad voiceprint

### Kommando för att testa:

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx src/cli.ts aurora:ingest-video "https://www.youtube.com/watch?v=VIDEO_ID" --diarize
npx tsx src/cli.ts aurora:ingest-video "https://www.svt.se/nyheter/..." --diarize
```

---

## Filer ändrade denna session

| Fil | Ändring |
|-----|---------|
| `aurora-workers/extract_youtube.py` → `extract_video.py` | Generaliserad, +publishedDate |
| `aurora-workers/__main__.py` | extract_video + alias |
| `aurora-workers/extract_url.py` | +publishedDate |
| `src/aurora/youtube.ts` → `video.ts` | isVideoUrl, videoNodeId, ingestVideo |
| `src/aurora/worker-bridge.ts` | +extract_video action |
| `src/aurora/intake.ts` | isVideoUrl routing |
| `src/aurora/index.ts` | Uppdaterade exports |
| `src/commands/aurora-ingest-youtube.ts` → `aurora-ingest-video.ts` | Generaliserat |
| `src/mcp/tools/aurora-ingest-youtube.ts` → `aurora-ingest-video.ts` | Generaliserat |
| `src/cli.ts` | aurora:ingest-video |
| `src/mcp/server.ts` | aurora_ingest_video |
| `tests/aurora/youtube.test.ts` → `video.test.ts` | +17 tester |
| `tests/commands/aurora-ingest-youtube.test.ts` → `aurora-ingest-video.test.ts` | Uppdaterat |
| `tests/mcp/tools/aurora-ingest-youtube.test.ts` → `aurora-ingest-video.test.ts` | Uppdaterat |
| `tests/aurora/auto-cross-ref.test.ts` | ingestVideo |
| `tests/commands/aurora-ingest-cross-ref.test.ts` | ingestVideo |
