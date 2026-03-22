import re

path = 'tests/core/agents/graph-tools.test.ts'
with open(path, 'r') as f:
    content = f.read()

# Replace the names array in graphToolDefinitions test
old = (
    "        'graph_query',\n"
    "        'graph_traverse',\n"
    "        'graph_assert',\n"
    "        'graph_update',\n"
    "        'graph_semantic_search',\n"
    "        'graph_cross_ref',\n"
    "        'graph_ppr',\n"
    "      ]);"
)
new = (
    "        'graph_query',\n"
    "        'graph_traverse',\n"
    "        'graph_assert',\n"
    "        'graph_update',\n"
    "        'graph_semantic_search',\n"
    "        'graph_cross_ref',\n"
    "        'graph_ppr',\n"
    "        'graph_health_check',\n"
    "      ]);"
)

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("SUCCESS: replaced names array in graphToolDefinitions test")
else:
    print("ERROR: old pattern not found")
    print("Looking for similar patterns...")
    idx = content.find("'graph_ppr',")
    if idx != -1:
        print(f"Found 'graph_ppr', at index {idx}")
        print(repr(content[idx-50:idx+100]))
