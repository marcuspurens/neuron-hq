import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/knowledge-manager.md'), 'utf-8');

describe('knowledge-manager.md — critical instructions', () => {
  it('defines three phases: SCAN, RESEARCH, REPORT', () => {
    expect(prompt).toMatch(/SCAN/);
    expect(prompt).toMatch(/RESEARCH/);
    expect(prompt).toMatch(/REPORT/);
  });

  it('mentions maxActions limit', () => {
    expect(prompt).toMatch(/maxActions/);
  });

  it('mentions Aurora tools', () => {
    expect(prompt).toMatch(/gaps/);
    expect(prompt).toMatch(/freshness/);
    expect(prompt).toMatch(/remember/);
    expect(prompt).toMatch(/suggest-research/);
  });

  it('mentions KMReport output format', () => {
    expect(prompt).toMatch(/KMReport/);
    expect(prompt).toMatch(/gapsFound/);
    expect(prompt).toMatch(/gapsResearched/);
    expect(prompt).toMatch(/sourcesRefreshed/);
    expect(prompt).toMatch(/newNodesCreated/);
  });

  it('focuses on knowledge maintenance, not coding', () => {
    expect(prompt).toMatch(/NOT.*coding/i);
  });
});
