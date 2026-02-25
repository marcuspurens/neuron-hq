import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { searchMemoryFiles, truncateToolResult, trimMessages, MAX_TOOL_RESULT_CHARS, withRetry, isOverloadedError, isConnectionError, isRetryableError, CONNECTION_RETRY_BASE_DELAY_MS } from '../../src/core/agents/agent-utils.js';

describe('searchMemoryFiles', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-agent-utils-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('returns no-match message when memory dir is empty', async () => {
    const dir = await makeTmpDir();
    const result = await searchMemoryFiles('context', dir);
    expect(result).toContain('No matches found');
    expect(result).toContain('"context"');
  });

  it('finds a match in patterns.md', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(
      path.join(dir, 'patterns.md'),
      '# Patterns\n\n## Librarian Read-After-Write\nAlways read after write.\n\n---\n'
    );
    const result = await searchMemoryFiles('librarian', dir);
    expect(result).toContain('Librarian Read-After-Write');
    expect(result).toContain('[patterns.md]');
  });

  it('finds matches across multiple files', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(
      path.join(dir, 'patterns.md'),
      '# Patterns\n\n## Streaming Output\nStreaming works.\n\n---\n'
    );
    await fs.writeFile(
      path.join(dir, 'errors.md'),
      '# Errors\n\n## Streaming Broke Once\nIt crashed.\n\n---\n'
    );
    const result = await searchMemoryFiles('streaming', dir);
    expect(result).toContain('[patterns.md]');
    expect(result).toContain('[errors.md]');
    expect(result).toContain('Streaming Output');
    expect(result).toContain('Streaming Broke Once');
  });

  it('is case-insensitive', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(
      path.join(dir, 'techniques.md'),
      '# Techniques\n\n## MemGPT Architecture\nCore technique.\n\n---\n'
    );
    const result = await searchMemoryFiles('MEMGPT', dir);
    expect(result).toContain('MemGPT Architecture');
  });

  it('does not include non-matching sections', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(
      path.join(dir, 'patterns.md'),
      '# Patterns\n\n## Git Isolation\nWorkspace git.\n\n---\n\n## Streaming Output\nLive text.\n\n---\n'
    );
    const result = await searchMemoryFiles('streaming', dir);
    expect(result).toContain('Streaming Output');
    expect(result).not.toContain('Git Isolation');
  });

  it('skips files that do not exist gracefully', async () => {
    const dir = await makeTmpDir();
    // Only create one of the four expected files
    await fs.writeFile(
      path.join(dir, 'errors.md'),
      '# Errors\n\n## Context Overflow\nCrashed.\n\n---\n'
    );
    const result = await searchMemoryFiles('context', dir);
    expect(result).toContain('Context Overflow');
  });

  it('truncates very long results', async () => {
    const dir = await makeTmpDir();
    const longEntry = 'x'.repeat(3000);
    await fs.writeFile(
      path.join(dir, 'techniques.md'),
      `# Techniques\n\n## Long Paper\n${longEntry}\n\n---\n`
    );
    const result = await searchMemoryFiles('long', dir);
    expect(result.length).toBeLessThanOrEqual(2100); // MAX_SEARCH_RESULT_CHARS + small buffer
    expect(result).toContain('truncated');
  });
});

describe('truncateToolResult', () => {
  it('returns short string unchanged', () => {
    const input = 'hello world';
    expect(truncateToolResult(input)).toBe(input);
  });

  it('truncates string exceeding maxChars', () => {
    const input = 'a'.repeat(MAX_TOOL_RESULT_CHARS + 500);
    const result = truncateToolResult(input);
    expect(result.length).toBeLessThan(input.length);
    expect(result).toContain('[... truncated 500 chars ...]');
  });

  it('includes truncation marker with correct char count', () => {
    const input = 'b'.repeat(20_000);
    const result = truncateToolResult(input);
    const expected = 20_000 - MAX_TOOL_RESULT_CHARS;
    expect(result).toContain(`[... truncated ${expected} chars ...]`);
  });

  it('respects custom maxChars parameter', () => {
    const input = 'c'.repeat(200);
    const result = truncateToolResult(input, 100);
    expect(result).toContain('[... truncated 100 chars ...]');
    expect(result.startsWith('c'.repeat(100))).toBe(true);
  });

  it('returns string at exactly maxChars unchanged', () => {
    const input = 'd'.repeat(MAX_TOOL_RESULT_CHARS);
    expect(truncateToolResult(input)).toBe(input);
  });
});

describe('withRetry', () => {
  it('returns result immediately on success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on overloaded_error and succeeds on second attempt', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error('{"type":"error","error":{"type":"overloaded_error"}}');
        return 'success';
      },
      3,
      0
    );
    expect(result).toBe('success');
    expect(calls).toBe(2);
  });

  it('throws after maxAttempts retries on overloaded_error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('{"type":"error","error":{"type":"overloaded_error"}}');
        },
        3,
        0
      )
    ).rejects.toThrow('overloaded_error');
    expect(calls).toBe(3);
  });

  it('throws immediately on non-overloaded errors without retry', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('Some other API error');
        },
        3,
        0
      )
    ).rejects.toThrow('Some other API error');
    expect(calls).toBe(1);
  });

  it('retries on connection error (ETIMEDOUT) and succeeds on second attempt', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) {
          const err = new Error('connect ETIMEDOUT');
          (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
          throw err;
        }
        return 'recovered';
      },
      3,
      0
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  }, 15_000);

  it('throws immediately on non-retryable error without retry', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('invalid_request_error');
        },
        3,
        0
      )
    ).rejects.toThrow('invalid_request_error');
    expect(calls).toBe(1);
  });
});

describe('isOverloadedError', () => {
  it('returns true for overloaded_error message', () => {
    expect(isOverloadedError(new Error('{"type":"overloaded_error"}'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isOverloadedError(new Error('rate_limit_error'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isOverloadedError('string error')).toBe(false);
    expect(isOverloadedError(null)).toBe(false);
  });
});

describe('isConnectionError', () => {
  it('returns true for ETIMEDOUT code', () => {
    const err = new Error('connect ETIMEDOUT');
    (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
    expect(isConnectionError(err)).toBe(true);
  });

  it('returns true for ENOTFOUND code', () => {
    const err = new Error('getaddrinfo ENOTFOUND api.anthropic.com');
    (err as NodeJS.ErrnoException).code = 'ENOTFOUND';
    expect(isConnectionError(err)).toBe(true);
  });

  it('returns true for ECONNRESET code', () => {
    const err = new Error('read ECONNRESET');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    expect(isConnectionError(err)).toBe(true);
  });

  it('returns true for ECONNREFUSED code', () => {
    const err = new Error('connect ECONNREFUSED');
    (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';
    expect(isConnectionError(err)).toBe(true);
  });

  it('returns true for "Connection error" in message', () => {
    expect(isConnectionError(new Error('Connection error'))).toBe(true);
  });

  it('returns true for "read ETIMEDOUT" in message without code', () => {
    expect(isConnectionError(new Error('read ETIMEDOUT'))).toBe(true);
  });

  it('returns false for overloaded_error', () => {
    expect(isConnectionError(new Error('overloaded_error'))).toBe(false);
  });

  it('returns false for generic errors', () => {
    expect(isConnectionError(new Error('Something went wrong'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isConnectionError('ETIMEDOUT')).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('returns true for overloaded errors', () => {
    expect(isRetryableError(new Error('overloaded_error'))).toBe(true);
  });

  it('returns true for connection errors', () => {
    const err = new Error('connect ETIMEDOUT');
    (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isRetryableError(new Error('invalid_request_error'))).toBe(false);
  });
});

describe('trimMessages', () => {
  function makeMessage(role: 'user' | 'assistant', text: string): Anthropic.MessageParam {
    return { role, content: text };
  }

  it('returns short message array unchanged', () => {
    const msgs = [makeMessage('user', 'brief'), makeMessage('assistant', 'ok')];
    const result = trimMessages(msgs);
    expect(result).toEqual(msgs);
  });

  it('trims long array to under maxChars', () => {
    const msgs = [
      makeMessage('user', 'brief content'),
      ...Array.from({ length: 50 }, (_, i) => makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(1000))),
    ];
    const result = trimMessages(msgs, 5000);
    // trimMessages keeps brief + insertion note + MIN_RECENT_MESSAGES(10) at minimum
    // so result has far fewer messages than the original 51
    expect(result.length).toBeLessThan(msgs.length);
    expect(result.length).toBeLessThanOrEqual(12); // brief + note + 10 recent
  });

  it('always preserves the first message (brief)', () => {
    const brief = makeMessage('user', 'This is the brief with important context');
    const msgs = [
      brief,
      ...Array.from({ length: 30 }, (_, i) => makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'filler '.repeat(200))),
    ];
    const result = trimMessages(msgs, 3000);
    expect(result[0]).toEqual(brief);
  });

  it('keeps at least MIN_RECENT_MESSAGES recent messages', () => {
    const msgs = [
      makeMessage('user', 'brief'),
      ...Array.from({ length: 30 }, (_, i) => makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'msg-' + i + ' '.repeat(500))),
    ];
    const result = trimMessages(msgs, 2000);
    // first (brief) + insertion note + MIN_RECENT_MESSAGES(10) = at least 12
    expect(result.length).toBeGreaterThanOrEqual(12);
  });

  it('inserts trimming note when messages are removed', () => {
    const msgs = [
      makeMessage('user', 'brief'),
      ...Array.from({ length: 30 }, (_, i) => makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'content '.repeat(200))),
    ];
    const result = trimMessages(msgs, 3000);
    const hasNote = result.some(
      (m) => typeof m.content === 'string' && m.content.includes('trimmed')
    );
    expect(hasNote).toBe(true);
  });

  it('does not trim when already under limit', () => {
    const msgs = [makeMessage('user', 'a'), makeMessage('assistant', 'b')];
    const result = trimMessages(msgs, 100_000);
    expect(result).toEqual(msgs);
    expect(result.length).toBe(2);
  });
});
