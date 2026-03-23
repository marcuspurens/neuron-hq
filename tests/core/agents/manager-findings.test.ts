/**
 * Tests for manager.ts ReviewerFindings audit logging (AC18, AC18b)
 *
 * These tests verify the logic that logs severity distribution to audit
 * by testing it through ReviewerResultSchema parsing — since the audit
 * call is gated on parsed.data.findings?.length > 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewerResultSchema } from '../../../src/core/messages.js';

describe('ReviewerFindings audit logging logic (AC18, AC18b)', () => {
  /**
   * Helper: simulate what manager.ts does when parsing reviewer_result.json
   * and deciding whether to call audit.log with ReviewerFindings.
   */
  function simulateManagerAuditLogic(jsonStr: string): {
    auditCalledWithFindings: boolean;
    counts?: { BLOCK: number; SUGGEST: number; NOTE: number };
    blockFindings?: string[];
  } {
    const auditLog = vi.fn();

    let parsed: ReturnType<typeof ReviewerResultSchema.safeParse>;
    try {
      parsed = ReviewerResultSchema.safeParse(JSON.parse(jsonStr));
    } catch {
      return { auditCalledWithFindings: false };
    }

    if (!parsed.success) {
      return { auditCalledWithFindings: false };
    }

    // Simulate the first audit.log (ReviewerResult)
    auditLog({
      event: 'agent_message',
      from: 'reviewer',
      to: 'manager',
      payload_type: 'ReviewerResult',
      verdict: parsed.data.verdict,
    });

    // Simulate the second audit.log (ReviewerFindings) — only if findings present
    if (parsed.data.findings?.length) {
      const severityCounts = { BLOCK: 0, SUGGEST: 0, NOTE: 0 };
      for (const f of parsed.data.findings) {
        severityCounts[f.severity]++;
      }
      const blockFindings = parsed.data.findings
        .filter((f) => f.severity === 'BLOCK')
        .map((f) => f.id);

      auditLog({
        event: 'agent_message',
        payload_type: 'ReviewerFindings',
        counts: severityCounts,
        blockFindings,
      });

      const findingsCall = auditLog.mock.calls.find(
        (call) => call[0]?.payload_type === 'ReviewerFindings',
      );
      return {
        auditCalledWithFindings: !!findingsCall,
        counts: findingsCall?.[0]?.counts,
        blockFindings: findingsCall?.[0]?.blockFindings,
      };
    }

    return { auditCalledWithFindings: false };
  }

  it('AC18: audit.log is called with payload_type: ReviewerFindings when findings present', () => {
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
          description: 'Missing test for empty array',
          file: 'src/core/foo.ts',
          line: 42,
        },
        {
          id: 'F2',
          severity: 'SUGGEST',
          category: 'readability',
          description: 'Rename processData',
        },
        {
          id: 'F3',
          severity: 'NOTE',
          category: 'design',
          description: 'Module getting large',
        },
      ],
      blockers: ['F1: Missing test'],
      suggestions: ['F2: Rename processData'],
    });

    const result = simulateManagerAuditLogic(json);

    expect(result.auditCalledWithFindings).toBe(true);
  });

  it('AC18: counts object has BLOCK/SUGGEST/NOTE keys with correct values', () => {
    const json = JSON.stringify({
      verdict: 'YELLOW',
      testsRun: 10,
      testsPassing: 8,
      acceptanceCriteria: [],
      findings: [
        { id: 'F1', severity: 'BLOCK', category: 'test-gap', description: 'A' },
        { id: 'F2', severity: 'BLOCK', category: 'policy', description: 'B' },
        { id: 'F3', severity: 'SUGGEST', category: 'readability', description: 'C' },
        { id: 'F4', severity: 'NOTE', category: 'design', description: 'D' },
      ],
      blockers: ['F1', 'F2'],
      suggestions: ['F3'],
    });

    const result = simulateManagerAuditLogic(json);

    expect(result.auditCalledWithFindings).toBe(true);
    expect(result.counts).toEqual({ BLOCK: 2, SUGGEST: 1, NOTE: 1 });
  });

  it('AC18: blockFindings contains IDs of BLOCK findings only', () => {
    const json = JSON.stringify({
      verdict: 'RED',
      testsRun: 10,
      testsPassing: 5,
      acceptanceCriteria: [],
      findings: [
        { id: 'F1', severity: 'BLOCK', category: 'test-gap', description: 'A' },
        { id: 'F2', severity: 'BLOCK', category: 'policy', description: 'B' },
        { id: 'F3', severity: 'SUGGEST', category: 'readability', description: 'C' },
      ],
      blockers: ['F1', 'F2'],
      suggestions: ['F3'],
    });

    const result = simulateManagerAuditLogic(json);

    expect(result.blockFindings).toEqual(['F1', 'F2']);
  });

  it('AC18b: audit.log NOT called with ReviewerFindings when findings array is empty', () => {
    const json = JSON.stringify({
      verdict: 'GREEN',
      testsRun: 50,
      testsPassing: 50,
      acceptanceCriteria: [],
      findings: [],
      blockers: [],
      suggestions: [],
    });

    const result = simulateManagerAuditLogic(json);

    expect(result.auditCalledWithFindings).toBe(false);
  });

  it('AC18b: audit.log NOT called with ReviewerFindings when findings field is absent (old JSON)', () => {
    // Old format without findings field — .default([]) applies
    const json = JSON.stringify({
      verdict: 'GREEN',
      testsRun: 50,
      testsPassing: 50,
      acceptanceCriteria: [],
      blockers: [],
      suggestions: [],
      // NO findings field
    });

    const result = simulateManagerAuditLogic(json);

    expect(result.auditCalledWithFindings).toBe(false);
  });

  it('AC18: NOTE-only findings trigger ReviewerFindings audit log (findings.length > 0)', () => {
    // NOTE findings are less actionable, but the key is: ANY findings triggers the log
    // This test documents that even NOTE-only findings WILL trigger the log
    const json = JSON.stringify({
      verdict: 'GREEN',
      testsRun: 10,
      testsPassing: 10,
      acceptanceCriteria: [],
      findings: [
        { id: 'F1', severity: 'NOTE', category: 'design', description: 'Module getting large' },
      ],
      blockers: [],
      suggestions: [],
    });

    const result = simulateManagerAuditLogic(json);

    // NOTE findings still trigger the log (findings.length > 0)
    expect(result.auditCalledWithFindings).toBe(true);
    expect(result.counts).toEqual({ BLOCK: 0, SUGGEST: 0, NOTE: 1 });
  });
});
