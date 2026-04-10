# Aurora — Second Brain Roadmap

> **Senast uppdaterad:** 2026-04-10 · OpenCode Session 15
> **Mål:** Aurora fungerar som second brain — indexera, minnas, söka, svara.

---

## Status just nu

| Mått                  | Värde                            |
| --------------------- | -------------------------------- |
| Senaste gröna körning | 2026-04-10 (4015 tester)         |
| MCP-tools             | 45                               |
| Databas               | PostgreSQL + pgvector (1024-dim) |
| Obsidian vault        | "Neuron Lab"                     |

---

## Pågående spår

### PDF Pipeline Quality (Session 11–15)

Facit-driven eval-loop för att mäta och förbättra PDF-ingest-kvaliteten.

| #   | Steg                              | Status       | Session |
| --- | --------------------------------- | ------------ | ------- |
| ✅  | `diagnosePdfPage()` — diagnostik  | Klar         | 10      |
| ✅  | Facit YAML-format + eval runner   | Klar         | 11      |
| ✅  | Page classifier (`classifyPage`)  | Klar         | 13      |
| ✅  | `aurora_pdf_eval` MCP tool        | Klar         | 14      |
| ✅  | Prompt comparison CLI             | Klar         | 14      |
| ✅  | Pages wired into graph nodes      | Klar         | 15      |
| ✅  | Fuzzy scoring + number normalize  | Klar         | 15      |
| 🔜  | **Vision prompt tuning v2**       | **Nästa**    | —       |

**P3: Vision prompt tuning** — Skapa en förbättrad vision-prompt (v2) och testa den mot befintlig facit med `aurora:pdf-eval-compare`. Kräver interaktiv session med Marcus (kör prompt → inspektera output → iterera). **Beror på P2 (fuzzy scoring) som nu är klar.**

```bash
pnpm neuron aurora:pdf-eval-compare \
  --facit tests/fixtures/pdf-eval/ \
  --prompt-a "current" \
  --prompt-b "src/aurora/prompts/pdf-vision-v2.txt"
```

### Kompilerade koncept-artiklar (Session 15 → framtida)

Ny feature inspirerad av Joel Rangsjö / Karpathys "LLM Knowledge Bases"-koncept. Aurora ska producera läsbara, pre-kompilerade sammanfattningar per koncept.

**Plan:** [`docs/plans/PLAN-compiled-concept-articles-2026-04-10.md`](docs/plans/PLAN-compiled-concept-articles-2026-04-10.md)

| WP  | Vad                                  | Effort | Status  |
| --- | ------------------------------------ | ------ | ------- |
| WP1 | `compileConceptArticle(conceptId)`   | 3-4h   | Planerad |
| WP2 | MCP-exponering                       | 1-2h   | Planerad |
| WP3 | Koncept-index (INDEX.md-motsvarighet)| 1-2h   | Planerad |
| WP4 | Svar som flödar tillbaka             | 1-2h   | Planerad |
| WP5 | Ingest → koncept-brygga              | 2-3h   | Planerad |

---

## Redan klart

| Funktion                              | Verifieringskommando          |
| ------------------------------------- | ----------------------------- |
| Video-ingest (YouTube, audio)         | `aurora:ingest-video <url>`   |
| PDF-ingest + OCR-fallback + vision    | `aurora:ingest rapport.pdf`   |
| Rich PDF pipeline (per-page vision)   | `aurora:ingest-pdf <fil>`     |
| Page classification (16 typer)        | Automatisk i rich PDF         |
| Semantisk sökning + PPR              | `aurora:search <term>`        |
| Fråga-svar med källhänvisningar       | `aurora:ask <fråga>`          |
| Confidence decay + Bayesian audit     | `aurora:confidence`           |
| Auto-embedding vid ingest             | Automatisk i intake-pipeline  |
| Semantisk dedup i memory              | `aurora:remember` (≥0.85)     |
| Cross-system sökning (Aurora+Neuron)  | `aurora:cross-ref search`     |
| Obsidian round-trip (export+import)   | `obsidian-export/import`      |
| Speaker timeline + diarization        | `aurora:identify-speakers`    |
| LLM-korrekturläsning                  | `aurora:polish <nodeId>`      |
| Knowledge gaps + research suggestions | `aurora:gaps`                 |
| Morning briefing                      | `aurora:morning-briefing`     |
| Knowledge library (syntes-artiklar)   | `neuron:knowledge-library`    |
| Concept ontology + hierarchy          | `neuron:knowledge-library concepts` |
| Schema.org document types             | Automatisk i pipeline         |
| EBUCore multimedia metadata           | `aurora:ebucore-metadata`     |
| Facit-driven PDF eval                 | `aurora:pdf-eval`             |
| Prompt comparison                     | `aurora:pdf-eval-compare`     |
| CrossRef DOI lookup                   | `crossref:lookup`             |

---

## Kommande (ej prioriterat)

| Funktion            | Beskrivning                                                   |
| ------------------- | ------------------------------------------------------------- |
| Schema.org JSON-LD  | `documentToJsonLd()` — exportera AuroraDocument som JSON-LD   |
| DOCX/XLSX intake    | `aurora:ingest rapport.docx`                                  |
| Voice-to-brain      | Diktera → transkribera → remember → länka                     |
| HyDE-sökning        | Generera hypotetiskt svar → embed → bättre sökträffar         |
| Dashboard           | Visuell vy av kunskapsgrafen, timeline, gaps                  |
| Batch re-indexing   | Omembedda alla noder med ny modell                            |
