---
session: 5
date: 2026-04-01
variant: llm
---

# Session 5 — LLM-Generated Metadata + Obsidian Rich Export

## Changes

| File                              | Change                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/aurora/intake.ts`            | `extractTags()` replaced by `generateMetadata()`: calls Gemma 3 via Ollama to produce `tags`, `language`, `author`, `contentType`, and `summary`; runs after embedding and cross-reference steps in the ingest pipeline                                             |
| `aurora-workers/extract_url.py`   | `output_format` parameter changed to `'markdown'` so URL extraction returns Markdown-formatted text instead of plain text                                                                                                                                           |
| `src/commands/obsidian-export.ts` | Full text now reconstructed from chunk nodes (not stored on parent); Markdown formatting preserved in output; TL;DR added as blockquote and in frontmatter; empty sections hidden from output; `contentType`, `author`, `language`, and `tags` added to frontmatter |
| `src/mcp/server.ts`               | Scope parameter parsing changed to accept comma-separated scope strings (e.g. `"aurora-insights,aurora-ingest"`)                                                                                                                                                    |

## New/Changed Interfaces

`extractTags()` removed. Replaced by `generateMetadata()`:

```typescript
interface GeneratedMetadata {
  tags: string[]; // LLM-generated semantic tags
  language: string; // ISO 639-1 code (e.g. "sv", "en")
  author: string | undefined;
  contentType: 'article' | 'video' | 'podcast' | 'paper' | 'social' | 'other';
  summary: string; // 1-3 sentence summary for TL;DR
}

async function generateMetadata(
  text: string,
  url: string | undefined,
  title: string | undefined
): Promise<GeneratedMetadata>;
```

Obsidian export frontmatter now includes:

```yaml
---
title: '...'
contentType: article
language: sv
author: '...'
tags:
  - tag1
  - tag2
tldr: '1-3 sentence summary here'
---
```

## Design Decisions

| Decision                                                                    | Rationale                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace heuristic `extractTags()` with LLM `generateMetadata()` via Gemma 3 | Heuristic tag extraction (session 4) had poor accuracy on non-English content and couldn't produce summaries. Gemma 3 (local, no API cost) produces semantically accurate tags, language detection, content type classification, and summaries in one call. |
| Run `generateMetadata()` after embeddings and cross-references              | Metadata generation is the most expensive ingest step (requires an LLM call). Running it last means a failure there doesn't block the cheaper steps (parsing, embedding, cross-refs) from completing.                                                       |
| Reconstruct full text from chunks in Obsidian export                        | The parent node's `properties.text` is truncated to `MAX_EMBED_CHARS` (1500 chars) for embedding purposes. Chunk nodes hold the full un-truncated text. Reading from chunks is the only way to produce complete Obsidian documents.                         |
| Hide empty sections in Obsidian export                                      | Exporting empty `## Tags` or `## Summary` sections created visual noise in Obsidian when metadata was absent. Conditional rendering improves vault readability.                                                                                             |
| MCP comma-separated scopes                                                  | The previous implementation required one scope per MCP call. Comma-separation lets the Hermes cron and other callers request multiple scopes in one invocation, reducing round-trips.                                                                       |
| `extract_url.py` output format changed to markdown                          | Plain text output lost structural cues (headers, lists, code blocks). Markdown-formatted extraction lets the Obsidian exporter preserve document structure without additional parsing.                                                                      |

## Test Delta

| Module         | Before | After    | Delta |
| -------------- | ------ | -------- | ----- |
| **Full suite** | 3949   | **3949** | 0     |

No net new tests added. The `generateMetadata()` function was not unit-tested this session (Gemma 3 calls are not mocked in the test suite yet). This is a known gap.

## Dependencies

External:

| Tool/Script                  | Purpose                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `~/.hermes/aurora-mcp.sh`    | New wrapper script for the Aurora MCP server; allows Hermes to invoke MCP tools without knowledge of the Node.js runtime path |
| `aurora-swarm-lab` directory | Moved to new location (path not specified in source material)                                                                 |

No new npm or Python packages.

## Known Issues

- `generateMetadata()` has no unit tests. LLM calls from Gemma 3 are not mocked. This means the metadata generation pipeline is only E2E-verified, not unit-tested.
- Gemma 3 can return malformed JSON for edge-case inputs (very short text, non-Latin scripts). No JSON parse error boundary exists yet; a parse failure will throw and abort ingest.
- Chunk-based full text reconstruction assumes chunks are stored in order. If chunk ordering is ever non-deterministic, the reconstructed text will be scrambled.
- `contentType` union type is fixed at 6 values. New content types cannot be added without a code change.

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: PASS
- `pnpm test`: PASS (3949/3949)
- Commits: `6961f3b`, `e763718`, `b9afb5a`, `22ba27e`, `c7dc2fa`, `27b848b`, `be9f0b0`, `be62f10`, `4bf5142` (10 commits total this session)
