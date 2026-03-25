#!/usr/bin/env python3
"""Fix constructor indentation in code-anchor.ts."""

FILE = 'src/core/agents/code-anchor.ts'

with open(FILE, 'r') as f:
    content = f.read()

# Fix the extra-indented constructor (4 spaces -> 2 spaces)
OLD = '    constructor(\n    private targetName: string,'
NEW = '  constructor(\n    private targetName: string,'

if OLD not in content:
    print("ERROR: Could not find indented constructor!")
    exit(1)

content = content.replace(OLD, NEW)

with open(FILE, 'w') as f:
    f.write(content)

print("SUCCESS: Fixed constructor indentation")
