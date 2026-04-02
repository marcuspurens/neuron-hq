# Documentation Style Guide

## Markdown Standards

### Headers

- Use ATX-style headers (`#`, `##`, `###`)
- One H1 per document
- Logical hierarchy (don't skip levels)

### Code Blocks

- Always specify language for syntax highlighting
- Use bash for shell commands
- Use typescript for TS code examples

### Lists

- Use `-` for unordered lists
- Use `1.` for ordered lists
- Indent nested lists by 2 spaces

### Links

- Prefer relative links for internal docs
- Use descriptive link text (not "click here")
- Format: `[Link Text](./path/to/doc.md)`

### Mermaid Diagrams

- **Alltid inkludera minst ett Mermaid-diagram** i handoffs och dagböcker
- Använd `flowchart`, `sequenceDiagram`, eller `graph` beroende på vad som är tydligast
- Diagram ska visa pipeline-flöden, arkitekturöversikter eller systemrelationer
- Obsidian och VS Code renderar Mermaid nativt — ingen plugin behövs
- Håll diagram kompakta: max ~20 noder, annars dela upp

## Document Types

### README.md

- Start with one-sentence description
- Quick start section
- Links to detailed docs
- Keep it concise (<300 lines)

### Runbook

- Operations focused
- Step-by-step procedures
- Troubleshooting section
- Emergency contacts/escalation

### Architecture

- System overview diagram
- Component descriptions
- Data flow
- Technology choices

### ADR (Architecture Decision Records)

- Use template in docs/adr/0001-template.md
- Number sequentially
- Include: Context, Decision, Consequences
- Immutable once accepted

## Tone

- Technical but accessible
- Use active voice
- Be concise
- Provide examples

## Examples

### Good

```markdown
# Neuron HQ

A control plane for autonomous agent swarms.

## Quick Start

1. Install dependencies: `pnpm install`
2. Add a target: `pnpm swarm target add demo /path/to/repo`
3. Run a swarm: `pnpm swarm run demo --hours 2`
```

### Bad

```markdown
# Welcome to Neuron HQ!

This is a really cool project that we built to make it easier to...
(50 more lines of fluff)
```

## Code Comments

### When to Comment

- Complex algorithms (explain _why_, not _what_)
- Workarounds (link to issue)
- Public APIs (JSDoc style)

### When NOT to Comment

- Obvious code
- Redundant comments
- Commented-out code (delete it)

### JSDoc Style

```typescript
/**
 * Validates a bash command against the allowlist.
 *
 * @param command - The shell command to validate
 * @returns true if allowed, false otherwise
 */
function isCommandAllowed(command: string): boolean {
  // ...
}
```
