import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractFunctionBody,
  analyzeBody,
  checkDeepAlignment,
  DEEP_ALIGNMENT_CHECKS,
} from '../../src/core/agents/observer-alignment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

// ── extractFunctionBody ───────────────────────────────────────────────────────

describe('extractFunctionBody', () => {
  it('extracts a simple function body', () => {
    const src = `
function hello(name: string): string {
  return 'hello ' + name;
}
`;
    const body = extractFunctionBody(src, 'hello');
    expect(body).not.toBeNull();
    expect(body).toContain("return 'hello '");
  });

  it('extracts an async function body', () => {
    const src = `
async function fetchData(url: string): Promise<string> {
  const res = await fetch(url);
  return res.text();
}
`;
    const body = extractFunctionBody(src, 'fetchData');
    expect(body).not.toBeNull();
    expect(body).toContain('await fetch');
  });

  it('extracts an arrow function body', () => {
    const src = `
const doSomething = (x: number) => {
  return x * 2;
};
`;
    const body = extractFunctionBody(src, 'doSomething');
    expect(body).not.toBeNull();
    expect(body).toContain('return x * 2');
  });

  it('extracts an async arrow function body', () => {
    const src = `
const verifySource = async (url: string) => {
  const result = await fetch(url);
  return result.ok;
};
`;
    const body = extractFunctionBody(src, 'verifySource');
    expect(body).not.toBeNull();
    expect(body).toContain('await fetch');
  });

  it('handles nested braces correctly', () => {
    const src = `
function outer(): void {
  if (true) {
    const obj = { a: 1, b: { c: 2 } };
    console.log(obj);
  }
}
`;
    const body = extractFunctionBody(src, 'outer');
    expect(body).not.toBeNull();
    expect(body).toContain('if (true)');
    expect(body).toContain('{ a: 1, b: { c: 2 } }');
  });

  it('handles braces inside string literals', () => {
    const src = `
function template(): string {
  return 'some { braces } in string';
}
`;
    const body = extractFunctionBody(src, 'template');
    expect(body).not.toBeNull();
    expect(body).toContain("'some { braces } in string'");
  });

  it('handles braces inside template literals', () => {
    const src = [
      'function msg(): string {',
      '  const x = `value: ${ 42 }`;',
      '  return x;',
      '}',
    ].join('\n');
    const body = extractFunctionBody(src, 'msg');
    expect(body).not.toBeNull();
    expect(body).toContain('return x');
  });

  it('handles braces inside single-line comments', () => {
    const src = `
function commented(): void {
  // { this brace is in a comment }
  doWork();
}
`;
    const body = extractFunctionBody(src, 'commented');
    expect(body).not.toBeNull();
    expect(body).toContain('doWork()');
  });

  it('handles braces inside block comments', () => {
    const src = `
function withBlockComment(): void {
  /* { brace in block comment } */
  doWork();
}
`;
    const body = extractFunctionBody(src, 'withBlockComment');
    expect(body).not.toBeNull();
    expect(body).toContain('doWork()');
  });

  it('returns null when function is not found', () => {
    const src = `
function existingFunction(): void {
  doSomething();
}
`;
    expect(extractFunctionBody(src, 'nonExistentFunction')).toBeNull();
  });

  it('extracts a class method body', () => {
    const src = `
class MyService {
  async processRequest(id: string): Promise<void> {
    const data = await fetchData(id);
    await saveData(data);
  }
}
`;
    const body = extractFunctionBody(src, 'processRequest');
    expect(body).not.toBeNull();
    expect(body).toContain('await fetchData');
    expect(body).toContain('await saveData');
  });

  it('extracts body with type annotation on return', () => {
    const src = `
function compute(x: number): { result: number; ok: boolean } {
  return { result: x * 2, ok: true };
}
`;
    const body = extractFunctionBody(src, 'compute');
    expect(body).not.toBeNull();
    expect(body).toContain('result: x * 2');
  });
});

// ── analyzeBody ───────────────────────────────────────────────────────────────

describe('analyzeBody', () => {
  // DEEP cases
  it('marks body with await as DEEP', () => {
    expect(analyzeBody('  const res = await fetchData(url);\n  return res;')).toBe('DEEP');
  });

  it('marks body with fetch( as DEEP', () => {
    expect(analyzeBody('  const r = fetch(url);\n  return r.json();')).toBe('DEEP');
  });

  it('marks body with if + function call as DEEP', () => {
    expect(analyzeBody('  if (condition) {\n    doThing();\n  }')).toBe('DEEP');
  });

  it('marks body with multiple function calls as DEEP', () => {
    expect(analyzeBody('  loadData(id);\n  saveResult(data);')).toBe('DEEP');
  });

  // SHALLOW cases
  it('marks empty body as SHALLOW', () => {
    expect(analyzeBody('')).toBe('SHALLOW');
  });

  it('marks body with only logger calls as SHALLOW', () => {
    expect(analyzeBody('  logger.info("doing nothing");\n  logger.debug("still nothing");')).toBe('SHALLOW');
  });

  it('marks body with only console calls as SHALLOW', () => {
    expect(analyzeBody('  console.log("stub");')).toBe('SHALLOW');
  });

  it('marks body returning hardcoded true as SHALLOW', () => {
    expect(analyzeBody("  return true;\n")).toBe('SHALLOW');
  });

  it('marks body returning hardcoded false as SHALLOW', () => {
    expect(analyzeBody("  return false;\n")).toBe('SHALLOW');
  });

  it('marks body returning hardcoded null as SHALLOW', () => {
    expect(analyzeBody("  return null;\n")).toBe('SHALLOW');
  });

  it('marks body returning hardcoded string as SHALLOW', () => {
    expect(analyzeBody("  return 'placeholder';\n")).toBe('SHALLOW');
  });

  it('marks body that only sets a property without calls as SHALLOW', () => {
    expect(analyzeBody('  this.flag = true;')).toBe('SHALLOW');
  });

  // Default / edge cases
  it('defaults to DEEP for unclear body', () => {
    // A single variable assignment that doesn't trigger any pattern
    expect(analyzeBody('  const x = someComplexExpression;')).toBe('DEEP');
  });
});

// ── checkDeepAlignment ────────────────────────────────────────────────────────

describe('checkDeepAlignment', () => {
  it('returns empty array when no checks match the agentRole', async () => {
    const results = await checkDeepAlignment('unknown-agent', 'some prompt text', '/dev/null');
    expect(results).toEqual([]);
  });

  it('returns NOT_FOUND when source file cannot be read', async () => {
    const results = await checkDeepAlignment(
      'knowledge-manager',
      'verify source authenticity',
      '/non/existent/path.ts',
    );
    expect(results).toHaveLength(1);
    expect(results[0].analysis).toBe('NOT_FOUND');
    expect(results[0].agent).toBe('knowledge-manager');
    expect(results[0].functionName).toBe('verifySource');
  });

  it('returns NOT_FOUND when prompt does not contain the keyword', async () => {
    // Use a real (readable) file but a prompt without the keyword
    const results = await checkDeepAlignment(
      'knowledge-manager',
      'This prompt has no relevant keywords',
      path.join(BASE_DIR, 'src/aurora/freshness.ts'),
    );
    expect(results).toHaveLength(1);
    expect(results[0].analysis).toBe('NOT_FOUND');
    expect(results[0].details).toContain('does not contain keyword');
  });

  it('returns DEEP for knowledge-manager verifySource (defined in aurora/freshness.ts)', async () => {
    const results = await checkDeepAlignment(
      'knowledge-manager',
      'Please verify the source content carefully.',
      path.join(BASE_DIR, 'src/aurora/freshness.ts'),
    );
    expect(results).toHaveLength(1);
    expect(results[0].analysis).toBe('DEEP');
    expect(results[0].agent).toBe('knowledge-manager');
    expect(results[0].functionName).toBe('verifySource');
    expect(results[0].promptClaim).toBe('verify');
  });

  it('returns DEEP for merger executeBashInTarget (post-merge verification via bash)', async () => {
    const results = await checkDeepAlignment(
      'merger',
      'Execute post-merge verif checks.',
      path.join(BASE_DIR, 'src/core/agents/merger.ts'),
    );
    expect(results).toHaveLength(1);
    expect(results[0].analysis).toBe('DEEP');
    expect(results[0].functionName).toBe('executeBashInTarget');
  });

  it('result shape matches DeepAlignmentCheck interface', async () => {
    const results = await checkDeepAlignment(
      'knowledge-manager',
      'verify the source',
      path.join(BASE_DIR, 'src/aurora/freshness.ts'),
    );
    const r = results[0];
    expect(r).toHaveProperty('agent');
    expect(r).toHaveProperty('promptClaim');
    expect(r).toHaveProperty('functionName');
    expect(r).toHaveProperty('sourceFile');
    expect(r).toHaveProperty('analysis');
    expect(r).toHaveProperty('details');
  });
});

// ── DEEP_ALIGNMENT_CHECKS export ──────────────────────────────────────────────

describe('DEEP_ALIGNMENT_CHECKS', () => {
  it('is exported and non-empty', () => {
    expect(DEEP_ALIGNMENT_CHECKS).toBeDefined();
    expect(Array.isArray(DEEP_ALIGNMENT_CHECKS)).toBe(true);
    expect(DEEP_ALIGNMENT_CHECKS.length).toBeGreaterThan(0);
  });

  it('each entry has required fields', () => {
    for (const check of DEEP_ALIGNMENT_CHECKS) {
      expect(check).toHaveProperty('agentRole');
      expect(check).toHaveProperty('promptKeyword');
      expect(check).toHaveProperty('expectedFunction');
      expect(check).toHaveProperty('sourceFile');
    }
  });

  it('contains knowledge-manager entry', () => {
    const km = DEEP_ALIGNMENT_CHECKS.find((c) => c.agentRole === 'knowledge-manager');
    expect(km).toBeDefined();
    expect(km!.expectedFunction).toBe('verifySource');
  });

  it('contains merger entry', () => {
    const merger = DEEP_ALIGNMENT_CHECKS.find((c) => c.agentRole === 'merger');
    expect(merger).toBeDefined();
    expect(merger!.expectedFunction).toBe('executeBashInTarget');
  });
});
