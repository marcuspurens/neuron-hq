import chalk from 'chalk';
import { statSync } from 'fs';
import { analyzeImage, ingestImage, isVisionAvailable } from '../aurora/vision.js';

/**
 * CLI command: aurora:describe-image
 *
 * Analyze an image using local Ollama vision model and index in Aurora.
 */
export async function auroraDescribeImageCommand(
  filePath: string,
  cmdOptions: { title?: string; prompt?: string; model?: string; describeOnly?: boolean; scope?: string },
): Promise<void> {
  const model = cmdOptions.model ?? process.env.OLLAMA_MODEL_VISION ?? 'qwen3-vl:8b';
  console.log(chalk.bold(`\n🔍 Analyzing image with ${model}...`));

  // Show file info
  try {
    const stats = statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`   Image: ${filePath} (${sizeMB} MB)`);
  } catch {
    console.log(`   Image: ${filePath}`);
  }
  console.log('');

  // Check vision availability
  const available = await isVisionAvailable(cmdOptions.model);
  if (!available) {
    console.error(chalk.red('  ❌ Ollama vision model not available (auto-start and pull failed).'));
    return;
  }

  try {
    if (cmdOptions.describeOnly) {
      const { description, modelUsed } = await analyzeImage(filePath, {
        prompt: cmdOptions.prompt,
        model: cmdOptions.model,
      });
      console.log(chalk.cyan('   📝 Description:'));
      console.log(`   ${description}\n`);
      console.log(chalk.dim(`   Model: ${modelUsed}`));
    } else {
      const result = await ingestImage(filePath, {
        title: cmdOptions.title,
        prompt: cmdOptions.prompt,
        model: cmdOptions.model,
        scope: cmdOptions.scope as 'personal' | 'shared' | 'project' | undefined,
      });

      console.log(chalk.cyan('   📝 Description:'));
      console.log(`   ${result.description}\n`);
      console.log(chalk.green('   ✅ Indexed in Aurora'));
      console.log(`     Node: ${result.documentNodeId}`);
      console.log(`     Words: ${result.wordCount}`);
      console.log(`     Chunks: ${result.chunkCount}`);
      if (result.crossRefsCreated > 0) {
        console.log(chalk.cyan(`     Cross-refs: ${result.crossRefsCreated}`));
      }
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
