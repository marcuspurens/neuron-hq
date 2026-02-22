import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { searchMemoryFiles } from '../../src/core/agents/agent-utils.js';

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
