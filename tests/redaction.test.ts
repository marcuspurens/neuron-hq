import { describe, it, expect } from 'vitest';
import { Redactor } from '../src/core/redaction.js';

describe('Redactor', () => {
  it('should redact API keys', () => {
    const redactor = new Redactor();
    const text = 'ANTHROPIC_API_KEY=sk-ant-1234567890abcdefghij';
    const redacted = redactor.redact(text);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('sk-ant-1234567890');
  });

  it('should redact environment variables with secrets', () => {
    const redactor = new Redactor();
    const text = 'export API_KEY=secret123';
    const redacted = redactor.redact(text);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('secret123');
  });

  it('should redact JWT tokens', () => {
    const redactor = new Redactor();
    const text = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123';
    const redacted = redactor.redact(text);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('should redact objects recursively', () => {
    const redactor = new Redactor();
    const obj = {
      safe: 'public data',
      credentials: {
        apiKey: 'sk-ant-secret123456789012',
      },
    };

    const redacted = redactor.redactObject(obj);
    expect(redacted.safe).toBe('public data');
    expect(redacted.credentials.apiKey).toContain('[REDACTED]');
  });

  it('should generate redaction report', () => {
    const redactor = new Redactor();
    redactor.redact('ANTHROPIC_API_KEY=sk-ant-1234567890abcdefghij');

    const report = redactor.generateReport();
    expect(report).toContain('Total redactions');
    expect(report).toContain('sensitive data');
  });

  it('should report zero redactions when none found', () => {
    const redactor = new Redactor();
    redactor.redact('This is safe public text');

    const report = redactor.generateReport();
    expect(report).toContain('No secrets detected');
  });
});
