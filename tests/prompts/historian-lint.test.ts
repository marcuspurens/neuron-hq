import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/historian.md'), 'utf-8');

describe('historian.md — critical instructions', () => {
  it('instructs to use grep_audit instead of read_file for audit.jsonl', () => {
    expect(prompt).toMatch(/grep_audit/);
  });

  it('instructs to use update_error_status (not write_to_memory) for existing errors', () => {
    expect(prompt).toMatch(/update_error_status/);
  });

  it('instructs to search before writing error entries', () => {
    expect(prompt).toMatch(/search_memory/);
  });

  it('forbids creating duplicate error entries', () => {
    expect(prompt).toMatch(/duplikat|duplicate|Skapa INTE en ny post/i);
  });

  it('instructs to verify with audit.jsonl before reporting agent failure', () => {
    expect(prompt).toMatch(/audit\.jsonl/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('grep_audit', 'REMOVED');
    expect(modified).not.toMatch(/grep_audit/);
  });

  it('includes Senast bekräftad in pattern entry format', () => {
    expect(prompt).toMatch(/Senast bekräftad/);
  });
});
