"""Insert graph_cross_ref tool definition into graph-tools.ts."""
import re

filepath = 'src/core/agents/graph-tools.ts'

with open(filepath, 'r') as f:
    content = f.read()

tool_def = """    {
      name: 'graph_cross_ref',
      description:
        'Find Aurora knowledge nodes that are semantically related to a Neuron knowledge graph node. ' +
        'Automatically creates cross-references for matches with similarity >= 0.7.',
      input_schema: {
        type: 'object' as const,
        properties: {
          neuron_node_id: {
            type: 'string',
            description: 'The Neuron KG node ID to find Aurora matches for',
          },
          relationship: {
            type: 'string',
            enum: ['supports', 'contradicts', 'enriches', 'discovered_via'],
            description: 'Relationship type for created cross-refs (default: enriches)',
          },
        },
        required: ['neuron_node_id'],
      },
    },"""

# Find the closing of graphToolDefinitions - the `  ];` line
# Insert before `  ];` that closes the return array
old = "  ];\n}"
# We need to find the first occurrence that is part of graphToolDefinitions
# The pattern is: the last tool entry closes with `    },\n  ];\n}`
# Replace: insert new tool before `  ];`

# More precise: find the `  ];` followed by `}` that closes graphToolDefinitions
content = content.replace(
    "      },\n    },\n  ];\n}",
    "      },\n    },\n" + tool_def + "\n  ];\n}",
    1  # only first occurrence
)

with open(filepath, 'w') as f:
    f.write(content)

print("Tool definition inserted successfully.")
