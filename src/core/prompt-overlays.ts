import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Configuration for resolving a prompt overlay.
 */
export interface OverlayConfig {
  model: string;
  role: string;
}

/**
 * Prefix-to-family mapping for model ID resolution.
 * Order matters: first match wins, so more specific prefixes should come first.
 */
const MODEL_FAMILY_MAP: ReadonlyArray<readonly [prefix: string, family: string]> = [
  ['claude-opus', 'claude-opus'],
  ['claude-sonnet', 'claude-sonnet'],
  ['claude-haiku', 'claude-haiku'],
  ['gpt-4', 'gpt-4'],
] as const;

/**
 * Maps a model ID to its overlay family using prefix matching.
 *
 * Examples:
 *   - `'claude-opus-4-20250514'` → `'claude-opus'`
 *   - `'claude-sonnet-4-20250514'` → `'claude-sonnet'`
 *   - `'gpt-4o'` → `'gpt-4'`
 *   - `'unknown-model'` → `undefined`
 */
export function resolveOverlayFamily(model: string): string | undefined {
  for (const [prefix, family] of MODEL_FAMILY_MAP) {
    if (model.startsWith(prefix)) {
      return family;
    }
  }
  return undefined;
}

/**
 * Loads a prompt overlay file for the given model family and role.
 *
 * Resolution order:
 *   1. `<baseDir>/prompts/overlays/<family>/<role>.md`
 *   2. `<baseDir>/prompts/overlays/<family>/default.md`
 *   3. `undefined` if neither exists
 *
 * Returns the file content as a string, or undefined if no overlay is found.
 */
export async function loadOverlay(
  baseDir: string,
  config: OverlayConfig,
): Promise<string | undefined> {
  const family = resolveOverlayFamily(config.model);
  if (family === undefined) {
    return undefined;
  }

  const overlayDir = path.join(baseDir, 'prompts', 'overlays', family);

  // Try role-specific overlay first
  try {
    return await readFile(path.join(overlayDir, `${config.role}.md`), 'utf-8');
  } catch {  /* intentional: overlay file may not exist */
    // Role-specific file not found, try default
  }

  // Fall back to default overlay
  try {
    return await readFile(path.join(overlayDir, 'default.md'), 'utf-8');
  } catch {  /* intentional: overlay file may not exist */
    return undefined;
  }
}

/**
 * Merges a base prompt with an optional overlay.
 *
 * If the overlay is undefined, returns the base prompt unchanged.
 * Otherwise appends the overlay after the base prompt with a `\n\n` separator.
 */
export function mergePromptWithOverlay(
  basePrompt: string,
  overlay: string | undefined,
): string {
  if (overlay === undefined) {
    return basePrompt;
  }
  return `${basePrompt}\n\n${overlay}`;
}
