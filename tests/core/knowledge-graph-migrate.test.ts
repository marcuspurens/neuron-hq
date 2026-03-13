import { describe, it, expect } from 'vitest';
import {
  migratePatterns,
  migrateErrors,
  migrateAll,
} from '../../src/core/knowledge-graph-migrate.js';

// --- Test fixtures ---

const singlePatternMd = `## Retry mechanism
**Kontext:** When API calls fail
**Lösning:** Retry with backoff
**Effekt:** Improved reliability
**Keywords:** retry, backoff, resilience
**Bekräftelser:** 5
**Körningar:** #11, #12`;

const multiConfidenceMd = `## Zero confirmations
**Bekräftelser:** 0
---
## Three confirmations
**Bekräftelser:** 3
---
## Ten confirmations
**Bekräftelser:** 10`;

const withUpdateMd = `## Active Pattern
**Bekräftelser:** 1
---
## [UPPDATERING] Old Pattern
**Bekräftelser:** 2`;

const withObsoletMd = `## Active Pattern
**Bekräftelser:** 1
---
## [OBSOLET] Deprecated Pattern
**Bekräftelser:** 2`;

const errorMd = `## Config timeout error
**Session:** 42
**Symptom:** Request times out after 30s
**Orsak:** Missing proxy config
**Lösning:** Add proxy settings to env
**Status:** Löst
**Keywords:** timeout, proxy
**Bekräftelser:** 2
**Körningar:** #15`;

const patternWithRelatera = `## Pattern Alpha
**Kontext:** Context A
**Bekräftelser:** 1
**Körningar:** #11
**Relaterat:** errors.md#Config timeout error`;

const errorWithRelateratMd = `## Config timeout error
**Session:** 42
**Symptom:** Timeout
**Orsak:** Bad config
**Status:** Löst
**Bekräftelser:** 2
**Körningar:** #11`;

// --- Tests ---

describe('migratePatterns', () => {
  it('returns empty nodes and edges for empty string', () => {
    const result = migratePatterns('');
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('creates one pattern node with correct id pattern-001', () => {
    const result = migratePatterns(singlePatternMd);
    const patterns = result.nodes.filter((n) => n.type === 'pattern');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe('pattern-001');
  });

  it('extracts section title from ## heading', () => {
    const result = migratePatterns(singlePatternMd);
    const pattern = result.nodes.find((n) => n.id === 'pattern-001');
    expect(pattern?.title).toBe('Retry mechanism');
  });

  it('maps 0 confirmations to confidence 0.5', () => {
    const result = migratePatterns(multiConfidenceMd);
    const node = result.nodes.find((n) => n.id === 'pattern-001');
    expect(node?.confidence).toBe(0.5);
  });

  it('maps 3 confirmations to confidence 0.7', () => {
    const result = migratePatterns(multiConfidenceMd);
    const node = result.nodes.find((n) => n.id === 'pattern-002');
    expect(node?.confidence).toBe(0.7);
  });

  it('maps 10 confirmations to confidence 0.95', () => {
    const result = migratePatterns(multiConfidenceMd);
    const node = result.nodes.find((n) => n.id === 'pattern-003');
    expect(node?.confidence).toBe(0.95);
  });

  it('parses Keywords as an array', () => {
    const result = migratePatterns(singlePatternMd);
    const pattern = result.nodes.find((n) => n.id === 'pattern-001');
    expect(pattern?.properties.keywords).toEqual([
      'retry',
      'backoff',
      'resilience',
    ]);
  });

  it('creates run nodes and discovered_in edges from Körningar', () => {
    const result = migratePatterns(singlePatternMd);
    const runNodes = result.nodes.filter((n) => n.type === 'run');
    expect(runNodes).toHaveLength(2);
    expect(runNodes.map((n) => n.id).sort()).toEqual(['run-011', 'run-012']);

    const discoveredEdges = result.edges.filter(
      (e) => e.type === 'discovered_in',
    );
    expect(discoveredEdges).toHaveLength(2);
    expect(
      discoveredEdges.find(
        (e) => e.from === 'pattern-001' && e.to === 'run-011',
      ),
    ).toBeDefined();
    expect(
      discoveredEdges.find(
        (e) => e.from === 'pattern-001' && e.to === 'run-012',
      ),
    ).toBeDefined();
  });

  it('skips sections with [UPPDATERING]', () => {
    const result = migratePatterns(withUpdateMd);
    const patterns = result.nodes.filter((n) => n.type === 'pattern');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].title).toBe('Active Pattern');
  });

  it('skips sections with [OBSOLET]', () => {
    const result = migratePatterns(withObsoletMd);
    const patterns = result.nodes.filter((n) => n.type === 'pattern');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].title).toBe('Active Pattern');
  });
});

describe('migrateErrors', () => {
  it('extracts error-specific fields (Session, Symptom, Orsak, Status)', () => {
    const result = migrateErrors(errorMd);
    const errorNode = result.nodes.find((n) => n.type === 'error');
    expect(errorNode).toBeDefined();
    expect(errorNode?.properties.session).toBe('42');
    expect(errorNode?.properties.symptom).toBe('Request times out after 30s');
    expect(errorNode?.properties.orsak).toBe('Missing proxy config');
    expect(errorNode?.properties.status).toBe('Löst');
  });

  it('error nodes get error- prefix', () => {
    const result = migrateErrors(errorMd);
    const errorNodes = result.nodes.filter((n) => n.type === 'error');
    expect(errorNodes).toHaveLength(1);
    expect(errorNodes[0].id).toBe('error-001');
  });
});

describe('migrateAll', () => {
  it('creates both pattern and error nodes', () => {
    const result = migrateAll(singlePatternMd, errorMd);
    const patterns = result.nodes.filter((n) => n.type === 'pattern');
    const errors = result.nodes.filter((n) => n.type === 'error');
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates run nodes across files', () => {
    const result = migrateAll(patternWithRelatera, errorWithRelateratMd);
    const runNodes = result.nodes.filter((n) => n.type === 'run');
    const run011 = runNodes.filter((n) => n.id === 'run-011');
    expect(run011).toHaveLength(1);
  });

  it('resolves Relaterat cross-file edges', () => {
    const result = migrateAll(patternWithRelatera, errorWithRelateratMd);
    const relatedEdges = result.edges.filter((e) => e.type === 'related_to');
    const crossRef = relatedEdges.find(
      (e) => e.from === 'pattern-001' && e.to === 'error-001',
    );
    expect(crossRef).toBeDefined();
  });
});
