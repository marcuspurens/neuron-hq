# Aurora Brain — Roadmap

**Vision:** Aurora ska vara en personlig hjärna som minns allt — samtal, PPT, Word, URL,
YouTube, ljud — och kan svara på frågor med precision och källhänvisningar.

**Metod:** Neuron HQ skriver briefs → körningar förbättrar Aurora steg för steg.

---

## Fas A — Indexeringskvalitet (pågående)

Målet är att varje chunk som indexeras innehåller tillräckligt med semantisk information
för att hittas oavsett hur användaren formulerar sin fråga.

| # | Förbättring | Vad det innebär | Effekt | Status |
|---|-------------|-----------------|--------|--------|
| A1 | **Chunk-summaries** | LLM genererar 1–2 menings sammanfattning som prepend till chunk-texten vid indexering | ⬆⬆⬆ | ❌ Nästa brief |
| A2 | **Entity-extraktion** | Extrahera namn, organisationer, datum, nyckelord ur varje chunk och spara i metadata | ⬆⬆ | ⚠️ Delvis |
| A3 | **Embedding-konsistens** | Säkerställ att alla chunks indexeras med samma modell (snowflake-arctic-embed) | ⬆ | ⚠️ Oklart |
| A4 | **Transcript overlap** | Lägg till 20% overlap i transcript-chunkning (matchar text-chunkning) | ⬆ | ❌ |

---

## Fas B — Retrieval & Ranking

Målet är att de 10 chunks som returneras alltid är de 10 mest relevanta.

| # | Förbättring | Vad det innebär | Effekt | Status |
|---|-------------|-----------------|--------|--------|
| B1 | **Dynamisk top-k** | Enkla frågor hämtar 5 chunks, komplexa 20 — baserat på frågans längd/komplexitet | ⬆ | ❌ |
| B2 | **HyDE** | Generera ett hypotetiskt svar på frågan → embed det → använd som sökvektor | ⬆⬆ | ❌ |
| B3 | **Cross-encoder re-ranking** | Använd en separat modell för att slutsorterade top-k baserat på fråga+chunk-par | ⬆⬆ | ❌ |
| B4 | **MMR (diversity)** | Maximal Marginal Relevance — undvik att returnera 10 nästan identiska chunks | ⬆ | ❌ |

---

## Fas C — Inmatningsflöden

Målet är att Aurora kan ta emot alla informationstyper utan manuell hantering.

| # | Flöde | Vad det innebär | Status |
|---|-------|-----------------|--------|
| C1 | **URL-skrapning** | Skrapa webbsida → extrahera text → chunk → indexera | ⚠️ Finns kod, ej testat end-to-end |
| C2 | **YouTube** | yt_dlp laddar ner → Whisper transkriberar → chunk → indexera | ⚠️ yt_dlp installerat, flöde ej testat |
| C3 | **PDF** | Extrahera text (pypdfium2/OCR) → chunk → indexera | ⚠️ Finns, PaddleOCR saknas |
| C4 | **Word/PPT** | python-docx / python-pptx extraktion → chunk → indexera | ⚠️ python-docx installerat |
| C5 | **Dropbox live-sync** | Ny fil i Dropbox → automatisk indexering | ✅ on_deleted finns, on_created? |
| C6 | **Ljud/möten** | Whisper + diarization → transkript → chunk → indexera | ⚠️ Whisper ok, pyannote saknas |

---

## Fas D — Svarsqualitet

Målet är att Aurora svarar på ett sätt som känns som en klok kollega, inte en sökmotor.

| # | Förbättring | Vad det innebär | Status |
|---|-------------|-----------------|--------|
| D1 | **Källhänvisningar** | Varje svar pekar på exakt källa (URL, dokument, tidsstämpel) | ⚠️ Delvis |
| D2 | **Sammanfattning av minne** | Aurora kan svara "vad minns jag om person X?" med sammanfattning | ❌ |
| D3 | **Tidslinje** | Aurora kan svara "vad hände under 2025?" kronologiskt | ❌ |
| D4 | **Konfidensindikator** | Aurora säger "jag är osäker" när chunks har låg score | ❌ |

---

## Fas E — Infrastruktur

| # | Förbättring | Vad det innebär | Status |
|---|-------------|-----------------|--------|
| E1 | **Docker** | Aurora i container — reproducerbart, portabelt | ❌ |
| E2 | **PaddleOCR** | OCR för skannade dokument | ❌ |
| E3 | **pyannote.audio** | Speaker diarization i möten | ❌ |
| E4 | **Batch re-indexering** | Omindexera alla gamla chunks med ny modell/summaries | ❌ |

---

## Prioritetsordning

```
A1 (chunk-summaries)
  ↓
C1+C2 (testa URL + YouTube end-to-end)
  ↓
A2 (entity-extraktion)
  ↓
B2 (HyDE)
  ↓
C3+C4 (PDF + Word)
  ↓
B3 (cross-encoder)
  ↓
D1+D2 (svarsqualitet)
  ↓
E1 (Docker)
```

---

*Senast uppdaterad: 2026-02-26*
*Ägare: Neuron HQ (implementerar) + användaren (godkänner briefs)*
