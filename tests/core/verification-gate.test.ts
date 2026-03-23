import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateHandoff, IMPLEMENTER_REQUIRED, REVIEWER_REQUIRED } from '../../src/core/verification-gate.js';
import { validateImplementerResult, validateReviewerResult } from '../../src/core/verification-gate.js';

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

  it('Implementer prompt contains self-check and quality checklist', () => {
    const prompt = readFileSync(join(__dirname, '../../prompts/implementer.md'), 'utf-8');
    expect(prompt).toMatch(/Quality Checklist.*Required Before Marking Done/);
    expect(prompt).toMatch(/Self-Check/);
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

describe('schema-based validation', () => {
  it('validateImplementerResult succeeds with valid JSON', () => {
    const json = JSON.stringify({
      taskId: 'T1',
      filesModified: [{ path: 'foo.ts', reason: 'Added feature' }],
      decisions: [],
      risks: [],
      notDone: [],
      confidence: 'HIGH',
      testsPassing: true,
    });
    const result = validateImplementerResult(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskId).toBe('T1');
    }
  });

  it('validateImplementerResult fails with invalid JSON string', () => {
    const result = validateImplementerResult('not json');
    expect(result.success).toBe(false);
  });

  it('validateImplementerResult fails with missing required fields', () => {
    const json = JSON.stringify({ taskId: 'T1' });
    const result = validateImplementerResult(json);
    expect(result.success).toBe(false);
  });

  it('validateReviewerResult succeeds with valid JSON', () => {
    const json = JSON.stringify({
      verdict: 'GREEN',
      testsRun: 50,
      testsPassing: 50,
      acceptanceCriteria: [{ criterion: 'Test', passed: true }],
      blockers: [],
      suggestions: [],
    });
    const result = validateReviewerResult(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verdict).toBe('GREEN');
    }
  });

  it('validateReviewerResult fails with invalid verdict value', () => {
    const json = JSON.stringify({
      verdict: 'ORANGE',
      testsRun: 10,
      testsPassing: 10,
      acceptanceCriteria: [],
      blockers: [],
      suggestions: [],
    });
    const result = validateReviewerResult(json);
    expect(result.success).toBe(false);
  });

  it('validateReviewerResult fails with malformed JSON string', () => {
    const result = validateReviewerResult('{broken}');
    expect(result.success).toBe(false);
  });

  it('validateReviewerResult succeeds with findings array (AC15)', () => {
    const json = JSON.stringify({
      verdict: 'YELLOW',
      testsRun: 10,
      testsPassing: 8,
      acceptanceCriteria: [],
      findings: [
        {
          id: 'F1',
          severity: 'BLOCK',
          category: 'test-gap',
          description: 'Missing test for edge case',
          file: 'src/core/foo.ts',
          line: 42,
        },
      ],
      blockers: ['F1: Missing test for edge case'],
      suggestions: [],
    });
    const result = validateReviewerResult(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0].severity).toBe('BLOCK');
    }
  });

  it('validateReviewerResult succeeds with old JSON without findings (backward compat, AC17)', () => {
    const json = JSON.stringify({
      verdict: 'GREEN',
      testsRun: 50,
      testsPassing: 50,
      acceptanceCriteria: [{ criterion: 'Schema validates', passed: true }],
      blockers: [],
      suggestions: [],
      // NO findings field — old format
    });
    const result = validateReviewerResult(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toEqual([]); // .default([]) applies
    }
  });
});
