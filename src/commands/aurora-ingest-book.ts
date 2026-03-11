import chalk from 'chalk';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { ingestImageBatch } from '../aurora/ocr.js';

/**
 * CLI command: aurora:ingest-book
 *
 * Batch-OCR a folder of scanned images into a single document.
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:ingest-book ./scans/bok-kapitel1/
 *   npx tsx src/cli.ts aurora:ingest-book ./scans/ --language sv --title "Min bok"
 *   npx tsx src/cli.ts aurora:ingest-book ./scans/ --output ./output/min-bok.md
 */
export async function auroraIngestBookCommand(
  folderPath: string,
  cmdOptions: { language?: string; title?: string; output?: string; scope?: string },
): Promise<void> {
  console.log(chalk.bold('\n📚 Batch OCR — scanning folder...'));
  console.log(`  Folder: ${folderPath}`);
  console.log(`  Language: ${cmdOptions.language ?? 'en'}`);
  if (cmdOptions.title) {
    console.log(`  Title: ${cmdOptions.title}`);
  }
  console.log('');

  const available = await isWorkerAvailable();
  if (!available) {
    console.error(chalk.red('  ❌ Python worker not available. Install Python 3 and run:'));
    console.error(chalk.red('     pip install paddleocr paddlepaddle'));
    return;
  }

  try {
    console.log('  Processing... (this may take a while for large books)');
    console.log('');

    const result = await ingestImageBatch(folderPath, {
      language: cmdOptions.language,
      title: cmdOptions.title,
      outputPath: cmdOptions.output,
      scope: cmdOptions.scope as 'personal' | 'shared' | 'project' | undefined,
    });

    console.log(chalk.green('  ✅ Done!'));
    console.log(`    Pages: ${result.pageCount}`);
    console.log(`    Words: ${result.wordCount.toLocaleString()}`);
    console.log(`    Confidence: ${result.avgConfidence}`);
    console.log(`    Chunks: ${result.chunkCount}`);
    if (result.crossRefsCreated > 0) {
      console.log(chalk.cyan(`    Cross-refs: ${result.crossRefsCreated}`));
    }
    if (result.savedTo) {
      console.log(`    Saved to: ${result.savedTo}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
