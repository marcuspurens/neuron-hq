# Research: Aurora Digital Tvilling — Arkitektur & Inventering

**Modell:** claude-sonnet-4-6
**Datum:** 2026-02-24
**Klocka:** 17:41
**Fil:** `research-2026-02-24T1741-aurora-digital-tvilling-arkitektur.md`

---

## Syfte

Arkitektursamtal inför bygget av ett "research-superproffsystem" — en digital tvilling av användaren. Systemet ska kunna matas med information (webb, YouTube, ljud, dokument) och dra slutsatser, antingen självständigt eller tillsammans med användaren. Aurora-swarm-lab valdes som bas. Neuron HQ ska övervaka systemet.

---

## Arkitekturbeslut (tagna i detta samtal)

| Fråga | Beslut |
|-------|--------|
| Repo | aurora-swarm-lab (befintligt) |
| Inmatning | Webb, YouTube, ljud (diarization), PDF, PPT, Word |
| OCR-kvalitet | Hög — skannade dokument ska fungera |
| Gränssnitt | MCP (koppling mot Claude Desktop) |
| Embeddings | Snowflake Arctic Embed via Ollama (lokal, gratis) |
| Autonomi (Neuron) | Neuron skapar brief → användaren godkänner → Neuron kör |

---

## Trelagersarkitektur

```
Lager 1: INGESTION
  Webb/YouTube → scrape/yt-dlp → text
  Ljud/Möten  → Whisper + Diarization → transkript
  PDF/PPT/Word → OCR-pipeline → text
  Alla källor → chunks med metadata (källa, datum, talare, ämne)

Lager 2: KNOWLEDGE STORE
  Vektorstore (PostgreSQL/SQLite)  ← semantisk sökning
  Snowflake                        ← metadata + rådata
  Talar-profiler                   ← voice prints → namn

Lager 3: CHAT / INSIKTER
  Användaren frågar: "Vad vet vi om ämne X?"
  Systemet: hämtar relevanta chunks → Claude
  Claude: syntetiserar → insikter + källhänvisningar
```

---

## Fas 0 — Inventering (kördes 2026-02-24)

### Vad Aurora redan har (kod)
75 Python-moduler med: URL-scraping, YouTube-inmatning, PDF/DOCX-extraktion,
Whisper-transkription, Speaker Diarization, Voice Print, vektorsökning,
hybrid-retrieval, memory-system (3 typer), Knowledge Graph, MCP-server (24 verktyg),
Snowflake-integration, job-queue, PII-filtrering, 187 tester (alla gröna).

### Vad som faktiskt är installerat och fungerar

| Komponent | Installerat | Fungerar |
|-----------|-------------|---------|
| PaddleOCR | ✅ | ✅ |
| pytesseract | ✅ | ✅ |
| pypdfium2 | ✅ | ✅ |
| faster_whisper | ✅ | ✅ |
| ffmpeg (system) | ✅ | ✅ |
| tesseract (system) | ✅ | ✅ |
| SQLite | ✅ | ✅ |
| .env konfigurerad | ✅ | ✅ |

### Vad som saknas (inte installerat)

| Komponent | Konsekvens |
|-----------|-----------|
| pyannote.audio | Speaker diarization fungerar inte |
| snowflake-connector-python | Snowflake fungerar inte (SQLite används) |
| python-docx | Word-dokument fungerar inte |
| yt-dlp | YouTube fungerar inte |
| playwright | Headless webb-fallback fungerar inte |
| docling | Ej installerat (var ett missförstånd) |
| whisper CLI | Saknas — men faster_whisper täcker det |
| psycopg2 | PostgreSQL fungerar inte (SQLite fallback) |

### Notering om Docling
Docling är INTE installerat i aurora-swarm-lab trots vad som troddes.
PaddleOCR + pytesseract är installerade och täcker scanned PDFs.
Docling kan vara ett bättre alternativ på sikt (täcker även PPT/Word) men är inte akut.

---

## Prioriterade installationer (nästa fas)

Enkla (en rad var):
```bash
pip install yt-dlp
pip install python-docx
pip install snowflake-connector-python
```

Mer komplex (kräver HuggingFace-token + ~1 GB nedladdning):
```bash
pip install pyannote.audio
# Kräver: PYANNOTE_TOKEN i .env (redan satt)
```

---

## Neuron Monitor — vad som behöver byggas (nytt)

Aurora behöver exponera en statusfil:
```json
{
  "status": "error",
  "component": "ingestion/youtube",
  "error": "yt-dlp returnerade 403",
  "timestamp": "2026-02-24T14:30:00"
}
```

Neuron HQ: ny Monitor-agent (TypeScript) som:
1. Läser `data/health.json` periodvis
2. Skapar brief om status = error
3. Användaren godkänner → Neuron kör körning

---

## Fasplan

| Fas | Innehåll | Neuron-körningar |
|-----|----------|-----------------|
| Fas 0 | Inventering ✅ (detta dokument) | — |
| Fas 1 | Installera saknade paket + verifiera end-to-end | ~2 körningar |
| Fas 2 | PowerPoint-stöd + Snowflake Arctic Embed | ~1 körning |
| Fas 3 | Monitor-agent i Neuron HQ | ~2 körningar |
