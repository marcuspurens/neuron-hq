"""Add scope: 'unknown' to all node object literals in knowledge-graph-migrate.ts"""
import re

with open('src/core/knowledge-graph-migrate.ts', 'r') as f:
    content = f.read()

# Pattern: find node objects that have `confidence:` but no `scope:`
# We add `scope: 'unknown' as const,` after each `confidence:` line in node literals
# This handles the pattern:
#   confidence: ...,
# }
# We need to add:
#   confidence: ...,
#   scope: 'unknown',
# }

# Strategy: find all "confidence: X.Y," or "confidence," lines that are followed
# by a closing brace or another property, and not already followed by scope
lines = content.split('\n')
result = []
i = 0
while i < len(lines):
    line = lines[i]
    result.append(line)
    
    # Check if this line contains "confidence:" in a node literal context
    stripped = line.strip()
    if stripped.startswith('confidence:') or stripped.startswith('confidence,'):
        # Check if next non-empty line already has scope
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j < len(lines) and 'scope' not in lines[j]:
            # Get indentation from current line
            indent = len(line) - len(line.lstrip())
            indent_str = ' ' * indent
            result.append(f"{indent_str}scope: 'unknown',")
    i += 1

with open('src/core/knowledge-graph-migrate.ts', 'w') as f:
    f.write('\n'.join(result))

print("Done - added scope to migrate file")
