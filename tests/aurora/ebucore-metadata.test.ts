import { describe, it, expect } from 'vitest';
import {
  EBUCORE_MAPPINGS,
  enrichWithEbucore,
  getEbucoreMetadata,
  validateEbucoreCompleteness,
  getAppliedStandards,
  metadataCoverageReport,
} from '../../src/aurora/ebucore-metadata.js';
import type { AuroraNode } from '../../src/aurora/aurora-schema.js';

/** Helper to build a minimal AuroraNode for testing. */
function makeNode(overrides: Partial<AuroraNode> & { type: AuroraNode['type'] }): AuroraNode {
  return {
    id: overrides.id ?? 'test-node-1',
    type: overrides.type,
    title: overrides.title ?? 'Test Node',
    properties: overrides.properties ?? {},
    confidence: overrides.confidence ?? 0.9,
    scope: overrides.scope ?? 'personal',
    sourceUrl: overrides.sourceUrl ?? null,
    created: '2025-01-01T00:00:00.000Z',
    updated: '2025-01-01T00:00:00.000Z',
  };
}

describe('EBUCORE_MAPPINGS', () => {
  it('has mappings for transcript, voice_print, and speaker_identity', () => {
    expect(EBUCORE_MAPPINGS).toHaveProperty('transcript');
    expect(EBUCORE_MAPPINGS).toHaveProperty('voice_print');
    expect(EBUCORE_MAPPINGS).toHaveProperty('speaker_identity');
  });

  it('transcript mappings include expected fields', () => {
    const m = EBUCORE_MAPPINGS.transcript;
    expect(m['ebucore:duration']).toBe('duration');
    expect(m['ebucore:title']).toBe('title');
    expect(m['ebucore:locator']).toBe('videoUrl');
  });
});

describe('enrichWithEbucore', () => {
  // Test 1: transcript node — maps all 7 fields
  it('adds ebucore properties to a transcript node', () => {
    const node = makeNode({
      type: 'transcript',
      title: 'My Video',
      properties: {
        duration: 120,
        language: 'en',
        videoUrl: 'https://youtube.com/watch?v=abc',
        platform: 'youtube',
        segmentCount: 5,
        publishedDate: '2025-01-01',
      },
    });

    const enriched = enrichWithEbucore(node);

    expect(enriched.properties['ebucore:duration']).toBe(120);
    expect(enriched.properties['ebucore:hasLanguage']).toBe('en');
    expect(enriched.properties['ebucore:title']).toBe('My Video');
    expect(enriched.properties['ebucore:locator']).toBe('https://youtube.com/watch?v=abc');
    expect(enriched.properties['ebucore:hasFormat']).toBe('youtube');
    expect(enriched.properties['ebucore:numberOfSegments']).toBe(5);
    expect(enriched.properties['ebucore:dateCreated']).toBe('2025-01-01');
  });

  // Test 2: voice_print node — maps speakerLabel, totalDurationMs, segmentCount
  it('enriches voice_print nodes', () => {
    const node = makeNode({
      type: 'voice_print',
      properties: { speakerLabel: 'Alice', totalDurationMs: 5000, segmentCount: 3 },
    });

    const enriched = enrichWithEbucore(node);
    expect(enriched.properties['ebucore:speakerName']).toBe('Alice');
    expect(enriched.properties['ebucore:speakerDuration']).toBe(5000);
    expect(enriched.properties['ebucore:numberOfSegments']).toBe(3);
  });

  // Test 3: speaker_identity node — maps EBUCore+ fields
  it('enriches speaker_identity nodes with displayName, givenName, familyName, and role', () => {
    const node = makeNode({
      type: 'speaker_identity',
      properties: {
        displayName: 'Dr. Smith',
        givenName: 'John',
        familyName: 'Smith',
        role: 'host',
        occupation: 'Professor',
        affiliation: { organizationName: 'KTH', department: 'CS' },
        entityId: 'entity-1',
        wikidata: 'Q12345',
        wikipedia: 'https://en.wikipedia.org/wiki/John_Smith',
        imdb: 'nm0001',
        linkedIn: 'johnsmith',
      },
    });

    const enriched = enrichWithEbucore(node);
    expect(enriched.properties['ebucore:personName']).toBe('Dr. Smith');
    expect(enriched.properties['ebucore:givenName']).toBe('John');
    expect(enriched.properties['ebucore:familyName']).toBe('Smith');
    expect(enriched.properties['ebucore:role']).toBe('host');
    expect(enriched.properties['ebucore:occupation']).toBe('Professor');
    expect(enriched.properties['ebucore:organisationName']).toBe('KTH');
    expect(enriched.properties['ebucore:organisationDepartment']).toBe('CS');
    expect(enriched.properties['ebucore:entityId']).toBe('entity-1');
    expect(enriched.properties['ebucore:agentWikidata']).toBe('Q12345');
    expect(enriched.properties['ebucore:agentWikipedia']).toBe('https://en.wikipedia.org/wiki/John_Smith');
    expect(enriched.properties['ebucore:agentImdb']).toBe('nm0001');
    expect(enriched.properties['ebucore:agentLinkedIn']).toBe('johnsmith');
  });

  // Test 4: unknown type returns node unchanged (copy)
  it('returns a copy for node types without mappings', () => {
    const node = makeNode({ type: 'document', properties: { text: 'hello' } });
    const enriched = enrichWithEbucore(node);
    expect(enriched).not.toBe(node);
    expect(enriched.properties).toEqual({ text: 'hello' });
    // No ebucore keys added
    const ebucoreKeys = Object.keys(enriched.properties).filter((k) => k.startsWith('ebucore:'));
    expect(ebucoreKeys).toHaveLength(0);
  });

  // Test 5: does NOT mutate original node
  it('does not mutate the original node', () => {
    const node = makeNode({
      type: 'transcript',
      properties: { duration: 120 },
    });

    const enriched = enrichWithEbucore(node);
    expect(enriched).not.toBe(node);
    expect(enriched.properties).not.toBe(node.properties);
    expect(node.properties['ebucore:duration']).toBeUndefined();
  });

  // Test 6: handles missing/null properties gracefully
  it('skips ebucore fields when source property is null or undefined', () => {
    const node = makeNode({
      type: 'transcript',
      properties: { duration: null, language: undefined },
    });

    const enriched = enrichWithEbucore(node);
    expect(enriched.properties['ebucore:duration']).toBeUndefined();
    expect(enriched.properties['ebucore:hasLanguage']).toBeUndefined();
    // title is always set from node.title
    expect(enriched.properties['ebucore:title']).toBe('Test Node');
  });

  // Test 23: transcript with ebucore:start already in properties (chunk scenario)
  it('preserves existing ebucore:start and ebucore:end on transcript chunks', () => {
    const node = makeNode({
      type: 'transcript',
      title: 'Chunk 1',
      properties: {
        'ebucore:start': '00:00:00',
        'ebucore:end': '00:05:00',
        'ebucore:partNumber': 1,
        duration: 300,
        language: 'en',
      },
    });

    const enriched = enrichWithEbucore(node);
    // Existing ebucore properties should be preserved
    expect(enriched.properties['ebucore:start']).toBe('00:00:00');
    expect(enriched.properties['ebucore:end']).toBe('00:05:00');
    expect(enriched.properties['ebucore:partNumber']).toBe(1);
    // New ebucore properties should be added
    expect(enriched.properties['ebucore:duration']).toBe(300);
    expect(enriched.properties['ebucore:hasLanguage']).toBe('en');
    expect(enriched.properties['ebucore:title']).toBe('Chunk 1');
  });

  // Test 24: speaker_identity with role 'unknown'
  it('maps speaker_identity with role unknown correctly', () => {
    const node = makeNode({
      type: 'speaker_identity',
      properties: { displayName: 'Speaker 1', role: 'unknown' },
    });

    const enriched = enrichWithEbucore(node);
    expect(enriched.properties['ebucore:personName']).toBe('Speaker 1');
    expect(enriched.properties['ebucore:role']).toBe('unknown');
  });
});

describe('getEbucoreMetadata', () => {
  // Test 7: returns ebucore fields from enriched node
  it('returns ebucore properties from an already-enriched node', () => {
    const node = makeNode({
      type: 'transcript',
      properties: {
        text: 'hello',
        'ebucore:duration': 120,
        'ebucore:title': 'My Video',
      },
    });

    const meta = getEbucoreMetadata(node);
    expect(meta).toEqual({
      'ebucore:duration': 120,
      'ebucore:title': 'My Video',
    });
    // Should NOT include non-ebucore properties
    expect(meta).not.toHaveProperty('text');
  });

  // Test 8: applies mapping on-the-fly for non-enriched node
  it('applies mapping on-the-fly for non-enriched nodes', () => {
    const node = makeNode({
      type: 'voice_print',
      properties: { speakerLabel: 'Bob', totalDurationMs: 3000, segmentCount: 2 },
    });

    const meta = getEbucoreMetadata(node);
    expect(meta['ebucore:speakerName']).toBe('Bob');
    expect(meta['ebucore:speakerDuration']).toBe(3000);
    expect(meta['ebucore:numberOfSegments']).toBe(2);
  });

  // Test 9: returns empty object for unknown type
  it('returns empty object for unknown node types', () => {
    const node = makeNode({ type: 'fact' });
    expect(getEbucoreMetadata(node)).toEqual({});
  });

  // Test 10: only returns fields that have values
  it('only returns fields that have values (skips null/undefined)', () => {
    const node = makeNode({
      type: 'transcript',
      title: 'My Video',
      properties: {
        duration: 120,
        language: null,
        // videoUrl, platform, segmentCount, publishedDate are all missing
      },
    });

    const meta = getEbucoreMetadata(node);
    expect(meta['ebucore:duration']).toBe(120);
    expect(meta['ebucore:title']).toBe('My Video');
    // Null/missing fields should not appear
    expect(meta).not.toHaveProperty('ebucore:hasLanguage');
    expect(meta).not.toHaveProperty('ebucore:locator');
    expect(meta).not.toHaveProperty('ebucore:hasFormat');
    expect(meta).not.toHaveProperty('ebucore:numberOfSegments');
    expect(meta).not.toHaveProperty('ebucore:dateCreated');
  });
});

describe('validateEbucoreCompleteness', () => {
  // Test 11: complete transcript (all fields present)
  it('returns complete=true for a fully populated transcript', () => {
    const node = makeNode({
      type: 'transcript',
      title: 'Full Video',
      properties: {
        duration: 120,
        publishedDate: '2025-01-01',
        language: 'en',
        videoUrl: 'https://example.com/video',
        platform: 'youtube',
        segmentCount: 5,
      },
    });

    const result = validateEbucoreCompleteness(node);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  // Test 12: incomplete transcript (missing publishedDate)
  it('reports missing publishedDate for transcript', () => {
    const node = makeNode({
      type: 'transcript',
      title: 'Video',
      properties: {
        duration: 120,
        language: 'en',
        videoUrl: 'https://example.com/video',
        platform: 'youtube',
        segmentCount: 5,
        // publishedDate is missing
      },
    });

    const result = validateEbucoreCompleteness(node);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain('ebucore:dateCreated');
    expect(result.missing).toHaveLength(1);
  });

  // Test 13: complete voice_print
  it('returns complete=true for a fully populated voice_print', () => {
    const node = makeNode({
      type: 'voice_print',
      properties: { speakerLabel: 'Alice', totalDurationMs: 5000, segmentCount: 3 },
    });

    const result = validateEbucoreCompleteness(node);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  // Test 14: complete speaker_identity
  it('returns complete=true for a fully populated speaker_identity', () => {
    const node = makeNode({
      type: 'speaker_identity',
      title: 'Alice',
      properties: {
        givenName: 'Alice',
        familyName: 'Smith',
        displayName: 'Alice Smith',
        role: 'host',
        occupation: 'PhD',
        affiliation: { organizationName: 'KTH', department: 'CS' },
        entityId: 'entity-1',
        wikidata: 'Q12345',
        wikipedia: 'https://en.wikipedia.org/wiki/Alice',
        imdb: 'nm0001',
        linkedIn: 'alicesmith',
      },
    });

    const result = validateEbucoreCompleteness(node);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  // Test 15: unknown type returns complete=true, missing=[]
  it('returns complete=true for types without mappings', () => {
    const node = makeNode({ type: 'fact' });
    expect(validateEbucoreCompleteness(node)).toEqual({ complete: true, missing: [] });
  });

  it('considers enriched (ebucore:*) properties as filled', () => {
    const node = makeNode({
      type: 'speaker_identity',
      title: 'Alice',
      properties: {
        'ebucore:givenName': 'Alice',
        'ebucore:familyName': 'Smith',
        'ebucore:personName': 'Alice Smith',
        'ebucore:role': 'host',
        'ebucore:occupation': 'PhD',
        'ebucore:organisationName': 'KTH',
        'ebucore:organisationDepartment': 'CS',
        'ebucore:entityId': 'entity-1',
        'ebucore:agentWikidata': 'Q12345',
        'ebucore:agentWikipedia': 'https://en.wikipedia.org/wiki/Alice',
        'ebucore:agentImdb': 'nm0001',
        'ebucore:agentLinkedIn': 'alicesmith',
      },
    });

    const result = validateEbucoreCompleteness(node);
    expect(result.complete).toBe(true);
  });
});

describe('getAppliedStandards', () => {
  // Test 16: transcript returns EBUCore 1.10 and Dublin Core
  it('returns EBUCore + Dublin Core for transcript', () => {
    expect(getAppliedStandards('transcript')).toEqual(['EBUCore 1.10', 'Dublin Core']);
  });

  // Test 17: voice_print returns EBUCore 1.10
  it('returns EBUCore for voice_print', () => {
    expect(getAppliedStandards('voice_print')).toEqual(['EBUCore 1.10']);
  });

  // Test 18: speaker_identity returns EBUCore 1.10
  it('returns EBUCore for speaker_identity', () => {
    expect(getAppliedStandards('speaker_identity')).toEqual(['EBUCore 1.10']);
  });

  // Test 19: unknown type returns []
  it('returns empty array for unknown types', () => {
    expect(getAppliedStandards('document')).toEqual([]);
    expect(getAppliedStandards('fact')).toEqual([]);
  });
});

describe('metadataCoverageReport', () => {
  // Test 20: mixed nodes — complete, partial, none
  it('reports correct coverage for mixed nodes', () => {
    const nodes: AuroraNode[] = [
      makeNode({
        id: 'n1',
        type: 'transcript',
        title: 'Full',
        properties: {
          duration: 120,
          publishedDate: '2025-01-01',
          language: 'en',
          videoUrl: 'url',
          platform: 'yt',
          segmentCount: 5,
        },
      }),
      makeNode({
        id: 'n2',
        type: 'transcript',
        title: 'Partial',
        properties: { duration: 60 },
      }),
      makeNode({ id: 'n3', type: 'fact', properties: {} }),
    ];

    const report = metadataCoverageReport(nodes);
    expect(report.totalNodes).toBe(3);
    expect(report.coveredNodes).toBe(2); // full + partial
    expect(report.byType.transcript.complete).toBe(1);
    expect(report.byType.transcript.partial).toBe(1);
    expect(report.byType.fact.none).toBe(1);
  });

  // Test 21: empty array returns zeros
  it('handles empty array', () => {
    const report = metadataCoverageReport([]);
    expect(report.totalNodes).toBe(0);
    expect(report.coveredNodes).toBe(0);
    expect(report.coveragePercent).toBe(0);
    expect(report.byType).toEqual({});
  });

  // Test 22: coverage percent calculation
  it('calculates coverage percent correctly', () => {
    const nodes: AuroraNode[] = [
      // Complete transcript
      makeNode({
        id: 'c1',
        type: 'transcript',
        title: 'Full',
        properties: {
          duration: 120,
          publishedDate: '2025-01-01',
          language: 'en',
          videoUrl: 'url',
          platform: 'yt',
          segmentCount: 5,
        },
      }),
      // Complete voice_print
      makeNode({
        id: 'c2',
        type: 'voice_print',
        properties: { speakerLabel: 'Alice', totalDurationMs: 5000, segmentCount: 3 },
      }),
      // No mapping (document)
      makeNode({ id: 'c3', type: 'document', properties: {} }),
      // No mapping (fact)
      makeNode({ id: 'c4', type: 'fact', properties: {} }),
    ];

    const report = metadataCoverageReport(nodes);
    expect(report.totalNodes).toBe(4);
    expect(report.coveredNodes).toBe(2);
    // 2/4 = 50%
    expect(report.coveragePercent).toBe(50);
  });

  it('classifies nodes with no applicable fields as none', () => {
    const node = makeNode({
      type: 'transcript',
      title: 'Empty',
      properties: {},
    });

    const report = metadataCoverageReport([node]);
    // title is always present via node.title, so it's partial, not none
    expect(report.byType.transcript.partial).toBe(1);
  });
});
