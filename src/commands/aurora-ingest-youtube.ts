import chalk from 'chalk';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { isYouTubeUrl, ingestYouTube } from '../aurora/youtube.js';
import type { YouTubeIngestOptions } from '../aurora/youtube.js';

/**
 * CLI command: aurora:ingest-youtube <url>
 * Ingest a YouTube video: extract audio, transcribe, optionally diarize.
 */
export async function auroraIngestYouTubeCommand(
  url: string,
  cmdOptions: { diarize?: boolean; scope?: string; maxChunks?: string; whisperModel?: string },
): Promise<void> {
  if (!isYouTubeUrl(url)) {
    console.error(chalk.red('\n  ❌ Not a valid YouTube URL\n'));
    return;
  }

  console.log(chalk.bold('\n🎬 Ingesting YouTube video...'));
  console.log(`  URL: ${url}\n`);

  // Check Python availability
  console.log('  Checking Python worker...');
  const available = await isWorkerAvailable();
  if (!available) {
    console.error(chalk.red('  ❌ Python worker not available.'));
    console.error(chalk.red('     Install: pip install yt-dlp faster-whisper'));
    return;
  }

  const options: YouTubeIngestOptions = {
    diarize: cmdOptions.diarize ?? false,
    scope: (cmdOptions.scope as YouTubeIngestOptions['scope']) ?? 'personal',
    maxChunks: cmdOptions.maxChunks ? parseInt(cmdOptions.maxChunks, 10) : undefined,
    whisperModel: cmdOptions.whisperModel,
  };

  try {
    console.log('  ⬇️  Extracting audio...');
    const result = await ingestYouTube(url, options);

    console.log(chalk.green(`  done`));
    console.log(`  📝 Chunks: ${result.chunksCreated}`);
    if (result.voicePrintsCreated > 0) {
      console.log(`  🗣️  Voice prints: ${result.voicePrintsCreated}`);
    }
    console.log('');
    console.log(chalk.green(`  ✅ YouTube video ingested!`));
    console.log(`    Title: "${result.title}"`);
    console.log(`    Transcript node: ${result.transcriptNodeId}`);
    console.log(`    Video ID: ${result.videoId}`);
    console.log(`    Duration: ${result.duration}s`);
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
