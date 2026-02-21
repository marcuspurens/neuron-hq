# Neuron HQ Runbook

Operational procedures for running and troubleshooting Neuron HQ.

## Installation

### Prerequisites
- macOS (tested on M4)
- Node 20+
- pnpm 8+
- Git
- Anthropic API key (enterprise recommended)

### Setup Steps

1. **Clone repo**
   ```bash
   cd /Users/mpmac
   git clone <neuron-hq-url> neuron-hq
   cd neuron-hq
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and add ANTHROPIC_API_KEY
   ```

4. **Verify installation**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

## Daily Operations

### Starting a New Run

1. **Edit brief**
   ```bash
   # Edit briefs/today.md with your goals
   code briefs/today.md
   ```

2. **Add target (first time)**
   ```bash
   pnpm swarm target add my-app /path/to/my-app
   ```

3. **Start run**
   ```bash
   pnpm swarm run my-app --hours 3
   ```

4. **Monitor**
   - Check console output for progress
   - Run will stop on time limit or blockers

### Reviewing Results

1. **Check status**
   ```bash
   pnpm swarm status
   ```

2. **Read report**
   ```bash
   pnpm swarm report <runid>
   ```

3. **Review artifacts**
   ```bash
   cat runs/<runid>/questions.md  # Blockers
   cat runs/<runid>/ideas.md      # Future work
   cat runs/<runid>/knowledge.md  # Learnings
   ```

### Resuming a Run

```bash
pnpm swarm resume <runid> --hours 2
```

### Replaying Verification

```bash
pnpm swarm replay <runid>
```

This re-runs verification commands and compares against manifest.

## Troubleshooting

### Run Failed to Start

**Symptom**: Error during `pnpm swarm run`

**Check**:
1. Is target configured? `pnpm swarm target list`
2. Does brief file exist? `ls briefs/today.md`
3. Is API key set? `grep ANTHROPIC_API_KEY .env`
4. Are policy files present? `ls policy/`

### Verification Failed

**Symptom**: Baseline or after-change verify shows FAIL

**Actions**:
1. Read `runs/<runid>/baseline.md` for error details
2. Check if target repo has issues (broken tests, missing deps)
3. Add manual verify commands to target config:
   ```bash
   pnpm swarm target add my-app /path \
     --verify "pnpm install" "pnpm test"
   ```

### Policy Blocked Command

**Symptom**: Audit log shows `allowed: false`

**Actions**:
1. Check `runs/<runid>/audit.jsonl` for policy_event
2. If command is safe and needed:
   - Add pattern to `policy/bash_allowlist.txt`
   - Ensure it doesn't match `policy/forbidden_patterns.txt`
3. If command is unsafe: do not add to allowlist

### Diff Too Large

**Symptom**: Report shows "Diff size: TOO_BIG"

**Actions**:
1. Review `questions.md` for split suggestion
2. Run should have written a blocker with how to proceed
3. Consider increasing `diff_block_lines` in `policy/limits.yaml` (carefully)

### Secrets Leaked

**Symptom**: API key or secret found in artifacts

**Actions**:
1. **Immediate**: Delete `runs/<runid>/` directory
2. **Rotate secret** (get new API key)
3. **Update redaction patterns** in `src/core/redaction.ts`
4. **Re-test redaction**: `pnpm test tests/redaction.test.ts`

### Out of Disk Space

**Symptom**: Errors writing to workspace or runs

**Actions**:
1. Clean old runs: `rm -rf runs/<old-runid>`
2. Clean old workspaces: `rm -rf workspaces/<old-runid>`
3. Recommended: Keep last 10 runs, delete rest

### API Rate Limit

**Symptom**: Anthropic API errors

**Actions**:
1. Check `runs/<runid>/usage.json` for token counts
2. Wait for rate limit reset
3. Consider reducing `--hours` for next run

## Monitoring

### Check Token Usage

```bash
cat runs/<runid>/usage.json | jq '.total_input_tokens, .total_output_tokens'
```

### Check Policy Events

```bash
cat runs/<runid>/audit.jsonl | grep '"allowed":false'
```

### Check Verification History

```bash
cat runs/<runid>/baseline.md
cat runs/<runid>/replay.md  # If replay was run
```

## Maintenance

### Weekly Tasks
- [ ] Clean old runs (keep last 20)
- [ ] Review policy violations in audits
- [ ] Update decision-cache if patterns emerge

### Monthly Tasks
- [ ] Review policy allowlist/forbidden patterns
- [ ] Update dependencies: `pnpm update`
- [ ] Run full test suite: `pnpm test`

### Quarterly Tasks
- [ ] Review architecture decisions (ADRs)
- [ ] Evaluate new Claude model versions
- [ ] Performance audit (token usage trends)

## Backup & Recovery

### What to Back Up
- `briefs/decision-cache.md` (important decisions)
- `targets/repos.yaml` (target configs)
- `runs/<important-runids>/` (key artifacts)
- `.env` (keep secure, encrypted backup)

### What NOT to Back Up
- `node_modules/` (rebuild with pnpm install)
- `workspaces/` (temporary)
- Most `runs/` (keep only important ones)

## Escalation

### Issues
For bugs or feature requests:
https://github.com/<your-org>/neuron-hq/issues

### Support
- Review documentation: `docs/`
- Check ADRs: `docs/adr/`
- Review prompts: `prompts/`

## Emergency Procedures

### Kill Runaway Run
```bash
# Find process
ps aux | grep 'swarm run'

# Kill it
kill <PID>

# Clean up partial run
rm -rf workspaces/<runid>
rm -rf runs/<runid>
```

### Reset to Clean State
```bash
# Back up targets and briefs
cp targets/repos.yaml /tmp/backup-repos.yaml
cp briefs/decision-cache.md /tmp/backup-cache.md

# Clean everything
rm -rf runs/* workspaces/*

# Restore configs
cp /tmp/backup-repos.yaml targets/repos.yaml
cp /tmp/backup-cache.md briefs/decision-cache.md
```

### Verify System Health
```bash
pnpm typecheck   # Should pass
pnpm lint        # Should pass
pnpm test        # Should pass
```

If all three pass, system is healthy.
