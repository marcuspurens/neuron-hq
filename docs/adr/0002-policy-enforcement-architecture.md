# ADR-0002: Policy Enforcement Architecture

**Date**: 2026-02-21
**Status**: Accepted
**Deciders**: System Architect
**Technical Story**: Swarm HQ security requirements

## Context

Autonomous agents running for 2-3 hours with bash access and file system writes pose significant security risks:
- Command injection attacks
- Destructive operations (rm -rf, force push)
- Secret leakage in logs
- Path traversal attacks
- Unbounded resource usage

We need a policy enforcement system that is:
1. **Preventive** (blocks before execution)
2. **Auditable** (logs everything)
3. **Maintainable** (easy to update rules)
4. **Fail-safe** (blocks by default)

## Decision

Implement a **multi-layer policy enforcement system**:

### Layer 1: Pre-execution Validation
- Bash commands matched against allowlist (regex)
- Forbidden patterns checked (highest priority)
- File writes validated against scope
- All validation happens BEFORE execution

### Layer 2: Runtime Constraints
- Diff size limits (warn at 150 lines, block at 300)
- Command timeouts (10 min default)
- Run time limits (configurable hours)
- WIP limits (1 feature at a time)

### Layer 3: Post-execution Audit
- Every tool call logged to audit.jsonl (append-only)
- Manifest checksums all artifacts
- Redaction pipeline removes secrets
- Optional GPG signing for tamper detection

### Configuration Files
- `policy/bash_allowlist.txt` - Regex patterns for allowed commands
- `policy/forbidden_patterns.txt` - Patterns that always block
- `policy/limits.yaml` - Numeric limits
- `policy/git_rules.md` - Git-specific safety rules

## Consequences

### Positive
- Strong security guarantees
- Full audit trail for compliance
- Easy to add new rules (just edit text files)
- Fails safe (default deny)
- No runtime dependencies (pure TypeScript)

### Negative
- Initial allowlist requires careful tuning
- False positives possible (legitimate commands blocked)
- Regex patterns can be tricky to get right
- Performance overhead of validation (minimal but non-zero)

### Neutral
- Text file configuration (not a database)
- Synchronous blocking (not async)

## Alternatives Considered

### Alternative 1: Sandboxed Containers
- **Pros**: Strongest isolation, industry standard
- **Cons**: Complex setup, macOS Docker limitations, overkill for local use
- **Why not chosen**: Adds deployment complexity, not needed for single-user local system

### Alternative 2: Allow-all with Post-execution Review
- **Pros**: No false positives, maximum flexibility
- **Cons**: Damage done before review, not preventive
- **Why not chosen**: Violates "fail-safe" requirement

### Alternative 3: LLM-based Policy Evaluation
- **Pros**: Semantic understanding, adaptive
- **Cons**: Nondeterministic, latency, API cost, can be tricked
- **Why not chosen**: Security decisions must be deterministic

## Implementation Notes

1. PolicyEnforcer loads rules at startup (fail fast if files missing)
2. All commands go through checkBashCommand() first
3. File writes validated in checkFileWriteScope()
4. Audit logging is fire-and-forget (don't block on I/O)
5. Redaction runs on all artifacts before manifest creation

## References

- `src/core/policy.ts` - Implementation
- `tests/policy.test.ts` - Test coverage
- `policy/` - Configuration files
- `.claude/rules/security.md` - Security guidelines
