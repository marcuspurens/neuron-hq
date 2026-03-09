"""Fix the graph_cross_ref case to call the right function."""

filepath = 'src/core/agents/graph-tools.ts'

with open(filepath, 'r') as f:
    content = f.read()

old = """    case 'graph_cross_ref':
      return executeGraphSemanticSearch(input, ctx);"""

new = """    case 'graph_cross_ref':
      return executeGraphCrossRef(input, ctx);"""

content = content.replace(old, new)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed graph_cross_ref case.")
