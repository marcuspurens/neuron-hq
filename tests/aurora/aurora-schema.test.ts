import { describe, it, expect } from 'vitest';
import {
  AuroraNodeSchema,
  AuroraEdgeSchema,
  AuroraGraphSchema,
  AuroraNodeTypeSchema,
  AuroraScopeSchema,
  AuroraEdgeTypeSchema,
} from '../../src/aurora/aurora-schema.js';

describe('AuroraNodeTypeSchema', () => {
  it('accepts valid node types', () => {
    for (const t of ['document', 'transcript', 'fact', 'preference', 'research', 'voice_print']) {
      expect(AuroraNodeTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid node type', () => {
    expect(() => AuroraNodeTypeSchema.parse('pattern')).toThrow();
    expect(() => AuroraNodeTypeSchema.parse('unknown')).toThrow();
  });
});

describe('AuroraScopeSchema', () => {
  it('accepts valid scopes', () => {
    for (const s of ['personal', 'shared', 'project']) {
      expect(AuroraScopeSchema.parse(s)).toBe(s);
    }
  });

  it('rejects invalid scope', () => {
    expect(() => AuroraScopeSchema.parse('universal')).toThrow();
  });
});

describe('AuroraEdgeTypeSchema', () => {
  it('accepts valid edge types', () => {
    for (const t of ['related_to', 'derived_from', 'references', 'contradicts', 'supports']) {
      expect(AuroraEdgeTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid edge type', () => {
    expect(() => AuroraEdgeTypeSchema.parse('solves')).toThrow();
  });
});

describe('AuroraNodeSchema', () => {
  const validNode = {
    id: 'doc-001',
    type: 'document',
    title: 'Test Document',
    properties: { source: 'test' },
    confidence: 0.8,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  it('validates a correct node', () => {
    const result = AuroraNodeSchema.parse(validNode);
    expect(result.id).toBe('doc-001');
    expect(result.type).toBe('document');
  });

  it('defaults scope to personal', () => {
    const result = AuroraNodeSchema.parse(validNode);
    expect(result.scope).toBe('personal');
  });

  it('accepts explicit scope', () => {
    const result = AuroraNodeSchema.parse({ ...validNode, scope: 'shared' });
    expect(result.scope).toBe('shared');
  });

  it('accepts sourceUrl as null', () => {
    const result = AuroraNodeSchema.parse({ ...validNode, sourceUrl: null });
    expect(result.sourceUrl).toBeNull();
  });

  it('accepts sourceUrl as string', () => {
    const result = AuroraNodeSchema.parse({ ...validNode, sourceUrl: 'https://example.com' });
    expect(result.sourceUrl).toBe('https://example.com');
  });

  it('accepts sourceUrl as undefined', () => {
    const result = AuroraNodeSchema.parse(validNode);
    expect(result.sourceUrl).toBeUndefined();
  });

  it('rejects confidence > 1', () => {
    expect(() => AuroraNodeSchema.parse({ ...validNode, confidence: 1.5 })).toThrow();
  });

  it('rejects confidence < 0', () => {
    expect(() => AuroraNodeSchema.parse({ ...validNode, confidence: -0.1 })).toThrow();
  });

  it('rejects empty id', () => {
    expect(() => AuroraNodeSchema.parse({ ...validNode, id: '' })).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => AuroraNodeSchema.parse({ ...validNode, title: '' })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() => AuroraNodeSchema.parse({ ...validNode, type: 'error' })).toThrow();
  });
});

describe('AuroraEdgeSchema', () => {
  const validEdge = {
    from: 'doc-001',
    to: 'fact-001',
    type: 'derived_from',
  };

  it('validates a correct edge', () => {
    const result = AuroraEdgeSchema.parse(validEdge);
    expect(result.from).toBe('doc-001');
    expect(result.to).toBe('fact-001');
    expect(result.type).toBe('derived_from');
  });

  it('defaults metadata to empty object', () => {
    const result = AuroraEdgeSchema.parse(validEdge);
    expect(result.metadata).toEqual({});
  });

  it('accepts metadata with extra fields (passthrough)', () => {
    const result = AuroraEdgeSchema.parse({
      ...validEdge,
      metadata: { createdBy: 'intake', custom: 'value' },
    });
    expect(result.metadata.createdBy).toBe('intake');
    expect((result.metadata as Record<string, unknown>).custom).toBe('value');
  });

  it('rejects invalid edge type', () => {
    expect(() => AuroraEdgeSchema.parse({ ...validEdge, type: 'causes' })).toThrow();
  });

  it('rejects empty from', () => {
    expect(() => AuroraEdgeSchema.parse({ ...validEdge, from: '' })).toThrow();
  });
});

describe('AuroraGraphSchema', () => {
  it('validates an empty graph', () => {
    const result = AuroraGraphSchema.parse({
      nodes: [],
      edges: [],
      lastUpdated: new Date().toISOString(),
    });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('validates a graph with nodes and edges', () => {
    const now = new Date().toISOString();
    const result = AuroraGraphSchema.parse({
      nodes: [{
        id: 'doc-001',
        type: 'document',
        title: 'Test',
        properties: {},
        confidence: 0.5,
        created: now,
        updated: now,
      }],
      edges: [],
      lastUpdated: now,
    });
    expect(result.nodes).toHaveLength(1);
  });
});
