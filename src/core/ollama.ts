/**
 * Centralized Ollama management — auto-start, model availability, and pull.
 * All Ollama interactions in the codebase should go through this module.
 */
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Default Ollama base URL. */
export function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || 'http://localhost:11434';
}

/** Promise-gate: deduplicates concurrent ensureOllama calls. */
let ollamaReady: Promise<boolean> | null = null;

/**
 * Ensure Ollama is running and a specific model is available.
 * Starts Ollama if needed and pulls the model if missing.
 * Uses a Promise-gate so concurrent calls share the same startup check.
 */
export async function ensureOllama(model?: string): Promise<boolean> {
  if (!ollamaReady) {
    ollamaReady = doEnsureOllama(model);
  }
  return ollamaReady;
}

/**
 * Internal implementation: check/start Ollama and pull model if needed.
 */
async function doEnsureOllama(model?: string): Promise<boolean> {
  const baseUrl = getOllamaUrl();

  // 1. Check if Ollama is reachable
  let running = false;
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    running = resp.ok;
  } catch {
    running = false;
  }

  // 2. Start Ollama if not running
  if (!running) {
    console.error('[ollama] Not running — starting...');
    const proc = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    // Wait up to 15s for it to become reachable
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const resp = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        });
        if (resp.ok) {
          running = true;
          break;
        }
      } catch {
        /* keep waiting */
      }
    }
    if (!running) {
      console.error('[ollama] Could not start — skipping');
      return false;
    }
    console.error('[ollama] Started');
  }

  // If no specific model requested, we're done
  if (!model) return true;

  // 3. Check if model is available
  if (await isModelAvailable(model)) return true;

  // 4. Pull the model
  console.error(`[ollama] Model "${model}" not found — pulling...`);
  try {
    await execFileAsync('ollama', ['pull', model], { timeout: 300_000 });
    console.error(`[ollama] Model "${model}" ready`);
    return true;
  } catch (err) {
    console.error(`[ollama] Failed to pull model: ${err}`);
    return false;
  }
}

/**
 * Check if a specific model is available in Ollama.
 */
export async function isModelAvailable(model: string): Promise<boolean> {
  const baseUrl = getOllamaUrl();
  try {
    const resp = await fetch(`${baseUrl}/api/tags`);
    const data = (await resp.json()) as {
      models: Array<{ name: string }>;
    };
    const names = data.models.map((m) => m.name.replace(/:latest$/, ''));
    return names.includes(model);
  } catch {
    return false;
  }
}

/** Reset promise-gate state (for testing). */
export function resetOllamaState(): void {
  ollamaReady = null;
}
