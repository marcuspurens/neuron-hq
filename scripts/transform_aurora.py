"""Replace per-node UPDATE loop with batch unnest UPDATE in aurora-graph.ts."""

import re

filepath = 'src/aurora/aurora-graph.ts'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Find the exact lines to replace (lines 344-349 in 1-indexed, 343-348 in 0-indexed)
# We look for the pattern: "for (let j = 0; j < batchRows.length; j++)"
start_idx = None
end_idx = None

for i, line in enumerate(lines):
    if 'for (let j = 0; j < batchRows.length; j++)' in line:
        start_idx = i
    if start_idx is not None and end_idx is None:
        # Count braces to find end of for block
        if i > start_idx:
            stripped = line.strip()
            if stripped == '}':
                end_idx = i
                break

if start_idx is None or end_idx is None:
    print('ERROR: Could not find the for loop to replace')
    exit(1)

print(f'Found for loop at lines {start_idx+1}-{end_idx+1}')

# The new code to insert (replacing lines start_idx through end_idx inclusive)
new_lines = [
    '        const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);\n',
    '        const vectors = embeddings.map((e: number[]) => `[${e.join(",")}]`);\n',
    '\n',
    '        await pool.query(\n',
    '          `UPDATE aurora_nodes AS n\n',
    '           SET embedding = v.emb::vector\n',
    '           FROM unnest($1::text[], $2::text[]) AS v(id, emb)\n',
    '           WHERE n.id = v.id`,\n',
    '          [ids, vectors],\n',
    '        );\n',
]

# Replace: remove old lines, insert new ones
result = lines[:start_idx] + new_lines + lines[end_idx+1:]

with open(filepath, 'w') as f:
    f.writelines(result)

print('OK: Replacement complete')
