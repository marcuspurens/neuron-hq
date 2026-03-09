"""Append executeGraphCrossRef function to graph-tools.ts."""

filepath = 'src/core/agents/graph-tools.ts'

impl = '''
async function executeGraphCrossRef(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const neuronNodeId = input.neuron_node_id as string;
  const relationship = (input.relationship as 'supports' | 'contradicts' | 'enriches' | 'discovered_via') || 'enriches';

  try {
    const matches = await findAuroraMatchesForNeuron(neuronNodeId, {
      limit: 5,
      minSimilarity: 0.5,
    });

    const crossRefsCreated: Array<{ auroraNodeId: string; similarity: number }> = [];

    for (const match of matches) {
      if (match.similarity >= 0.7) {
        await createCrossRef(
          neuronNodeId,
          match.node.id,
          relationship,
          match.similarity,
          { createdBy: ctx.agent, runId: ctx.runId },
        );
        crossRefsCreated.push({
          auroraNodeId: match.node.id,
          similarity: match.similarity,
        });
      }
    }

    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_cross_ref',
      allowed: true,
      note: `Found ${matches.length} Aurora matches, created ${crossRefsCreated.length} cross-refs`,
    });

    return JSON.stringify({
      neuronNodeId,
      matches: matches.map(m => ({
        auroraNodeId: m.node.id,
        title: m.node.title,
        type: m.node.type,
        similarity: m.similarity,
        crossRefCreated: m.similarity >= 0.7,
      })),
      crossRefsCreated,
    }, null, 2);
  } catch (error) {
    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_cross_ref',
      allowed: true,
      note: `graph_cross_ref failed: ${error}`,
    });

    return JSON.stringify({
      neuronNodeId,
      matches: [],
      crossRefsCreated: [],
      error: `Failed to search Aurora: ${error instanceof Error ? error.message : error}`,
    });
  }
}
'''

with open(filepath, 'a') as f:
    f.write(impl)

print("Implementation function appended successfully.")
