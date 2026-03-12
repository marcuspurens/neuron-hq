#!/usr/bin/env python3
"""Replace the per-node UPDATE loop in autoEmbedNodes with a batch unnest UPDATE."""

filepath = 'src/core/knowledge-graph.ts'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Find the target lines (0-indexed)
# We want to replace lines 284-290 (1-indexed) = 283-289 (0-indexed)
# Line 284: "        const embeddings = await provider.embedBatch(batchTexts);"
# Line 290: "        }"

# Verify we have the right lines
assert 'const embeddings = await provider.embedBatch(batchTexts);' in lines[283], f"Line 284 mismatch: {lines[283]}"
assert 'for (let j = 0; j < batchRows.length; j++)' in lines[284], f"Line 285 mismatch: {lines[284]}"

# Build the replacement lines
replacement = [
    "        const embeddings = await provider.embedBatch(batchTexts);\n",
    "        const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);\n",
    "        const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);\n",
    "\n",
    "        await pool.query(\n",
    "          `UPDATE kg_nodes AS n\n",
    "           SET embedding = v.emb::vector\n",
    "           FROM unnest($1::text[], $2::text[]) AS v(id, emb)\n",
    "           WHERE n.id = v.id`,\n",
    "          [ids, vectors],\n",
    "        );\n",
]

# Replace lines 283-289 (0-indexed) with replacement
new_lines = lines[:283] + replacement + lines[290:]

with open(filepath, 'w') as f:
    f.writelines(new_lines)

print(f"Done. Old line count: {len(lines)}, new line count: {len(new_lines)}")
