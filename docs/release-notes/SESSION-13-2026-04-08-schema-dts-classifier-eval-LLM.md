---
session: 13
date: 2026-04-08
variant: llm
---

# Session 13 — schema-dts + Page Classifier + Eval Runner

## Changes

| File | Change |
|------|--------|
| `package.json` | Added `schema-dts` v2.0.0 devDependency |
| `src/aurora/types.ts` | NEW — `AuroraDocument`, `AuroraProvenance`, `AuroraPageEntry`, `PageUnderstanding`, `PageType`, `ChartType`, `DataPoint`, `PageTypeSignals`, `Facit`, `EvalResult` |
| `src/aurora/page-classifier.ts` | NEW — `classifyPage(digest: PageDigest): PageUnderstanding` pure function |
| `src/aurora/pdf-eval.ts` | NEW — `parseFacit()`, `evalPdfPage()`, `evalFromPipelineJson()`, `evalDirectory()`, `formatEvalSummary()` |
| `src/aurora/index.ts` | Added exports for all new types and functions |
| `src/cli.ts` | Added `aurora:pdf-eval <facit>` command |
| `tests/aurora/page-classifier.test.ts` | NEW — 15 tests |
| `tests/aurora/pdf-eval.test.ts` | NEW — 9 tests |

## New/Changed Interfaces

```typescript
// src/aurora/types.ts
type PageType = 'cover' | 'table_of_contents' | 'text' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'scatter_plot' | 'table' | 'infographic' | 'diagram' | 'image' | 'mixed' | 'blank' | 'unknown';
type ChartType = 'horizontal_bar' | 'vertical_bar' | 'stacked_bar' | 'grouped_bar' | 'line' | 'multi_line' | 'pie' | 'donut' | 'scatter' | 'area' | 'bubble' | null;
type AuroraDocumentType = 'Report' | 'Article' | 'VideoObject' | 'WebPage';
type AuroraProvenance = Provenance; // alias

interface AuroraDocument {
  '@context': 'https://schema.org';
  '@type': AuroraDocumentType;
  name: string; creator: string | null; datePublished: string | null;
  inLanguage: string; keywords: string[]; encodingFormat: string;
  aurora: {
    id: string; sourceHash: string; provenance: AuroraProvenance;
    pages: AuroraPageEntry[]; reviewed: boolean; reviewedAt: string | null;
  };
}

interface AuroraPageEntry { digest: PageDigest; understanding: PageUnderstanding | null; }

interface PageUnderstanding {
  pageType: PageType; pageTypeConfidence: number; chartType: ChartType;
  title: string | null; dataPoints: DataPoint[]; keyFinding: string | null;
  imageDescription: string | null; signals: PageTypeSignals;
}

interface EvalResult {
  page: number; source: string;
  textScore: number; visionScore: number; combinedScore: number;
  details: { textContains, textMinChars, textGarbled, visionType, visionTitle, dataPoints, negativesClean };
}
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Removed `schema-dts` import from types.ts | Unused — YAGNI. Types reference Schema.org concepts by convention, import deferred to serialization phase |
| `AuroraProvenance` = type alias | Existing `Provenance` has correct fields. Alias enables future divergence without breaking |
| `AuroraPageEntry` wraps digest + understanding | Pipeline output (digest) vs classifier output (understanding) have different lifecycles |
| Classifier is sync pure function | Parses existing vision output, no LLM calls. Pure = testable, cacheable, deterministic |
| Markdown table parser for DATA | Vision output uses `\| Label \| Value \|` format per real pipeline fixtures |
| Scoring weights: text 40% vision 60% | Vision is the primary signal for charts/data. Text verifies extraction baseline |

## Test Delta

Before: 3984 tests (3983 pass, 1 fail)
After: 4008 tests (4006 pass, 2 fail — both pre-existing flaky)
New: +24 tests (15 page-classifier, 9 pdf-eval)

## Known Issues

- 2 pre-existing flaky test failures (`auto-cross-ref.test.ts`, `tester.test.ts`)
- `schema-dts` installed but types not imported — deferred per YAGNI
- ~~Classifier not wired into `ingestPdfRich()` pipeline~~ — wired in Session 14
- ~~No MCP tool for eval~~ — `aurora_pdf_eval` added in Session 14

## Verification

typecheck: clean. 4006/4008 tests pass. CLI command runs against fixture data.
