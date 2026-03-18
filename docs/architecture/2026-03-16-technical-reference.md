# Neuron HQ — Technical Architecture Reference

> Version 1.0 · Session 90 · 2026-03-16
> Audience: LLMs, senior engineers, system architects
> Companion: [architecture-explained.md](architecture-explained.md) (non-technical version)

---

## 1. System Topology

```
                                    ┌─────────────────────────┐
                                    │     Claude Desktop       │
                                    │     (MCP Client)         │
                                    │                         │
                                    │  Skills ──► Prompts     │
                                    │               │         │
                                    │           ┌───▼───┐     │
                                    │           │ Tools │     │
                                    └───────────┴───┬───┘─────┘
                                                    │ JSON-RPC (stdio)
                                                    ▼
┌──────────────┐              ┌──────────────────────────────────────────────┐
│  CLI         │              │            MCP Server Layer                  │
│              │              │                                              │
│  run         │              │  10 Scopes × (tools + prompts)              │
│  resume      │              │  createMcpServer(scope?: string)            │
│  costs       │              │  Notification wrapper (job polling)          │
│  jobs        │              │                                              │
│  mcp-server  │              │  aurora-search ─── aurora-insights           │
│  dashboard   │              │  aurora-memory ─── aurora-ingest-text        │
│  brief       │              │  aurora-ingest-media ── aurora-media         │
│  km          │              │  aurora-library ── aurora-quality            │
│              │              │  neuron-runs ──── neuron-analytics           │
└──────┬───────┘              └──────────────────┬───────────────────────────┘
       │                                         │
       │  runCommand()                           │  Direct DB/file access
       ▼                                         │
┌──────────────────────────────────────────────────────────────────────────┐
│                         RunOrchestrator                                  │
│                                                                          │
│  RunContext {                                                             │
│    runid: RunId              // YYYYMMDD-HHMM-<target>                  │
│    target: Target            // { name, path, type }                    │
│    hours: number             // Time budget                             │
│    workspaceDir: string      // workspaces/<runid>/<target>/            │
│    runDir: string            // runs/<runid>/                           │
│    artifacts: ArtifactsManager                                          │
│    audit: AuditLogger        // Append-only, SHA-256                    │
│    manifest: ManifestManager // Checksums + commands                    │
│    usage: UsageTracker       // Tokens per agent                       │
│    redactor: Redactor        // API key/JWT/PEM scanning               │
│    verifier: Verifier        // Baseline + post-change tests           │
│    git: GitOperations        // Branches, worktrees, diff              │
│    policy: PolicyEnforcer    // 3-layer validation                     │
│    startTime / endTime       // Computed from hours                    │
│  }                                                                      │
│                                                                          │
│  Lifecycle: initRun → baseline → Manager loop → finalize                │
│  Resume:    resumeRun → reuse workspace → new runDir (-resume)          │
│  E-stop:    STOP file in baseDir → EstopError                           │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           Agent Layer                                    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                        MANAGER                                    │   │
│  │                                                                   │   │
│  │  Model: claude-sonnet-4-6 (default)                               │   │
│  │  Max iterations: 100 (configurable)                               │   │
│  │  Prompt: prompts/manager.md + overlays + adaptive hints           │   │
│  │                                                                   │   │
│  │  Loop:                                                            │   │
│  │    1. Load brief + system prompt + beliefs                        │   │
│  │    2. Stream Claude response with tool definitions                │   │
│  │    3. Execute tool_use blocks (policy-gated, audit-logged)        │   │
│  │    4. Return tool_results → continue loop                         │   │
│  │    5. Break on end_turn without tool_use                          │   │
│  │                                                                   │   │
│  │  Iteration budget:                                                │   │
│  │    Orientation ≤10 │ Planning ≤10 │ Delegation = rest             │   │
│  │    HARD RULE: delegate by iteration 30 or abort                   │   │
│  │                                                                   │   │
│  │  Delegation tools:                                                │   │
│  │    delegate_to_implementer(task, taskId?)                         │   │
│  │    delegate_parallel_wave(tasks[], wave_index)                    │   │
│  │    delegate_to_reviewer(brief, changeSummary)                     │   │
│  │    delegate_to_researcher(brief)                                  │   │
│  │    delegate_to_tester()                                           │   │
│  │    delegate_to_merger()                                           │   │
│  │    delegate_to_historian()                                        │   │
│  │    delegate_to_librarian()                                        │   │
│  │    delegate_to_consolidator()                                     │   │
│  │    write_task_plan(plan: TaskPlan)                                │   │
│  └───────────────────────────┬───────────────────────────────────────┘   │
│                              │                                           │
│     ┌────────────────────────┼────────────────────────────────┐         │
│     │                        │                                │         │
│     ▼                        ▼                                ▼         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐      │
│  │ EXECUTORS    │  │ QUALITY GATES│  │ KNOWLEDGE AGENTS         │      │
│  │              │  │              │  │                          │      │
│  │ Implementer  │  │ Reviewer     │  │ Historian    [Haiku]     │      │
│  │   [Sonnet]   │  │   [Sonnet]   │  │ Librarian    [Haiku]     │      │
│  │   max: 70    │  │   max: 50    │  │ Consolidator [Sonnet]    │      │
│  │   worktree   │  │   STOPLIGHT  │  │ KnowledgeMgr [varies]    │      │
│  │   isolation   │  │   security   │  │                          │      │
│  │              │  │   scan       │  │ Confidence decay          │      │
│  │ Researcher   │  │              │  │ Semantic dedup            │      │
│  │   [Haiku]    │  │ Tester       │  │ Bayesian belief update    │      │
│  │   max: 40    │  │   [Sonnet]   │  │ Web search + ingest      │      │
│  │              │  │   max: 30    │  │ Topic chaining            │      │
│  │ Merger       │  │   PASS/FAIL  │  │                          │      │
│  │   [Sonnet]   │  │              │  │                          │      │
│  │   max: 30    │  │              │  │                          │      │
│  │   GREEN-gate │  │              │  │                          │      │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │ Shared Tool Layer (all agents)                                    │   │
│  │                                                                   │   │
│  │ bash_exec(cmd)        → PolicyEnforcer.checkBashCommand()        │   │
│  │ read_file(path)       → UTF-8, 50K truncation                    │   │
│  │ write_file(path, data)→ PolicyEnforcer.checkFileWriteScope()     │   │
│  │ list_files(dir)       → Directory listing                        │   │
│  │                                                                   │   │
│  │ graph_query(type, title?, limit?)                                │   │
│  │ graph_traverse(fromId, direction, edgeType?)                     │   │
│  │ graph_assert(fromId, toId, edgeType)        [write agents only]  │   │
│  │ graph_update(nodeId, title, properties)      [write agents only]  │   │
│  │ graph_semantic_search(query, limit?)                              │   │
│  │ graph_merge_nodes(keepId, removeId)          [consolidator only]  │   │
│  │ find_duplicate_candidates()                  [consolidator only]  │   │
│  │ find_stale_nodes(ageThresholdDays)           [consolidator only]  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Data Layer                                      │
│                                                                          │
│  ┌─────────────────────────┐     ┌──────────────────────────────────┐   │
│  │  File System (primary)  │     │  PostgreSQL 17 + pgvector        │   │
│  │                         │     │  (acceleration, optional)        │   │
│  │  memory/                │     │                                  │   │
│  │    graph.json           │     │  kg_nodes    (id, type, title,   │   │
│  │    runs.md              │     │               confidence, scope, │   │
│  │    errors.md            │     │               embedding[1024])   │   │
│  │    patterns.md          │     │  kg_edges    (from, to, type,    │   │
│  │    techniques.md        │     │               metadata)          │   │
│  │                         │     │  aurora_nodes (parallel graph)   │   │
│  │  runs/<runid>/          │     │  aurora_edges                    │   │
│  │    brief.md             │     │  runs        (status, times)     │   │
│  │    baseline.md          │     │  usage       (tokens per agent)  │   │
│  │    report.md            │     │  metrics     (test deltas, etc)  │   │
│  │    questions.md         │     │  audit_entries                   │   │
│  │    ideas.md             │     │  task_scores                     │   │
│  │    knowledge.md         │     │  run_beliefs (Bayesian)          │   │
│  │    research/sources.md  │     │  run_belief_audit                │   │
│  │    audit.jsonl          │     │                                  │   │
│  │    manifest.json        │     │  HNSW index on embedding cols    │   │
│  │    usage.json           │     │  Cosine distance: <=>            │   │
│  │    redaction_report.md  │     │                                  │   │
│  │    task_plan.md         │     │  Write: file first → DB second   │   │
│  │    merge_summary.md     │     │  Read: DB first → file fallback  │   │
│  └─────────────────────────┘     │  Failure: non-fatal (file-only)  │   │
│                                  └──────────────────────────────────┘   │
│  ┌─────────────────────────┐     ┌──────────────────────────────────┐   │
│  │  Ollama (local)         │     │  Anthropic API (cloud)           │   │
│  │                         │     │                                  │   │
│  │  snowflake-arctic-embed │     │  claude-sonnet-4-6 (default)     │   │
│  │    1024 dimensions      │     │  claude-haiku-4-5 (cost agents)  │   │
│  │    POST /api/embed      │     │                                  │   │
│  │    batch: 20 per call   │     │  Streaming: messages.create()    │   │
│  │                         │     │  Tool use: native function calls │   │
│  │  qwen3-vl:8b           │     │  Max tokens: model-dependent     │   │
│  │    Vision/OCR           │     │                                  │   │
│  └─────────────────────────┘     └──────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Policy Enforcement (3 layers)

```
Incoming command/path
        │
        ▼
┌─ Layer 1: Forbidden Patterns ───────────────────────────┐
│  policy/forbidden_patterns.txt                          │
│  Regex blocklist: --force-push, eval, SQL injection     │
│  Match → BLOCKED (highest priority)                     │
└─────────────────────────┬───────────────────────────────┘
                          │ pass
                          ▼
┌─ Layer 2: Bash Allowlist ───────────────────────────────┐
│  policy/bash_allowlist.txt                              │
│  Regex whitelist: git, pnpm, ls, cat, grep, python...   │
│  No match → BLOCKED                                     │
└─────────────────────────┬───────────────────────────────┘
                          │ pass
                          ▼
┌─ Layer 3: File Scope ───────────────────────────────────┐
│  Write operations only:                                 │
│  ✓ workspaces/<runid>/**                                │
│  ✓ runs/<runid>/**                                      │
│  ✓ baseDir/** (self-dev mode, not other runs)           │
│  ✗ Everything else → BLOCKED                            │
└─────────────────────────┬───────────────────────────────┘
                          │ pass
                          ▼
┌─ Additional: Brief Injection Detection ─────────────────┐
│  Patterns: "ignore previous instructions",              │
│  "you are now", "forget everything", "[SYSTEM]"         │
│  Match → PolicyViolationError                           │
└─────────────────────────────────────────────────────────┘
```

All policy decisions logged to `audit.jsonl` with:
```json
{
  "timestamp": "ISO-8601",
  "role": "implementer",
  "tool": "bash_exec",
  "allowed": false,
  "policy_event": "matches forbidden pattern: --force",
  "command": "git push --force"
}
```

---

## 3. Parallel Execution Model

```
Manager: write_task_plan([T1, T2, T3, T4, T5])
         T1 depends on nothing
         T2 depends on nothing
         T3 depends on T1
         T4 depends on T1
         T5 depends on T3, T4

computeExecutionWaves():
  Wave 0: [T1, T2]       ← independent
  Wave 1: [T3, T4]       ← depend on T1
  Wave 2: [T5]           ← depends on T3, T4

detectFileConflicts(Wave 1):
  T3 touches: src/foo.ts, src/bar.ts
  T4 touches: src/bar.ts, src/baz.ts
  Conflict: {T3, T4} share src/bar.ts

splitConflictingWave(Wave 1):
  Sub-wave 1a: [T3]
  Sub-wave 1b: [T4]

Execution:
  Wave 0:  T1 ──worktree──► merge ──┐
           T2 ──worktree──► merge ──┤
  Wave 1a: T3 ──worktree──► merge ──┤  max_parallel: 3
  Wave 1b: T4 ──worktree──► merge ──┤
  Wave 2:  T5 ──worktree──► merge ──┘

Per task:
  git.addWorktree(path, 'neuron-<runid>-task-<taskId>')
  → ImplementerAgent.run(task, { taskId, branchName })
  → Promise.allSettled() (fault-tolerant)
  → git.removeWorktree(path)
  → merge_task_branch (conflict detection + clean merge)
```

**AtomicTask schema (Zod)**:
```typescript
{
  id: string,              // "T1"
  description: string,     // One-sentence change
  files: string[],         // Expected touched files
  passCriterion: string,   // "pnpm test passes"
  dependsOn?: string[]     // ["T1"] (topological)
}
```

---

## 4. Bayesian Belief System

```
Run completes
      │
      ▼
collectOutcomes(runDir):
  Read: metrics.json, report.md, usage.json, manifest.json, task_scores.jsonl
  Extract signals:
    stoplight   (weight 0.20) → GREEN=success, RED=failure
    re-delegations (0.10)     → 0 redelegations=success, >2=failure
    blocked-cmds   (0.08)     → 0=success, >3=failure
    tests-added    (0.06)     → >0=success (features only)
    task-score     (0.12)     → avg score > 0.7=success
    token-budget   (0.05)     → under budget=success

  Dimensions: agent:<name>, brief:<type>, target:<name>
  → RunOutcome[] (dimension × signal combinations)
      │
      ▼
updateRunBeliefs(outcomes):
  For each outcome:
    bayesianUpdate(prior_confidence, outcome.success, outcome.weight)
    → new posterior confidence
  Upsert run_beliefs table
  Log to run_belief_audit
      │
      ▼
generateAdaptiveHints(beliefs, briefType):
  warnings:      confidence < 0.5  → specific suggestions per agent/brief
  strengths:     confidence > 0.85 → listed as proven approaches
  contradictions: |conf_A - conf_B| > 0.35 → flagged
  → promptSection injected into Manager's system prompt
      │
      ▼
Manager reads hints at loop start:
  "## Adaptive Performance Hints
   Based on 12 dimensions across 143 observations:
   ⚠️ agent:researcher (0.42): Consider giving more specific instructions...
   ✓ brief:feature (0.91): Strong track record
   ⚡ Contradiction: agent:merger(0.95) vs agent:consolidator(0.55)"

Decay:
  applyDecay(confidence, runsSinceUpdate):
    grace_period = 10 runs
    if runsSinceUpdate > grace_period:
      decayed = confidence - (runsSinceUpdate - grace_period) * 0.02
      clamp toward 0.5 (not below)
    → Stale beliefs drift to neutral
```

---

## 5. Knowledge Graph Schema

```
Node types:     pattern | error | technique | run | agent
Edge types:     solves | discovered_in | related_to | causes | used_by
Scope:          universal | project-specific | unknown

KGNode {
  id: string (UUID)
  type: NodeType
  title: string
  properties: Record<string, unknown>
  confidence: number (0–1)
  scope: NodeScope
  model: string | null
  created: ISO datetime
  updated: ISO datetime
}

KGEdge {
  from: string (node ID)
  to: string (node ID)
  type: EdgeType
  metadata: { runId?, agent?, timestamp? }
}

Storage:
  Primary: PostgreSQL (kg_nodes + kg_edges, transactional upsert)
  Fallback: memory/graph.json (atomic write)
  Embeddings: 1024-dim vector, HNSW index, cosine distance

Dedup pipeline:
  1. Jaccard similarity on keywords (title tokenization)
  2. Embedding cosine similarity (if vectors available)
  3. ≥0.9 → BLOCK (duplicate)
  4. ≥0.8 → WARN (potential duplicate)
  5. <0.8 → ALLOW

Decay:
  Factor: 0.9× per cycle
  Threshold: confidence < 0.1 → stale flag
  Applied by: Historian (end of each run)
  Guard: decay_applied flag prevents double-decay
```

---

## 6. MCP Three-Layer Architecture

```
┌─ Layer 3: Skills ──────────────────────────────────────────────────────┐
│                                                                        │
│  .claude/skills/<name>/SKILL.md                                        │
│  Cross-server orchestration via YAML frontmatter + instructions        │
│                                                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │ researcha-amne  │  │ indexera-och-lar │  │ kunskapscykel   │        │
│  │                 │  │                 │  │                 │        │
│  │ aurora-search → │  │ aurora-ingest → │  │ aurora-search → │        │
│  │ aurora-insights│  │ aurora-quality→ │  │ aurora-insights→│        │
│  │ → aurora-lib   │  │ → aurora-memory │  │ aurora-library→ │        │
│  └─────────────────┘  └─────────────────┘  │ aurora-quality  │        │
│                                            └─────────────────┘        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │ indexera-youtube │  │ speaker-analys  │  │ kvalitetskontrol│        │
│  │                 │  │                 │  │                 │        │
│  │ ingest-media → │  │ aurora-media → │  │ aurora-quality→ │        │
│  │ aurora-media → │  │ aurora-search → │  │ aurora-insights│        │
│  │ aurora-search   │  │ aurora-insights │  │ → neuron-runs   │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                        │
│  + starta-korning, system-oversikt                                     │
│                                                                        │
│  Design patterns:                                                      │
│    Prompt Chaining    — sequential tool calls across scopes            │
│    Orchestrator-Worker — KM delegates to search/ingest/quality         │
│    Evaluator-Optimizer — quality scope validates other scopes' work    │
│    Multi-MCP Coord    — skills combine 2-4 scopes                     │
│    Domain Intelligence — brief type → different tool sequences         │
├────────────────────────────────────────────────────────────────────────┤
│  Layer 2: MCP Prompts (19 total)                                       │
│                                                                        │
│  Registered in scopes.ts via server.prompt()                           │
│  Swedish names, Zod input schemas, template interpolation              │
│  Visible in Claude Desktop "+" menu                                    │
│                                                                        │
│  aurora-search:      sok-och-svara, vad-vet-vi                         │
│  aurora-insights:    full-briefing, forskningsforslag                   │
│  aurora-memory:      vad-sa-vi, lar-fran-samtal                        │
│  aurora-ingest-text: indexera-lank                                      │
│  aurora-ingest-media: indexera-video, indexera-bilder                   │
│  aurora-media:       speaker-review, jobb-oversikt                     │
│  aurora-library:     ny-artikel, kunskapsbibliotek                     │
│  aurora-quality:     kvalitetsrapport, verifiera-kallor                │
│  neuron-runs:        senaste-korningar, starta-korning                 │
│  neuron-analytics:   dashboard, beliefs                                │
├────────────────────────────────────────────────────────────────────────┤
│  Layer 1: MCP Servers (10 scopes, 32 tools)                            │
│                                                                        │
│  createMcpServer(scope?)                                               │
│    scope=undefined → register ALL scopes (monolith mode)               │
│    scope="aurora-search" → register only that scope                    │
│                                                                        │
│  CLI: npx tsx src/cli.ts mcp-server --scope aurora-search              │
│                                                                        │
│  Consolidations (45→32):                                               │
│    speakers    8→1 (action-based: gallery|rename|merge|suggest|...)    │
│    jobs        4→1 (action: status|list|stats|cancel)                  │
│    memory      3→1 (action: remember|recall|stats)                     │
│    freshness   2→1 (action: verify|report)                             │
│    cross_ref   2→1 (action: search|integrity)                          │
│                                                                        │
│  Notification wrapper:                                                  │
│    Checks completed async jobs on every tool call                      │
│    Prepends status to response (non-blocking, fail-safe)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Run Execution Sequence

```
CLI: npx tsx src/cli.ts run neuron-hq --brief briefs/xyz.md --hours 1
│
├─ 1. INIT
│   ├─ runid = "20260316-0246-neuron-hq"
│   ├─ mkdir workspaces/<runid>/neuron-hq/ (copy target)
│   ├─ mkdir runs/<runid>/ (artifacts)
│   ├─ Copy brief → runs/<runid>/brief.md
│   ├─ Validate brief (injection patterns)
│   ├─ Create branch: neuron/<runid>
│   ├─ Check meta-triggers (every 10th run → META_ANALYSIS)
│   └─ Initialize manifest.json with start SHA
│
├─ 2. BASELINE
│   ├─ Detect test framework (package.json → pnpm test)
│   ├─ Run full test suite
│   └─ Save result → runs/<runid>/baseline.md
│
├─ 3. MANAGER LOOP (max 100 iterations)
│   │
│   ├─ Iteration 1-5: ORIENTATION
│   │   ├─ read_file(brief.md)
│   │   ├─ graph_query("pattern", limit=10)
│   │   ├─ graph_semantic_search(brief_keywords)
│   │   ├─ read_memory_file("runs.md")
│   │   └─ bash_exec("pnpm test") — verify baseline
│   │
│   ├─ Iteration 6-10: PLANNING
│   │   ├─ Analyze codebase (read_file, list_files, bash_exec)
│   │   └─ write_task_plan({ tasks: [T1, T2, T3] })
│   │
│   ├─ Iteration 11+: DELEGATION
│   │   ├─ delegate_to_researcher(brief)
│   │   │   └─ Returns: ideas.md, research/sources.md
│   │   │
│   │   ├─ delegate_parallel_wave([T1, T2], wave=0)
│   │   │   ├─ T1 → worktree → ImplementerAgent → merge
│   │   │   └─ T2 → worktree → ImplementerAgent → merge
│   │   │
│   │   ├─ delegate_to_implementer(T3)  // sequential if depends on T1/T2
│   │   │
│   │   ├─ delegate_to_tester()
│   │   │   └─ Returns: "TESTS PASS: 2371 passed"
│   │   │
│   │   ├─ delegate_to_reviewer(brief, changeSummary)
│   │   │   ├─ Security scan (if HIGH risk)
│   │   │   └─ Returns: report.md with STOPLIGHT
│   │   │
│   │   ├─ IF GREEN:
│   │   │   ├─ delegate_to_merger()
│   │   │   │   └─ Commits to target, writes merge_summary.md
│   │   │   ├─ delegate_to_historian()
│   │   │   │   └─ Updates graph, applies decay, writes memory
│   │   │   └─ delegate_to_librarian()  // if auto-triggered
│   │   │
│   │   └─ IF RED/YELLOW:
│   │       ├─ Analyze failures
│   │       ├─ delegate_to_implementer(fix_task)
│   │       └─ Loop back to tester → reviewer
│   │
│   └─ Time/iteration guard: break if endTime reached or maxIterations
│
├─ 4. FINALIZE
│   ├─ Write report.md (if not written by Reviewer)
│   ├─ Write usage.json (token breakdown per agent)
│   ├─ Generate redaction_report.md
│   ├─ Complete manifest.json (checksums)
│   ├─ Compute run-metrics.json
│   ├─ Collect outcomes → updateRunBeliefs()
│   ├─ Update cost-tracking.md
│   └─ Optional: auto-KM post-run hook
│
└─ 5. OUTPUT
    ├─ runs/<runid>/report.md     → STOPLIGHT + instructions
    ├─ runs/<runid>/questions.md  → max 3 blockers
    ├─ runs/<runid>/ideas.md      → research findings
    └─ 8 more required artifacts
```

---

## 8. Agent Tool Access Matrix

| Tool | Manager | Impl | Review | Research | Test | Merger | Historian | Librarian | Consol |
|------|---------|------|--------|----------|------|--------|-----------|-----------|--------|
| bash_exec | ✓ | ✓ | ✓ | ✓ | ✓ | ✓* | - | - | - |
| read_file | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| write_file | ✓ | ✓ | ✓ | - | - | ✓* | ✓* | - | - |
| list_files | ✓ | ✓ | ✓ | ✓ | ✓ | - | - | - | - |
| graph_query | ✓ | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ |
| graph_traverse | ✓ | ✓ | ✓ | ✓ | - | - | ✓ | ✓ | ✓ |
| graph_assert | - | - | - | - | - | - | ✓ | ✓ | ✓ |
| graph_update | - | - | - | - | - | - | ✓ | ✓ | ✓ |
| graph_semantic | ✓ | - | - | ✓ | - | - | ✓ | ✓ | ✓ |
| graph_merge | - | - | - | - | - | - | - | - | ✓ |
| delegate_* | ✓ | - | - | - | - | - | - | - | - |
| read_memory | ✓ | - | - | - | - | - | ✓ | ✓ | - |
| write_memory | - | - | - | - | - | - | ✓ | ✓ | - |
| fetch_url | - | - | - | - | - | - | - | ✓ | - |
| copy_to_target | - | - | - | - | - | ✓ | - | - | - |
| merge_branch | - | - | - | - | - | ✓ | - | - | - |

*Merger: bash_exec_in_target (target repo), write_file (runs dir only)
*Historian: write_to_memory (memory/ dir only)

---

## 9. Verification Gates

```
Implementer handoff validation:
  Required: "## Self-Check", "Confidence:"
  Optional: structured JSON (Zod-validated)

Reviewer report validation:
  Required: "Tests run:", "Acceptance criteria checked:"
  STOPLIGHT extraction: regex /\bGREEN\b/ in report.md

Merger gate:
  BLOCKS unless report.md contains \bGREEN\b
  Security scan results override (critical finding → forced RED)

Diff size gate:
  < 150 lines → OK
  150-300 lines → WARN
  > 300 lines → BLOCK (500 for purely additive)
```

---

## 10. Runtime Limits (policy/limits.yaml)

```yaml
# Time
max_run_hours: 8          bash_timeout_seconds: 600
default_run_hours: 3      verification_timeout_seconds: 1800

# Iterations (per agent)
max_iterations_per_run: 50    max_iterations_manager: 100
max_iterations_implementer: 70    max_iterations_reviewer: 50
max_iterations_tester: 30    max_iterations_merger: 30
max_iterations_historian: 30    max_iterations_librarian: 30
max_iterations_researcher: 40    max_iterations_consolidator: 30

# Parallelism
max_parallel_implementers: 3    max_wip_features: 1
consolidation_frequency: 10

# Diff safety
diff_warn_lines: 150    diff_block_lines: 300

# Research
max_web_searches_per_run: 10    max_sources_per_research: 20
max_blocker_questions: 3    max_ideas: 10

# File size
max_file_size_bytes: 10485760    max_artifact_size_bytes: 5242880

# Audit
audit_log_max_entries: 10000    manifest_checksum_algorithm: sha256

# Agent models
agent_models:
  researcher: claude-haiku-4-5    historian: claude-haiku-4-5
  librarian: claude-haiku-4-5

# KM auto-scheduling
km_auto:
  enabled: false    min_runs_between: 3    max_actions_per_run: 3
  skip_on_red: true    topic_from_brief: true

# KM topic chaining
km_chaining:
  enabled: true    maxCycles: 3    maxTimeMinutes: 15
  convergenceThreshold: 2    emergentGapsPerCycle: 5
```

---

## 11. Statistics

| Metric | Value |
|--------|-------|
| Total agents | 11 (3 executor, 3 quality, 5 knowledge) |
| MCP scopes | 10 (8 Aurora, 2 Neuron) |
| MCP tools | 32 (consolidated from 45) |
| MCP prompts | 19 (Swedish) |
| Skills | 8 (cross-server) |
| Completed runs | 143 |
| Tests | 2371 passing |
| DB migrations | 16 |
| Knowledge nodes | 122 (with 1024-dim embeddings) |
| Knowledge edges | 77 |
| Policy patterns | ~50 allowlist + ~20 forbidden |
| Prompt files | 10 agent + 5 model overlays |
| Lines of TypeScript | ~25,000 |
