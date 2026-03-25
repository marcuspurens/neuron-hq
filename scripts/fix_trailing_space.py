#!/usr/bin/env python3
"""Fix trailing space in FORBIDDEN_PATTERNS."""

FILE = 'src/core/agents/code-anchor.ts'

with open(FILE, 'r') as f:
    content = f.read()

# Fix trailing space
OLD = '    />\s*\\.\\/, \n  ];'
NEW = '    />\s*\\.\\//,\n  ];'

# Use literal string replacement
old_literal = '    />\\.\\//,   \n  ];'

# Try direct approach
lines = content.split('\n')
fixed_lines = []
for line in lines:
    if line.rstrip() != line and '/>\\.\\//,' in line:
        fixed_lines.append(line.rstrip())
        print(f"Fixed trailing space on line with: {line.rstrip()}")
    else:
        fixed_lines.append(line)

content = '\n'.join(fixed_lines)

with open(FILE, 'w') as f:
    f.write(content)

print("Done.")
