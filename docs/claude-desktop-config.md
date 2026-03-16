# Claude Desktop Configuration

> Last updated: 2026-03-16

This guide provides complete `claude_desktop_config.json` configurations for connecting Claude Desktop to Neuron HQ's MCP servers. Each server exposes a focused set of tools (2–4 per scope) for optimal tool-call precision.

For background on why we split into scopes, see [MCP Server Architecture](./mcp-servers.md).

---

## Complete Configuration (All 10 Scopes)

Copy this into your `claude_desktop_config.json` and replace `/path/to/neuron-hq` with the absolute path to your Neuron HQ checkout:

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

> **Important**: Replace every `/path/to/neuron-hq` with the actual absolute path to your Neuron HQ directory (e.g. `/Users/you/neuron-hq`). You may also need to add an `env` block with `PATH` and `DATABASE_URL` — see `mcp-config.example.json` in the repo root for a working example.

---

## Recommended Setup

You don't need all 10 scopes active at once. We recommend an **always-on** base plus **on-demand** scopes for specific workflows.

### Always-On Scopes

These two scopes cover the most common daily interactions:

| Scope | Why |
|-------|-----|
| `aurora-search` | Search the knowledge graph, ask questions, check system status |
| `aurora-memory` | Remember findings, recall past context, detect knowledge gaps |

### On-Demand Scopes by Workflow

Enable additional scopes based on what you're doing:

| Workflow | Scopes | Use Case |
|----------|--------|----------|
| **Research** | `aurora-insights`, `aurora-library`, `aurora-quality` | Deep analysis, briefings, research suggestions, quality audits |
| **Ingestion** | `aurora-ingest-text`, `aurora-ingest-media`, `aurora-media` | Adding new content (URLs, docs, video, images, books, PDFs) |
| **Development** | `neuron-runs`, `neuron-analytics` | Managing agent runs, viewing dashboards and statistics |

---

## Minimal Configs by Workflow

Copy-paste ready configurations for common workflows. Replace `/path/to/neuron-hq` in each.

### Always-On (Recommended Baseline)

```json
{
  "mcpServers": {
    "neuron-aurora-search": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-search"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-memory": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-memory"],
      "cwd": "/path/to/neuron-hq"
    }
  }
}
```

### Research Workflow

Always-on scopes plus research, library, and quality tools:

```json
{
  "mcpServers": {
    "neuron-aurora-search": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-search"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-memory": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-memory"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-insights": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-insights"],
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
    }
  }
}
```

### Ingestion Workflow

Always-on scopes plus ingestion and media management tools:

```json
{
  "mcpServers": {
    "neuron-aurora-search": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-search"],
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
    }
  }
}
```

### Development Workflow

Always-on scopes plus Neuron run management and analytics:

```json
{
  "mcpServers": {
    "neuron-aurora-search": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-search"],
      "cwd": "/path/to/neuron-hq"
    },
    "neuron-aurora-memory": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server", "--scope", "aurora-memory"],
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

---

## All-in-One Alternative

For backwards compatibility, you can run a single server that registers all 32 tools:

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

> **Caveat**: With 32 tools on a single server, you will hit the tool-count degradation zone. Industry benchmarks show tool-call precision drops significantly above 15–20 tools. The split-scope approach keeps each server at 2–4 tools for near-perfect precision. Use `--scope all` only for quick testing, not production use.

---

## Config File Location

The `claude_desktop_config.json` file lives at:

| OS | Path |
|----|------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

After editing the config, restart Claude Desktop for changes to take effect.
