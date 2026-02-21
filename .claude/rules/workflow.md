# Workflow Rules

## Development Workflow

### 1. Small Commits
- Each commit should be one logical change
- Descriptive commit messages
- Reference issue/task if applicable

### 2. Test Before Commit
```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 3. PR Checklist
- [ ] Tests pass
- [ ] Types check
- [ ] Lint passes
- [ ] New tests for new features
- [ ] Docs updated if needed

## Code Review Standards

### What Reviewers Check
- Security: No vulnerabilities introduced
- Tests: Adequate coverage
- Types: No any abuse
- Style: Follows project conventions
- Docs: Updated if API changed

### Approval Criteria
- At least one approval
- All CI checks pass
- No unresolved comments

## Release Process

### Versioning
- Follow semver: MAJOR.MINOR.PATCH
- Breaking changes: bump MAJOR
- New features: bump MINOR
- Bug fixes: bump PATCH

### Changelog
- Update CHANGELOG.md for every release
- Group changes: Added, Changed, Fixed, Removed
- Link to PRs and issues

## Agent Development

### When Adding New Agent Roles
1. Create prompt in `prompts/<role>.md`
2. Implement in `src/core/agents/<role>.ts`
3. Add tests in `tests/agents/<role>.test.ts`
4. Document in architecture.md

### When Modifying Policy
1. Update policy file (bash_allowlist.txt, etc.)
2. Add test case for new rule
3. Update security.md if security-relevant
4. Document rationale in ADR
