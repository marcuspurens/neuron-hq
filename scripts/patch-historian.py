"""Insert Scope Tagging section into historian.md after step 6."""

with open('prompts/historian.md', 'r') as f:
    content = f.read()

insertion = """
### Scope Tagging

When writing nodes with `graph_assert`, always set `scope` in the node:

- **"universal"** — Pattern applies to any project (testing strategies,
  coding conventions, error handling, tool usage, prompt engineering)
- **"project-specific"** — Pattern is tied to a specific target's codebase,
  architecture, or domain (e.g., "Aurora uses SQLite", "neuron-hq uses Zod")

**Rule of thumb:** If the pattern would help someone working on a *different*
project, it's universal. If it only makes sense in the context of *this* target,
it's project-specific.

Example:
```
graph_assert({
  node: {
    type: "pattern",
    title: "Run tests with -q to avoid context overflow",
    properties: { ... },
    confidence: 0.8,
    scope: "universal"
  }
})
```
"""

# Insert after "bump confidence" line
marker = '   - When confirming an existing pattern → use `graph_update` to bump confidence'
content = content.replace(marker, marker + '\n' + insertion)

with open('prompts/historian.md', 'w') as f:
    f.write(content)

print("Done - inserted Scope Tagging section into historian.md")
