import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CodeAnchor, type VerificationConversation } from '../../src/core/agents/code-anchor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('CodeAnchor', () => {
  it('can be constructed without errors', () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    expect(anchor).toBeInstanceOf(CodeAnchor);
  });

  it('has verify and respond methods', () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    expect(typeof anchor.verify).toBe('function');
    expect(typeof anchor.respond).toBe('function');
  });
});

describe('CodeAnchor tool execution (unit)', () => {
  let anchor: CodeAnchor;

  beforeEach(() => {
    anchor = new CodeAnchor('neuron-hq', BASE_DIR);
  });

  it('executeReadFile reads existing files with line numbers', () => {
    // Access private method via any cast for unit testing
    const result = (anchor as any).executeReadFile('package.json');
    expect(result).toContain('"name"');
    expect(result).toMatch(/^\s*1\s+/); // Line numbers start at 1
  });

  it('executeReadFile returns error for nonexistent files', () => {
    const result = (anchor as any).executeReadFile('nonexistent-file-xyz.ts');
    expect(result).toContain('Error: File not found');
  });

  it('executeReadFile blocks path traversal', () => {
    const result = (anchor as any).executeReadFile('../../etc/passwd');
    expect(result).toContain('outside project directory');
  });

  it('executeListFiles lists directory contents', () => {
    const result = (anchor as any).executeListFiles('src/core/agents');
    expect(result).toContain('code-anchor.ts');
    expect(result).toContain('brief-reviewer.ts');
  });

  it('executeListFiles marks directories with trailing slash', () => {
    const result = (anchor as any).executeListFiles('src');
    expect(result).toContain('core/');
  });

  it('executeListFiles returns error for nonexistent directory', () => {
    const result = (anchor as any).executeListFiles('nonexistent-dir-xyz');
    expect(result).toContain('Error: Directory not found');
  });

  it('executeBash runs grep and returns results', async () => {
    const result = await (anchor as any).executeBash('grep -rn "class CodeAnchor" src/core/agents/code-anchor.ts');
    expect(result).toContain('class CodeAnchor');
  });

  it('executeBash returns no matches for nonexistent pattern', async () => {
    const result = await (anchor as any).executeBash('grep -rn "xyzNonExistentPattern123" src/');
    expect(result).toContain('no matches');
  });

  it('executeBash respects baseDir as cwd', async () => {
    const result = await (anchor as any).executeBash('pwd');
    expect(result).toBe(BASE_DIR);
  });
});

describe('CodeAnchor conversation persistence', () => {
  const verificationsDir = path.join(BASE_DIR, 'runs', 'verifications');
  const testConvFile = path.join(verificationsDir, 'test-conversation.json');

  afterEach(() => {
    // Clean up test conversation file
    if (fs.existsSync(testConvFile)) {
      fs.unlinkSync(testConvFile);
    }
  });

  it('loadConversation returns null for nonexistent file', () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    const result = (anchor as any).loadConversation('/tmp/nonexistent.json');
    expect(result).toBeNull();
  });

  it('loadConversation returns null for undefined path', () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    const result = (anchor as any).loadConversation(undefined);
    expect(result).toBeNull();
  });

  it('saveConversation creates file and returns path', () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    const conversation: VerificationConversation = {
      briefFile: 'test.md',
      target: 'test-target',
      turns: [
        { role: 'verifier', content: 'Test report', ts: new Date().toISOString() },
      ],
      started: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    const savedPath = (anchor as any).saveConversation(conversation, testConvFile);
    expect(savedPath).toBe(testConvFile);
    expect(fs.existsSync(testConvFile)).toBe(true);

    const loaded = JSON.parse(fs.readFileSync(testConvFile, 'utf-8'));
    expect(loaded.target).toBe('test-target');
    expect(loaded.turns).toHaveLength(1);
    expect(loaded.turns[0].role).toBe('verifier');
  });

  it('loadConversation reads saved conversation', () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    const conversation: VerificationConversation = {
      briefFile: 'test.md',
      target: 'test-target',
      turns: [],
      started: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    (anchor as any).saveConversation(conversation, testConvFile);
    const loaded = (anchor as any).loadConversation(testConvFile);
    expect(loaded).not.toBeNull();
    expect(loaded.target).toBe('test-target');
  });

  it('loadConversation handles invalid JSON gracefully', () => {
    fs.mkdirSync(verificationsDir, { recursive: true });
    fs.writeFileSync(testConvFile, 'not valid json', 'utf-8');

    const anchor = new CodeAnchor('test-target', BASE_DIR);
    const result = (anchor as any).loadConversation(testConvFile);
    expect(result).toBeNull();
  });
});

describe('CodeAnchor graph context', () => {
  it('createGraphContext returns valid context with no-op audit', async () => {
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    const ctx = (anchor as any).createGraphContext();

    expect(ctx.graphPath).toContain('memory/graph.json');
    expect(ctx.runId).toBe('code-anchor');
    expect(ctx.agent).toBe('code-anchor');
    expect(typeof ctx.audit.log).toBe('function');

    // No-op audit should not throw
    await ctx.audit.log({ ts: '', role: 'manager', tool: 'test', allowed: true });
  });
});

describe('CodeAnchor tool definitions', () => {
  it('defines read_file, list_files, bash_exec and graph tools', async () => {
    // Import the tool definitions function indirectly via module
    const mod = await import('../../src/core/agents/code-anchor.js');
    // Since codeAnchorToolDefinitions is not exported, test via the agent's tool usage
    // We verify the tools exist by checking the agent has the right methods
    const anchor = new CodeAnchor('test-target', BASE_DIR);
    expect(typeof (anchor as any).executeReadFile).toBe('function');
    expect(typeof (anchor as any).executeListFiles).toBe('function');
    expect(typeof (anchor as any).executeBash).toBe('function');
    expect(typeof (anchor as any).createGraphContext).toBe('function');
  });
});
