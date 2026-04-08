---
session: 12
date: 2026-04-07
variant: llm
---

# Session 12 — Schema.org Metadata Architecture

## Changes

| File | Change |
|------|--------|
| `docs/handoffs/HANDOFF-2026-04-07T1200-...` | NEW handoff |
| `docs/release-notes/SESSION-12-...` | NEW release notes (Marcus + LLM) |
| `docs/dagbocker/DAGBOK-*.md` | Appended session 12 entries |
| `docs/litellm-*.md` | NEW config guides (4 files, can be deleted after fix) |

## New/Changed Interfaces

```typescript
// Designed but NOT yet implemented — session 13
import type { Report, Article, VideoObject, WithContext } from 'schema-dts';

interface AuroraDocument {
  '@context': 'https://schema.org';
  '@type': 'Report' | 'Article' | 'VideoObject' | 'WebPage';
  name: string;                    // title
  creator: string | null;          // author/org
  datePublished: string | null;    // ISO 8601
  inLanguage: string;              // BCP 47
  keywords: string[];              // subjects
  encodingFormat: string;          // MIME type
  aurora: {
    id: string;                    // stable UUID
    sourceHash: string;            // SHA-256
    provenance: AuroraProvenance;
    pages: PageDigest[];           // existing + understanding
    reviewed: boolean;
    reviewedAt: string | null;
  };
}

interface PageUnderstanding {
  pageType: PageType;              // enum: cover, bar_chart, table, text, ...
  pageTypeConfidence: number;      // 0.0–1.0
  chartType: ChartType | null;     // horizontal_bar, pie, line, ...
  title: string | null;
  dataPoints: DataPoint[];
  keyFinding: string | null;
  imageDescription: string | null;
  signals: PageTypeSignals;        // debug: what classifier saw
}
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Schema.org via `schema-dts` over Dublin Core | Superset of DC, Google-supported, TypeScript autocomplete, domain-specific types (`Report` vs generic DC `type: "report"` string), JSON-LD export-ready |
| Minimal Schema.org subset (6 fields) | `name`, `creator`, `datePublished`, `inLanguage`, `keywords`, `encodingFormat` — add more when first consumer needs them |
| `aurora` namespace for extensions | Schema.org fields at top level, Aurora-specific under `aurora: {}` — clean separation, no collision |
| TypeScript interfaces as spec | No separate YAML schema. Types in code, JSON output conforms |
| Facit YAML unchanged | Eval assertions ≠ metadata. Different purpose, different lifecycle |

## Test Delta

No code changes — tests unchanged (3983/3984 passing).

## Known Issues

- **LiteLLM agent routing broken** — `reasoningSummary` parameter incompatible with Azure `gpt-5-nano` (explore, librarian) and `gpt-5.2` (oracle). Main model unaffected. Fix requires LiteLLM server config change.
- Multiple LiteLLM config guide files created in `docs/` during debugging — can be cleaned up after fix.

## Verification

Analysis/design session only. No runtime changes. Baseline unchanged.

**Next**: Session 13: Fix LiteLLM, `pnpm add -D schema-dts`, implement `AuroraDocument`, build page classifier.
