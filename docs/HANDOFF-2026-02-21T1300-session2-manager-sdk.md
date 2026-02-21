# Neuron HQ - Handoff Documentation
**Date**: 2026-02-21
**Session**: 2 - Manager Agent SDK integration complete
**Next**: First live test + remaining agents

---

## Session 2 Summary

### What Was Done

1. **Node.js 20 installed** via `brew install node@20`
   - Keg-only: requires `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`
   - npm 10.8.2 available

2. **Dependencies installed** via `npm install` (267 packages)

3. **Manager Agent fully implemented** (`src/core/agents/manager.ts`)
   - Anthropic SDK integration with `claude-opus-4-6`
   - 4 tools: `bash_exec`, `read_file`, `write_file`, `list_files`
   - Full policy gating on bash commands and file writes
   - Agent loop with time limit + max iteration stop conditions
   - Token usage tracking per agent
   - Audit logging for every tool call
   - Baseline verification (discover + verify + format)
   - Default artifact generation (questions, ideas, knowledge, sources)
   - 527 lines, up from 92 placeholder lines

4. **All tests pass** (6 suites, 37 tests)

5. **TypeScript compiles** (only pre-existing unused import warnings)

### What Was NOT Done
- `.env` not created (no API key configured yet)
- No live test run executed
- Implementer, Reviewer, Researcher agents still placeholders
- Resume functionality still placeholder
- No commit made for session 2 changes

---

## Current Status: 85%

### Done
- [x] Project scaffolding (Session 1)
- [x] All core modules (Session 1)
- [x] CLI commands (Session 1)
- [x] Policy system (Session 1)
- [x] Tests (Session 1)
- [x] Documentation (Session 1)
- [x] Node.js + dependencies installed (Session 2)
- [x] **Manager Agent with Anthropic SDK** (Session 2)

### Remaining
- [ ] Configure `.env` with `ANTHROPIC_API_KEY`
- [ ] First live test run
- [ ] Implementer agent (`src/core/agents/implementer.ts`)
- [ ] Reviewer agent (`src/core/agents/reviewer.ts`)
- [ ] Researcher agent (`src/core/agents/researcher.ts`)
- [ ] Resume functionality (`src/commands/resume.ts`)
- [ ] Commit session 2 changes

---

## Manager Agent Architecture

### File: `src/core/agents/manager.ts`

```
ManagerAgent
  ├── constructor(ctx, baseDir)
  │     └── Initializes Anthropic client + loads policy limits
  ├── run()
  │     ├── 1. runBaseline()         → discover + verify + write baseline.md
  │     ├── 2. buildSystemPrompt()   → manager.md + run context + tool docs
  │     ├── 3. runAgentLoop()        → SDK message loop with tools
  │     └── 4. writeDefaultArtifacts() → questions, ideas, knowledge, sources
  ├── Tools (defineTools)
  │     ├── bash_exec     → execSync + policy.checkBashCommand()
  │     ├── read_file     → fs.readFile (workspace-relative paths)
  │     ├── write_file    → fs.writeFile + policy.checkFileWriteScope()
  │     └── list_files    → fs.readdir
  └── Stop conditions
        ├── Time limit (ctx.endTime)
        ├── Max iterations (policy limits)
        └── Agent end_turn (no more tool calls)
```

### Key Design Decisions
- **Model**: `claude-opus-4-6` (max_tokens: 8192)
- **Tool execution**: Synchronous `execSync` for bash (with timeout from policy)
- **Policy gating**: Every bash command and file write checked before execution
- **Audit trail**: Every tool call logged to audit.jsonl
- **Token tracking**: Input/output tokens recorded per agent via `ctx.usage`

### Answers to Session 1 Questions

1. **Which Anthropic package?** `@anthropic-ai/sdk` (standard SDK, `^0.32.1`)
2. **Tool implementation**: Custom tools defined as Anthropic Tool objects, gated through PolicyEnforcer
3. **Agent loop**: Single long conversation with iterative tool use
4. **Error handling**: Try/catch per tool call, errors returned as tool results (not thrown)

---

## Immediate Next Steps (Session 3)

### Priority 1: First Live Test

```bash
# 1. Set up PATH
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# 2. Configure API key
cd /Users/mpmac/neuron-hq
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY=sk-ant-...

# 3. Add test target
npx tsx src/cli.ts target add test-demo /Users/mpmac/aurora-swarm-lab

# 4. Run minimal swarm (6 minutes)
npx tsx src/cli.ts run test-demo --hours 0.1

# 5. Verify
ls runs/*/
cat runs/*/report.md
cat runs/*/audit.jsonl
cat runs/*/usage.json
```

### Priority 2: Implement Remaining Agents

Use Manager agent as template. Each agent needs:
1. Anthropic SDK client
2. Tools relevant to its role
3. Policy gating
4. Token tracking
5. Audit logging

**Implementer** (`src/core/agents/implementer.ts`):
- Tools: bash_exec, read_file, write_file, list_files
- Focus: code changes, small diffs (<150 lines)
- Runs verification after changes

**Reviewer** (`src/core/agents/reviewer.ts`):
- Tools: read_file, list_files, bash_exec (read-only commands)
- Focus: risk assessment (LOW/MED/HIGH), stoplight report
- Two-phase commit for HIGH risk

**Researcher** (`src/core/agents/researcher.ts`):
- Tools: read_file, list_files, web_search (new tool needed)
- Focus: ideas.md, sources.md
- Max 10 web searches per run

### Priority 3: Commit Changes

```bash
cd /Users/mpmac/neuron-hq
git add src/core/agents/manager.ts
git commit -m "Implement Manager agent with Anthropic SDK (claude-opus-4-6)"
```

---

## Environment Notes

### Node.js PATH
Node@20 is keg-only. Every terminal session needs:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
```
Or add permanently to `~/.zshrc`.

### npm vs pnpm
pnpm is not installed. Use `npm` or `npx tsx` instead of `pnpm`:
```bash
npm test              # instead of pnpm test
npm run typecheck     # instead of pnpm typecheck
npx tsx src/cli.ts    # instead of pnpm swarm
```

### Known Lint Warnings
Pre-existing (not from session 2):
- `src/cli.ts`: unused `chalk` import
- `src/commands/replay.ts`: unused `manifest` variable
- `src/commands/run.ts`: unused `Verifier` import
- `src/core/artifacts.ts`: unused `RunId`, `RiskLevel` imports
- `src/core/run.ts`: unused `name` variable
- ESLint config doesn't include `tests/` directory

Session 2 (minor, acceptable):
- 4 `@typescript-eslint/no-explicit-any` warnings in error catch blocks

---

## Key Files Reference

### Modified in Session 2
- `src/core/agents/manager.ts` - **Full Anthropic SDK implementation** (was placeholder)

### Unchanged but Important
- `src/core/policy.ts` - Policy enforcement (study this)
- `src/core/run.ts` - Run orchestration + RunContext interface
- `src/core/artifacts.ts` - Artifact writing methods
- `src/core/verify.ts` - Verification (discoverCommands + verify + formatMarkdown)
- `src/core/usage.ts` - Token tracking (recordTokens + recordToolCall)
- `src/core/manifest.ts` - Manifest (addCommand takes `command: string, exitCode: number`)
- `src/core/audit.ts` - Audit logging
- `src/commands/run.ts` - CLI run command that creates RunContext and calls ManagerAgent

---

## Continuity

**Repository**: `/Users/mpmac/neuron-hq`
**Branch**: `main`
**Last commit**: `199524a` (handoff docs from session 1)
**Uncommitted changes**: `src/core/agents/manager.ts` (+464 lines)

**Next developer should**:
1. Read this HANDOFF.md
2. Set up PATH: `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`
3. Configure `.env` with API key
4. Commit the manager.ts changes
5. Run first live test
6. Implement remaining agents (Implementer, Reviewer, Researcher)

---

**End of Handoff Session 2**
