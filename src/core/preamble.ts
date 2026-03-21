import { readFile } from 'node:fs/promises';
import path from 'node:path';

let cachedPreamble: string | undefined;

/**
 * Loads the shared LLM Operating Awareness preamble from prompts/preamble.md.
 * Result is cached after the first load.
 */
export async function loadPreamble(baseDir: string): Promise<string> {
  if (cachedPreamble !== undefined) {
    return cachedPreamble;
  }
  const preamblePath = path.join(baseDir, 'prompts', 'preamble.md');
  cachedPreamble = await readFile(preamblePath, 'utf-8');
  return cachedPreamble;
}

/**
 * Prepends the LLM Operating Awareness preamble to a system prompt.
 */
export async function prependPreamble(
  baseDir: string,
  systemPrompt: string,
): Promise<string> {
  const preamble = await loadPreamble(baseDir);
  return `${preamble}\n\n---\n\n${systemPrompt}`;
}

/**
 * Clears the cached preamble (for testing).
 */
export function clearPreambleCache(): void {
  cachedPreamble = undefined;
}
