# TD-3a: MCP Server Split — 10 Focused Servers + Tool Consolidation

## Problem

The Neuron HQ MCP server has 45 tools in a single server. Industry benchmarks show:
- 10 tools = perfect precision (100%)
- 30+ tools = critical threshold (descriptions overlap, confusion)
- 100 tools = Claude Desktop hard limit

Current state: 45 tools → we are well into the degradation zone.

## Solution

Split the monolithic server into 10 focused MCP servers, each with 2-4 tools. Consolidate 5 groups of related tools into single tools with `action` parameters (reducing 45 → 32 tools total). Use `--scope` CLI flag to select which server to start.

## Acceptance Criteria

### 1. Tool Consolidation (5 groups → 5 consolidated tools)

**1a. aurora_speakers** (replaces 8 tools → 1)
1. Create `src/mcp/tools/aurora-speakers.ts` with action parameter: `gallery`, `identities`, `rename`, `merge`, `suggest`, `confirm`, `reject`, `auto_tag`
2. Each action maps to existing function calls (no logic changes)
3. Remove old files: `aurora-voice-gallery.ts`, `aurora-speaker-identities.ts`, `aurora-rename-speaker.ts`, `aurora-merge-speakers.ts`, `aurora-suggest-speakers.ts`, `aurora-confirm-speaker.ts`, `aurora-reject-speaker.ts`, `aurora-auto-tag-speakers.ts`
4. Test: at least 3 tests covering different actions

**1b. aurora_jobs** (replaces 4 tools → 1)
5. Create `src/mcp/tools/aurora-jobs-consolidated.ts` with action: `status`, `list`, `stats`, `cancel`
6. Remove old: `aurora-job-status.ts`, `aurora-jobs.ts`, `aurora-job-stats.ts`, `aurora-cancel-job.ts`
7. Test: at least 2 tests

**1c. aurora_memory** (replaces 3 tools → 1)
8. Create `src/mcp/tools/aurora-memory.ts` with action: `remember`, `recall`, `stats`
9. Remove old: `aurora-remember.ts`, `aurora-recall.ts`, `aurora-memory-stats.ts`
10. Test: at least 2 tests

**1d. aurora_freshness** (replaces 2 tools → 1)
11. Create `src/mcp/tools/aurora-freshness-consolidated.ts` with action: `verify`, `report`
12. Remove old: `aurora-verify.ts`, `aurora-freshness.ts`
13. Test: at least 1 test

**1e. aurora_cross_ref** (replaces 2 tools → 1)
14. Create `src/mcp/tools/aurora-cross-ref.ts` with action: `search`, `integrity`
15. Remove old: `cross-ref.ts`, `cross-ref-integrity.ts`
16. Test: at least 1 test

### 2. Server Scope Registry

17. Create `src/mcp/scopes.ts` defining a `ServerScope` type and a registry mapping each scope name to its tool registration functions
18. Each scope has: `name`, `description`, `registerTools(server)` function
19. 10 scopes defined:

| Scope | Tools |
|-------|-------|
| `aurora-search` | aurora_search, aurora_ask, aurora_status |
| `aurora-insights` | aurora_timeline, aurora_briefing, aurora_suggest_research |
| `aurora-memory` | aurora_memory (consolidated), aurora_learn_conversation, aurora_gaps |
| `aurora-ingest-text` | aurora_ingest_url (from aurora-ingest.ts), aurora_ingest_doc (from aurora-ingest.ts) |
| `aurora-ingest-media` | aurora_ingest_video, aurora_ingest_image, aurora_ingest_book, aurora_ocr_pdf |
| `aurora-media` | aurora_speakers (consolidated), aurora_jobs (consolidated), aurora_ebucore_metadata |
| `aurora-library` | neuron_knowledge_library, neuron_knowledge_manager, neuron_km_chain_status |
| `aurora-quality` | aurora_freshness (consolidated), aurora_cross_ref (consolidated), aurora_confidence, aurora_check_deps |
| `neuron-runs` | neuron_runs, neuron_start, neuron_costs |
| `neuron-analytics` | neuron_dashboard, neuron_run_statistics, neuron_knowledge, neuron_crossref |

20. Test: scopes registry contains exactly 10 entries, each with non-empty registerTools

### 3. Server Factory

21. Modify `src/mcp/server.ts`: `createMcpServer(scope?: string)` — if scope provided, register only that scope's tools. If `all` or undefined, register all tools (backwards compatible)
22. Each scope creates a server with name `neuron-hq-${scope}` (e.g., `neuron-hq-aurora-search`)
23. The notification wrapper (`wrapToolsWithNotification`) only applies to scopes that include job-related tools: `aurora-ingest-media`, `aurora-media`, and `all`
24. Test: `createMcpServer('aurora-search')` registers exactly 3 tools
25. Test: `createMcpServer()` (no arg) registers all 32 tools
26. Test: `createMcpServer('all')` registers all 32 tools

### 4. CLI --scope Flag

27. Add `--scope <name>` flag to `mcp-server` CLI command
28. `npx tsx src/cli.ts mcp-server --scope aurora-search` starts only aurora-search tools
29. `npx tsx src/cli.ts mcp-server` (no flag) starts all tools (backwards compatible)
30. `npx tsx src/cli.ts mcp-server --scope all` same as no flag
31. Invalid scope name → helpful error listing available scopes
32. Test: CLI parses --scope flag correctly

### 5. Split aurora-ingest.ts

33. The current `aurora-ingest.ts` registers both `aurora_ingest_url` and `aurora_ingest_doc` in a single `registerAuroraIngestTools()`. Split into two separate registration functions: `registerAuroraIngestUrlTool()` and `registerAuroraIngestDocTool()` so they can be assigned to different scopes (`aurora-ingest-text` vs keeping them together)
34. Test: both tools still work independently

### 6. Documentation

35. Create `docs/mcp-servers.md` documenting:
    - All 10 scopes with their tools
    - Claude Desktop configuration JSON for all 10 servers
    - Which scopes to enable for common workflows
    - How to add tools to a scope

### 7. No Regressions

36. All existing tests pass (2373+)
37. Typecheck clean
38. Lint clean

## Technical Notes

### Consolidated Tool Pattern

Follow the existing pattern from `knowledge-library.ts`:

```typescript
server.tool(
  'aurora_speakers',
  'Manage speaker voice prints and identities. Actions: gallery, identities, rename, merge, suggest, confirm, reject, auto_tag.',
  {
    action: z.enum(['gallery', 'identities', 'rename', 'merge', 'suggest', 'confirm', 'reject', 'auto_tag']),
    speakerId: z.string().optional(),
    targetId: z.string().optional(),
    name: z.string().optional(),
    // ... other params as optional
  },
  async ({ action, ...params }) => {
    switch (action) {
      case 'gallery': return handleGallery();
      case 'rename': return handleRename(params);
      // ...
    }
  }
);
```

### Scope Registry Pattern

```typescript
// src/mcp/scopes.ts
export interface ServerScope {
  name: string;
  description: string;
  registerTools: (server: McpServer) => void;
}

export const SCOPES: Record<string, ServerScope> = {
  'aurora-search': {
    name: 'aurora-search',
    description: 'Search and query the Aurora knowledge graph',
    registerTools: (server) => {
      registerAuroraSearchTool(server);
      registerAuroraAskTool(server);
      registerAuroraStatusTool(server);
    },
  },
  // ... 9 more
};
```

### Notification Wrapper Scope

The `wrapToolsWithNotification()` checks for completed video jobs. Only scopes that deal with video/jobs need this:
- `aurora-ingest-media` — user just queued a video
- `aurora-media` — user is checking job status
- `all` — backwards compatible

Other scopes skip the wrapper entirely (saves one DB query per tool call).

## Files to Create/Modify

**Create:**
- `src/mcp/tools/aurora-speakers.ts` — consolidated 8→1
- `src/mcp/tools/aurora-jobs-consolidated.ts` — consolidated 4→1
- `src/mcp/tools/aurora-memory.ts` — consolidated 3→1
- `src/mcp/tools/aurora-freshness-consolidated.ts` — consolidated 2→1
- `src/mcp/tools/aurora-cross-ref.ts` — consolidated 2→1
- `src/mcp/scopes.ts` — scope registry
- `docs/mcp-servers.md` — documentation
- `tests/mcp/scopes.test.ts` — scope tests
- `tests/mcp/consolidated-tools.test.ts` — consolidation tests

**Modify:**
- `src/mcp/server.ts` — accept scope parameter
- `src/mcp/tools/aurora-ingest.ts` — split into two registration functions
- `src/commands/mcp-server.ts` — add --scope flag
- `src/cli.ts` — pass --scope to mcp-server command

**Delete (after consolidation):**
- `src/mcp/tools/aurora-voice-gallery.ts`
- `src/mcp/tools/aurora-speaker-identities.ts`
- `src/mcp/tools/aurora-rename-speaker.ts`
- `src/mcp/tools/aurora-merge-speakers.ts`
- `src/mcp/tools/aurora-suggest-speakers.ts`
- `src/mcp/tools/aurora-confirm-speaker.ts`
- `src/mcp/tools/aurora-reject-speaker.ts`
- `src/mcp/tools/aurora-auto-tag-speakers.ts`
- `src/mcp/tools/aurora-job-status.ts`
- `src/mcp/tools/aurora-jobs.ts`
- `src/mcp/tools/aurora-job-stats.ts`
- `src/mcp/tools/aurora-cancel-job.ts`
- `src/mcp/tools/aurora-remember.ts`
- `src/mcp/tools/aurora-recall.ts`
- `src/mcp/tools/aurora-memory-stats.ts`
- `src/mcp/tools/aurora-verify.ts`
- `src/mcp/tools/aurora-freshness.ts`
- `src/mcp/tools/cross-ref.ts`
- `src/mcp/tools/cross-ref-integrity.ts`

## Out of Scope

- MCP Prompts (TD-3b)
- Skills / SKILL.md files (TD-3c)
- Claude Desktop config changes (manual after this brief)
- Renaming existing tool names (keep backwards compatible)
