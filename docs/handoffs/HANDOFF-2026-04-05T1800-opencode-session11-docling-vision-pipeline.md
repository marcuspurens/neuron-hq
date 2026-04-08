# Handoff — Session 11: Docling + Vision Pipeline

**Date:** 2026-04-05
**Session:** 11 (OpenCode)
**Status:** Complete — pipeline working, facit ready for review

---

## What was done

### 1. Vision model fix: qwen3-vl thinking bug

**Problem:** `qwen3-vl:8b` = thinking variant. `think: false` ignored due to missing ChatML template (ollama/ollama#14798). All `num_predict` tokens consumed by thinking → empty content.

**Fix:** Switched to `qwen3-vl:8b-instruct-q8_0` (9.8 GB) via custom Modelfile wrapper:

- `ollama/Modelfile.vision-extract` — temp 0, seed 42, num_ctx 32768, SYSTEM prompt, JSON few-shot
- Config default: `aurora-vision-extract`
- `vision.ts` refactored: diagnostics logging (load/eval/tokens), `keep_alive: 10m`, `stat` size check (10MB limit)

### 2. Docling integration as primary PDF extractor

**Why:** pypdfium2 gives flat text without structure. Docling (IBM, v2.84.0) gives markdown with headings, tables, layout, OCR — 53 pages in 38s.

**Architecture:**

```
PDF → Docling (full document, ~38s) → per-page markdown + tables
  ├─ Pages without images → Docling markdown is sufficient
  └─ Pages with <!-- image --> → Vision model fills in chart/diagram data
```

**Files changed:**
| File | Change |
|------|--------|
| `aurora-workers/docling_extract.py` | NEW — Docling worker: per-page markdown + tables + image count |
| `aurora-workers/__main__.py` | Registered `extract_pdf_docling` action |
| `src/aurora/worker-bridge.ts` | Added `extract_pdf_docling` to action union |
| `src/aurora/ocr.ts` | `diagnosePdfPage` now uses Docling as primary. Vision only triggers for pages with `<!-- image -->` |
| `src/aurora/vision.ts` | Refactored: VisionDiagnostics, stat check, keep_alive, temperature 0 |
| `src/core/config.ts` | Default vision model → `aurora-vision-extract` |
| `ollama/Modelfile.vision-extract` | NEW — Custom instruct wrapper |
| `.env.example` | Updated setup instructions |
| `tests/aurora/vision.test.ts` | Full rewrite for new API |
| `tests/aurora/ocr.test.ts` | Updated diagnosePdfPage mocks for Docling |
| `tests/core/config.test.ts` | New default model |
| `tests/fixtures/pdf-eval/*.json` | Pipeline output for 5 pages |
| `tests/fixtures/pdf-eval/*.yaml` | Facit skeletons (partially reviewed by Marcus) |

### 3. Metadata model research

Marcus did deep research on metadata standards (Dublin Core, Schema.org, JATS, TEI, DataCite, DoclingDocument). Decision reached:

**Three-layer model:**

1. **Dublin Core envelope** — discovery/bibliographic (title, creator, date, subject)
2. **DoclingDocument** — internal canonical model (text, tables, pictures, structure)
3. **Page-understanding extension** — our addition: page_type (computed from Docling elements + vision signal), chart_type, data_points, image_description

**Key insight:** `page_type` should be _computed_ from Docling element-labels + vision signal, not hardcoded in the vision prompt. This way, upgrading the vision model automatically improves classification.

### 4. Python dependency state

Docling 2.84.0 upgraded numpy to 2.4.4, which broke pyarrow/pandas. Fixed by upgrading:

- pyarrow → 23.0.1
- pandas → 3.0.2
- bottleneck → 1.6.0
- numexpr → 2.14.1

Note: streamlit 1.37.1 has unresolved dependency conflicts (pandas<3, protobuf<6, rich<14). Not blocking.

---

## Test status

- **3983/3984 tests pass** (1 pre-existing failure in `auto-cross-ref.test.ts`)
- **Docling worker verified** on 5 pages of Ungdomsbarometern
- **Vision model verified** — 5/5 pages analyzed, no timeouts with instruct variant

---

## What was NOT done

- v1 metadata spec not written (decided to defer to session 12)
- page_type classifier not built (deferred)
- No eval loop built (WP2-4 from PLAN-pdf-eval-loop)
- Facit only partially reviewed by Marcus (page 1 done)

---

## Next session (12) priorities

1. **Land v1 metadata spec** — Docling + Dublin Core + page-understanding extension, concrete YAML schema
2. **Build page_type classifier** — combine Docling element-labels (text count, table count, image count, header labels) with vision signal to compute page_type
3. **Build data review UI/workflow** — Marcus needs a way to see full pipeline output per page, edit/correct it, so prompts can be tuned iteratively

---

## Setup for next session

```bash
# Vision model (already pulled + created)
ollama list | grep aurora-vision-extract

# If missing:
ollama pull qwen3-vl:8b-instruct-q8_0
ollama create aurora-vision-extract -f ollama/Modelfile.vision-extract

# Pin before running diagnose:
curl http://localhost:11434/api/chat -d '{"model":"aurora-vision-extract","messages":[{"role":"user","content":"Hello"}],"stream":false,"options":{"num_predict":5},"keep_alive":"30m"}'

# Run diagnose:
AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3 npx tsx src/cli.ts aurora:pdf-diagnose "<pdf>" --page 10 --language sv
```

---

## Key files to read

- `ollama/Modelfile.vision-extract` — vision model configuration
- `aurora-workers/docling_extract.py` — Docling Python worker
- `src/aurora/ocr.ts` (lines 440-553) — `diagnosePdfPage` with Docling + vision
- `src/aurora/vision.ts` — vision analysis with diagnostics
- `tests/fixtures/pdf-eval/` — pipeline output + facit skeletons
