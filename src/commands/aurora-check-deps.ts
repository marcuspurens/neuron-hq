/**
 * CLI command: aurora:check-deps
 * Check which Python dependencies are available for Aurora workers.
 */
import chalk from 'chalk';
import { runWorker, isWorkerAvailable } from '../aurora/worker-bridge.js';

interface DepInfo {
  available: boolean;
  version: string | null;
  error: string | null;
}

interface ModelInfo {
  available: boolean;
  error: string | null;
}

interface CheckDepsMetadata {
  python_version: string;
  python_path: string;
  dependencies: Record<string, DepInfo>;
  models: Record<string, ModelInfo>;
  source_type: string;
}

// Map from Python module key to display name
const DEP_DISPLAY_NAMES: Record<string, string> = {
  faster_whisper: 'faster-whisper',
  pyannote_audio: 'pyannote.audio',
  yt_dlp: 'yt-dlp',
  pypdfium2: 'pypdfium2',
  trafilatura: 'trafilatura',
};

// Install commands for missing deps
const INSTALL_HINTS: Record<string, string> = {
  faster_whisper: 'pip install faster-whisper',
  pyannote_audio: 'pip install pyannote.audio',
  yt_dlp: 'pip install yt-dlp',
  pypdfium2: 'pip install pypdfium2',
  trafilatura: 'pip install trafilatura',
};

export async function auroraCheckDepsCommand(options: {
  preloadModels?: boolean;
}): Promise<void> {
  // Check if Python worker is even available
  const available = await isWorkerAvailable();
  if (!available) {
    console.log(chalk.red('Python worker not available. Check AURORA_PYTHON_PATH or install python3.'));
    return;
  }

  const response = await runWorker({
    action: 'check_deps',
    source: '',
    options: { preload_models: options.preloadModels ?? false },
  });

  if (!response.ok) {
    console.log(chalk.red(`Error: ${response.error}`));
    return;
  }

  const meta = response.metadata as unknown as CheckDepsMetadata;

  console.log(chalk.bold('\nAurora Dependency Check'));
  console.log('\u2550'.repeat(23));

  console.log(`\nPython: ${meta.python_version} (${meta.python_path})`);

  console.log('\nDependencies:');
  for (const [key, dep] of Object.entries(meta.dependencies)) {
    const displayName = DEP_DISPLAY_NAMES[key] ?? key;
    if (dep.available) {
      console.log(`  \u2705 ${displayName.padEnd(16)} ${dep.version}`);
    } else {
      console.log(`  \u26A0\uFE0F  ${displayName.padEnd(16)} not installed`);
      const hint = INSTALL_HINTS[key];
      if (hint) {
        console.log(`     Install: ${hint}`);
      }
    }
  }

  if (Object.keys(meta.models).length > 0) {
    console.log('\nModels (--preload-models):');
    for (const [name, model] of Object.entries(meta.models)) {
      if (model.available) {
        console.log(`  \u2705 ${name.padEnd(20)} loaded`);
      } else {
        console.log(`  \u274C ${name.padEnd(20)} ${model.error ?? 'failed'}`);
      }
    }
  } else if (options.preloadModels) {
    console.log('\nModels: skipped (faster-whisper not available)');
  }

  console.log('');
}
