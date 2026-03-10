import chalk from 'chalk';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { ingestVideo } from '../aurora/video.js';
import type { VideoIngestOptions } from '../aurora/video.js';

/**
 * CLI command: aurora:ingest-video <url>
 * Ingest a video from any yt-dlp supported site: extract audio, transcribe, optionally diarize.
 */
export async function auroraIngestVideoCommand(
  url: string,
  cmdOptions: {
    diarize?: boolean;
    scope?: string;
    maxChunks?: string;
    whisperModel?: string;
    language?: string;
  },
): Promise<void> {
  console.log(chalk.bold('\n🎬 Ingesting video...'));
  console.log(`  URL: ${url}\n`);

  // Check Python availability
  console.log('  Checking Python worker...');
  const available = await isWorkerAvailable();
  if (!available) {
    console.error(chalk.red('  ❌ Python worker not available.'));
    console.error(chalk.red('     Install: pip install yt-dlp faster-whisper'));
    return;
  }

  const options: VideoIngestOptions = {
    diarize: cmdOptions.diarize ?? false,
    scope: (cmdOptions.scope as VideoIngestOptions['scope']) ?? 'personal',
    maxChunks: cmdOptions.maxChunks ? parseInt(cmdOptions.maxChunks, 10) : undefined,
    whisperModel: cmdOptions.whisperModel,
    language: cmdOptions.language,
  };

  try {
    console.log('  ⬇️  Extracting audio...');
    const result = await ingestVideo(url, options);

    console.log(chalk.green(`  done`));
    console.log(`  📝 Chunks: ${result.chunksCreated}`);
    if (result.voicePrintsCreated > 0) {
      console.log(`  🗣️  Voice prints: ${result.voicePrintsCreated}`);
    }
    console.log('');
    console.log(chalk.green(`  ✅ Video ingested!`));
    console.log(`    Title: "${result.title}"`);
    console.log(`    Transcript node: ${result.transcriptNodeId}`);
    console.log(`    Platform: ${result.platform}`);
    if (result.videoId) {
      console.log(`    Video ID: ${result.videoId}`);
    }
    console.log(`    Duration: ${result.duration}s`);
    if (result.modelUsed) {
      console.log(`    Model used: ${result.modelUsed}`);
    }
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
