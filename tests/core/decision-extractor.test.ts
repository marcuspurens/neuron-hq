import { describe, it, expect } from 'vitest';
import {
  extractDecisions,
  buildDecisionChain,
  type Decision,
  type AuditEntry,
  type EventData,
  type DecisionType,
} from '../../src/core/decision-extractor.js';

describe('decision-extractor', () => {
  // =====================================================
  // extractDecisions
  // =====================================================
  describe('extractDecisions', () => {
    it('returns empty array for empty inputs', () => {
      const result = extractDecisions('', [], []);
      expect(result).toEqual([]);
    });

    it('extracts decisions from "I\'ll" intent patterns', () => {
      const text = "I'll delegate T1 to the implementer.";
      const result = extractDecisions(text, [], [], 'run1', 'manager');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].what).toContain('delegate T1 to the implementer');
      expect(result[0].type).toBe('tool_choice');
    });

    it('extracts decisions from "I should" patterns', () => {
      const text = 'I should use vitest for testing.';
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].what).toContain('use vitest for testing');
    });

    it('extracts decisions from "I need to" patterns', () => {
      const text = 'I need to fix the failing tests first.';
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].what).toContain('fix the failing tests first');
    });

    it('extracts "why" from "Because" patterns', () => {
      const text =
        "I'll split into two tasks. Because the brief has independent parts.";
      const result = extractDecisions(text, [], [], 'run1', 'manager');
      expect(result[0].why).toContain('the brief has independent parts');
    });

    it('extracts "why" from "Since" patterns', () => {
      const text = "I'll use Zod. Since it is already a project dependency.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].why).toContain('already a project dependency');
    });

    it('extracts alternatives from "Instead of" patterns', () => {
      const text =
        "I'll use regex parsing. Instead of using a full AST parser.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].alternatives).toBeDefined();
      expect(result[0].alternatives![0]).toContain('using a full AST parser');
    });

    it('extracts alternatives from "Rather than" patterns', () => {
      const text =
        "I'll write unit tests. Rather than integration tests for now.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].alternatives).toBeDefined();
      expect(result[0].alternatives![0]).toContain('integration tests');
    });

    it('detects low confidence from "Unsure" keyword', () => {
      const text = "Unsure about the approach. I'll try regex first.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].confidence).toBe('low');
    });

    it('detects low confidence from "Not sure" keyword', () => {
      const text = "Not sure this will work. I'll attempt it anyway.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].confidence).toBe('low');
    });

    it('detects high confidence from "Clearly" keyword', () => {
      const text = "Clearly the best approach. I'll use the existing pattern.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].confidence).toBe('high');
    });

    it('detects high confidence from "Obviously" keyword', () => {
      const text = "Obviously we need tests. I'll write them first.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].confidence).toBe('high');
    });

    it('defaults confidence to medium when no signals present', () => {
      const text = "I'll create the file now.";
      const result = extractDecisions(text, [], [], 'run1', 'implementer');
      expect(result[0].confidence).toBe('medium');
    });

    it('generates sequential IDs with padded numbers', () => {
      const text =
        "I'll do step one. I'll do step two. I'll do step three.";
      const result = extractDecisions(text, [], [], 'myrun', 'agent');
      expect(result[0].id).toBe('d-myrun-001');
      expect(result[1].id).toBe('d-myrun-002');
      expect(result[2].id).toBe('d-myrun-003');
    });

    it('defaults runid to "unknown" when not provided', () => {
      const text = "I'll do something.";
      const result = extractDecisions(text, [], []);
      expect(result[0].id).toMatch(/^d-unknown-\d{3}$/);
    });

    it('defaults agent to "unknown" when not provided', () => {
      const text = "I'll do something.";
      const result = extractDecisions(text, [], []);
      expect(result[0].agent).toBe('unknown');
    });

    it('truncates thinkingSnippet to 500 characters', () => {
      const longIntent = 'A'.repeat(600);
      const text = `I'll ${longIntent}.`;
      const result = extractDecisions(text, [], [], 'run1', 'agent');
      expect(result[0].thinkingSnippet!.length).toBeLessThanOrEqual(500);
    });

    // ── Audit entry extraction ──

    it('extracts delegation decisions from audit delegate_to_* tools', () => {
      const audit: AuditEntry[] = [
        {
          ts: '2024-01-01T00:00:00Z',
          role: 'manager',
          tool: 'delegate_to_implementer',
          allowed: true,
        },
      ];
      const result = extractDecisions('', audit, [], 'run1', 'manager');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('delegation');
      expect(result[0].what).toContain('implementer');
      expect(result[0].auditRefs).toContain('2024-01-01T00:00:00Z');
    });

    it('extracts review decisions from reviewer role', () => {
      const audit: AuditEntry[] = [
        {
          ts: '2024-01-01T01:00:00Z',
          role: 'reviewer',
          tool: 'approve_change',
          allowed: true,
        },
      ];
      const result = extractDecisions('', audit, [], 'run1', 'reviewer');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('review');
    });

    it('extracts fix decisions when same tool retried after failure', () => {
      const audit: AuditEntry[] = [
        {
          ts: '2024-01-01T00:00:00Z',
          role: 'implementer',
          tool: 'bash_exec',
          allowed: false,
        },
        {
          ts: '2024-01-01T00:01:00Z',
          role: 'implementer',
          tool: 'bash_exec',
          allowed: true,
        },
      ];
      const result = extractDecisions('', audit, [], 'run1', 'implementer');
      expect(result.some((d) => d.type === 'fix')).toBe(true);
    });

    // ── Event extraction ──

    it('extracts plan decisions from plan_created events', () => {
      const events: EventData[] = [
        {
          event: 'plan_created',
          data: { taskCount: 3, agent: 'manager', reason: 'Brief has 3 parts' },
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      const result = extractDecisions('', [], events, 'run1', 'manager');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('plan');
      expect(result[0].what).toContain('3 tasks');
    });

    it('extracts escalation decisions from escalation events', () => {
      const events: EventData[] = [
        {
          event: 'escalation',
          data: { agent: 'implementer', reason: 'Tests keep failing' },
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      const result = extractDecisions('', [], events, 'run1', 'implementer');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('escalation');
      expect(result[0].confidence).toBe('low');
    });

    it('combines decisions from thinking, audit, and events', () => {
      const text = "I'll use regex for parsing.";
      const audit: AuditEntry[] = [
        {
          ts: '2024-01-01T00:00:00Z',
          role: 'manager',
          tool: 'delegate_to_implementer',
          allowed: true,
        },
      ];
      const events: EventData[] = [
        {
          event: 'plan_created',
          data: { taskCount: 2 },
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      const result = extractDecisions(text, audit, events, 'run1', 'manager');
      const types = result.map((d) => d.type);
      expect(types).toContain('tool_choice');
      expect(types).toContain('delegation');
      expect(types).toContain('plan');
    });

    it('assigns auditRefs to thinking-derived decisions when audit entries exist', () => {
      const text = "I'll parse the file.";
      const audit: AuditEntry[] = [
        {
          ts: '2024-01-01T00:00:00Z',
          role: 'implementer',
          tool: 'read_file',
          allowed: true,
        },
      ];
      const result = extractDecisions(text, audit, [], 'run1', 'implementer');
      const thinkingDecision = result.find((d) => d.type === 'tool_choice');
      expect(thinkingDecision?.auditRefs).toBeDefined();
      expect(thinkingDecision?.auditRefs!.length).toBeGreaterThan(0);
    });
  });

  // =====================================================
  // buildDecisionChain
  // =====================================================
  describe('buildDecisionChain', () => {
    it('returns empty tree for empty array', () => {
      const tree = buildDecisionChain([]);
      expect(tree.root).toBeNull();
      expect(tree.children.size).toBe(0);
      expect(tree.orphans).toEqual([]);
    });

    it('sets plan decision as root', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.root).toBe(decisions[0]);
    });

    it('attaches delegation as child of plan root', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        makeDecision('d-r-002', 'delegation', 'manager', 'Delegated to implementer'),
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.root?.id).toBe('d-r-001');
      expect(tree.children.get('d-r-001')).toHaveLength(1);
      expect(tree.children.get('d-r-001')![0].id).toBe('d-r-002');
    });

    it('attaches review as child of plan root', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        makeDecision('d-r-002', 'review', 'reviewer'),
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.children.get('d-r-001')).toHaveLength(1);
      expect(tree.children.get('d-r-001')![0].type).toBe('review');
    });

    it('attaches tool_choice as child of agent delegation', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        makeDecision('d-r-002', 'delegation', 'manager', 'Delegated to implementer'),
        makeDecision('d-r-003', 'tool_choice', 'implementer'),
      ];
      const tree = buildDecisionChain(decisions);
      // tool_choice by implementer → child of delegation to implementer
      expect(tree.children.get('d-r-002')).toHaveLength(1);
      expect(tree.children.get('d-r-002')![0].id).toBe('d-r-003');
    });

    it('attaches fix as child of agent delegation', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        makeDecision('d-r-002', 'delegation', 'manager', 'Delegated to implementer'),
        makeDecision('d-r-003', 'fix', 'implementer'),
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.children.get('d-r-002')).toHaveLength(1);
      expect(tree.children.get('d-r-002')![0].type).toBe('fix');
    });

    it('attaches escalation as child of agent delegation', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        makeDecision('d-r-002', 'delegation', 'manager', 'Delegated to implementer'),
        makeDecision('d-r-003', 'escalation', 'implementer'),
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.children.get('d-r-002')).toHaveLength(1);
      expect(tree.children.get('d-r-002')![0].type).toBe('escalation');
    });

    it('places decisions without parent in orphans', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'tool_choice', 'unknown_agent'),
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.root).toBeNull();
      expect(tree.orphans).toHaveLength(1);
    });

    it('uses existing parentId if already set', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        { ...makeDecision('d-r-002', 'tool_choice', 'implementer'), parentId: 'd-r-001' },
      ];
      const tree = buildDecisionChain(decisions);
      expect(tree.children.get('d-r-001')).toHaveLength(1);
    });

    it('handles complex tree with multiple agents', () => {
      const decisions: Decision[] = [
        makeDecision('d-r-001', 'plan', 'manager'),
        makeDecision('d-r-002', 'delegation', 'manager', 'Delegated to implementer'),
        makeDecision('d-r-003', 'delegation', 'manager', 'Delegated to reviewer'),
        makeDecision('d-r-004', 'tool_choice', 'implementer'),
        makeDecision('d-r-005', 'tool_choice', 'implementer'),
        makeDecision('d-r-006', 'review', 'reviewer'),
      ];
      const tree = buildDecisionChain(decisions);

      // Root is plan
      expect(tree.root?.id).toBe('d-r-001');

      // 2 delegations + 1 review under root
      const rootChildren = tree.children.get('d-r-001') || [];
      expect(rootChildren).toHaveLength(3);

      // 2 tool_choices under implementer delegation
      const implChildren = tree.children.get('d-r-002') || [];
      expect(implChildren).toHaveLength(2);

      expect(tree.orphans).toHaveLength(0);
    });
  });
});

// ── Test Helpers ──────────────────────────────────────────

function makeDecision(
  id: string,
  type: DecisionType,
  agent: string,
  what?: string,
): Decision {
  return {
    id,
    timestamp: '2024-01-01T00:00:00Z',
    agent,
    type,
    what: what || `Decision ${id}`,
    why: '',
    confidence: 'medium',
  };
}
