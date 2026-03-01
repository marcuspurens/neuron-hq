"""Replace the knowledge-graph ARCHIVE block in manager.md."""

with open('prompts/manager.md', 'r') as f:
    content = f.read()

old_block = """<!-- ARCHIVE: knowledge-graph -->
## Planning Phase — Consult Knowledge Graph

Before delegating work, query the knowledge graph for relevant context:

### 1. Known patterns for this target
```
graph_query({ type: "pattern", query: "<target-name>" })
```

### 2. Known risks and bugs
```
graph_query({ type: "error", query: "<target-name>", min_confidence: 0.5 })
```

### 3. Previous decisions
```
graph_query({ type: "pattern", query: "decision <target-name>" })
```

Use what you find to:
- Avoid repeating known mistakes (check error/bug nodes)
- Follow established patterns (check pattern nodes)
- Respect previous architectural decisions (check decision nodes)
- Flag if the brief conflicts with any known risk

If the graph returns no relevant nodes, proceed normally.
<!-- /ARCHIVE: knowledge-graph -->"""

new_block = """<!-- ARCHIVE: knowledge-graph -->
## Planning Phase — Consult Knowledge Graph

Before delegating work, query the knowledge graph for relevant context:

### 1. Universal patterns (from all projects)
```
graph_query({ type: "pattern", scope: "universal", min_confidence: 0.6 })
```

Use these proven patterns regardless of which target you're working on.

### 2. Target-specific patterns
```
graph_query({ type: "pattern", query: "<target-name>" })
```

Patterns specific to this target's codebase and architecture.

### 3. Target-specific risks
```
graph_query({ type: "error", query: "<target-name>", min_confidence: 0.5 })
```

### 4. Previous decisions
```
graph_query({ type: "pattern", query: "decision <target-name>" })
```

Use what you find to:
- Avoid repeating known mistakes (check error/bug nodes)
- Follow established patterns (check pattern nodes)
- Respect previous architectural decisions (check decision nodes)
- Flag if the brief conflicts with any known risk

If the graph returns no relevant nodes, proceed normally.
<!-- /ARCHIVE: knowledge-graph -->"""

if old_block not in content:
    raise ValueError("Could not find old knowledge-graph block in manager.md")

content = content.replace(old_block, new_block)

with open('prompts/manager.md', 'w') as f:
    f.write(content)

print("Done - replaced knowledge-graph section in manager.md")
