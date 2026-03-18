import chalk from 'chalk';
import { copyFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { isWorkerAvailable } from '../aurora/worker-bridge.js';
import { ingestVideo } from '../aurora/video.js';
import type { VideoIngestOptions, ProgressUpdate } from '../aurora/video.js';

const AUDIO_DIR = '/Users/mpmac/Documents/Neuron Lab/audio';

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
    keepAudio?: boolean;
    polish?: boolean;
    identifySpeakers?: boolean;
    polishModel?: string;
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

  const stepEmojis: Record<string, string> = {
    downloading: '⬇️ ',
    transcribing: '🎤',
    diarizing: '🗣️ ',
    chunking: '✂️ ',
    embedding: '🧠',
    polishing: '✨',
    identifying: '🗣️',
  };

  const options: VideoIngestOptions = {
    diarize: cmdOptions.diarize ?? true,
    scope: (cmdOptions.scope as VideoIngestOptions['scope']) ?? 'personal',
    maxChunks: cmdOptions.maxChunks ? parseInt(cmdOptions.maxChunks, 10) : undefined,
    whisperModel: cmdOptions.whisperModel,
    language: cmdOptions.language,
    polish: cmdOptions.polish,
    identifySpeakers: cmdOptions.identifySpeakers,
    polishModel: cmdOptions.polishModel as VideoIngestOptions['polishModel'],
    onProgress: (update: ProgressUpdate) => {
      const emoji = stepEmojis[update.step] ?? '▶️';
      if (update.progress === 0) {
        console.log(`  ${emoji} ${update.step}...`);
      } else if (update.progress >= 1.0) {
        console.log(`  ${emoji} ${update.step} done (${(update.stepElapsedMs / 1000).toFixed(1)}s)`);
      }
    },
  };

  try {
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
    // Save audio file (default: on, use --no-keep-audio to skip)
    if ((cmdOptions.keepAudio ?? true) && result.audioPath) {
      await mkdir(AUDIO_DIR, { recursive: true });
      const dest = join(AUDIO_DIR, `${result.transcriptNodeId}${basename(result.audioPath).replace(/^[^.]*/, '')}`);
      await copyFile(result.audioPath, dest);
      console.log(`    🔊 Audio saved: ${dest}`);
    }
    if (result.crossRefsCreated > 0) {
      console.log(chalk.cyan(`  🔗 ${result.crossRefsCreated} cross-reference${result.crossRefsCreated > 1 ? 's' : ''} created:`));
      for (const match of result.crossRefMatches) {
        console.log(`     → [${match.similarity.toFixed(2)}] ${match.relationship} "${match.neuronTitle}"`);
      }
    }
    if (result.polished) {
      console.log(chalk.cyan('  ✨ Transcript polished via LLM'));
    }
    if (result.speakerGuesses && result.speakerGuesses.length > 0) {
      console.log(chalk.cyan('  🗣️  Speaker guesses:'));
      for (const g of result.speakerGuesses) {
        const name = g.name || '(unknown)';
        console.log(`     ${g.speakerLabel}: ${name} (${g.confidence}%) — ${g.role}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
