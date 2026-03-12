# Neuron HQ Architecture

> Last updated: 2026-03-03 (Session 63)

Neuron HQ is a **control plane** that orchestrates autonomous agent swarms to develop code in target repositories. It provides isolation, auditability, policy enforcement, persistent learning, and structured artifact generation.

## System Overview

```
                              ┌──────────────────────────────────────────────────────────────────────┐
                              │                          NEURON  HQ                                  │
                              │                                                                      │
                              │  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌───────────────┐  ┌─────┐│
                              │  │   CLI     │  │   Policy     │  │  Audit   │  │  Model        │  │ MCP ││
                              │  │ Commands  │  │  Enforcer    │  │  Logger  │  │  Registry     │  │Serv.││
                              │  └────┬─────┘  └──────┬───────┘  └────┬─────┘  └──────┬────────┘  └──┬──┘│
                              │       │               │               │               │             │
                              │  ┌────▼───────────────▼───────────────▼───────────────▼──────────┐  │
                              │  │                    Run Orchestrator                            │  │
                              │  │          (workspace, brief, artifacts, finalization)           │  │
                              │  └────────────────────────────┬──────────────────────────────────┘  │
                              │                               │                                     │
                              │  ┌────────────────────────────▼──────────────────────────────────┐  │
                              │  │                      Manager Agent                            │  │
                              │  │     (central orchestrator — delegates to all sub-agents)      │  │
                              │  └───┬────┬────┬────┬────┬────┬────┬────┬────┬──────────────────┘  │
                              │       │    │    │    │    │    │    │    │    │                      │
                              │  ┌────▼┐┌─▼──┐┌▼──┐┌▼──┐┌▼──┐┌▼──┐┌▼──┐┌▼──┐┌▼────────┐           │
                              │  │Impl.││Rev.││Res.││Test││Merg││Hist││Libr││Cons││Brief   │           │
                              │  │     ││    ││    ││    ││    ││    ││    ││    ││Agent   │           │
                              │  └─────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────────┘           │
                              │                                                                      │
                              │  ┌──────────────────────────────────────────────────────────────┐    │
                              │  │                    Data Layer                                 │    │
                              │  │  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐  │    │
                              │  │  │Knowledge │  │  Semantic    │  │Embedding │  │ Postgres │  │    │
                              │  │  │  Graph   │◄─┤  Search     │◄─┤ Provider │──┤   (DB)   │  │    │
                              │  │  │(dual-wr.)│  │ (pgvector)  │  │ (Ollama) │  │          │  │    │
                              │  │  └──────────┘  └─────────────┘  └──────────┘  └──────────┘  │    │
                              │  └──────────────────────────────────────────────────────────────┘    │
                              └──────────────────────────────────────────────────────────────────────┘
                                         │                                      │
                                ┌────────▼────────┐                    ┌────────▼────────┐
                                │   Workspace      │                    │    Runs          │
                                │ workspaces/      │                    │  runs/<runid>/   │
                                │   <runid>/<name> │                    │   (artifacts)    │
                                │   (isolated)     │                    └─────────────────┘
                                └────────┬─────────┘
                                         │
                                ┌────────▼────────┐
                                │   Target Repo    │
                                │  (original src)  │
                                └──────────────────┘
```

---

## Agent System

The agent system follows a **hub-and-spoke delegation pattern**. The Manager is the central orchestrator that delegates work to 9 specialized sub-agents. Every agent:

- Uses the **Anthropic Claude API** with streaming
- Runs in an **iteration-bounded loop** (configurable per agent)
- Has **policy-gated tool access**
- Logs every tool call to the **audit trail**
- Uses **exponential backoff retry** for API overload/connection errors
- Applies **model-specific prompt overlays** for per-model tuning

### Agent Overview

| Agent | Role | Key Output | Graph Access | Model |
|-------|------|------------|--------------|-------|
| **Manager** | Central orchestrator | Delegates work, writes default artifacts | Read | Sonnet (default) |
| **Implementer** | Write code | Code changes, handoff, commits | Read | Sonnet (default) |
| **Reviewer** | Quality gate | `report.md` with STOPLIGHT (GREEN/YELLOW/RED) | Read | Sonnet (default) |
| **Researcher** | Explore & ideate | `ideas.md`, `sources.md` | Read | Haiku |
| **Tester** | Run test suite | Verdict string (PASS/FAIL/NO TESTS) | None | Sonnet (default) |
| **Merger** | Copy to target repo | Commits to target (only if GREEN) | None | Sonnet (default) |
| **Historian** | Persistent memory | Memory files, knowledge graph nodes | Full R/W | Haiku |
| **Librarian** | Research (arxiv) | `techniques.md`, graph nodes | Full R/W | Haiku |
| **Consolidator** | Graph maintenance | Merge duplicates, find gaps | Full R/W | Sonnet (default) |
| **Brief Agent** | Interactive brief creation | `briefs/<date>-<slug>.md` | None | Sonnet (default) |

### Delegation Flow

A typical complete run follows this sequence:

```
Manager
  ├── delegate_to_researcher ──► Researcher
  │                               └── produces ideas.md + sources.md
  ├── write_task_plan
  │
  ├── delegate_to_implementer ──► Implementer (single task)
  │   OR
  ├── delegate_parallel_wave ───► N × Implementer (on git worktrees)
  │                               └── each produces handoff + code changes
  │
  ├── delegate_to_tester ───────► Tester
  │                               └── returns PASS/FAIL verdict
  │
  ├── delegate_to_reviewer ─────► Reviewer
  │                               └── produces report.md (STOPLIGHT)
  │
  ├── delegate_to_merger ───────► Merger
  │                               └── copies to target if GREEN, commits
  │
  ├── delegate_to_historian ────► Historian
  │                               └── updates memory files + knowledge graph
  │
  ├── delegate_to_consolidator ─► Consolidator
  │                               └── merges duplicates, finds missing edges
  │
  └── delegate_to_librarian ────► Librarian
                                  └── searches arxiv, updates techniques.md
```

### Agent Tool Access Matrix

| Tool | Manager | Impl. | Rev. | Res. | Test | Merger | Hist. | Libr. | Cons. |
|------|---------|-------|------|------|------|--------|-------|-------|-------|
| `bash_exec` | x | x | x | x | x | x | | | |
| `read_file` | x | x | x | x | x | x | x | | |
| `write_file` | x | x | x | x | x | x | | | |
| `list_files` | x | x | x | x | x | | | | |
| `read_memory_file` | x | | | | | | x | x | |
| `search_memory` | x | | | | | | x | | |
| `write_to_memory` | | | | | | | x | | |
| `update_error_status` | | | | | | | x | | |
| `grep_audit` | | | | | | | x | | |
| `fetch_url` | | | | | | | | x | |
| `copy_to_target` | | | | | | x | | | |
| `bash_exec_in_target` | | | | | | x | | | |
| `merge_task_branch` | | | | | | x | | | |
| `graph_query` | x | x | x | x | | | x | x | x |
| `graph_traverse` | x | x | x | x | | | x | x | x |
| `graph_assert` | | | | | | | x | x | x |
| `graph_update` | | | | | | | x | x | x |
| `graph_semantic_search` | | | | | | | x | | x |
| `graph_merge_nodes` | | | | | | | | | x |
| `find_duplicate_candidates` | | | | | | | | | x |
| `find_stale_nodes` | | | | | | | | | x |
| `find_missing_edges` | | | | | | | | | x |
| `delegate_to_*` (8 agents) | x | | | | | | | | |
| `write_task_plan` | x | | | | | | | | |

### Verification Gate

Quality is enforced through structured validation at handoff points:

- **Implementer handoff** must contain: `## Self-Check` and `Confidence:` sections
- **Reviewer handoff** must contain: `## Self-Check`, `Tests run:`, and `Acceptance criteria checked:`
- Both agents may produce **structured JSON results** validated with Zod schemas (`ImplementerResultSchema`, `ReviewerResultSchema`)
- The **Merger** has its own gate: checks `report.md` for the regex `\bGREEN\b` — if not found, returns `MERGER_BLOCKED`

### Parallel Execution

The Manager can delegate a **wave of tasks** to run in parallel:

1. `write_task_plan` decomposes work into `AtomicTask` objects with dependencies
2. `computeExecutionWaves` produces topologically-sorted waves
3. `detectFileConflicts` + `splitConflictingWave` ensure tasks in the same wave don't touch the same files
4. Each parallel Implementer runs on its own **git worktree**
5. `Promise.allSettled()` runs them concurrently (max `max_parallel_implementers` from limits)
6. The Merger's `merge_task_branch` tool merges completed branches back

---

## Data Architecture

Neuron HQ uses a **dual-write** pattern: files are the primary/backup store, PostgreSQL is an optional acceleration layer.

### Dual-Write Philosophy

```
               ┌─────────────┐
               │  Application │
               └──────┬───────┘
                      │
              ┌───────┴────────┐
              │                │
    ┌─────────▼──────┐  ┌─────▼──────────┐
    │  FILE (always)  │  │  POSTGRES       │
    │                 │  │  (if available)  │
    │  graph.json     │  │  kg_nodes       │
    │  audit.jsonl    │  │  kg_edges       │
    │  usage.json     │  │  audit_entries  │
    │  manifest.json  │  │  runs           │
    │  *.md artifacts │  │  usage          │
    │                 │  │  metrics        │
    │                 │  │  task_scores    │
    │                 │  │  + embeddings   │
    └─────────────────┘  └────────────────┘
```

**Write path:** File first (always succeeds), then DB (if available; failure is non-fatal).

**Read path:** DB first (if available and has data), then file fallback.

**Key invariants:**
- The file system always has all data — it is the source of truth
- DB unavailability never breaks the application — it degrades to file-only mode
- `isDbAvailable()` gates all DB operations
- `db-import` provides a one-time backfill path from files to DB

### PostgreSQL Schema

7 tables across 2 migrations:

#### `kg_nodes` — Knowledge Graph Nodes

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | PK |
| `type` | TEXT | CHECK: pattern, error, technique, run, agent |
| `title` | TEXT | NOT NULL |
| `properties` | JSONB | Default `{}` |
| `confidence` | REAL | 0.0–1.0 |
| `scope` | TEXT | CHECK: universal, project-specific, unknown |
| `model` | TEXT | Nullable — which model created the node |
| `embedding` | vector(1024) | pgvector, HNSW index (cosine) |
| `created` | TIMESTAMPTZ | |
| `updated` | TIMESTAMPTZ | |

#### `kg_edges` — Knowledge Graph Edges

| Column | Type | Notes |
|--------|------|-------|
| `from_id` | TEXT | FK → kg_nodes, CASCADE |
| `to_id` | TEXT | FK → kg_nodes, CASCADE |
| `type` | TEXT | CHECK: solves, discovered_in, related_to, causes, used_by |
| `metadata` | JSONB | runId, agent, timestamp |

Unique constraint: `(from_id, to_id, type)`.

#### `runs` — Run Metadata

| Column | Type | Notes |
|--------|------|-------|
| `runid` | TEXT | PK |
| `target_name` | TEXT | |
| `brief_title` | TEXT | |
| `status` | TEXT | running, green, yellow, red, error, stopped |
| `started_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | |
| `model` | TEXT | |
| `workspace_branch` | TEXT | |
| `target_start_sha` | TEXT | |

#### `usage` — Token Consumption per Run

| Column | Type | Notes |
|--------|------|-------|
| `runid` | TEXT | PK, FK → runs |
| `model` | TEXT | |
| `total_input_tokens` | INTEGER | |
| `total_output_tokens` | INTEGER | |
| `by_agent` | JSONB | Per-agent breakdown |
| `tool_counts` | JSONB | Per-tool call counts |

#### `metrics` — Per-Run Metrics

| Column | Type | Notes |
|--------|------|-------|
| `runid` | TEXT | PK, FK → runs |
| `duration_seconds` | REAL | |
| `tests_*` | INTEGER | Baseline/after passed/failed/added |
| `insertions/deletions` | INTEGER | |
| `files_new/modified` | INTEGER | |
| `delegations_total` | INTEGER | |
| `raw` | JSONB | Full metrics blob |

#### `audit_entries` — Global Audit Trail

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL | PK |
| `runid` | TEXT | FK → runs |
| `ts` | TIMESTAMPTZ | |
| `role` | TEXT | Agent role |
| `tool` | TEXT | Tool name |
| `allowed` | BOOLEAN | Policy decision |
| `input_hash` | TEXT | SHA-256 (16 hex) |
| `output_hash` | TEXT | |
| `exit_code` | INTEGER | |
| `files_touched` | TEXT[] | Array |
| `diff_additions/deletions` | INTEGER | |
| `policy_event` | TEXT | |
| `note` | TEXT | |

Indexes: runid, timestamp DESC, role, tool, partial on blocked.

#### `task_scores` — Process Reward Scores

| Column | Type | Notes |
|--------|------|-------|
| `runid` | TEXT | FK → runs |
| `task_id` | TEXT | |
| `score_efficiency` | REAL | |
| `score_safety` | REAL | |
| `score_first_pass` | REAL | |
| `aggregate` | REAL | Weighted composite |

#### `migrations` — Schema Versioning

| Column | Type | Notes |
|--------|------|-------|
| `name` | TEXT | UNIQUE |
| `applied_at` | TIMESTAMPTZ | |

---

## Knowledge Graph

The knowledge graph is the persistent learning memory of the system. It stores patterns, errors, techniques, and run history as a directed graph.

### Node Types

| Type | Purpose | Example |
|------|---------|---------|
| `pattern` | Coding patterns that work | "Use vitest mock for agent tests" |
| `error` | Errors encountered and resolutions | "TypeScript strict null check failure" |
| `technique` | Research findings, best practices | "Exponential backoff for API retry" |
| `run` | Run summaries | "Run 94 — pgvector embeddings" |
| `agent` | Agent behavior observations | "Historian agent dedup patterns" |

### Edge Types

| Type | Meaning | Example |
|------|---------|---------|
| `solves` | A pattern/technique solves an error | pattern → error |
| `discovered_in` | Found during a specific run | node → run |
| `related_to` | General association | pattern ↔ pattern |
| `causes` | One error triggers another | error → error |
| `used_by` | A technique is used by an agent | technique → agent |

### Confidence Decay

Nodes that haven't been confirmed recently lose confidence over time:

- **Decay factor:** 0.9× per cycle (configurable)
- **Threshold:** nodes older than 20 days (configurable)
- **Stale flag:** nodes with confidence < 0.1 are flagged `stale: true`
- **Applied by:** Historian agent at the end of each run
- **Skipped for:** nodes already decayed in this cycle (`decay_applied: true`)

### Semantic Deduplication

Before adding a new node, the Historian checks for semantic duplicates:

1. Calls `semanticSearch()` with the new node's text
2. Warns if similarity ≥ 0.8 to an existing node
3. Blocks if similarity ≥ 0.9 (likely duplicate)
4. The Consolidator uses **hybrid dedup**: Jaccard (keyword) + semantic (embedding) similarity

---

## Embedding Pipeline

```
  Node text                    Ollama API                    PostgreSQL
  ─────────                    ──────────                    ──────────
  "{type}: {title}.       ──►  POST /api/embed          ──►  UPDATE kg_nodes
   {properties JSON}"          model: snowflake-              SET embedding = vector(1024)
                               arctic-embed
                               ──► 1024-dim float[]

  Entry points:
  1. autoEmbedNodes()      ── called during saveGraph() for new/updated nodes
  2. embed-nodes CLI       ── batch backfill for nodes missing embeddings

  Query path:
  semanticSearch(query)    ── embed query → pgvector cosine distance
                              SELECT ... 1-(embedding <=> $1::vector) AS similarity
                              FROM kg_nodes WHERE embedding IS NOT NULL
                              ORDER BY embedding <=> query::vector
                              (HNSW index: m=16, ef_construction=64)
```

---

## Policy Enforcement

### Pre-execution Checks

Before any bash command or file write:

1. **Bash allowlist** (`policy/bash_allowlist.txt`) — regex patterns for permitted commands
2. **Forbidden patterns** (`policy/forbidden_patterns.txt`) — blocked commands/arguments
3. **File write scope** — agents may only write to `workspaces/<runid>/` and `runs/<runid>/`
4. **Diff size limits** — warn at 150 lines, block at 300 lines
5. **Prompt injection detection** — briefs scanned for injection attempts

### Runtime Limits (`policy/limits.yaml`)

| Limit | Value |
|-------|-------|
| `max_run_hours` | 8 |
| `default_run_hours` | 3 |
| `max_iterations_manager` | 100 |
| `max_iterations_implementer` | 70 |
| `max_parallel_implementers` | 3 |
| `consolidation_frequency` | 10 runs |
| `diff_warn_lines` | 150 |
| `diff_block_lines` | 300 |
| `max_web_searches_per_run` | 10 |

### Per-Agent Model Overrides

| Agent | Default Model |
|-------|---------------|
| Manager, Implementer, Reviewer, Tester, Merger, Consolidator | Sonnet (CLI configurable) |
| Researcher, Historian, Librarian | Haiku (cost-optimized) |

### Post-execution Audit

After every operation:
1. Log to `audit.jsonl` (and DB if available)
2. Hash input/output (SHA-256, 16 hex chars)
3. Track token usage per agent
4. Redact secrets before writing artifacts

---

## Security Model

### Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Command injection | Bash allowlist + forbidden patterns |
| Path traversal | File scope checks (write only to workspace/runs) |
| Secret exposure | Redaction pipeline scans for API keys, JWTs, PEM keys |
| Destructive git ops | Git rules enforcement (no force push, no history rewrite) |
| Resource exhaustion | Iteration limits, time limits, diff size limits |
| Malicious briefs | Prompt injection detection in `PolicyEnforcer` |

### Security Scanning

The Reviewer runs an automated **security scan** on HIGH-risk briefs:

- 12 regex patterns checking for hardcoded secrets, eval/injection, SQL injection, etc.
- Critical findings are included in the Reviewer's prompt
- Scan results influence the STOPLIGHT verdict

### Isolation Model

- Each run gets `workspaces/<runid>/<targetName>/` — a fresh copy of the target repo
- All code changes happen in isolation
- The Merger is the **only** agent that writes to the target repo
- New branch: `swarm/<runid>`

---

## Artifact System

Every run generates these required artifacts in `runs/<runid>/`:

| Artifact | Content |
|----------|---------|
| `brief.md` | Snapshot of input brief |
| `baseline.md` | Pre-change test results |
| `report.md` | STOPLIGHT status + instructions + risk |
| `questions.md` | Max 3 blockers (or "No blockers") |
| `ideas.md` | Research-driven ideas with impact/effort/risk |
| `knowledge.md` | Learnings, assumptions, open questions |
| `research/sources.md` | Code references and documentation |
| `audit.jsonl` | Complete tool call log |
| `manifest.json` | Checksums + commands + timestamps |
| `usage.json` | Token tracking per agent |
| `redaction_report.md` | What secrets were redacted |

Additional optional artifacts:
- `task_plan.md` — structured task decomposition
- `merge_plan.md` / `merge_summary.md` — merger artifacts
- `test_report.md` — tester findings
- `implementer_handoff.md` / `reviewer_handoff.md` — agent handoffs
- `implementer_result.json` / `reviewer_result.json` — structured results
- `consolidation_report.md` — graph maintenance report
- `metrics.json` / `task_scores.jsonl` — computed after run

---

## MCP Server

Neuron HQ can be exposed as a **Model Context Protocol (MCP) server**, allowing Claude Desktop or Claude Code to query Neuron's data directly from any chat session.

### Architecture

```
Claude Desktop / Claude Code
         │
         │  stdio (JSON-RPC)
         ▼
┌─────────────────────┐
│   MCP Server        │
│   (src/mcp/server.ts)│
│                     │
│  ┌───────────────┐  │        ┌──────────────┐
│  │ neuron_runs   │──┼───────►│ runs table   │
│  │ neuron_costs  │──┼───────►│ usage table  │
│  │ neuron_know.  │──┼───────►│ kg_nodes     │
│  │ neuron_start  │──┼───────►│ child_process│
│  └───────────────┘  │        └──────────────┘
└─────────────────────┘
```

### Tools

| Tool | Type | Input | Output |
|------|------|-------|--------|
| `neuron_runs` | Read | status?, target?, last?, runid? | Run list or single run details |
| `neuron_knowledge` | Read | query, type?, scope?, semantic?, limit? | Matching nodes with edges |
| `neuron_costs` | Read | last?, by_agent?, summary_only? | Cost totals and breakdowns |
| `neuron_start` | Write | target, brief, hours?, confirm | Starts run as child process |

### Transport

- **Stdio** — the server communicates via stdin/stdout (MCP JSON-RPC protocol)
- Started as subprocess by Claude Desktop/Code
- All logging goes to stderr (stdout reserved for protocol)

### Configuration

Example configuration for Claude Desktop (`mcp-config.example.json`):

```json
{
  "mcpServers": {
    "neuron-hq": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server"],
      "cwd": "/path/to/neuron-hq"
    }
  }
}
```

### SDK

Uses `@modelcontextprotocol/sdk` (official MCP TypeScript SDK). Tools are registered with Zod input schemas for automatic validation.

---

## CLI Commands

Entry point: `npx tsx src/cli.ts <command>`

| Command | Description |
|---------|-------------|
| `target add <name> <path>` | Register a target repository |
| `target list` | List all registered targets |
| `run <target> --brief <path>` | Start a new swarm run |
| `resume <runid>` | Resume an interrupted run |
| `status <runid>` | Show run status and artifacts |
| `replay <runid>` | Replay the audit trail |
| `logs <runid>` | Show run logs |
| `report <runid>` | Display the run report |
| `brief <target>` | Interactive brief creation (Brief Agent) |
| `monitor <runid>` | Live monitoring of an active run |
| `scaffold <name>` | Generate a new project skeleton |
| `costs` | Show cost analysis across all runs |
| `costs --save` | Save cost report to `docs/cost-tracking.md` |
| `db-migrate` | Apply pending Postgres migrations |
| `db-import` | Import file-based data into Postgres |
| `embed-nodes` | Generate embeddings for nodes without vectors |
| `mcp-server` | Start Neuron HQ as an MCP server (stdio) |

---

## Module Dependency Graph

```
CLI (cli.ts)
  └── commands/*
        └── RunOrchestrator (run.ts)
              ├── PolicyEnforcer (policy.ts)
              ├── types.ts (foundational — Zod schemas)
              ├── AuditLogger (audit.ts)
              ├── ArtifactsManager (artifacts.ts)
              ├── UsageTracker (usage.ts)
              ├── ManifestManager (manifest.ts)
              ├── Redactor (redaction.ts)
              ├── RunMetrics (run-metrics.ts)
              ├── TaskRewards (task-rewards.ts)
              └── ManagerAgent (manager.ts)
                    ├── all 8 sub-agents
                    ├── agent-utils.ts (truncation, retry, trimming)
                    ├── graph-tools.ts
                    │     ├── knowledge-graph.ts (CRUD, dual-write)
                    │     │     ├── db.ts (Postgres pool)
                    │     │     └── embeddings.ts (Ollama provider)
                    │     └── semantic-search.ts (pgvector queries)
                    │           ├── db.ts
                    │           └── embeddings.ts
                    ├── agent-client.ts (Anthropic SDK factory)
                    │     └── model-registry.ts (model resolution)
                    ├── messages.ts (typed inter-agent schemas)
                    ├── verification-gate.ts
                    │     └── messages.ts
                    ├── task-splitter.ts (AtomicTask decomposition)
                    ├── parallel-coordinator.ts
                    │     └── task-splitter.ts
                    ├── prompt-hierarchy.ts (prompt section loading)
                    ├── prompt-overlays.ts (model-specific tuning)
                    └── graph-merge.ts (duplicate detection)
                          └── knowledge-graph.ts

MCP Server (src/mcp/server.ts)
  └── tools/*
        ├── runs.ts ──► db.ts, runs/ filesystem
        ├── knowledge.ts ──► knowledge-graph.ts, semantic-search.ts
        ├── costs.ts ──► db.ts, pricing.ts
        └── start.ts ──► child_process (spawn CLI)

Leaf modules (no internal deps):
  types.ts, model-registry.ts, messages.ts, task-splitter.ts,
  security-scan.ts, scaffold.ts, prompt-hierarchy.ts, prompt-overlays.ts,
  pricing.ts
```

---

## Prompt System

### Prompt Files

Each agent has a dedicated prompt file in `prompts/`:

```
prompts/
  ├── manager.md
  ├── implementer.md
  ├── reviewer.md
  ├── researcher.md
  ├── tester.md
  ├── merger.md
  ├── historian.md
  ├── librarian.md
  ├── consolidator.md
  ├── brief-agent.md
  └── overlays/
        ├── claude-opus/
        │     └── default.md
        └── claude-haiku/
              ├── default.md
              ├── implementer.md
              └── manager.md
```

### Prompt Hierarchy

Prompts support a **hierarchical section system** using `<!-- ARCHIVE: name -->` markers. This allows:

- **Core sections** that are always loaded
- **Archive sections** that are loaded on-demand when specific conditions apply (e.g., `self-check`, `security-review`, `no-tests`)

### Model-Specific Overlays

The overlay system adjusts prompts per model family:

1. Resolve model ID → family (e.g., `claude-haiku-4-5-20251001` → `claude-haiku`)
2. Look for `prompts/overlays/<family>/<role>.md` (role-specific overlay)
3. Fall back to `prompts/overlays/<family>/default.md` (default overlay)
4. Merge: overlay text is appended after the main prompt

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode, NodeNext modules) |
| Runtime | Node.js 20+ |
| Package Manager | pnpm |
| Agent SDK | Anthropic Claude API (`@anthropic-ai/sdk`) |
| MCP | `@modelcontextprotocol/sdk` (stdio transport) |
| Database | PostgreSQL 17 + pgvector |
| Embeddings | Ollama + snowflake-arctic-embed (1024 dims) |
| Validation | Zod schemas throughout |
| Testing | Vitest (938 tests, 85 files) |
| Linting | ESLint + Prettier |
| CLI | Commander.js |

---

## Project Statistics (as of Session 63)

| Metric | Value |
|--------|-------|
| Tests | 984 passing (91 files) |
| Total runs completed | 95 |
| Knowledge graph nodes | 122 (all with embeddings) |
| Knowledge graph edges | 77 |
| Agent types | 10 |
| Core source files | 34 + 12 agent files |
| CLI commands | 16 |
| MCP tools | 4 (runs, knowledge, costs, start) |
| Postgres tables | 7 + 1 (migrations) |
| Prompt files | 10 + 5 overlays |
| Policy files | 4 |

---

## Sammanfattning

### Version 1 — Teknisk sammanfattning (för utvecklare och AI-ingenjörer)

Neuron HQ är ett TypeScript-baserat **agentorkestreringssystem** som koordinerar en svärm av 10 specialiserade AI-agenter (Claude API) för att autonomt utveckla kod i externa repositories. Arkitekturen bygger på tre kärnprinciper:

**1. Hub-and-spoke-delegation.** En Manager-agent bryter ned uppgifter, delegerar till Implementer (kodskrivning), Reviewer (kvalitetsgrind med STOPLIGHT), Researcher (idégenerering), Tester (testexekvering), och Merger (sammanslagning till målrepo). Historian, Librarian och Consolidator hanterar persistent lärande. Parallellexekvering stöds via git worktrees med topologisk task-sortering och filkonfliktdetektering.

**2. Dual-write-persistens.** Alla data (knowledge graph, audit trail, usage) skrivs först till fil (alltid tillförlitligt), sedan till PostgreSQL 17 + pgvector (valfritt, non-fatal vid fel). DB:n möjliggör SQL-joins, kostnadsanalys och semantisk vektorsökning (1024-dim embeddings via Ollama/snowflake-arctic-embed med HNSW-index). Systemet degraderar graciöst till fil-only om DB:n är nåbar.

**3. Policy-first säkerhet.** Varje bash-kommando valideras mot en allowlist/forbidden-list. Filskrivningar begränsas till workspace- och runs-kataloger. Diff-storlekar har warn/block-gränser. Briefs scannas för prompt injection. Alla tool calls loggas till en append-only audit trail med SHA-256-hashade in/utdata. Hemligheter redakteras automatiskt (API-nycklar, JWT, PEM).

Knowledge-grafen (122 noder, 77 kanter) fungerar som långtidsminne med confidence decay på inaktiva noder, semantisk dedup (cosine similarity ≥ 0.8 varnar, ≥ 0.9 blockerar), och Jaccard+embedding-baserad konsolidering. Varje körning producerar 11+ strukturerade artefakter med checksummor.

Sedan session 63 exponeras systemet som **MCP-server** (Model Context Protocol, stdio-transport) med 4 verktyg: `neuron_runs`, `neuron_knowledge`, `neuron_costs`, `neuron_start`. Det möjliggör att Claude Desktop/Code kan fråga kunskapsgrafen, hämta körningsdata och starta nya körningar direkt — utan CLI.

Systemet har 984 tester (91 filer), 95 genomförda körningar, och konfigurerbara per-agent modellval (Sonnet för tunga uppgifter, Haiku för kostnadseffektiva).

---

### Version 2 — Icke-teknisk sammanfattning (för ledningsgrupp/beslutsfattare)

**Vad Neuron HQ gör:**

Neuron HQ är ett styrningssystem för AI-drivna utvecklingsteam. Istället för att en enskild AI-assistent skriver kod, organiserar Neuron HQ ett **team av 10 specialiserade AI-agenter** som samarbetar — precis som ett riktigt utvecklingsteam med programmerare, granskare, testare och projektledare.

**Hur det fungerar (i enkla steg):**

1. Du beskriver vad du vill ha gjort i en **brief** (en kort specifikation)
2. En **Manager-agent** läser briefen och planerar arbetet
3. En **Researcher** undersöker kodbasen och föreslår angreppssätt
4. En eller flera **Implementers** skriver koden
5. En **Tester** kör alla tester för att verifiera att inget gått sönder
6. En **Reviewer** granskar allt och ger grönt/gult/rött ljus
7. Om grönt: en **Merger** lägger in ändringarna i det riktiga projektet
8. En **Historian** dokumenterar vad som lärdes — så systemet blir bättre med tiden

**Vad som gör det unikt:**

- **Säkerhet:** Varje åtgärd kontrolleras mot regler innan den utförs. Inga farliga kommandon tillåts. Alla steg loggas i en oföränderlig revisionslogg.
- **Isolering:** Agenterna arbetar i en kopia av koden, inte i originalet. Ändringarna slås samman först efter godkännande.
- **Lärande minne:** Systemet har ett kunskapsbibliotek med mönster, fel och lösningar som byggs upp körning efter körning. Gamla, obekräftade kunskaper tonas automatiskt ned.
- **Kostnadseffektivt:** Enklare uppgifter (research, dokumentation) körs på billigare AI-modeller. Tyngre uppgifter (kodskrivning, granskning) körs på kraftfullare modeller.
- **Fullständig spårbarhet:** Varje körning producerar rapporter, checksummor och kostnadsredovisning. Man kan alltid svara på "vad gjordes, varför, och vad kostade det?"

**Siffror:**

- 95 genomförda körningar
- 984 automatiska tester som verifierar att systemet fungerar korrekt
- 10 specialiserade agentroller
- Kunskapsbibliotek med 122 dokumenterade mönster och erfarenheter
- **MCP-integration:** Claude Desktop/Code kan fråga Neuron HQ direkt — visa körningar, söka i kunskapen, kolla kostnader, och starta nya körningar
