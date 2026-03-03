import { describe, it, expect } from 'vitest';
import {
  ImplementerTaskSchema,
  ImplementerResultSchema,
  ReviewerTaskSchema,
  ReviewerResultSchema,
  AgentMessageSchema,
} from '../../src/core/messages.js';

// --- Helpers ---

function makeImplementerResult(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    taskId: 'T1',
    filesModified: [{ path: 'src/foo.ts', reason: 'Added feature' }],
    decisions: [{ choice: 'Use zod', reason: 'Already a dependency' }],
    risks: ['Edge case with empty arrays'],
    notDone: [],
    confidence: 'HIGH',
    testsPassing: true,
    ...overrides,
  };
}

// --- Tests ---

describe('messages schemas', () => {
  // =====================================================
  // ImplementerTaskSchema
  // =====================================================
  describe('ImplementerTaskSchema', () => {
    it('validates a complete task with all fields', () => {
      const valid = {
        taskId: 'T1',
        description: 'Create messages.ts',
        files: ['src/core/messages.ts'],
        acceptanceCriteria: ['Schema validates correctly'],
      };
      expect(() => ImplementerTaskSchema.parse(valid)).not.toThrow();
    });

    it('validates task without optional files field', () => {
      const valid = {
        taskId: 'T1',
        description: 'Create messages.ts',
        acceptanceCriteria: ['Schema validates correctly'],
      };
      const parsed = ImplementerTaskSchema.parse(valid);
      expect(parsed.files).toBeUndefined();
    });

    it('validates task with empty files array', () => {
      const valid = {
        taskId: 'T2',
        description: 'Refactor code',
        files: [],
        acceptanceCriteria: ['Tests pass'],
      };
      expect(() => ImplementerTaskSchema.parse(valid)).not.toThrow();
    });

    it('validates task with empty acceptanceCriteria', () => {
      const valid = {
        taskId: 'T3',
        description: 'Quick fix',
        acceptanceCriteria: [],
      };
      expect(() => ImplementerTaskSchema.parse(valid)).not.toThrow();
    });

    it('rejects task without taskId', () => {
      const invalid = { description: 'test', acceptanceCriteria: [] };
      expect(() => ImplementerTaskSchema.parse(invalid)).toThrow();
    });

    it('rejects task without description', () => {
      const invalid = { taskId: 'T1', acceptanceCriteria: [] };
      expect(() => ImplementerTaskSchema.parse(invalid)).toThrow();
    });

    it('rejects task without acceptanceCriteria', () => {
      const invalid = { taskId: 'T1', description: 'test' };
      expect(() => ImplementerTaskSchema.parse(invalid)).toThrow();
    });

    it('rejects task with non-string taskId', () => {
      const invalid = {
        taskId: 123,
        description: 'test',
        acceptanceCriteria: [],
      };
      expect(() => ImplementerTaskSchema.parse(invalid)).toThrow();
    });
  });

  // =====================================================
  // ImplementerResultSchema
  // =====================================================
  describe('ImplementerResultSchema', () => {
    it('validates a complete result with all fields', () => {
      const valid = makeImplementerResult({
        concern: 'Might break on Windows',
      });
      expect(() => ImplementerResultSchema.parse(valid)).not.toThrow();
    });

    it('validates a minimal result without optional concern', () => {
      const valid = makeImplementerResult();
      const parsed = ImplementerResultSchema.parse(valid);
      expect(parsed.concern).toBeUndefined();
      expect(parsed.confidence).toBe('HIGH');
    });

    it('validates result with empty arrays', () => {
      const valid = makeImplementerResult({
        filesModified: [],
        decisions: [],
        risks: [],
        notDone: [],
      });
      expect(() => ImplementerResultSchema.parse(valid)).not.toThrow();
    });

    it('validates all confidence levels', () => {
      for (const level of ['HIGH', 'MEDIUM', 'LOW']) {
        const valid = makeImplementerResult({ confidence: level });
        expect(() => ImplementerResultSchema.parse(valid)).not.toThrow();
      }
    });

    it('rejects result with invalid confidence level', () => {
      const invalid = makeImplementerResult({ confidence: 'MAYBE' });
      expect(() => ImplementerResultSchema.parse(invalid)).toThrow();
    });

    it('rejects result with missing taskId', () => {
      const invalid = makeImplementerResult();
      delete invalid.taskId;
      expect(() => ImplementerResultSchema.parse(invalid)).toThrow();
    });

    it('rejects result with non-boolean testsPassing', () => {
      const invalid = makeImplementerResult({ testsPassing: 'yes' });
      expect(() => ImplementerResultSchema.parse(invalid)).toThrow();
    });

    it('rejects result with malformed filesModified entry', () => {
      const invalid = makeImplementerResult({
        filesModified: [{ path: 'foo.ts' }], // missing reason
      });
      expect(() => ImplementerResultSchema.parse(invalid)).toThrow();
    });
  });

  // =====================================================
  // ReviewerTaskSchema
  // =====================================================
  describe('ReviewerTaskSchema', () => {
    it('validates a complete reviewer task with focusAreas', () => {
      const valid = {
        implementerResult: makeImplementerResult(),
        focusAreas: ['Security', 'Performance'],
      };
      expect(() => ReviewerTaskSchema.parse(valid)).not.toThrow();
    });

    it('validates reviewer task without optional focusAreas', () => {
      const valid = {
        implementerResult: makeImplementerResult(),
      };
      const parsed = ReviewerTaskSchema.parse(valid);
      expect(parsed.focusAreas).toBeUndefined();
    });

    it('rejects reviewer task with invalid implementerResult', () => {
      const invalid = {
        implementerResult: { taskId: 'T1' }, // missing required fields
      };
      expect(() => ReviewerTaskSchema.parse(invalid)).toThrow();
    });

    it('rejects reviewer task without implementerResult', () => {
      const invalid = { focusAreas: ['Security'] };
      expect(() => ReviewerTaskSchema.parse(invalid)).toThrow();
    });
  });

  // =====================================================
  // ReviewerResultSchema
  // =====================================================
  describe('ReviewerResultSchema', () => {
    it('validates a complete GREEN reviewer result', () => {
      const valid = {
        verdict: 'GREEN',
        testsRun: 50,
        testsPassing: 50,
        acceptanceCriteria: [
          { criterion: 'Schema validates', passed: true, note: 'All good' },
        ],
        blockers: [],
        suggestions: ['Consider adding more edge case tests'],
      };
      expect(() => ReviewerResultSchema.parse(valid)).not.toThrow();
    });

    it('validates a RED reviewer result with blockers', () => {
      const valid = {
        verdict: 'RED',
        testsRun: 10,
        testsPassing: 3,
        acceptanceCriteria: [
          { criterion: 'Tests pass', passed: false },
        ],
        blockers: ['7 tests failing', 'Type errors present'],
        suggestions: [],
      };
      const parsed = ReviewerResultSchema.parse(valid);
      expect(parsed.verdict).toBe('RED');
      expect(parsed.blockers).toHaveLength(2);
      expect(parsed.acceptanceCriteria[0].note).toBeUndefined();
    });

    it('validates a YELLOW reviewer result', () => {
      const valid = {
        verdict: 'YELLOW',
        testsRun: 20,
        testsPassing: 18,
        acceptanceCriteria: [],
        blockers: [],
        suggestions: ['Minor style issue'],
      };
      expect(() => ReviewerResultSchema.parse(valid)).not.toThrow();
    });

    it('rejects reviewer result with invalid verdict', () => {
      const invalid = {
        verdict: 'ORANGE',
        testsRun: 10,
        testsPassing: 10,
        acceptanceCriteria: [],
        blockers: [],
        suggestions: [],
      };
      expect(() => ReviewerResultSchema.parse(invalid)).toThrow();
    });

    it('rejects reviewer result with missing testsRun', () => {
      const invalid = {
        verdict: 'GREEN',
        testsPassing: 10,
        acceptanceCriteria: [],
        blockers: [],
        suggestions: [],
      };
      expect(() => ReviewerResultSchema.parse(invalid)).toThrow();
    });

    it('rejects reviewer result with non-number testsPassing', () => {
      const invalid = {
        verdict: 'GREEN',
        testsRun: 10,
        testsPassing: 'all',
        acceptanceCriteria: [],
        blockers: [],
        suggestions: [],
      };
      expect(() => ReviewerResultSchema.parse(invalid)).toThrow();
    });
  });

  // =====================================================
  // AgentMessageSchema
  // =====================================================
  describe('AgentMessageSchema', () => {
    it('validates a complete agent message with payload', () => {
      const valid = {
        from: 'manager',
        to: 'implementer',
        timestamp: '2026-03-03T02:30:00Z',
        payload: { taskId: 'T1', description: 'Do thing' },
      };
      expect(() => AgentMessageSchema.parse(valid)).not.toThrow();
    });

    it('validates agent message with null payload', () => {
      const valid = {
        from: 'reviewer',
        to: 'manager',
        timestamp: '2026-01-15T10:00:00.000Z',
        payload: null,
      };
      expect(() => AgentMessageSchema.parse(valid)).not.toThrow();
    });

    it('validates agent message with string payload', () => {
      const valid = {
        from: 'implementer',
        to: 'manager',
        timestamp: '2026-06-01T00:00:00Z',
        payload: 'simple string payload',
      };
      const parsed = AgentMessageSchema.parse(valid);
      expect(parsed.payload).toBe('simple string payload');
    });

    it('rejects agent message with invalid datetime format', () => {
      const invalid = {
        from: 'manager',
        to: 'implementer',
        timestamp: 'not-a-date',
        payload: {},
      };
      expect(() => AgentMessageSchema.parse(invalid)).toThrow();
    });

    it('rejects agent message with non-ISO timestamp', () => {
      const invalid = {
        from: 'manager',
        to: 'implementer',
        timestamp: '2026-03-03 02:30:00',
        payload: {},
      };
      expect(() => AgentMessageSchema.parse(invalid)).toThrow();
    });

    it('rejects agent message without from field', () => {
      const invalid = {
        to: 'implementer',
        timestamp: '2026-03-03T02:30:00Z',
        payload: {},
      };
      expect(() => AgentMessageSchema.parse(invalid)).toThrow();
    });

    it('rejects agent message without to field', () => {
      const invalid = {
        from: 'manager',
        timestamp: '2026-03-03T02:30:00Z',
        payload: {},
      };
      expect(() => AgentMessageSchema.parse(invalid)).toThrow();
    });
  });
});
