# Handoff — Session 12: Schema.org Metadata Architecture

**Date:** 2026-04-07
**Session:** 12 (OpenCode)
**Model:** Grok-4 → Claude Opus 4.6 (switched mid-session)
**Status:** Design complete, no code changes. Agent routing broken entire session.

---

## What was done

### 1. Metadata architecture deep analysis

Session 11 proposed a three-layer model: Dublin Core + DoclingDocument + page-understanding. Session 12 challenged this:

- **Initial proposal:** Dublin Core (7 fields) as document envelope — rejected as premature
- **User challenge:** "Google, MS, OpenAI use Schema.org — why not us?"
- **Research:** Official DC→Schema.org mappings (DCMI GitHub), `schema-dts` npm package (Google, 1.2k stars, v2.0.0), Schema.org/Report type analysis
- **Final decision:** Use **Schema.org via `schema-dts`** — superset of DC, TypeScript types for `Report`, `VideoObject`, `Article`, JSON-LD compatible

### 2. AuroraDocument interface designed

```typescript
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
```

### 3. LiteLLM agent routing diagnosed

- **Root cause:** `reasoningSummary` parameter sent to Azure models (`gpt-5.2`, `gpt-5-nano`) that don't support it
- **Affected:** All sub-agents (explore → `gpt-5-nano`, librarian → `gpt-5-nano`, oracle → `gpt-5.2`)
- **Not affected:** Main Sisyphus model (user-selected, works fine)
- **Multiple fix attempts:** Model switch Grok→Opus for main model, but sub-agent routing is separate
- **Status:** Unresolved — requires LiteLLM server-side config change

---

## Files changed

| File | Change |
|------|--------|
| `docs/handoffs/HANDOFF-2026-04-07T1200-opencode-session12-schema-org-metadata-architecture.md` | NEW — this handoff |
| `docs/release-notes/SESSION-12-2026-04-07-schema-org-metadata.md` | NEW — Marcus release note |
| `docs/release-notes/SESSION-12-2026-04-07-schema-org-metadata-LLM.md` | NEW — LLM release note |
| `docs/dagbocker/DAGBOK-MARCUS.md` | Appended session 12 entry |
| `docs/dagbocker/DAGBOK-DEV.md` | Appended session 12 entry |
| `docs/dagbocker/DAGBOK-LLM.md` | Appended session 12 entry |
| `docs/litellm-fix-2026-04-06.md` | NEW — LiteLLM config guide (can be deleted) |
| `docs/litellm-sonnet-opus-routing-2026-04-06.md` | NEW — routing guide (can be deleted) |
| `docs/litellm-sonnet-opus-setup.md` | NEW — setup guide (can be deleted) |
| `docs/opencode-litellm-explained-2026-04-06.md` | NEW — architecture explanation (can be deleted) |

---

## What was NOT done

- No code changes (design/research session)
- LiteLLM agent routing not fixed (server-side config)
- No `schema-dts` npm install
- No `AuroraDocument` implementation
- No page_type classifier
- No review tool

---

## Test status

- **3983/3984 tests pass** (unchanged from session 11)
- **typecheck:** clean
- **Agent routing:** BROKEN — all sub-agents fail with `reasoningSummary` error

---

## Next session (13) priorities

### P0: Fix LiteLLM agent routing
The `gpt-5-nano` and `gpt-5.2` model groups in LiteLLM send `reasoningSummary` parameter that Azure doesn't support. Fix options:
1. Remove `reasoningSummary` from these model groups' default params
2. Add Anthropic models as fallback for these groups
3. Replace Azure models with Anthropic for sub-agents

### P1: Install schema-dts and implement AuroraDocument
```bash
pnpm add -D schema-dts
```
Then implement the `AuroraDocument` interface in `src/aurora/types.ts` (or new file).

### P2: Page type classifier
Pure function: `classifyPage(digest: PageDigest): PageUnderstanding`
Uses Docling element counts + vision description → computed `pageType` enum.

### P3: Review CLI / eval runner
Score pipeline output against facit YAML. Interactive review for Marcus.

---

## Key files for next session

- `src/aurora/ocr.ts` — current `PageDigest` interface, `ingestPdfRich()`, `diagnosePdfPage()`
- `tests/fixtures/pdf-eval/` — 5 facit YAML + 5 pipeline JSON
- `docs/plans/PLAN-pdf-eval-loop-2026-04-04.md` — eval workflow plan
- Schema.org Report: https://schema.org/Report
- `schema-dts` npm: https://www.npmjs.com/package/schema-dts (Google, TypeScript types)

---

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Schema.org via `schema-dts` over Dublin Core | Schema.org is superset of DC, Google-supported, has TypeScript types with autocomplete, domain-specific types (`Report`, `VideoObject`), JSON-LD compatible for future export |
| Minimal Schema.org subset | Only fields we need: `name`, `creator`, `datePublished`, `inLanguage`, `keywords`, `encodingFormat`. Add more when first consumer needs them |
| TypeScript interfaces as spec | No separate YAML schema — types live in code, pipeline JSON conforms to them |
| Facit YAML stays separate | Eval assertions ≠ metadata. Different purpose, different lifecycle |
| `page_type` computed, not prompted | Docling element counts + vision signal → classifier function. Better model = better results automatically |
| `aurora` namespace for extensions | Schema.org fields at top level, Aurora-specific fields under `aurora: {}` — clean separation |

---

## Setup for next session

```bash
# Verify baseline
pnpm typecheck && pnpm test

# Install schema-dts
pnpm add -D schema-dts

# Test pipeline still works
AURORA_PYTHON_PATH=/opt/anaconda3/bin/python3 npx tsx src/cli.ts aurora:pdf-diagnose "tests/fixtures/ungdomsbarometern.pdf" --page 10

# Test agent routing (after LiteLLM fix)
# All three should succeed without reasoningSummary error
```
