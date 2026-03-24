#!/usr/bin/env python3
"""Apply all 6 edits to consolidator.ts as specified in the brief."""

import re

FILEPATH = "src/core/agents/consolidator.ts"

with open(FILEPATH, "r") as f:
    content = f.read()

original = content  # keep for diff verification

# -------------------------
# Edit 1: Update import on line 13 to add findPprCandidates
# -------------------------
old_import = "import { mergeNodes, findDuplicateCandidates, findStaleNodes, findMissingEdges, abstractNodes, findAbstractionCandidates, type AbstractionProposal } from '../graph-merge.js';"
new_import = "import { mergeNodes, findDuplicateCandidates, findPprCandidates, findStaleNodes, findMissingEdges, abstractNodes, findAbstractionCandidates, type AbstractionProposal } from '../graph-merge.js';"

assert old_import in content, f"Edit 1: Could not find import line"
content = content.replace(old_import, new_import, 1)
print("Edit 1: import updated ✓")

# -------------------------
# Edit 2: Insert find_ppr_candidates tool before write_consolidation_report tool
# -------------------------
# Find the exact block for write_consolidation_report and insert before it
insert_before = """      {
        name: 'write_consolidation_report',"""

new_tool = """      {
        name: 'find_ppr_candidates',
        description: 'Find related nodes using graph-based PPR search (finds connections Jaccard misses)',
        input_schema: {
          type: 'object' as const,
          properties: {
            nodeId: { type: 'string', description: 'ID of the seed node to run PPR from' },
            limit: { type: 'number', description: 'Maximum number of results to return (default 10)' },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'write_consolidation_report',"""

assert insert_before in content, f"Edit 2: Could not find 'write_consolidation_report' tool block"
content = content.replace(insert_before, new_tool, 1)
print("Edit 2: find_ppr_candidates tool definition added ✓")

# -------------------------
# Edit 3: Add case in switch statement before 'write_consolidation_report' case
# -------------------------
old_case = "            case 'write_consolidation_report':"
new_case = """            case 'find_ppr_candidates':
              result = await this.executeFindPprCandidates(
                block.input as { nodeId: string; limit?: number }
              );
              break;
            case 'write_consolidation_report':"""

assert old_case in content, f"Edit 3: Could not find 'write_consolidation_report' case"
content = content.replace(old_case, new_case, 1)
print("Edit 3: find_ppr_candidates switch case added ✓")

# -------------------------
# Edit 4: Add executeFindPprCandidates() method before executeFindStaleNodes
# -------------------------
old_stale_marker = """  /**
   * Find stale nodes with low confidence that haven't been updated recently.
   */
  private async executeFindStaleNodes"""

new_ppr_method = """  /**
   * Find related nodes using Personalized PageRank (PPR) from a seed node.
   * Useful for finding conceptually related nodes that Jaccard similarity misses.
   */
  private async executeFindPprCandidates(input: {
    nodeId: string;
    limit?: number;
  }): Promise<string> {
    const graphPath = path.join(this.memoryDir, 'graph.json');
    const graph = await loadGraph(graphPath);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'find_ppr_candidates',
      allowed: true,
      note: `Finding PPR candidates for node ${input.nodeId} (limit: ${input.limit ?? 10})`,
    });

    try {
      const candidates = findPprCandidates(graph, input.nodeId, { limit: input.limit });
      return JSON.stringify(
        candidates.map(({ node, score }) => ({ nodeId: node.id, title: node.title, type: node.type, score })),
        null,
        2
      );
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Find stale nodes with low confidence that haven't been updated recently.
   */
  private async executeFindStaleNodes"""

assert old_stale_marker in content, f"Edit 4: Could not find executeFindStaleNodes marker"
content = content.replace(old_stale_marker, new_ppr_method, 1)
print("Edit 4: executeFindPprCandidates method added ✓")

# -------------------------
# Edit 5: Update findDuplicateCandidates call to use usePpr: true
# -------------------------
old_jaccard = "    const jaccardCandidates = findDuplicateCandidates(graph, threshold);"
new_jaccard = "    const jaccardCandidates = findDuplicateCandidates(graph, threshold, { usePpr: true });"

assert old_jaccard in content, f"Edit 5: Could not find findDuplicateCandidates call"
content = content.replace(old_jaccard, new_jaccard, 1)
print("Edit 5: findDuplicateCandidates updated with usePpr: true ✓")

# -------------------------
# Edit 6: Update fullReport to add pprSection and graphStatsSection
# -------------------------
old_full_report = "    const fullReport = input.content + abstractionSection;"
new_full_report = """    // PPR-discoveries section (header only — LLM fills content in input.content)
    const pprSection = '\\n## PPR-upptäckter\\n' +
      '*(Noder som PPR hittade men Jaccard missade. Fylls i av LLM i rapport-innehållet.)*\\n';

    // Graph stats section (header only — LLM fills content in input.content)
    const graphStatsSection = '\\n## Grafstatistik (noder/kanter före/efter)\\n' +
      '*(Statistik fylls i av LLM i rapport-innehållet.)*\\n';

    const fullReport = input.content + abstractionSection + pprSection + graphStatsSection;"""

assert old_full_report in content, f"Edit 6: Could not find fullReport line"
content = content.replace(old_full_report, new_full_report, 1)
print("Edit 6: fullReport updated with pprSection and graphStatsSection ✓")

# -------------------------
# Write back
# -------------------------
with open(FILEPATH, "w") as f:
    f.write(content)

print("\nAll 6 edits applied successfully!")
