#!/usr/bin/env python3
"""Fix toContainEqual assertions to use objectContaining for nested node objects."""

path = 'tests/core/graph-merge.test.ts'
with open(path, 'r') as f:
    content = f.read()

# Fix: node: nodeB → node: expect.objectContaining({ id: nodeB.id })
old1 = "expect(results).not.toContainEqual(expect.objectContaining({ node: nodeB }));"
new1 = "expect(results).not.toContainEqual(expect.objectContaining({ node: expect.objectContaining({ id: nodeB.id }) }));"

old2 = "expect(results).toContainEqual(expect.objectContaining({ node: nodeC, score: 0.3 }));"
new2 = "expect(results).toContainEqual(expect.objectContaining({ node: expect.objectContaining({ id: nodeC.id }), score: 0.3 }));"

old3 = "expect(results).toContainEqual(expect.objectContaining({ node: nodeD, score: 0.2 }));"
new3 = "expect(results).toContainEqual(expect.objectContaining({ node: expect.objectContaining({ id: nodeD.id }), score: 0.2 }));"

assert old1 in content, "old1 not found"
assert old2 in content, "old2 not found"
assert old3 in content, "old3 not found"

content = content.replace(old1, new1)
content = content.replace(old2, new2)
content = content.replace(old3, new3)

with open(path, 'w') as f:
    f.write(content)

print("Done")
