import { describe, it, expect } from 'vitest';
import * as readline from 'node:readline/promises';
import { Readable, Writable } from 'node:stream';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSlug, BriefAgent } from '../../src/core/agents/brief-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('generateSlug', () => {
  it('converts Swedish characters correctly (ä→a, ö→o, å→a)', () => {
    expect(generateSlug('Lägg till OAuth i aurora')).toBe('lagg-till-oauth-i-aurora');
    expect(generateSlug('Ändra öppna åtgärder')).toBe('andra-oppna-atgarder');
  });

  it('handles spaces and special characters', () => {
    expect(generateSlug('Add new feature!')).toBe('add-new-feature');
    expect(generateSlug('fix: broken test (urgent)')).toBe('fix-broken-test-urgent');
    expect(generateSlug('hello world test')).toBe('hello-world-test');
  });

  it('handles edge cases', () => {
    expect(generateSlug('')).toBe('');
    expect(generateSlug('   multiple   spaces   ')).toBe('multiple-spaces');
    expect(generateSlug('a--b---c')).toBe('a-b-c');
    expect(generateSlug('   ')).toBe('');
  });

  it('handles all-uppercase text', () => {
    expect(generateSlug('FIX ALL THE THINGS')).toBe('fix-all-the-things');
  });

  it('handles numbers and mixed content', () => {
    expect(generateSlug('version 20 release')).toBe('version-20-release');
    expect(generateSlug('step1 step2 step3')).toBe('step1-step2-step3');
  });
});

describe('BriefAgent', () => {
  it('can be constructed without errors', () => {
    const agent = new BriefAgent('test-target', BASE_DIR);
    expect(agent).toBeInstanceOf(BriefAgent);
  });

  it('accepts an injected readline interface', () => {
    const input = new Readable({ read() {} });
    const output = new Writable({ write(_c, _e, cb) { cb(); } });
    const rl = readline.createInterface({ input, output });

    const agent = new BriefAgent('test-target', BASE_DIR, rl);
    expect(agent).toBeInstanceOf(BriefAgent);

    rl.close();
  });

  it('brief file path follows correct naming convention', () => {
    const today = new Date().toISOString().slice(0, 10);
    const slug = generateSlug('Add OAuth support');
    const expectedFilename = `${today}-${slug}.md`;

    expect(expectedFilename).toMatch(/^\d{4}-\d{2}-\d{2}-add-oauth-support\.md$/);
  });
});
