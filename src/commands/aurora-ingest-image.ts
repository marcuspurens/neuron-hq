import chalk from 'chalk';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { ingestImage } from '../aurora/ocr.js';

/**
 * CLI command: aurora:ingest-image
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:ingest-image <path>
 *   npx tsx src/cli.ts aurora:ingest-image <path> --language sv
 */
export async function auroraIngestImageCommand(
  filePath: string,
  cmdOptions: { language?: string; scope?: string },
): Promise<void> {
  console.log(chalk.bold('\n📷 Ingesting image via OCR...'));
  console.log(`  File: ${filePath}`);
  console.log(`  Language: ${cmdOptions.language ?? 'en'}`);
  console.log('');

  // Check Python availability
  const available = await isWorkerAvailable();
  if (!available) {
    console.error(chalk.red('  ❌ Python worker not available. Install Python 3 and run:'));
    console.error(chalk.red('     pip install paddleocr paddlepaddle'));
    return;
  }

  try {
    const result = await ingestImage(filePath, {
      language: cmdOptions.language,
      scope: cmdOptions.scope as 'personal' | 'shared' | 'project' | undefined,
    });

    console.log(chalk.green('  ✅ Ingested!'));
    console.log(`    Title: ${result.title}`);
    console.log(`    Words: ${result.wordCount}`);
    console.log(`    Chunks: ${result.chunkCount}`);
    if (result.crossRefsCreated > 0) {
      console.log(chalk.cyan(`    Cross-refs: ${result.crossRefsCreated}`));
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
