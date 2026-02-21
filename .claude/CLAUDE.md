# Neuron HQ - Claude Code Instructions

## What is This Repo?
Neuron HQ is a **control plane** for running autonomous agent swarms that develop other repos. It coordinates Manager, Implementer, Reviewer, and Researcher agents using the Anthropic Claude Agent SDK.

## Critical Rules (Read First)

### 1. File Scope
- Agents **ONLY write** to:
  - `workspaces/<runid>/` (workspace copies of target repos)
  - `runs/<runid>/` (run artifacts)
  - Neuron HQ code itself (when developing Neuron HQ)
- Everything else is **read-only**

### 2. Policy Enforcement
- All bash commands **MUST** match `policy/bash_allowlist.txt`
- **BLOCK** anything in `policy/forbidden_patterns.txt`
- Enforce git rules from `policy/git_rules.md`
- Respect all limits in `policy/limits.yaml`

### 3. Required Artifacts
Every run **MUST** create in `runs/<runid>/`:
- `brief.md` - snapshot of input brief
- `baseline.md` - baseline verification results
- `report.md` - STOPLIGHT + how to run/test + risk + rollback
- `questions.md` - max 3 blockers (or "No blockers")
- `ideas.md` - research-driven ideas with impact/effort/risk
- `knowledge.md` - learnings, assumptions, open questions
- `research/sources.md` - links + summaries
- `audit.jsonl` - append-only audit log
- `manifest.json` - checksums + commands
- `usage.json` - token tracking (info only)
- `redaction_report.md` - what was redacted

## Tech Stack
- **TypeScript** (strict mode, NodeNext)
- **pnpm** for package management
- **Vitest** for tests
- **ESLint + Prettier** for quality
- **Anthropic SDK** for agents (see package.json)

## Development Workflow

### Run Tests
```bash
pnpm test
pnpm test:watch  # watch mode
```

### Type Check
```bash
pnpm typecheck
```

### Lint/Format
```bash
pnpm lint
pnpm format
```

### Build (type-check only, we use tsx for runtime)
```bash
pnpm build
```

## Code Style
- Prefer explicit types over inference at boundaries
- Use Zod for runtime validation
- Keep functions small and focused
- Test all policy enforcement
- Error handling: explicit Result types or throw with context

## Testing Requirements
- All policy modules **MUST** have tests
- Test blocking behavior explicitly
- Test artifact creation
- Test audit logging
- Aim for >80% coverage on core modules

## See Also
- `docs/architecture.md` - system design
- `docs/runbook.md` - operations guide
- `policy/` - all enforcement rules
- `prompts/` - agent role definitions
