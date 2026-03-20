import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/neuron-help.md'), 'utf-8');

describe('neuron-help.md — critical instructions', () => {
  it('defines the assistant role for Neuron HQ', () => {
    expect(prompt).toMatch(/hjälpassistent.*Neuron HQ/);
  });

  it('instructs to rank the 3 most relevant tools', () => {
    expect(prompt).toMatch(/ranka de 3 mest relevanta/);
  });

  it('specifies JSON output format with name and reason', () => {
    expect(prompt).toMatch(/"name"/);
    expect(prompt).toMatch(/"reason"/);
  });

  it('requires responses in Swedish', () => {
    expect(prompt).toMatch(/Svara på svenska/);
  });

  it('instructs to return only JSON, no other text', () => {
    expect(prompt).toMatch(/ENBART.*JSON/);
  });

  it('instructs intent-based matching, not just keyword matching', () => {
    expect(prompt).toMatch(/intention.*inte bara ordmatchning/);
  });

  it('specifies empty array fallback when no tool is relevant', () => {
    expect(prompt).toMatch(/tom array.*\[\]/);
  });

  it('includes placeholders for question and tools', () => {
    expect(prompt).toMatch(/\{\{question\}\}/);
    expect(prompt).toMatch(/\{\{tools\}\}/);
  });

  it('is concise — under 30 lines', () => {
    const lineCount = prompt.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(30);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('JSON-arrayen', 'REMOVED');
    expect(modified).not.toMatch(/JSON-arrayen/);
  });
});
