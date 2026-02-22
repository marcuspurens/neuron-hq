import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { LibrarianAgent } from '../../src/core/agents/librarian.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

function createMockContext(
  policy: Awaited<ReturnType<typeof createPolicyEnforcer>>,
  runDir: string,
  workspaceDir: string
) {
  return {
    runid: '20260222-1200-test' as any,
    target: { name: 'test-target', path: '/tmp/test-target', default_branch: 'main' },
    hours: 1,
    workspaceDir,
    runDir,
    policy,
    audit: { log: async () => {} },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: { readBrief: async () => '# Brief\n\nTest brief.' },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

describe('LibrarianAgent', () => {
  let agent: LibrarianAgent;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;
  let memoryDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'librarian-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    memoryDir = path.join(tmpDir, 'memory');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    agent = new LibrarianAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    // Override memoryDir to use temp location
    (agent as any).memoryDir = memoryDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('can be instantiated', () => {
    expect(agent).toBeInstanceOf(LibrarianAgent);
  });

  it('loads the librarian prompt', async () => {
    const prompt = await agent.loadPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Librarian');
  });

  it('defines the correct tools', () => {
    const tools: Array<{ name: string }> = (agent as any).defineTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('fetch_url');
    expect(names).toContain('read_memory_file');
    expect(names).toContain('write_to_techniques');
  });

  describe('write_to_techniques', () => {
    it('creates techniques.md with header if it does not exist', async () => {
      await agent.executeWriteToTechniques({
        entry: '## Test Paper (2026)\n**Källa:** arxiv:1234\n**Kärna:** Test.\n\n---',
      });

      const content = await fs.readFile(path.join(memoryDir, 'techniques.md'), 'utf-8');
      expect(content).toContain('# Techniques');
      expect(content).toContain('Test Paper');
    });

    it('appends to existing techniques.md without overwriting', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'techniques.md'),
        '# Techniques\n\n## Gammal teknik (2025)\n\n---\n'
      );

      await agent.executeWriteToTechniques({
        entry: '## Ny teknik (2026)\n\n---',
      });

      const content = await fs.readFile(path.join(memoryDir, 'techniques.md'), 'utf-8');
      expect(content).toContain('Gammal teknik');
      expect(content).toContain('Ny teknik');
    });

    it('returns success message', async () => {
      const result = await agent.executeWriteToTechniques({
        entry: '## Test\n\n---',
      });
      expect(result).toContain('techniques.md');
    });
  });

  describe('read_memory_file', () => {
    it('reads existing memory file', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(path.join(memoryDir, 'techniques.md'), '# Techniques\n\n## Existing entry\n');

      const result = await agent.executeReadMemoryFile({ file: 'techniques' });
      expect(result).toContain('Existing entry');
    });

    it('returns helpful message when file does not exist', async () => {
      const result = await agent.executeReadMemoryFile({ file: 'techniques' });
      expect(result).toContain('not found');
    });

    it('returns error for invalid file name', async () => {
      const result = await agent.executeReadMemoryFile({ file: 'invalid' });
      expect(result).toContain('Error');
    });
  });

  describe('fetch_url', () => {
    it('rejects non-http/https URLs', async () => {
      const result = await agent.executeFetchUrl({ url: 'file:///etc/passwd' });
      expect(result).toContain('Error');
      expect(result).toContain('http');
    });

    it('rejects ftp URLs', async () => {
      const result = await agent.executeFetchUrl({ url: 'ftp://example.com/file' });
      expect(result).toContain('Error');
    });

    it('accepts https URLs (mocked)', async () => {
      // Mock global fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<feed><entry><title>Test Paper</title></entry></feed>',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await agent.executeFetchUrl({ url: 'https://export.arxiv.org/api/query?search_query=test' });
      expect(result).toContain('Test Paper');

      vi.unstubAllGlobals();
    });

    it('handles HTTP error responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await agent.executeFetchUrl({ url: 'https://example.com/missing' });
      expect(result).toContain('404');

      vi.unstubAllGlobals();
    });

    it('truncates very large responses', async () => {
      const largeContent = 'x'.repeat(100_000);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => largeContent,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await agent.executeFetchUrl({ url: 'https://example.com/large' });
      expect(result.length).toBeLessThan(60_000);
      expect(result).toContain('truncated');

      vi.unstubAllGlobals();
    });
  });
});
