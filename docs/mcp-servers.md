# MCP Server Architecture

> Last updated: 2026-03-16

## Overview

Neuron HQ exposes its functionality through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), allowing Claude Desktop and other MCP clients to interact with Aurora's knowledge graph, ingestion pipeline, and Neuron's run management.

### Why We Split

The original monolithic MCP server registered all tools on a single server instance. Industry benchmarks show that tool-call precision degrades significantly as tool count increases:

| Tool Count | Precision |
|------------|-----------|
| ≤10 | ~100% — perfect |
| 15–20 | Noticeable degradation |
| 30+ | Critical threshold — descriptions overlap, model confusion |
| 100 | Claude Desktop hard limit |

With 45 tools on one server, we were deep in the degradation zone. Tool consolidation (merging related tools into single tools with `action` parameters) reduced the count from 45 to **32 tools**. Splitting those 32 tools across **10 focused servers** means each server exposes 2–4 tools — well within the perfect-precision range.

### Current State

- **10 scopes** (each runs as an independent MCP server)
- **32 tools** total
- **2–4 tools per scope** (optimal for model precision)
- Backwards compatible: `--scope all` (or no flag) registers all tools on one server

---

## Available Scopes

| Scope | Tools | Description |
|-------|-------|-------------|
| `aurora-search` | `aurora_search`, `aurora_ask`, `aurora_status` | Full-text and semantic search, Q&A, system status |
| `aurora-insights` | `aurora_timeline`, `aurora_briefing`, `aurora_suggest_research` | Timeline analysis, daily briefings, research suggestions |
| `aurora-memory` | `aurora_memory`, `aurora_learn_conversation`, `aurora_gaps` | Persistent memory — remember/recall/stats, conversation learning, gap detection |
| `aurora-ingest-text` | `aurora_ingest_url`, `aurora_ingest_doc` | Ingest text content — URLs and documents |
| `aurora-ingest-media` | `aurora_ingest_video`, `aurora_ingest_image`, `aurora_ingest_book`, `aurora_ocr_pdf` | Ingest rich media — video, images, books, OCR for PDFs |
| `aurora-media` | `aurora_speakers`, `aurora_jobs`, `aurora_ebucore_metadata` | Speaker management, job tracking, EBUCore metadata |
| `aurora-library` | `neuron_knowledge_library`, `neuron_knowledge_manager`, `neuron_km_chain_status` | Knowledge library browsing, knowledge-manager agent, chain status |
| `aurora-quality` | `aurora_freshness`, `aurora_cross_ref`, `aurora_confidence`, `aurora_check_deps` | Source freshness, cross-reference integrity, confidence scoring, dependency checks |
| `neuron-runs` | `neuron_runs`, `neuron_start`, `neuron_costs` | List/start agent runs, track costs |
| `neuron-analytics` | `neuron_dashboard`, `neuron_run_statistics`, `neuron_knowledge`, `neuron_crossref` | Analytics dashboard, run statistics, knowledge graph queries, CrossRef lookups |

---

## Claude Desktop Configuration

Each scope runs as a separate MCP server. Add the scopes you need to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neuron-aurora-search": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-search"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-insights": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-insights"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-memory": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-memory"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-ingest-text": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-ingest-text"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-ingest-media": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-ingest-media"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-media": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-media"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-library": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-library"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-quality": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-quality"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-runs": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "neuron-runs"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-analytics": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "neuron-analytics"],
      "cwd": "/path/to/neuron-hq"
    }
  }
}
```

> **Tip**: Replace `/path/to/neuron-hq` with the absolute path to your Neuron HQ checkout. You may also need to set `env` with `PATH` and `DATABASE_URL` — see `mcp-config.example.json` for reference.

### All-in-One (Not Recommended)

For backwards compatibility, you can still run a single server with all 32 tools:

```json
{
  "mcpServers": {
    "neuron-hq": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "all"],
      "cwd": "/path/to/neuron-hq"
    }
  }
}
```

Or simply omit the `--scope` flag entirely. This is **not recommended** for production use due to tool-count degradation.

---

## Common Workflows

Enable only the scopes you need for your current task:

### Research Workflow

For searching, analyzing, and building knowledge:

| Scope | Why |
|-------|-----|
| `aurora-search` | Search and ask questions against the knowledge graph |
| `aurora-insights` | Get briefings, timelines, and research suggestions |
| `aurora-memory` | Remember findings and detect knowledge gaps |

### Ingestion Workflow

For adding new content to the knowledge base:

| Scope | Why |
|-------|-----|
| `aurora-ingest-text` | Ingest URLs and documents |
| `aurora-ingest-media` | Ingest videos, images, books, PDFs |
| `aurora-media` | Manage speakers, track jobs, view metadata |

### Development Workflow

For managing Neuron agent runs:

| Scope | Why |
|-------|-----|
| `neuron-runs` | Start runs, list runs, track costs |
| `neuron-analytics` | View dashboard, run statistics, knowledge queries |

### Quality Assurance

For auditing and maintaining knowledge quality:

| Scope | Why |
|-------|-----|
| `aurora-quality` | Check freshness, cross-references, confidence, dependencies |
| `aurora-library` | Browse and manage the knowledge library |

### Full Stack

Enable all 10 scopes for unrestricted access. Or use `--scope all` on a single server (with the caveat of 32 tools on one server).

---

## Adding Tools to a Scope

To add a new MCP tool:

1. **Create the tool file** in `src/mcp/tools/`

   Follow the existing pattern — export a `registerXxxTool(server: McpServer)` function:

   ```typescript
   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import { z } from 'zod';

   export function registerMyNewTool(server: McpServer): void {
     server.tool(
       'my_new_tool',
       'Description of what this tool does.',
       {
         param1: z.string().describe('What this parameter does'),
       },
       async (args) => {
         // Implementation
         return {
           content: [{ type: 'text' as const, text: 'result' }],
         };
       },
     );
   }
   ```

2. **Add the import** to `src/mcp/scopes.ts`

   ```typescript
   import { registerMyNewTool } from './tools/my-new-tool.js';
   ```

3. **Register in the appropriate scope's `registerTools`**

   ```typescript
   'aurora-search': {
     name: 'aurora-search',
     description: '...',
     registerTools(server: McpServer): void {
       registerAuroraSearchTool(server);
       registerAuroraAskTool(server);
       registerAuroraStatusTool(server);
       registerMyNewTool(server);  // ← add here
     },
   },
   ```

4. **Update this docs page** — add the tool to the scope table above

5. **Write tests** — at minimum one test verifying the tool registers correctly

> **Guidelines**: Keep each scope at ≤5 tools. If a scope would exceed 5 tools, consider creating a new scope or consolidating related tools into a single tool with an `action` parameter.
