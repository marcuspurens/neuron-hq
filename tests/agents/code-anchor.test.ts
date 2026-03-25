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
    // pwd is not in readonly allowlist, so test cwd via wc which runs relative to baseDir
    const result = await (anchor as any).executeBash('wc -l package.json');
    // wc returns a line count + filename — just verify it ran without BLOCKED
    expect(result).not.toContain('BLOCKED');
    expect(result).toMatch(/\d+/); // contains a number (line count)
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

describe('CodeAnchor bash policy (unit)', () => {
  let anchor: CodeAnchor;

  beforeEach(() => {
    anchor = new CodeAnchor('neuron-hq', BASE_DIR);
  });

  // AC1: rm -rf / is blocked as forbidden pattern
  it('AC1: blocks rm -rf /', async () => {
    const result = await (anchor as any).executeBash('rm -rf /');
    expect(result).toContain('BLOCKED');
    expect(result).toContain('matches forbidden pattern');
  });

  // AC2: curl is blocked as forbidden pattern
  it('AC2: blocks curl', async () => {
    const result = await (anchor as any).executeBash('curl http://example.com');
    expect(result).toContain('BLOCKED');
    expect(result).toContain('matches forbidden pattern');
  });

  // AC3: python is not in allowlist
  it('AC3: blocks python (not in allowlist)', async () => {
    const result = await (anchor as any).executeBash('python -c "import os; os.system(\\"rm -rf /\\")"');
    expect(result).toContain('BLOCKED');
    expect(result).toContain('not in readonly allowlist');
  });

  // AC4: grep is allowed
  it('AC4: allows grep', async () => {
    const result = await (anchor as any).executeBash('grep -rn "class CodeAnchor" src/core/agents/code-anchor.ts');
    expect(result).not.toContain('BLOCKED');
    expect(result).toContain('class CodeAnchor');
  });

  // AC5: find is allowed
  it('AC5: allows find', async () => {
    const result = await (anchor as any).executeBash('find src -name "*.ts" -type f');
    expect(result).not.toContain('BLOCKED');
    expect(result).toContain('.ts');
  });

  // AC6: git log is allowed
  it('AC6: allows git log', async () => {
    const result = await (anchor as any).executeBash('git log --oneline -5');
    expect(result).not.toContain('BLOCKED');
  });

  // AC7: static properties exist on class
  it('AC7: READONLY_ALLOWLIST and FORBIDDEN_PATTERNS are static class properties', () => {
    // Access via the class itself (not instance) to verify they are static
    const allowlist = (CodeAnchor as any).READONLY_ALLOWLIST;
    const forbidden = (CodeAnchor as any).FORBIDDEN_PATTERNS;
    expect(Array.isArray(allowlist)).toBe(true);
    expect(allowlist.length).toBeGreaterThan(0);
    expect(Array.isArray(forbidden)).toBe(true);
    expect(forbidden.length).toBeGreaterThan(0);
  });

  // AC8: pipe to rm is blocked
  it('AC8: blocks pipe to rm (pipe bypass)', async () => {
    const result = await (anchor as any).executeBash('grep "foo" | rm -rf /');
    expect(result).toContain('BLOCKED');
    expect(result).toContain('matches forbidden pattern');
  });

  // AC9: redirect to absolute path is blocked
  it('AC9: blocks redirect to absolute path', async () => {
    const result = await (anchor as any).executeBash('grep "foo" > /etc/passwd');
    expect(result).toContain('BLOCKED');
    expect(result).toContain('matches forbidden pattern');
  });

  // AC9b: pipe to xargs is blocked
  it('AC9b: blocks pipe to xargs', async () => {
    const result = await (anchor as any).executeBash('find . -name "*.ts" | xargs rm');
    expect(result).toContain('BLOCKED');
    expect(result).toContain('matches forbidden pattern');
  });
});

describe('CodeAnchor accumulated responses (unit)', () => {
  // AC10: runAgentLoop accumulates text responses with separator
  it('AC10: uses allTextResponses array (grep verify)', () => {
    const src = fs.readFileSync('src/core/agents/code-anchor.ts', 'utf-8');
    expect(src).toContain('allTextResponses');
    expect(src).toContain('---');  // separator in join
  });

  // AC12: Promise.all used for parallel tool execution
  it('AC12: uses Promise.all for parallel tool execution', () => {
    const src = fs.readFileSync('src/core/agents/code-anchor.ts', 'utf-8');
    expect(src).toContain('Promise.all');
    expect(src).toContain('toolUseBlocks.map');
  });
});

describe('CodeAnchor model registry (unit)', () => {
  // AC13: code-anchor is in AGENT_ROLES
  it('AC13: code-anchor is in AGENT_ROLES', async () => {
    const { AGENT_ROLES } = await import('../../src/core/model-registry.js');
    expect(AGENT_ROLES).toContain('code-anchor');
  });
});
