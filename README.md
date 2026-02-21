# Neuron HQ

**Autonomous agent swarm control plane for developing target repos**

Neuron HQ coordinates Manager, Implementer, Reviewer, and Researcher agents to autonomously develop code in other repositories over 2-3 hour runs, with full audit trails, policy enforcement, and artifact generation.

## Quick Start

### 1. Install

```bash
pnpm install
```

### 2. Configure API Key

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Add a Target Repo

```bash
pnpm swarm target add my-app /path/to/my-app
```

### 4. Write Your Brief

Edit `briefs/today.md` with what you want to achieve.

### 5. Run the Swarm

```bash
pnpm swarm run my-app --hours 3
```

### 6. Review Results

```bash
pnpm swarm report <runid>
cat runs/<runid>/questions.md
cat runs/<runid>/ideas.md
```

## Daily Workflow

1. **Morning**: Edit `briefs/today.md` with your goals
2. **Start run**: `pnpm swarm run <target> --hours 3`
3. **Go do other work** while swarm operates autonomously
4. **Afternoon**: Review `runs/<runid>/report.md`, `questions.md`, `ideas.md`
5. **If blockers**: Answer in `runs/<runid>/answers.md`
6. **Resume**: `pnpm swarm resume <runid> --hours 2`
7. **Repeat** until satisfied

## CLI Commands

### Target Management
```bash
pnpm swarm target add <name> <path-or-url>   # Add target repo
pnpm swarm target list                        # List all targets
```

### Running Swarms
```bash
pnpm swarm run <target> --hours 3            # Start new run
pnpm swarm resume <runid> --hours 2          # Resume run
pnpm swarm status                            # List all runs
```

### Results & Logs
```bash
pnpm swarm report <runid>                    # Show report
pnpm swarm logs <runid>                      # Show artifact paths
pnpm swarm replay <runid>                    # Re-run verification
```

## What Gets Created

Every run creates in `runs/<runid>/`:

- **brief.md** - Snapshot of input brief
- **baseline.md** - Baseline verification results
- **report.md** - STOPLIGHT status + how to run/test + risks + rollback
- **questions.md** - Max 3 blockers (or "No blockers")
- **ideas.md** - Research-driven ideas with impact/effort/risk
- **knowledge.md** - Learnings, assumptions, open questions
- **research/sources.md** - Links + summaries
- **audit.jsonl** - Append-only audit log
- **manifest.json** - Checksums + commands
- **usage.json** - Token tracking (info only)
- **redaction_report.md** - What was redacted from logs

## Agent Roles

- **Manager**: Plans, prioritizes, enforces WIP limit (1 feature at a time), stops on time/blockers
- **Implementer**: Writes clean code, small diffs (<150 lines), runs verifications
- **Reviewer**: Policy gatekeeper, risk classifier (LOW/MED/HIGH), requires two-phase for HIGH risk
- **Researcher**: Web search, generates ideas with impact/effort/risk analysis

## Policy Enforcement

All agents are constrained by policy in `policy/`:

- **bash_allowlist.txt** - Only these commands allowed
- **forbidden_patterns.txt** - These patterns always blocked
- **git_rules.md** - Git safety rules (no force push, no history rewrite)
- **limits.yaml** - Runtime limits (hours, diff size, timeouts)

Policy violations are logged in `audit.jsonl` and block execution.

## Security

- API keys never committed (use `.env`)
- All secrets redacted from artifacts
- Writes restricted to `workspaces/<runid>/` and `runs/<runid>/`
- Command injection prevented via allowlist
- File path traversal blocked
- Git destructive operations blocked

## Development

### Run Tests
```bash
pnpm test
pnpm test:watch  # Watch mode
```

### Type Check
```bash
pnpm typecheck
```

### Lint & Format
```bash
pnpm lint
pnpm lint:fix
pnpm format
```

## Documentation

- [Architecture](docs/architecture.md) - System design
- [Runbook](docs/runbook.md) - Operations guide
- [ADRs](docs/adr/) - Architecture decision records

## Status

**MVP Status**: ✅ Core infrastructure complete
- ✅ Policy enforcement
- ✅ Target management
- ✅ Run orchestration
- ✅ Artifact generation
- ✅ Audit logging
- ✅ CLI commands
- 🚧 Anthropic SDK integration (placeholder agents)
- 🚧 Full agent implementation

## License

MIT
