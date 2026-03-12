import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { createPolicyEnforcer } from '../../src/core/policy.js';
import {
  executeSharedBash,
  executeSharedReadFile,
  executeSharedWriteFile,
  executeSharedListFiles,
  coreToolDefinitions,
  type AgentToolContext,
} from '../../src/core/agents/shared-tools.js';

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

function makeToolCtx(ctx: any, role = 'tester'): AgentToolContext {
  return { ctx, agentRole: role };
}

describe('shared-tools', () => {
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-tools-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // executeSharedBash
  // -----------------------------------------------------------------------

  describe('executeSharedBash', () => {
    it('blocks forbidden commands (policy block)', async () => {
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedBash(toolCtx, 'rm -rf /');
      expect(result).toMatch(/^BLOCKED:/);
    });

    it('runs a successful command', async () => {
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedBash(toolCtx, 'echo hello');
      expect(result).toContain('hello');
    });

    it('supports the truncate option', async () => {
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedBash(toolCtx, 'echo hello', { truncate: true });
      expect(typeof result).toBe('string');
      expect(result).toContain('hello');
    });

    it('includes stderr when includeStderr is true', async () => {
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedBash(toolCtx, 'echo hello', { includeStderr: true });
      expect(result).toContain('hello');
    });

    it('reports command failure', async () => {
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      // Use an allowlisted command that will fail (cat a non-existent file)
      const result = await executeSharedBash(toolCtx, 'cat nonexistent-file-xyz-12345.txt');
      expect(result).toMatch(/Command failed|Exit/);
    });
  });

  // -----------------------------------------------------------------------
  // executeSharedReadFile
  // -----------------------------------------------------------------------

  describe('executeSharedReadFile', () => {
    it('reads an existing file', async () => {
      const filePath = path.join(workspaceDir, 'test-read.txt');
      await fs.writeFile(filePath, 'hello from file');
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedReadFile(toolCtx, 'test-read.txt');
      expect(result).toBe('hello from file');
    });

    it('reads a file with truncate option', async () => {
      const filePath = path.join(workspaceDir, 'test-truncate.txt');
      await fs.writeFile(filePath, 'short content');
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedReadFile(toolCtx, 'test-truncate.txt', {
        truncate: true,
      });
      expect(typeof result).toBe('string');
      expect(result).toContain('short content');
    });

    it('returns error for non-existent file', async () => {
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedReadFile(toolCtx, 'does-not-exist.txt');
      expect(result).toMatch(/^Error reading file:/);
    });
  });

  // -----------------------------------------------------------------------
  // executeSharedWriteFile
  // -----------------------------------------------------------------------

  describe('executeSharedWriteFile', () => {
    it('writes a file and verifies content', async () => {
      // Use a baseDir under BASE_DIR/runs/runid so policy allows the write
      const writeDir = path.join(BASE_DIR, 'runs', '20260222-1200-test');
      await fs.mkdir(writeDir, { recursive: true });
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedWriteFile(
        toolCtx,
        'test-write-output.txt',
        'written content',
        writeDir,
      );
      expect(result).toContain('File written successfully');
      const content = await fs.readFile(
        path.join(writeDir, 'test-write-output.txt'),
        'utf-8',
      );
      expect(content).toBe('written content');
      // Cleanup
      await fs.unlink(path.join(writeDir, 'test-write-output.txt'));
    });

    it('creates parent directories automatically', async () => {
      const writeDir = path.join(BASE_DIR, 'runs', '20260222-1200-test');
      await fs.mkdir(writeDir, { recursive: true });
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedWriteFile(
        toolCtx,
        'subdir/deep/file.txt',
        'deep content',
        writeDir,
      );
      expect(result).toContain('File written successfully');
      const content = await fs.readFile(
        path.join(writeDir, 'subdir', 'deep', 'file.txt'),
        'utf-8',
      );
      expect(content).toBe('deep content');
      // Cleanup
      await fs.rm(path.join(writeDir, 'subdir'), { recursive: true, force: true });
    });
  });

  // -----------------------------------------------------------------------
  // executeSharedListFiles
  // -----------------------------------------------------------------------

  describe('executeSharedListFiles', () => {
    it('lists workspace root with FILE and DIR entries', async () => {
      await fs.writeFile(path.join(workspaceDir, 'readme.md'), '# README');
      await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true });
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedListFiles(toolCtx);
      expect(result).toContain('FILE');
      expect(result).toContain('DIR');
      expect(result).toContain('readme.md');
      expect(result).toContain('src');
    });

    it('returns (empty directory) for empty dir', async () => {
      const emptyDir = path.join(workspaceDir, 'empty');
      await fs.mkdir(emptyDir);
      const ctx = createMockContext(policy, runDir, workspaceDir);
      const toolCtx = makeToolCtx(ctx);
      const result = await executeSharedListFiles(toolCtx, 'empty');
      expect(result).toBe('(empty directory)');
    });
  });

  // -----------------------------------------------------------------------
  // coreToolDefinitions
  // -----------------------------------------------------------------------

  describe('coreToolDefinitions', () => {
    it('returns 4 tools with correct names', () => {
      const tools = coreToolDefinitions();
      expect(tools).toHaveLength(4);
      const names = tools.map((t) => t.name);
      expect(names).toContain('bash_exec');
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('list_files');
    });

    it('accepts custom descriptions', () => {
      const tools = coreToolDefinitions({ bash: 'Custom bash desc' });
      const bashTool = tools.find((t) => t.name === 'bash_exec');
      expect(bashTool?.description).toBe('Custom bash desc');
      // Others should keep defaults
      const readTool = tools.find((t) => t.name === 'read_file');
      expect(readTool?.description).toBe('Read the contents of a file.');
      const writeTool = tools.find((t) => t.name === 'write_file');
      expect(writeTool?.description).toBe(
        'Write content to a file. Subject to policy file scope validation.',
      );
      const listTool = tools.find((t) => t.name === 'list_files');
      expect(listTool?.description).toBe('List files in a directory.');
    });
  });
});
