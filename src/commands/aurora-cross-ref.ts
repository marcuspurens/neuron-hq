import chalk from 'chalk';
import { unifiedSearch } from '../aurora/cross-ref.js';
import type { UnifiedSearchOptions } from '../aurora/cross-ref.js';

export async function auroraCrossRefCommand(
  query: string,
  cmdOptions: { limit?: string; minSimilarity?: string; type?: string },
): Promise<void> {
  console.log(chalk.bold(`\n🔗 Cross-Reference Search: "${query}"\n`));

  try {
    const options: UnifiedSearchOptions = {};
    if (cmdOptions.limit) options.limit = parseInt(cmdOptions.limit, 10);
    if (cmdOptions.minSimilarity) options.minSimilarity = parseFloat(cmdOptions.minSimilarity);
    if (cmdOptions.type) options.type = cmdOptions.type;

    const result = await unifiedSearch(query, options);

    // Show Neuron KG results
    console.log(chalk.bold('Neuron KG (code patterns):'));
    if (result.neuronResults.length === 0) {
      console.log(chalk.dim('  No results.'));
    } else {
      for (const r of result.neuronResults) {
        const sim = `[${r.similarity.toFixed(2)}]`;
        const conf = `confidence: ${r.node.confidence}`;
        console.log(`  ${chalk.cyan(sim)} ${r.node.id}: "${r.node.title}" (${r.node.type}, ${conf})`);
        if (r.existingRef) {
          console.log(chalk.green(`         🔗 ${r.existingRef.relationship} by Aurora ${r.existingRef.auroraNodeId}`));
        }
      }
    }

    console.log('');

    // Show Aurora KG results
    console.log(chalk.bold('Aurora KG (research/documents):'));
    if (result.auroraResults.length === 0) {
      console.log(chalk.dim('  No results.'));
    } else {
      for (const r of result.auroraResults) {
        const sim = `[${r.similarity.toFixed(2)}]`;
        const conf = `confidence: ${r.node.confidence}`;
        console.log(`  ${chalk.magenta(sim)} ${r.node.id}: "${r.node.title}" (${r.node.type}, ${conf})`);
        if (r.existingRef) {
          console.log(chalk.green(`         🔗 ${r.existingRef.relationship} Neuron ${r.existingRef.neuronNodeId}`));
        }
      }
    }

    console.log(`\n${chalk.bold('Cross-references found:')} ${result.crossRefs.length}\n`);
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
