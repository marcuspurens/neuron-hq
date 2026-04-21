/**
 * MCP client for the Aurora Media Python server.
 *
 * Replaces worker-bridge.ts subprocess spawning for media-related actions
 * (transcribe_audio, diarize_audio, denoise_audio, extract_video, etc.)
 * with a persistent MCP connection to a long-running Python MCP server.
 *
 * Benefits:
 *   - Models loaded once at server startup, not per-call
 *   - WhisperX with word alignment replaces faster-whisper
 *   - Pyannote diarization model stays warm between calls
 *   - Same WorkerResponse shape — drop-in replacement for runWorker()
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { WorkerResponse } from './worker-bridge.js';

const logger = createLogger('aurora:media-client');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Actions supported by the media MCP server. */
export type MediaAction =
  | 'transcribe_audio'
  | 'diarize_audio'
  | 'denoise_audio'
  | 'extract_video'
  | 'extract_video_metadata'
  | 'check_deps';

interface MediaToolCallOptions {
  /** Timeout in milliseconds (default 60_000). */
  timeout?: number;
}

/* ------------------------------------------------------------------ */
/*  Singleton MCP client                                               */
/* ------------------------------------------------------------------ */

let _client: Client | null = null;
let _transport: StdioClientTransport | null = null;
let _connecting: Promise<Client> | null = null;

/**
 * Get or create a persistent MCP client connection to the Python media server.
 * The server process is spawned once and reused for all subsequent calls.
 */
async function getMediaClient(): Promise<Client> {
  if (_client) return _client;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const pythonPath = getConfig().AURORA_PYTHON_PATH;
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const serverScript = resolve(currentDir, '../../aurora-workers/mcp_server.py');

    logger.info('Starting Aurora Media MCP server ...', { pythonPath, serverScript });

    const transport = new StdioClientTransport({
      command: pythonPath,
      args: [serverScript],
      env: {
        ...process.env as Record<string, string>,
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stderr: 'pipe',
      cwd: resolve(currentDir, '../../aurora-workers'),
    });

    const stderr = transport.stderr;
    if (stderr && 'on' in stderr) {
      (stderr as unknown as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          for (const line of text.split('\n')) {
            logger.info(`[media-server] ${line}`);
          }
        }
      });
    }

    const client = new Client(
      { name: 'aurora-media-client', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);
    logger.info('Aurora Media MCP server connected');

    _client = client;
    _transport = transport;
    _connecting = null;

    return client;
  })();

  return _connecting;
}

/* ------------------------------------------------------------------ */
/*  callMediaTool — drop-in replacement for runWorker()                */
/* ------------------------------------------------------------------ */

/**
 * Call a tool on the Aurora Media MCP server.
 *
 * Returns the same WorkerResponse shape as runWorker() for backward compat.
 * The MCP server returns `{ ok: true, title, text, metadata }` or throws.
 */
export async function callMediaTool(
  action: MediaAction,
  args: Record<string, unknown>,
  options?: MediaToolCallOptions,
): Promise<WorkerResponse> {
  const timeout = options?.timeout ?? 60_000;

  try {
    const client = await getMediaClient();

    const result = await client.callTool(
      { name: action, arguments: args },
      undefined,
      { timeout },
    );

    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content?.find((c) => c.type === 'text');
    if (!textContent?.text) {
      return { ok: false, error: 'Media server returned no text content' };
    }

    const parsed = JSON.parse(textContent.text) as WorkerResponse;
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Media tool call failed', { action, error: message });
    return { ok: false, error: `Media MCP error: ${message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Convenience wrappers matching runWorker() call patterns            */
/* ------------------------------------------------------------------ */

/**
 * Transcribe audio using WhisperX via the media MCP server.
 * Drop-in replacement for: runWorker({ action: 'transcribe_audio', ... })
 */
export function transcribeAudio(
  audioPath: string,
  options?: { whisperModel?: string; language?: string },
  callOptions?: MediaToolCallOptions,
): Promise<WorkerResponse> {
  return callMediaTool(
    'transcribe_audio',
    {
      audio_path: audioPath,
      whisper_model: options?.whisperModel ?? null,
      language: options?.language ?? null,
    },
    callOptions,
  );
}

/**
 * Diarize audio (speaker identification) via the media MCP server.
 * Drop-in replacement for: runWorker({ action: 'diarize_audio', ... })
 */
export function diarizeAudio(
  audioPath: string,
  callOptions?: MediaToolCallOptions,
): Promise<WorkerResponse> {
  return callMediaTool(
    'diarize_audio',
    { audio_path: audioPath },
    callOptions,
  );
}

/**
 * Denoise audio via DeepFilterNet through the media MCP server.
 * Drop-in replacement for: runWorker({ action: 'denoise_audio', ... })
 */
export function denoiseAudio(
  audioPath: string,
  callOptions?: MediaToolCallOptions,
): Promise<WorkerResponse> {
  return callMediaTool(
    'denoise_audio',
    { audio_path: audioPath },
    callOptions,
  );
}

/**
 * Extract video (download audio + subtitles + metadata) via yt-dlp.
 * Drop-in replacement for: runWorker({ action: 'extract_video', ... })
 */
export function extractVideo(
  url: string,
  callOptions?: MediaToolCallOptions,
): Promise<WorkerResponse> {
  return callMediaTool(
    'extract_video',
    { url },
    callOptions,
  );
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

/**
 * Check if the media MCP server is available.
 * Attempts to connect and ping the server.
 */
export async function isMediaServerAvailable(): Promise<boolean> {
  try {
    const client = await getMediaClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Shut down the media MCP server connection.
 * Call this during application shutdown.
 */
export async function closeMediaClient(): Promise<void> {
  if (_client) {
    try {
      await _client.close();
    } catch {
      /* intentional: best-effort cleanup */
    }
    _client = null;
  }
  if (_transport) {
    try {
      await _transport.close();
    } catch {
      /* intentional: best-effort cleanup */
    }
    _transport = null;
  }
  _connecting = null;
}
