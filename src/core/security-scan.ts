/**
 * Security scanning for diffs — detects hardcoded secrets, injection vectors,
 * and other security anti-patterns in added lines.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const SecurityFindingSchema = z.object({
  pattern: z.string().describe('Name of the matched pattern'),
  severity: z.enum(['critical', 'high', 'medium', 'info']),
  line: z.number().describe('Line number in diff where found'),
  context: z.string().describe('The matching line (truncated to 120 chars)'),
  recommendation: z.string(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const ScanResultSchema = z.object({
  findings: z.array(SecurityFindingSchema),
  scanned_lines: z.number(),
  patterns_checked: z.number(),
  has_critical: z.boolean(),
  has_high: z.boolean(),
  summary: z.string(),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

// ---------------------------------------------------------------------------
// Security Patterns
// ---------------------------------------------------------------------------

interface SecurityPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'info';
  recommendation: string;
}

/** Severity ordering for sort (lower = more severe). */
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

export const SECURITY_PATTERNS: SecurityPattern[] = [
  // Critical
  {
    name: 'hardcoded-api-key',
    regex: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/i,
    severity: 'critical',
    recommendation: 'Move to environment variable',
  },
  {
    name: 'aws-access-key',
    regex: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
    recommendation: 'Remove AWS key and rotate immediately',
  },
  {
    name: 'private-key',
    regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    severity: 'critical',
    recommendation: 'Never commit private keys; use a secrets manager',
  },

  // High
  {
    name: 'eval-function',
    regex: /\b(?:eval|Function)\s*\(/,
    severity: 'high',
    recommendation: 'Avoid eval; use safer alternatives',
  },
  {
    name: 'command-injection',
    regex: /child_process.*exec\(.*\$\{/,
    severity: 'high',
    recommendation: 'Use execFile with argument arrays instead',
  },
  {
    name: 'sql-injection',
    regex: /(?:query|execute)\s*\(\s*['"`].*\$\{/,
    severity: 'high',
    recommendation: 'Use parameterized queries',
  },
  {
    name: 'shell-interpolation',
    regex: /exec(?:Sync)?\s*\(\s*`/,
    severity: 'high',
    recommendation: 'Avoid template literals in shell commands',
  },

  // Medium
  {
    name: 'sensitive-log',
    regex: /console\.log\(.*(?:key|secret|token|password)/i,
    severity: 'medium',
    recommendation: 'Remove sensitive data from logs',
  },
  {
    name: 'disabled-security-lint',
    regex: /eslint-disable.*security/,
    severity: 'medium',
    recommendation: 'Do not disable security lint rules',
  },
  {
    name: 'insecure-http',
    regex: /['"]http:\/\/(?!localhost|127\.0\.0\.1)/,
    severity: 'medium',
    recommendation: 'Use HTTPS instead of HTTP',
  },

  // Info
  {
    name: 'security-todo',
    regex: /(?:TODO|FIXME|HACK).*(?:security|auth|secret)/i,
    severity: 'info',
    recommendation: 'Resolve security TODOs before merging',
  },
  {
    name: 'broad-permissions',
    regex: /chmod\s+(?:777|666)/,
    severity: 'info',
    recommendation: 'Use least-privilege file permissions',
  },
];

// ---------------------------------------------------------------------------
// scanDiff
// ---------------------------------------------------------------------------

/**
 * Scan a unified diff string for security issues in added lines.
 * Only lines starting with `+` (but not `+++`) are checked.
 */
export function scanDiff(diff: string): ScanResult {
  const lines = diff.split('\n');
  const findings: SecurityFinding[] = [];
  let scannedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only scan added lines (start with '+'), skip diff headers ('+++')
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    scannedLines++;

    for (const pattern of SECURITY_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          pattern: pattern.name,
          severity: pattern.severity,
          line: i + 1, // 1-based
          context: line.length > 120 ? line.slice(0, 120) : line,
          recommendation: pattern.recommendation,
        });
      }
    }
  }

  // Sort by severity (critical first)
  findings.sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const hasCritical = criticalCount > 0;
  const hasHigh = highCount > 0;

  let summary: string;
  if (findings.length === 0) {
    summary = 'Clean — no issues found';
  } else {
    summary = `Found ${findings.length} issues: ${criticalCount} critical, ${highCount} high`;
  }

  return {
    findings,
    scanned_lines: scannedLines,
    patterns_checked: SECURITY_PATTERNS.length,
    has_critical: hasCritical,
    has_high: hasHigh,
    summary,
  };
}

// ---------------------------------------------------------------------------
// formatScanReport
// ---------------------------------------------------------------------------

/**
 * Format a ScanResult as a markdown report string.
 */
export function formatScanReport(result: ScanResult): string {
  if (result.findings.length === 0) {
    return '### Security Scan\n\nNo security issues found. ✅';
  }

  const lines: string[] = [
    '### Security Scan',
    '',
    '| Pattern | Severity | Line | Context | Recommendation |',
    '|---------|----------|------|---------|----------------|',
  ];

  for (const f of result.findings) {
    // Escape pipe characters in context to avoid breaking the table
    const safeContext = f.context.replace(/\|/g, '\\|');
    lines.push(
      `| ${f.pattern} | ${f.severity} | ${f.line} | ${safeContext} | ${f.recommendation} |`,
    );
  }

  const criticalCount = result.findings.filter((f) => f.severity === 'critical').length;
  const highCount = result.findings.filter((f) => f.severity === 'high').length;

  lines.push('');
  lines.push(
    `⚠️ ${result.findings.length} findings (${criticalCount} critical, ${highCount} high)`,
  );

  return lines.join('\n');
}
