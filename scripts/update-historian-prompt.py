"""Add cross-ref section and tool entry to historian.md."""

filepath = 'prompts/historian.md'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add cross-ref section before "## What NOT to Do"
cross_ref_section = """## Cross-referens med Aurora

Efter att du har skapat eller uppdaterat noder i kunskapsgrafen, använd
`graph_cross_ref` för att kontrollera om Aurora-kunskapsbasen har relaterad
information. Detta kopplar ihop vad vi lär oss från körningar med vad
användaren har forskat om.

Använd `graph_cross_ref` för:
- Nya mönster (pattern) — finns det Aurora-forskning som stödjer mönstret?
- Nya tekniker (technique) — har Aurora dokument om samma teknik?
- Nya fel (error) — finns det Aurora-fakta som förklarar felet?

---

"""

content = content.replace(
    "## What NOT to Do",
    cross_ref_section + "## What NOT to Do"
)

# 2. Add graph_cross_ref to the Tools section at the end
tool_entry = "- **graph_cross_ref**: Find Aurora nodes semantically related to a Neuron node. Auto-creates cross-references for matches with similarity >= 0.7. Input: { neuron_node_id, relationship? }\n"

# Add after the last graph_update line in the Tools section
content = content.replace(
    "- **graph_update**: Update an existing node's confidence or properties\n",
    "- **graph_update**: Update an existing node's confidence or properties\n" + tool_entry
)

with open(filepath, 'w') as f:
    f.write(content)

print("Historian prompt updated successfully.")
