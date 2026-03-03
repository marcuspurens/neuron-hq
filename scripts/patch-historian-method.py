"""Add checkSemanticDuplicates method before executeReadFile."""

with open('src/core/agents/historian.ts', 'r') as f:
    content = f.read()

marker = '  private async executeReadFile(input: { path: string }): Promise<string> {'

new_method = """  /**
   * Check for semantically similar nodes before adding a new one.
   * Returns warning/info message or null if no duplicates found.
   */
  private async checkSemanticDuplicates(input: Record<string, unknown>): Promise<string | null> {
    try {
      if (!(await isEmbeddingAvailable())) return null;

      const nodeInput = input.node as { title?: string; type?: string } | undefined;
      if (!nodeInput?.title) return null;

      const results = await semanticSearch(nodeInput.title, {
        type: nodeInput.type,
        limit: 5,
        minSimilarity: 0.8,
      });

      if (results.length === 0) return null;

      const warnings: string[] = [];
      for (const match of results) {
        if (match.similarity >= 0.9) {
          warnings.push(
            `\\u26a0\\ufe0f Very similar node exists: "${match.title}" (id: ${match.id}, similarity: ${match.similarity.toFixed(2)}). Consider updating it instead of creating a new node.`
          );
        } else if (match.similarity >= 0.8) {
          warnings.push(
            `\\u2139\\ufe0f Related node found: "${match.title}" (id: ${match.id}, similarity: ${match.similarity.toFixed(2)})`
          );
        }
      }

      return warnings.length > 0 ? `[Semantic Dedup Check]\\n${warnings.join('\\n')}` : null;
    } catch {
      // Non-fatal: if semantic search fails, proceed without dedup check
      return null;
    }
  }

  """

if marker not in content:
    print("ERROR: marker not found!")
    exit(1)

content = content.replace(marker, new_method + marker)

with open('src/core/agents/historian.ts', 'w') as f:
    f.write(content)

print("Added checkSemanticDuplicates method successfully")
