import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/morning-briefing-questions.md'), 'utf-8');

describe('morning-briefing-questions.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('identifies as Aurora', () => {
    expect(prompt).toMatch(/Aurora/);
  });

  it('requires exactly 3 questions', () => {
    expect(prompt).toMatch(/3 frågor/);
  });

  it('has candidates placeholder', () => {
    expect(prompt).toMatch(/\{\{candidates\}\}/);
  });

  it('requires JSON array response', () => {
    expect(prompt).toMatch(/JSON-array/i);
  });

  it('mentions category classification', () => {
    expect(prompt).toMatch(/gap|stale|idea/);
  });
});
