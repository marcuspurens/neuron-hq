#!/usr/bin/env python3
"""Fix the hourglass emoji in manager.ts."""

with open('src/core/agents/manager.ts', 'r') as f:
    content = f.read()

# Replace the escaped unicode with the actual emoji
content = content.replace("'- **Status**: \\u23f3 pending\\n'", "'- **Status**: ⏳ pending\\n'")

with open('src/core/agents/manager.ts', 'w') as f:
    f.write(content)

print("Fixed emoji")
