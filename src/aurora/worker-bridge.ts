/**
 * TypeScript bridge that runs Python aurora-workers via child_process.spawn.
 * Workers communicate via stdin (JSON request) / stdout (JSON response).
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { resolve as resolvePath } from 'path';

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WorkerRequest {
  action: 'extract_url' | 'extract_pdf' | 'extract_text' | 'extract_video' | 'extract_youtube' | 'transcribe_audio' | 'diarize_audio' | 'check_deps' | 'extract_ocr' | 'ocr_pdf' | 'batch_ocr' | 'extract_video_metadata';
  source: string;
  /** Optional key-value options forwarded to the Python handler. */
  options?: Record<string, unknown>;
}

export interface WorkerResult {
  ok: true;
  title: string;
  text: string;
  metadata: {
    source_type: 'url' | 'pdf' | 'text';
    word_count: number;
    language?: string;
    page_count?: number;
  };
}

export interface WorkerError {
  ok: false;
  error: string;
}

export type WorkerResponse = WorkerResult | WorkerError;

export interface WorkerOptions {
  /** Timeout in milliseconds (default 60 000). */
  timeout?: number;
  /** Path to the Python interpreter (default process.env.AURORA_PYTHON_PATH ?? 'python3'). */
  pythonPath?: string;
}

/* ------------------------------------------------------------------ */
/*  runWorker                                                          */
/* ------------------------------------------------------------------ */

/**
 * Spawn a Python aurora-worker process, send it a JSON request on stdin,
 * and return the parsed JSON response from stdout.
 */
export function runWorker(
  request: WorkerRequest,
  options?: WorkerOptions,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const timeout = options?.timeout ?? 60_000;
    const pythonPath =
      options?.pythonPath ?? process.env.AURORA_PYTHON_PATH ?? 'python3';
    const workersDir = resolvePath(
      import.meta.dirname ?? '.',
      '../../aurora-workers',
    );
    const mainScript = resolvePath(workersDir, '__main__.py');

    const proc = spawn(pythonPath, [mainScript], {
      cwd: workersDir,
      timeout,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Worker failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim()) as WorkerResponse;
        resolve(result);
      } catch {
        reject(new Error(`Worker returned invalid JSON: ${stdout}`));
      }
    });

    proc.on('error', (err) => reject(err));

    proc.stdin.write(JSON.stringify(request));
    proc.stdin.end();
  });
}

/* ------------------------------------------------------------------ */
/*  isWorkerAvailable                                                  */
/* ------------------------------------------------------------------ */

/**
 * Quick check: can we reach the configured Python interpreter?
 * Returns true if `python3 -c 'print("ok")'` succeeds within 5 s.
 */
export async function isWorkerAvailable(
  pythonPath?: string,
): Promise<boolean> {
  const python =
    pythonPath ?? process.env.AURORA_PYTHON_PATH ?? 'python3';
  try {
    const { stdout } = await execFileAsync(
      python,
      ['-c', 'print("ok")'],
      { timeout: 5000 },
    );
    return stdout.trim() === 'ok';
  } catch {
    return false;
  }
}
