# Security Rules

## Critical Security Principles

### 1. Never Commit Secrets
- ANTHROPIC_API_KEY stays in .env (never in git)
- No hardcoded credentials anywhere
- Redact all secrets from logs and artifacts

### 2. Input Validation
- Validate all file paths (prevent traversal)
- Validate all shell commands (match allowlist)
- Validate all YAML/JSON inputs with Zod schemas

### 3. Command Injection Prevention
- Never construct shell commands with string interpolation
- Use array-based command execution where possible
- Sanitize all user inputs before shell execution
- Enforce bash allowlist strictly

### 4. File System Safety
- Restrict writes to workspace and runs directories
- Check file paths before read/write
- Prevent symlink attacks
- Respect file size limits

### 5. Git Safety
- Never force push
- Never rewrite history on shared branches
- Validate all git operations against git_rules.md
- Block destructive git commands

## Audit Requirements
- Log every tool call to audit.jsonl
- Log all policy blocks with reason
- Include checksums in manifest.json
- Make audit log append-only

## Redaction
- Scan for API keys, tokens, credentials
- Redact before writing artifacts
- Document redactions in redaction_report.md
- Use consistent replacement pattern

## Threat Model
We protect against:
1. Malicious brief.md that tries command injection
2. Path traversal attacks in target paths
3. Accidental secret exposure in artifacts
4. Destructive operations on user's repos
5. Unbounded resource usage

We do NOT protect against:
- User with malicious intent and full system access
- Compromised ANTHROPIC_API_KEY
- Physical access attacks
