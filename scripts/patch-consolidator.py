"""Insert Scope Promotion section into consolidator.md after Archive Stale Nodes."""

with open('prompts/consolidator.md', 'r') as f:
    content = f.read()

marker = """- Archiving = set properties.archived = true, not deletion

## Rules"""

replacement = """- Archiving = set properties.archived = true, not deletion

### 5. Scope Promotion

Check if any `project-specific` or `unknown` patterns appear in multiple
targets (different `provenance.runId` prefixes or different target names in
properties):

- If a pattern has been confirmed in 2+ different targets → promote to
  `scope: "universal"` via `graph_update()`
- If a pattern only has provenance from one target → set to
  `scope: "project-specific"` if still `unknown`

## Rules"""

if marker not in content:
    raise ValueError("Could not find marker in consolidator.md")

content = content.replace(marker, replacement)

with open('prompts/consolidator.md', 'w') as f:
    f.write(content)

print("Done - inserted Scope Promotion section into consolidator.md")
