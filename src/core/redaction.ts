/**
 * Redaction system for removing secrets from logs and artifacts.
 */

const SECRET_PATTERNS = [
  // API keys
  /\b[A-Za-z0-9_-]{20,}\b/g, // Generic long tokens
  /ANTHROPIC_API_KEY\s*=\s*[^\s]+/gi,
  /API_KEY\s*=\s*[^\s]+/gi,
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys

  // Environment variables with secrets
  /export\s+\w*KEY\w*\s*=\s*[^\s]+/gi,
  /export\s+\w*SECRET\w*\s*=\s*[^\s]+/gi,
  /export\s+\w*TOKEN\w*\s*=\s*[^\s]+/gi,
  /export\s+\w*PASSWORD\w*\s*=\s*[^\s]+/gi,

  // JWT tokens
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,

  // Private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
];

const REPLACEMENT = '[REDACTED]';

export class Redactor {
  private redactionCount = 0;
  private redactedFields: Set<string> = new Set();

  /**
   * Redact secrets from text.
   */
  redact(text: string): string {
    let redacted = text;

    for (const pattern of SECRET_PATTERNS) {
      const matches = redacted.match(pattern);
      if (matches) {
        this.redactionCount += matches.length;
        redacted = redacted.replace(pattern, REPLACEMENT);

        // Track which pattern matched (for reporting)
        this.redactedFields.add(pattern.source);
      }
    }

    return redacted;
  }

  /**
   * Redact secrets from an object (recursively).
   */
  redactObject<T extends Record<string, unknown>>(obj: T): T {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        redacted[key] = this.redact(value);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactObject(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted as T;
  }

  /**
   * Generate a redaction report.
   */
  generateReport(): string {
    const lines = [
      '# Redaction Report',
      '',
      `**Total redactions**: ${this.redactionCount}`,
      '',
    ];

    if (this.redactionCount > 0) {
      lines.push('**Patterns matched**:');
      for (const field of this.redactedFields) {
        lines.push(`- ${field}`);
      }
      lines.push('');
      lines.push('All sensitive data has been replaced with `[REDACTED]`.');
    } else {
      lines.push('No secrets detected in artifacts.');
    }

    return lines.join('\n');
  }

  /**
   * Reset redaction statistics.
   */
  reset(): void {
    this.redactionCount = 0;
    this.redactedFields.clear();
  }
}
