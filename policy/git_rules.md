# Git Rules for Neuron HQ

## Core Principles
1. **Never write to main/master branch directly**
2. **Never force push** (unless explicitly allowed in policy)
3. **Never rewrite published history**
4. **All work happens in workspace branches** (swarm/<runid>)

## Allowed Operations

### Read Operations (always safe)
- `git status`
- `git diff`
- `git log`
- `git show`
- `git branch --list`
- `git rev-parse`

### Workspace Operations (safe in workspace)
- `git checkout -b swarm/<runid>` (create workspace branch)
- `git switch swarm/<runid>` (switch to workspace branch)
- `git add <files>` (stage changes)
- `git commit -m "message"` (commit to workspace branch)
- `git config --local` (workspace-local config only)

## Forbidden Operations

### Never Allowed
- `git push --force` or `git push -f`
- `git reset --hard` (unless in explicit rollback policy)
- `git clean -fd`
- `git filter-branch`
- `git rebase --force`
- Any operation on main/master branch
- Any operation that rewrites history (`--amend` on shared commits)

## Branch Policy

### Workspace Branch Naming
- Pattern: `swarm/<runid>`
- Example: `swarm/20260221-1430-feature-auth`

### Protection Rules
- Reviewer must verify branch before any push
- Push requires explicit approval in two-phase commit (HIGH risk)
- No direct commits to main/master

## Rollback Procedure

If rollback is needed:
1. Document in report.md exact rollback commands
2. Prefer `git revert` over `git reset`
3. If `git reset --hard` is truly needed, require explicit approval in answers.md
