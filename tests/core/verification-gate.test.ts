import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateHandoff, IMPLEMENTER_REQUIRED, REVIEWER_REQUIRED } from '../../src/core/verification-gate.js';

describe('verification-gate', () => {
  // Unit tests for validateHandoff
  it('returns empty array when all sections present', () => {
    const content = '## Self-Check\nConfidence: HIGH\nTests run: YES\nAcceptance criteria checked: 5/5';
    expect(validateHandoff(content, ['## Self-Check', 'Confidence:'])).toEqual([]);
  });

  it('returns missing sections when some are absent', () => {
    const content = '## Summary\nSome text here';
    expect(validateHandoff(content, ['## Self-Check', 'Confidence:'])).toEqual(['## Self-Check', 'Confidence:']);
  });

  it('returns only the missing sections (partial match)', () => {
    const content = '## Self-Check\nSome reflection text';
    expect(validateHandoff(content, ['## Self-Check', 'Confidence:'])).toEqual(['Confidence:']);
  });

  // Constants tests
  it('IMPLEMENTER_REQUIRED includes ## Self-Check and Confidence:', () => {
    expect(IMPLEMENTER_REQUIRED).toContain('## Self-Check');
    expect(IMPLEMENTER_REQUIRED).toContain('Confidence:');
  });

  it('REVIEWER_REQUIRED includes ## Self-Check and Tests run:', () => {
    expect(REVIEWER_REQUIRED).toContain('## Self-Check');
    expect(REVIEWER_REQUIRED).toContain('Tests run:');
  });

  // Prompt integration tests
  it('Manager prompt contains "Before You Delegate"', () => {
    const prompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');
    expect(prompt).toMatch(/Before You Delegate/);
  });

  it('Implementer prompt contains "Before You Report Done"', () => {
    const prompt = readFileSync(join(__dirname, '../../prompts/implementer.md'), 'utf-8');
    expect(prompt).toMatch(/Before You Report Done/);
  });

  it('Reviewer prompt contains "Before You Write Your Verdict"', () => {
    const prompt = readFileSync(join(__dirname, '../../prompts/reviewer.md'), 'utf-8');
    expect(prompt).toMatch(/Before You Write Your Verdict/);
  });

  // Integration test
  it('handoff with all implementer sections passes validation', () => {
    const handoff = `# Implementer Handoff

## What was done
- Added feature X

## Self-Check
- Criteria covered: [A, B, C]
- Criteria NOT covered: None
- Confidence: HIGH
- Concern: None
`;
    expect(validateHandoff(handoff, IMPLEMENTER_REQUIRED)).toEqual([]);
  });

  it('handoff with all reviewer sections passes validation', () => {
    const handoff = `# Reviewer Report

## Self-Check
- Tests run: YES (498 passed)
- Acceptance criteria checked: 8/8
- Missed criterion: None
- Gut feeling: Clean
`;
    expect(validateHandoff(handoff, REVIEWER_REQUIRED)).toEqual([]);
  });
});
