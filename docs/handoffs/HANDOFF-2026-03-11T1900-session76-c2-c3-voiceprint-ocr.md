# Handoff: Session 76 — Voiceprint + OCR

**Datum:** 2026-03-11
**Commit:** `8bee851` | **Tester:** 1614 ✅ (+104) | **Körningar:** 114 (+4)

## Gjort

### Körning 111: check-deps 🟢 (`9091eaf`, +16 tester)
- Python worker `check_deps.py` — kontrollerar beroenden
- CLI `aurora:check-deps` + MCP `aurora_check_deps`
- `--preload-models` laddar Whisper-modeller

### Körning 112: C2 Voiceprint-redigering 🟢 (`592360c`, +31 tester)
- `src/aurora/voiceprint.ts` — core: `renameSpeaker`, `mergeSpeakers`, `suggestSpeakerMatches`
- 3 CLI-kommandon: `aurora:rename-speaker`, `aurora:merge-speakers`, `aurora:suggest-speakers`
- 3 MCP-tools: `aurora_rename_speaker`, `aurora_merge_speakers`, `aurora_suggest_speakers`
- Neuron fixade bugg i briefen: `edge.relation` → `edge.type`

### Körning 113: C2.1 Confidence Loop 🟢 (`2c2d7f2`, +32 tester)
- `src/aurora/speaker-identity.ts` — `SpeakerIdentity` med confidence-formel
- `createSpeakerIdentity`, `confirmSpeaker`, `rejectSpeakerSuggestion`, `autoTagSpeakers`
- Confidence: `min(0.95, 0.5 + (n-1) × 0.1)` → auto-tag vid ≥ 0.90 (5 bekräftelser)
- Integrerat i video-ingest: föreslår/taggar automatiskt vid nya videor
- 3 CLI + 4 MCP-tools

### Körning 114: C3 OCR 🟢 (`8bee851`, +25 tester)
- `aurora-workers/extract_ocr.py` — PaddleOCR på bilder (png/jpg/webp)
- `aurora-workers/ocr_pdf.py` — renderar PDF-sidor som bilder → OCR
- `src/aurora/ocr.ts` — `ingestImage()`, `ocrPdf()`, `isTextGarbled()`
- **Auto-fallback**: PDF-ingest → om text ser trasig ut → OCR automatiskt
- 2 CLI + 2 MCP-tools

### Installationer
- `pyannote.audio` 4.0.4 ✅
- `paddleocr` + `paddlepaddle` ✅

## MCP-tools: 33 totalt

Neuron: runs/knowledge/costs/start/cross_ref
Aurora: status/search/ask/ingest_url/ingest_doc/ingest_video/ingest_image/ocr_pdf/remember/recall/memory_stats/voice_gallery/timeline/gaps/briefing/verify_source/freshness_report/learn_conversation/suggest_research/rename_speaker/merge_speakers/suggest_speakers/confirm_speaker/reject_speaker/speaker_identities/auto_tag_speakers/check_deps

## Spår C status

| Steg | Status |
|------|--------|
| C1 Video-pipeline + STT | 🟢 Klar (S74–75) |
| C2 Voiceprint rename/merge/suggest | 🟢 Klar (S76) |
| C2.1 Confidence-loop (auto-tag) | 🟢 Klar (S76) |
| C3 OCR (PaddleOCR + PDF-fallback) | 🟢 Klar (S76) |
| C3.1 Batch-OCR (skannad bok → markdown) | Brief att skriva |
| C4 Lokal vision (Ollama) | Brief att skriva |

## Nästa session

1. **C3.1 Batch-OCR** — ingesta hel mapp med bilder som ett dokument, output som markdown (användaren vill kunna läsa resultatet)
2. **Testa STT + OCR på riktigt** — SVT-video (STT) + bild/trasig PDF (OCR)
3. **C4 Lokal vision via Ollama** (llava/minicpm-v/moondream) — gratis alternativ till Claude Vision

## Beslut tagna

- **C4 ändrad:** "Claude Vision" → "Lokal vision via Ollama" — användaren föredrar gratis, lokala modeller
- **C3.1 batch-OCR:** Output ska vara markdown så användaren kan läsa direkt
