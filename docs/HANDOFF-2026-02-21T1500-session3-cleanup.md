# Swarm HQ - Handoff Documentation
**Date**: 2026-02-21
**Session**: 3 - Repo cleanup & target registration
**Next**: First live run + remaining agents

---

## Session 3 Summary

### What Was Done

1. **Both repos diagnosed and cleaned up**
   - Discovered swarm-hq had uncommitted session 2 work (manager.ts + handoff files)
   - Discovered aurora-swarm-lab had ~30 uncommitted files from multiple earlier sessions
   - Verified no cross-contamination between repos

2. **swarm-hq committed cleanly** (3 new commits on top of session 2)
   - `e917919` Manager agent with Anthropic SDK
   - `5bc3731` Handoff docs reorganized
   - `c21f702` package-lock.json (npm install, pnpm not available)
   - `00de203` aurora-swarm-lab registered as first target

3. **aurora-swarm-lab committed in 6 logical groups**
   - `0deb879` Prompts extracted to `app/prompts/` text files
   - `090ef23` Dropbox intake + macOS autostart scripts
   - `8c6f801` Transcript markdown output + ontology rules
   - `4801fa5` MCP server richer UI + intake_ui_server
   - `e906d64` Module improvements + all new tests
   - `1f8e68d` Docs, scripts, env, gitignore cleanup

4. **aurora-swarm-lab registered as target in swarm-hq**
   - File: `targets/repos.yaml`
   - verify_commands: `python -m pytest tests/ -x -q`

### Both repos are now: clean working tree, no dirty state

---

## Current Status

### swarm-hq: 85% complete

#### Done
- [x] Project scaffolding + all core modules
- [x] CLI commands (target, run, resume, replay, status)
- [x] Policy system (bash allowlist, forbidden patterns, file scope, limits)
- [x] Artifact system (10 required artifacts per run)
- [x] Audit logging, manifest, usage tracking, secret redaction
- [x] Tests (6 suites, 37 tests)
- [x] Manager Agent with Anthropic SDK (`claude-opus-4-6`)
- [x] aurora-swarm-lab registered as first target

#### Remaining
- [ ] Configure `.env` with `ANTHROPIC_API_KEY`
- [ ] First live test run against aurora-swarm-lab
- [ ] Implementer agent (`src/core/agents/implementer.ts`)
- [ ] Reviewer agent (`src/core/agents/reviewer.ts`)
- [ ] Researcher agent (`src/core/agents/researcher.ts`)
- [ ] Resume functionality (`src/commands/resume.ts`)

### aurora-swarm-lab: ~90% complete (NEXT_STEPS.md)

#### Done
- [x] Full intake pipeline (URL, PDF/DOCX, YouTube/audio, Dropbox)
- [x] Whisper transcription + transcript markdown
- [x] Chunking + enrichment + Snowflake publish
- [x] Swarm ask pipeline (route → retrieve → analyze → synthesize)
- [x] GraphRAG (entities/relations/ontology/publish/retrieve)
- [x] Memory layer (working/long-term)
- [x] Obsidian integration
- [x] Initiative scoring + reports
- [x] MCP server with richer UI (forms, list editing, voice gallery)
- [x] Voiceprint + diarization (pyannote optional)
- [x] Audio denoise (DeepFilterNet optional)
- [x] Prompts extracted to `app/prompts/*.txt`

#### Current focus (NEXT_STEPS.md)
- MCP Apps richer UI — forms and list editing (done in session 3's commits)
- Consider this complete; no clear remaining P0 items

---

## Repo Relationship

```
swarm-hq/                          ← Control plane (TypeScript)
  targets/repos.yaml               ← aurora-swarm-lab registered here
  src/core/agents/manager.ts       ← Orchestrates swarm over target repos
  workspaces/<runid>/              ← Git worktree copy of aurora-swarm-lab
  runs/<runid>/                    ← Artifacts per run

aurora-swarm-lab/                  ← Target repo (Python AI assistant)
  app/                             ← Python modules
  tests/                           ← pytest
```

swarm-hq **reads** aurora-swarm-lab by cloning into `workspaces/`.
swarm-hq **never writes** directly to `/Users/mpmac/aurora-swarm-lab/`.

---

## Immediate Next Steps (Session 4)

### Priority 1: First live run

```bash
# 1. Set up PATH
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# 2. Configure API key
cd /Users/mpmac/swarm-hq
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY=sk-ant-...

# 3. Run minimal swarm (6 minutes) against aurora-swarm-lab
npx tsx src/cli.ts run aurora-swarm-lab --hours 0.1

# 4. Verify artifacts
ls runs/*/
cat runs/*/report.md
cat runs/*/audit.jsonl
cat runs/*/usage.json
```

### Priority 2: Implement remaining agents

Use `src/core/agents/manager.ts` as template. Each agent needs:
1. Anthropic SDK client (`claude-opus-4-6`)
2. Tools relevant to its role
3. Policy gating (checkBashCommand + checkFileWriteScope)
4. Token tracking (`ctx.usage.recordTokens`)
5. Audit logging (`ctx.audit.log`)

**Implementer** (`src/core/agents/implementer.ts`):
- Focus: code changes, small diffs (<150 lines)
- Tools: bash_exec, read_file, write_file, list_files
- Runs verification after each change

**Reviewer** (`src/core/agents/reviewer.ts`):
- Focus: risk assessment (LOW/MED/HIGH), stoplight report
- Tools: read_file, list_files, bash_exec (read-only)
- Two-phase commit for HIGH risk changes

**Researcher** (`src/core/agents/researcher.ts`):
- Focus: ideas.md, sources.md
- Tools: read_file, list_files, web_search (new tool needed)
- Max 10 web searches per run

---

## Environment Notes

### Node.js PATH (required every session)
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
```
Or add permanently to `~/.zshrc`.

### npm vs pnpm
pnpm is not installed. Use npm/npx:
```bash
npm test              # instead of pnpm test
npm run typecheck     # instead of pnpm typecheck
npx tsx src/cli.ts    # instead of pnpm swarm
```

### Key files
| File | Purpose |
|------|---------|
| `src/core/agents/manager.ts` | Manager agent (full implementation) |
| `src/core/policy.ts` | Policy enforcement |
| `src/core/run.ts` | RunContext interface + orchestration |
| `src/core/artifacts.ts` | Artifact writing methods |
| `src/core/verify.ts` | Baseline verification |
| `src/core/usage.ts` | Token tracking |
| `src/core/audit.ts` | Audit logging |
| `targets/repos.yaml` | Registered target repos |

---

## Continuity

**swarm-hq**: `/Users/mpmac/swarm-hq`, branch `main`, last commit `00de203`
**aurora-swarm-lab**: `/Users/mpmac/aurora-swarm-lab`, branch `main`, last commit `1f8e68d`

Both repos: clean working tree.

---

**End of Handoff Session 3**
