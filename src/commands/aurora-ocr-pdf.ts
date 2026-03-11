import chalk from 'chalk';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { ocrPdf } from '../aurora/ocr.js';

/**
 * CLI command: aurora:ocr-pdf
 *
 * Force OCR extraction of a PDF (for broken font encoding).
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:ocr-pdf <path>
 *   npx tsx src/cli.ts aurora:ocr-pdf <path> --language sv --dpi 300
 */
export async function auroraOcrPdfCommand(
  filePath: string,
  cmdOptions: { language?: string; dpi?: string; scope?: string },
): Promise<void> {
  console.log(chalk.bold('\n📄 Extracting text from PDF via OCR...'));
  console.log(`  File: ${filePath}`);
  console.log(`  Language: ${cmdOptions.language ?? 'en'}`);
  console.log(`  DPI: ${cmdOptions.dpi ?? '200'}`);
  console.log('');

  // Check Python availability
  const available = await isWorkerAvailable();
  if (!available) {
    console.error(chalk.red('  ❌ Python worker not available. Install Python 3 and run:'));
    console.error(chalk.red('     pip install paddleocr paddlepaddle pypdfium2'));
    return;
  }

  try {
    const result = await ocrPdf(filePath, {
      language: cmdOptions.language,
      dpi: cmdOptions.dpi ? parseInt(cmdOptions.dpi, 10) : undefined,
      scope: cmdOptions.scope as 'personal' | 'shared' | 'project' | undefined,
    });

    console.log(chalk.green('  ✅ Extracted!'));
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
