import chalk from 'chalk';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { ingestUrl, ingestDocument } from '../aurora/intake.js';
import type { IngestOptions } from '../aurora/intake.js';

/**
 * CLI command: aurora:ingest <source>
 * Ingest a URL or local file into the Aurora knowledge graph.
 */
export async function auroraIngestCommand(
  source: string,
  cmdOptions: { scope?: string; type?: string; maxChunks?: string },
): Promise<void> {
  const isUrl = source.startsWith('http://') || source.startsWith('https://');

  console.log(chalk.bold(`\nIngesting: ${source}\n`));

  // Check Python availability
  console.log('  Checking Python worker...');
  const available = await isWorkerAvailable();
  if (!available) {
    console.error(chalk.red('  ❌ Python worker not available. Install Python 3 and run:'));
    console.error(chalk.red('     pip install -r aurora-workers/requirements.txt'));
    return;
  }

  const options: IngestOptions = {};
  if (cmdOptions.scope) {
    options.scope = cmdOptions.scope as IngestOptions['scope'];
  }
  if (cmdOptions.type) {
    options.type = cmdOptions.type as IngestOptions['type'];
  }
  if (cmdOptions.maxChunks) {
    options.maxChunks = parseInt(cmdOptions.maxChunks, 10);
  }

  try {
    console.log('  Extracting text...');
    const result = isUrl
      ? await ingestUrl(source, options)
      : await ingestDocument(source, options);

    console.log(chalk.green(`  done (${result.wordCount} words)`));
    console.log(`  Chunking... ${result.chunkCount} chunks`);
    console.log('  Creating nodes... done');
    console.log('  Embedding... done');
    console.log('');
    console.log(chalk.green(`  ✅ Ingested "${result.title}"`));
    console.log(`    Document node: ${result.documentNodeId}`);
    console.log(`    Chunks: ${result.chunkCount}`);
    console.log(`    Scope: ${options.scope ?? 'personal'}`);
    if (result.crossRefsCreated > 0) {
      console.log(chalk.cyan(`  🔗 ${result.crossRefsCreated} cross-reference${result.crossRefsCreated > 1 ? 's' : ''} created:`));
      for (const match of result.crossRefMatches) {
        console.log(`     → [${match.similarity.toFixed(2)}] ${match.relationship} "${match.neuronTitle}"`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
