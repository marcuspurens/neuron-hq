import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import {
  bayesianUpdate,
  classifySource,
  updateConfidence,
  getConfidenceHistory,
  SOURCE_WEIGHTS,
  type ConfidenceEvidence,
} from '../../src/aurora/bayesian-confidence.js';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  bayesianUpdate                                                     */
/* ------------------------------------------------------------------ */

describe('bayesianUpdate', () => {
  it('returns higher confidence when evidence supports', () => {
    const result = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'academic',
      reason: 'test',
    });
    expect(result).toBeGreaterThan(0.5);
  });

  it('returns lower confidence when evidence contradicts', () => {
    const result = bayesianUpdate(0.5, {
      direction: 'contradicts',
      sourceType: 'academic',
      reason: 'test',
    });
    expect(result).toBeLessThan(0.5);
  });

  it('academic source has larger effect than blog', () => {
    const academicResult = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'academic',
      reason: 'test',
    });
    const blogResult = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'blog',
      reason: 'test',
    });
    const academicDelta = Math.abs(academicResult - 0.5);
    const blogDelta = Math.abs(blogResult - 0.5);
    expect(academicDelta).toBeGreaterThan(blogDelta);
  });

  it('from 0.5 with supports academic gives approx 0.5622', () => {
    const result = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'academic',
      reason: 'test',
    });
    expect(result).toBeCloseTo(0.5622, 3);
  });

  it('stays within (0, 1) at extremes', () => {
    const low = bayesianUpdate(0.001, {
      direction: 'contradicts',
      sourceType: 'academic',
      reason: 'test',
    });
    expect(low).toBeGreaterThan(0);

    const high = bayesianUpdate(0.999, {
      direction: 'supports',
      sourceType: 'academic',
      reason: 'test',
    });
    expect(high).toBeLessThan(1);
  });

  it('is approximately symmetric: supports then contradicts returns near start', () => {
    const after1 = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'academic',
      reason: 'test',
    });
    const after2 = bayesianUpdate(after1, {
      direction: 'contradicts',
      sourceType: 'academic',
      reason: 'test',
    });
    expect(Math.abs(after2 - 0.5)).toBeLessThan(0.01);
  });

  it('respects custom weight override', () => {
    const highWeight = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'blog',
      reason: 'test',
      weight: 0.5,
    });
    const lowWeight = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'blog',
      reason: 'test',
      weight: 0.1,
    });
    expect(highWeight).not.toBe(lowWeight);
  });
});

/* ------------------------------------------------------------------ */
/*  classifySource                                                     */
/* ------------------------------------------------------------------ */

describe('classifySource', () => {
  it('returns academic for arxiv.org', () => {
    expect(classifySource('https://arxiv.org/abs/1234')).toBe('academic');
  });

  it('returns encyclopedia for wikipedia.org', () => {
    expect(classifySource('https://en.wikipedia.org/wiki/Test')).toBe('encyclopedia');
  });

  it('returns official for .gov domains', () => {
    expect(classifySource('https://www.fda.gov/drugs')).toBe('official');
  });

  it('returns news for reuters.com', () => {
    expect(classifySource('https://www.reuters.com/article')).toBe('news');
  });

  it('returns blog for unknown URLs', () => {
    expect(classifySource('https://myblog.com/post')).toBe('blog');
  });

  it('returns anecdotal for null', () => {
    expect(classifySource(null)).toBe('anecdotal');
  });
});

/* ------------------------------------------------------------------ */
/*  updateConfidence                                                   */
/* ------------------------------------------------------------------ */

describe('updateConfidence', () => {
  const evidence: ConfidenceEvidence = {
    direction: 'supports',
    sourceType: 'academic',
    reason: 'Peer-reviewed study',
  };

  it('updates node confidence in DB', async () => {
    // First call: SELECT returns existing node
    mockQuery
      .mockResolvedValueOnce({ rows: [{ confidence: 0.5 }] })
      // Second call: UPDATE
      .mockResolvedValueOnce({ rowCount: 1 })
      // Third call: INSERT audit
      .mockResolvedValueOnce({ rowCount: 1 });

    await updateConfidence('node-1', evidence);

    // Verify UPDATE was called with new confidence
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE aurora_nodes SET confidence');
    expect(updateCall[1][0]).toBeGreaterThan(0.5); // new confidence
    expect(updateCall[1][1]).toBe('node-1');

    // Verify INSERT was called
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO confidence_audit');
  });

  it('creates audit entry', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ confidence: 0.5 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    await updateConfidence('node-1', evidence);

    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO confidence_audit');
    const params = insertCall[1];
    expect(params[0]).toBe('node-1');          // node_id
    expect(params[1]).toBe(0.5);               // old_confidence
    expect(params[2]).toBeGreaterThan(0.5);    // new_confidence
    expect(params[3]).toBe('supports');         // direction
    expect(params[4]).toBe('academic');         // source_type
    expect(params[5]).toBe(SOURCE_WEIGHTS.academic); // weight
    expect(params[6]).toBe('Peer-reviewed study');   // reason
  });

  it('throws for missing node', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(updateConfidence('nonexistent', evidence)).rejects.toThrow(
      'Aurora node not found',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  getConfidenceHistory                                               */
/* ------------------------------------------------------------------ */

describe('getConfidenceHistory', () => {
  it('returns entries ordered by timestamp', async () => {
    const ts1 = new Date('2026-03-10T10:00:00Z');
    const ts2 = new Date('2026-03-09T10:00:00Z');

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          node_id: 'node-1',
          old_confidence: 0.5,
          new_confidence: 0.56,
          direction: 'supports',
          source_type: 'academic',
          weight: 0.25,
          reason: 'Study confirmed',
          metadata: {},
          timestamp: ts1,
        },
        {
          node_id: 'node-1',
          old_confidence: 0.56,
          new_confidence: 0.50,
          direction: 'contradicts',
          source_type: 'blog',
          weight: 0.06,
          reason: 'Blog disputed',
          metadata: {},
          timestamp: ts2,
        },
      ],
    });

    const result = await getConfidenceHistory('node-1');

    expect(result).toHaveLength(2);
    // Verify camelCase mapping
    expect(result[0].nodeId).toBe('node-1');
    expect(result[0].oldConfidence).toBe(0.5);
    expect(result[0].newConfidence).toBe(0.56);
    expect(result[0].direction).toBe('supports');
    expect(result[0].sourceType).toBe('academic');
    expect(result[0].weight).toBe(0.25);
    expect(result[0].reason).toBe('Study confirmed');
    expect(result[0].metadata).toEqual({});
    expect(result[0].timestamp).toBe(ts1.toISOString());

    expect(result[1].nodeId).toBe('node-1');
    expect(result[1].sourceType).toBe('blog');
    expect(result[1].timestamp).toBe(ts2.toISOString());
  });

  it('respects limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getConfidenceHistory('node1', 5);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0][1];
    expect(params[1]).toBe(5);
  });
});
