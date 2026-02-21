# Neuron HQ Architecture

## Overview

Neuron HQ is a **control plane** that orchestrates autonomous agent swarms to develop code in target repositories. It provides isolation, auditability, policy enforcement, and artifact generation.

## System Components

```
┌─────────────────────────────────────────────────────┐
│                    Neuron HQ                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │     CLI      │  │   Policy     │  │  Audit   │  │
│  │  Commands    │  │  Enforcer    │  │  Logger  │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │          Run Orchestrator                    │  │
│  └──────────────────────────────────────────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │Manager  │ │Implemen │ │Reviewer │ │Research │  │
│  │ Agent   │ │ter Agent│ │ Agent   │ │er Agent │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
└─────────────────────────────────────────────────────┘
              ↓                           ↓
     ┌────────────────┐          ┌────────────────┐
     │   Workspace    │          │      Runs      │
     │ <runid>/<name> │          │    <runid>/    │
     │  (isolated)    │          │  (artifacts)   │
     └────────────────┘          └────────────────┘
              ↓
     ┌────────────────┐
     │  Target Repo   │
     │ (original src) │
     └────────────────┘
```

## Data Flow

1. **User** writes brief in `briefs/today.md`
2. **CLI** triggers run command
3. **RunOrchestrator** creates isolated workspace and run directories
4. **Policy** validates all operations before execution
5. **Agents** (Manager → Implementer/Researcher → Reviewer) execute tasks
6. **Audit** logs every tool call
7. **Artifacts** generated in `runs/<runid>/`
8. **Manifest** checksummed and optionally signed

## Isolation Model

### Workspace Isolation
- Each run gets `workspaces/<runid>/<targetName>/`
- Fresh clone/copy from target repo
- All code changes happen here
- New branch: `swarm/<runid>`

### File Write Scope
Agents can ONLY write to:
- `workspaces/<runid>/` (target repo workspace)
- `runs/<runid>/` (artifacts)
- Neuron HQ repo itself (for self-development)

Everything else is **read-only**.

## Policy Enforcement

### Pre-execution Checks
Before any bash command or file write:
1. Check against `bash_allowlist.txt`
2. Check against `forbidden_patterns.txt`
3. Check file write scope
4. Check diff size limits

### Post-execution Audit
After every operation:
1. Log to `audit.jsonl`
2. Update manifest commands
3. Track token usage
4. Redact any secrets

### Blocking Behavior
- Forbidden patterns → immediate block
- Not in allowlist → block
- Outside file scope → block
- Diff too large → block with suggestion to split

## Agent System

### Manager Agent
- **Responsibility**: Planning, prioritization, coordination
- **Stop conditions**: Time limit, blockers, verification failure
- **WIP limit**: 1 feature at a time
- **Output**: Delegates to other agents

### Implementer Agent
- **Responsibility**: Write code, run verifications
- **Constraints**: Max 150 lines diff per iteration
- **Output**: Code changes, commits

### Reviewer Agent
- **Responsibility**: Gatekeeper, risk assessment
- **Risk levels**: LOW/MED/HIGH
- **Two-phase commit**: Required for HIGH risk
- **Output**: PASS/FAIL + report.md stoplight

### Researcher Agent
- **Responsibility**: Web search, idea generation
- **Max searches**: 10 per run
- **Output**: ideas.md with impact/effort/risk, sources.md

## Artifact Generation

### Required Artifacts
Every run MUST create:
- brief.md (snapshot)
- baseline.md (before changes)
- report.md (STOPLIGHT + instructions)
- questions.md (blockers)
- ideas.md (future work)
- knowledge.md (learnings)
- audit.jsonl (full log)
- manifest.json (checksums)
- usage.json (tokens)
- redaction_report.md (secrets)

### Artifact Validation
Reviewer checks:
- All artifacts present
- Checksums valid
- No secrets leaked
- Stoplight status complete

## Security Model

### Threat Mitigation
1. **Command injection**: Bash allowlist + forbidden patterns
2. **Path traversal**: File scope checks
3. **Secret exposure**: Redaction pipeline
4. **Destructive ops**: Git rules enforcement
5. **Resource exhaustion**: Timeouts + limits

### Audit Trail
- Every tool call logged
- Input/output hashed
- Policy events recorded
- Manifest signed (optional GPG)

## Technology Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node 20+
- **Package Manager**: pnpm
- **Agent SDK**: Anthropic Claude Agent SDK (TODO: integrate)
- **Validation**: Zod schemas
- **Testing**: Vitest

## Future Enhancements

### Phase 2 (Post-MVP)
- [ ] Anthropic SDK integration
- [ ] Full agent implementations
- [ ] Resume functionality
- [ ] Multi-target parallel runs

### Phase 3
- [ ] Local model eval
- [ ] Self-improvement loops
- [ ] Performance optimizations
- [ ] Distributed execution

## Design Decisions

See [ADRs](adr/) for detailed architecture decision records.
