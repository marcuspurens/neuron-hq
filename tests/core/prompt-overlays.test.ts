import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveOverlayFamily, loadOverlay, mergePromptWithOverlay } from '../../src/core/prompt-overlays.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('resolveOverlayFamily', () => {
  it('maps claude-opus-4-6 to claude-opus', () => {
    expect(resolveOverlayFamily('claude-opus-4-6')).toBe('claude-opus');
  });

  it('maps claude-opus-4-20250514 to claude-opus', () => {
    expect(resolveOverlayFamily('claude-opus-4-20250514')).toBe('claude-opus');
  });

  it('maps claude-haiku-4-5-20251001 to claude-haiku', () => {
    expect(resolveOverlayFamily('claude-haiku-4-5-20251001')).toBe('claude-haiku');
  });

  it('maps claude-sonnet-4-20250514 to claude-sonnet', () => {
    expect(resolveOverlayFamily('claude-sonnet-4-20250514')).toBe('claude-sonnet');
  });

  it('maps gpt-4o to gpt-4', () => {
    expect(resolveOverlayFamily('gpt-4o')).toBe('gpt-4');
  });

  it('maps gpt-4-turbo to gpt-4', () => {
    expect(resolveOverlayFamily('gpt-4-turbo')).toBe('gpt-4');
  });

  it('returns undefined for unknown model', () => {
    expect(resolveOverlayFamily('llama-3-70b')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(resolveOverlayFamily('')).toBeUndefined();
  });
});

describe('loadOverlay', () => {
  // Create a temp directory with overlay files for testing
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `overlay-test-${Date.now()}`);
    const overlayDir = path.join(tmpDir, 'prompts', 'overlays');

    // Create claude-haiku with role-specific + default
    await mkdir(path.join(overlayDir, 'claude-haiku'), { recursive: true });
    await writeFile(path.join(overlayDir, 'claude-haiku', 'default.md'), 'Haiku default overlay');
    await writeFile(path.join(overlayDir, 'claude-haiku', 'manager.md'), 'Haiku manager overlay');

    // Create claude-opus with only default
    await mkdir(path.join(overlayDir, 'claude-opus'), { recursive: true });
    await writeFile(path.join(overlayDir, 'claude-opus', 'default.md'), 'Opus default overlay');
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads role-specific overlay when it exists', async () => {
    const result = await loadOverlay(tmpDir, { model: 'claude-haiku-4-5-20251001', role: 'manager' });
    expect(result).toBe('Haiku manager overlay');
  });

  it('falls back to default.md when role-specific file does not exist', async () => {
    const result = await loadOverlay(tmpDir, { model: 'claude-haiku-4-5-20251001', role: 'implementer' });
    expect(result).toBe('Haiku default overlay');
  });

  it('loads default.md for family with no role-specific files', async () => {
    const result = await loadOverlay(tmpDir, { model: 'claude-opus-4-6', role: 'reviewer' });
    expect(result).toBe('Opus default overlay');
  });

  it('returns undefined for unknown model family', async () => {
    const result = await loadOverlay(tmpDir, { model: 'llama-3-70b', role: 'manager' });
    expect(result).toBeUndefined();
  });

  it('returns undefined when family directory does not exist', async () => {
    const result = await loadOverlay(tmpDir, { model: 'claude-sonnet-4-20250514', role: 'manager' });
    expect(result).toBeUndefined();
  });
});

describe('mergePromptWithOverlay', () => {
  it('appends overlay after base prompt', () => {
    const result = mergePromptWithOverlay('Base prompt text.', 'Overlay text.');
    expect(result).toBe('Base prompt text.\n\nOverlay text.');
  });

  it('returns base prompt unchanged when overlay is undefined', () => {
    const result = mergePromptWithOverlay('Base prompt text.', undefined);
    expect(result).toBe('Base prompt text.');
  });

  it('handles empty base prompt with overlay', () => {
    const result = mergePromptWithOverlay('', 'Overlay text.');
    expect(result).toBe('\n\nOverlay text.');
  });

  it('handles multiline overlay', () => {
    const overlay = '## Instructions\n\n- Step 1\n- Step 2';
    const result = mergePromptWithOverlay('Base.', overlay);
    expect(result).toBe('Base.\n\n## Instructions\n\n- Step 1\n- Step 2');
  });
});
