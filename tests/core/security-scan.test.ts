import { describe, it, expect } from 'vitest';
import {
  scanDiff,
  formatScanReport,
  SecurityFindingSchema,
  ScanResultSchema,
} from '../../src/core/security-scan.js';
import { isHighRisk } from '../../src/core/agents/reviewer.js';

// ---------------------------------------------------------------------------
// scanDiff
// ---------------------------------------------------------------------------

describe('scanDiff', () => {
  it('empty diff → 0 findings', () => {
    const result = scanDiff('');
    expect(result.findings.length).toBe(0);
    expect(result.scanned_lines).toBe(0);
  });

  it('clean diff → 0 findings', () => {
    const diff = [
      '+const x = 42;',
      '+const y = x + 1;',
      '+export { x, y };',
    ].join('\n');
    const result = scanDiff(diff);
    expect(result.findings.length).toBe(0);
  });

  it('hardcoded API key → critical', () => {
    const diff = '+const apiKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234";';
    const result = scanDiff(diff);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const finding = result.findings.find((f) => f.pattern === 'hardcoded-api-key');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('AWS AKIA key → critical', () => {
    const diff = '+const key = "AKIAIOSFODNN7EXAMPLE";';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'aws-access-key');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('private key block → critical', () => {
    const diff = '+-----BEGIN RSA PRIVATE KEY-----';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'private-key');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('eval() → high', () => {
    const diff = '+const result = eval(userInput);';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'eval-function');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  it('exec with template literal → high', () => {
    const diff = '+child_process.exec(`rm ${dir}`)';
    const result = scanDiff(diff);
    const finding = result.findings.find(
      (f) => f.pattern === 'command-injection' || f.pattern === 'shell-interpolation',
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  it('SQL with template literal → high', () => {
    const diff = '+db.query(`SELECT * FROM users WHERE id = ${userId}`)';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'sql-injection');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  it('console.log with password → medium', () => {
    const diff = '+console.log(password)';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'sensitive-log');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('medium');
  });

  it('HTTP url (not localhost) → medium', () => {
    const diff = '+const url = "http://example.com/api";';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'insecure-http');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('medium');
  });

  it('TODO security comment → info', () => {
    const diff = '+// TODO: fix security issue';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'security-todo');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });

  it('chmod 777 → info', () => {
    const diff = '+chmod 777 /tmp/data';
    const result = scanDiff(diff);
    const finding = result.findings.find((f) => f.pattern === 'broad-permissions');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });

  it('only scans added lines (+), ignores removed (-)', () => {
    const diff = [
      '-const apiKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234";',
      '+const x = 42;',
    ].join('\n');
    const result = scanDiff(diff);
    expect(result.findings.length).toBe(0);
  });

  it('findings sorted by severity (critical first)', () => {
    const diff = [
      '+// TODO: fix security issue',
      '+const result = eval(userInput);',
      '+const apiKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234";',
    ].join('\n');
    const result = scanDiff(diff);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[result.findings.length - 1].severity).toBe('info');
  });

  it('context truncated to 120 chars', () => {
    // Build a long line that triggers a pattern (hardcoded API key)
    const padding = 'x'.repeat(150);
    const diff = `+const apiKey = "${padding}";`;
    const result = scanDiff(diff);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].context.length).toBeLessThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------
// formatScanReport
// ---------------------------------------------------------------------------

describe('formatScanReport', () => {
  it('no findings → clean message', () => {
    const result = scanDiff('');
    const report = formatScanReport(result);
    expect(report).toContain('No security issues found. ✅');
  });

  it('findings → markdown table', () => {
    const diff = '+const result = eval(userInput);';
    const result = scanDiff(diff);
    const report = formatScanReport(result);
    expect(report).toContain('| Pattern | Severity | Line | Context | Recommendation |');
  });

  it('summary with counts', () => {
    const diff = [
      '+const apiKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234";',
      '+const result = eval(userInput);',
    ].join('\n');
    const result = scanDiff(diff);
    const report = formatScanReport(result);
    // Should have at least 1 critical (apiKey) and 1 high (eval)
    expect(report).toContain(`${result.findings.length} findings (1 critical, 1 high)`);
  });
});

// ---------------------------------------------------------------------------
// isHighRisk
// ---------------------------------------------------------------------------

describe('isHighRisk', () => {
  it('brief with "**High.**" → true', () => {
    expect(isHighRisk('## Risk\n\n**High.**')).toBe(true);
  });

  it('brief with "**Low.**" → false', () => {
    expect(isHighRisk('## Risk\n\n**Low.**')).toBe(false);
  });

  it('brief without Risk section → false', () => {
    expect(isHighRisk('## Scope\n\nSome scope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScanResultSchema
// ---------------------------------------------------------------------------

describe('ScanResultSchema', () => {
  it('validates correct object', () => {
    const valid = {
      findings: [
        {
          pattern: 'test-pattern',
          severity: 'high' as const,
          line: 1,
          context: 'some context',
          recommendation: 'fix it',
        },
      ],
      scanned_lines: 10,
      patterns_checked: 12,
      has_critical: false,
      has_high: true,
      summary: 'Found 1 issues: 0 critical, 1 high',
    };
    expect(() => ScanResultSchema.parse(valid)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SecurityFindingSchema
// ---------------------------------------------------------------------------

describe('SecurityFindingSchema', () => {
  it('rejects invalid severity', () => {
    expect(() =>
      SecurityFindingSchema.parse({
        pattern: 'test',
        severity: 'invalid',
        line: 1,
        context: 'x',
        recommendation: 'y',
      }),
    ).toThrow();
  });
});
