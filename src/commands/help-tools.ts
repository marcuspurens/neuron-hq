import { findTools, listAllToolsByCategory } from '../mcp/tools/neuron-help.js';
import type { HelpResult } from '../mcp/tools/neuron-help.js';

/**
 * CLI command: help-tools [question...]
 * Without argument: list all tools by category.
 * With argument: find the most relevant tools for a given question.
 */
export async function helpToolsCommand(
  question: string | undefined,
  _options: Record<string, unknown>,
): Promise<void> {
  try {
    if (!question || question.trim() === '') {
      console.log('📚 Alla Neuron HQ-verktyg\n');
      console.log(listAllToolsByCategory());
      return;
    }

    const results: HelpResult[] = await findTools(question);

    console.log(`🔍 Resultat för: "${question}"\n`);

    for (const [i, r] of results.entries()) {
      console.log(`${i + 1}. ${r.name} [${r.category}]`);
      console.log(`   ${r.reason}`);
      if (r.exampleMcp) {
        console.log(`   MCP: ${r.exampleMcp}`);
      }
      if (r.exampleCli) {
        console.log(`   CLI: ${r.exampleCli}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(
      `❌ help-tools error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
