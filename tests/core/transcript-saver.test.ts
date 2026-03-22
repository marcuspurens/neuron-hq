import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveTranscript } from '../../src/core/transcript-saver.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('saveTranscript', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcript-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves JSONL with correct structure', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hello agent' },
      { role: 'assistant' as const, content: 'Hello user' },
    ];

    await saveTranscript(tmpDir, 'manager', messages);

    const filePath = path.join(tmpDir, 'transcripts', 'manager.jsonl');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.turn).toBe(0);
    expect(first.role).toBe('user');
    expect(first.content).toBe('Hello agent');
    expect(first.ts).toBeDefined();

    const second = JSON.parse(lines[1]);
    expect(second.turn).toBe(1);
    expect(second.role).toBe('assistant');
    expect(second.content).toBe('Hello user');
  });

  it('creates transcripts directory if it does not exist', async () => {
    const messages = [{ role: 'user' as const, content: 'test' }];
    await saveTranscript(tmpDir, 'tester', messages);

    const dirExists = await fs.stat(path.join(tmpDir, 'transcripts')).then(() => true).catch(() => false);
    expect(dirExists).toBe(true);
  });

  it('handles array content (tool_use / tool_result blocks)', async () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: [
          { type: 'text', text: 'Let me check' },
          { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'foo.ts' } },
        ],
      },
      {
        role: 'user' as const,
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: 'file contents here' },
        ],
      },
    ];

    await saveTranscript(tmpDir, 'implementer', messages as any);

    const filePath = path.join(tmpDir, 'transcripts', 'implementer.jsonl');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.content).toHaveLength(2);
    expect(first.content[0].type).toBe('text');
    expect(first.content[1].type).toBe('tool_use');
  });

  it('does not throw on empty messages', async () => {
    await expect(saveTranscript(tmpDir, 'reviewer', [])).resolves.toBeUndefined();

    // No file should be created
    const exists = await fs.stat(path.join(tmpDir, 'transcripts', 'reviewer.jsonl')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('does not throw on write error', async () => {
    // Pass an invalid path that will fail
    await expect(
      saveTranscript('/nonexistent/path/that/fails', 'agent', [
        { role: 'user' as const, content: 'test' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('uses task-specific filename for parallel implementers', async () => {
    const messages = [{ role: 'user' as const, content: 'task T1' }];
    await saveTranscript(tmpDir, 'implementer-T1', messages);

    const filePath = path.join(tmpDir, 'transcripts', 'implementer-T1.jsonl');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('task T1');
  });
});
