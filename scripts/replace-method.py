"""Replace the executeFindDuplicateCandidates method in consolidator.ts"""

with open('src/core/agents/consolidator.ts', 'r') as f:
    lines = f.readlines()

# Method: lines 370-391 (1-indexed), i.e. 369-390 (0-indexed)
start_idx = 369  # /**
end_idx = 390    # }

# Verify we're replacing the right thing
assert lines[start_idx].strip() == '/**', f"Expected /**, got: {lines[start_idx].strip()}"
assert 'executeFindDuplicateCandidates' in lines[start_idx + 3], f"Method name not found at expected line"
assert lines[end_idx].strip() == '}', f"Expected closing brace, got: {lines[end_idx].strip()}"

new_method = '''  /**
   * Find pairs of nodes with similar titles that may be duplicates.
   * Enhanced: also runs semantic search if embeddings are available.
   */
  private async executeFindDuplicateCandidates(
    input: { similarity_threshold?: number }
  ): Promise<string> {
    const graphPath = path.join(this.memoryDir, 'graph.json');
    const graph = await loadGraph(graphPath);
    const threshold = input.similarity_threshold ?? 0.6;

    // 1. Keyword/Jaccard-based candidates (existing logic)
    const jaccardCandidates = findDuplicateCandidates(graph, threshold);
    const jaccardPairs = new Set(
      jaccardCandidates.map(c => [c.nodeA, c.nodeB].sort().join('|'))
    );

    // 2. Semantic candidates (if embeddings available)
    let semanticOnlyCount = 0;
    let bothCount = 0;
    const allCandidates = [...jaccardCandidates];

    const embeddingAvailable = await isEmbeddingAvailable();
    if (embeddingAvailable) {
      const semanticPairsFound = new Set<string>();

      for (const node of graph.nodes) {
        try {
          const similar = await findSimilarNodes(node.id, {
            limit: 5,
            minSimilarity: threshold,
          });

          for (const match of similar) {
            // Only consider same-type pairs (like Jaccard does)
            if (match.type !== node.type) continue;

            const pairKey = [node.id, match.id].sort().join('|');
            if (semanticPairsFound.has(pairKey)) continue;
            semanticPairsFound.add(pairKey);

            if (jaccardPairs.has(pairKey)) {
              bothCount++;
            } else {
              semanticOnlyCount++;
              allCandidates.push({
                nodeA: node.id,
                nodeB: match.id,
                similarity: match.similarity,
              });
            }
          }
        } catch {
          // Skip nodes that fail semantic search
        }
      }
    }

    const report = {
      candidates: allCandidates.sort((a, b) => b.similarity - a.similarity),
      stats: {
        keyword_only: jaccardCandidates.length - bothCount,
        semantic_only: semanticOnlyCount,
        both: bothCount,
        total: allCandidates.length,
        embedding_available: embeddingAvailable,
      },
    };

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'find_duplicate_candidates',
      allowed: true,
      note: `Found ${report.stats.total} candidates (keyword: ${report.stats.keyword_only}, semantic: ${report.stats.semantic_only}, both: ${report.stats.both})`,
    });

    return JSON.stringify(report, null, 2);
  }
'''

replacement_lines = new_method.split('\n')
# Add newlines
replacement_lines = [line + '\n' for line in replacement_lines]
# Remove the extra newline at the very end (the last split element is empty)
if replacement_lines[-1].strip() == '':
    replacement_lines = replacement_lines[:-1]

new_lines = lines[:start_idx] + replacement_lines + lines[end_idx + 1:]

with open('src/core/agents/consolidator.ts', 'w') as f:
    f.writelines(new_lines)

print(f"Replaced lines {start_idx+1}-{end_idx+1} with {len(replacement_lines)} new lines")
print("Done!")
