import { describe, it, expect } from 'vitest';
import { extractBriefContext } from '../../src/core/brief-context-extractor.js';
import type { BriefContext } from '../../src/core/brief-context-extractor.js';

describe('brief-context-extractor', () => {
  // ── Test 1: Empty string ─────────────────────────────
  it('returns empty keywords and base nodeTypes for empty string', () => {
    const result = extractBriefContext('');
    expect(result).toEqual({
      keywords: [],
      nodeTypes: ['error', 'pattern', 'idea'],
    });
  });

  // ── Test 2: PPR-related terms extraction ─────────────
  it('extracts PPR and PageRank from brief mentioning them', () => {
    const brief = `# PPR-algoritm
    
## Background
Personalized PageRank is used for graph traversal.
The PPR algorithm helps find related nodes.`;

    const result = extractBriefContext(brief);
    const kw = result.keywords;
    expect(kw.some((k) => k.includes('ppr'))).toBe(true);
    expect(kw.some((k) => k.includes('pagerank'))).toBe(true);
  });

  // ── Test 3: nodeTypes always includes base types ─────
  it('always includes error, pattern, idea in nodeTypes', () => {
    const result = extractBriefContext('Some random brief content.');
    expect(result.nodeTypes).toContain('error');
    expect(result.nodeTypes).toContain('pattern');
    expect(result.nodeTypes).toContain('idea');
  });

  // ── Test 4: research triggers technique ──────────────
  it('includes technique in nodeTypes when brief mentions research', () => {
    const brief = 'This task involves research into new algorithms.';
    const result = extractBriefContext(brief);
    expect(result.nodeTypes).toContain('technique');
  });

  it('includes technique when brief mentions forskning', () => {
    const brief = 'Uppgiften kräver forskning om algoritmer.';
    const result = extractBriefContext(brief);
    expect(result.nodeTypes).toContain('technique');
  });

  it('includes technique when brief mentions study', () => {
    const brief = 'Conduct a study of performance characteristics.';
    const result = extractBriefContext(brief);
    expect(result.nodeTypes).toContain('technique');
  });

  // ── Test 5: Stopword filtering ───────────────────────
  it('filters out Swedish and English stopwords', () => {
    const brief = 'The och att är the is a simple test.';
    const result = extractBriefContext(brief);
    expect(result.keywords).not.toContain('the');
    expect(result.keywords).not.toContain('och');
    expect(result.keywords).not.toContain('att');
    expect(result.keywords).not.toContain('är');
    expect(result.keywords).not.toContain('is');
  });

  // ── Test 6: Words shorter than 3 chars filtered ──────
  it('filters out words shorter than 3 characters', () => {
    const brief = 'An AI on is to do it up go by at if so no.';
    const result = extractBriefContext(brief);
    // All words in the brief are <= 2 chars or stopwords
    expect(result.keywords).toEqual([]);
  });

  // ── Test 7: Max 20 keywords ──────────────────────────
  it('returns max 20 keywords even with very long brief', () => {
    const words = Array.from({ length: 100 }, (_, i) => `keyword${i}`);
    const brief = words.join(' ');
    const result = extractBriefContext(brief);
    expect(result.keywords.length).toBeLessThanOrEqual(20);
  });

  // ── Test 8: Backtick terms prioritized ───────────────
  it('prioritizes backtick terms in keyword extraction', () => {
    const filler = Array.from({ length: 30 }, (_, i) => `filler${i}`).join(' ');
    const brief = `Use \`extractBriefContext\` to parse briefs. ${filler}`;
    const result = extractBriefContext(brief);
    expect(result.keywords).toContain('extractbriefcontext');
  });

  // ── Test 9: camelCase splitting ──────────────────────
  it('splits camelCase terms into component words', () => {
    const brief = 'The function extractBriefContext handles parsing.';
    const result = extractBriefContext(brief);
    expect(result.keywords).toContain('extract');
    expect(result.keywords).toContain('brief');
    expect(result.keywords).toContain('context');
  });

  // ── Test 10: snake_case terms ────────────────────────
  it('includes snake_case terms and their components', () => {
    const brief = 'Configure the `brief_context` parser.';
    const result = extractBriefContext(brief);
    expect(result.keywords).toContain('brief_context');
    expect(result.keywords).toContain('brief');
    expect(result.keywords).toContain('context');
  });

  // ── Additional edge case tests ───────────────────────
  it('handles whitespace-only content as empty', () => {
    const result = extractBriefContext('   \n\t  \n  ');
    expect(result).toEqual({
      keywords: [],
      nodeTypes: ['error', 'pattern', 'idea'],
    });
  });

  it('does not include technique when no trigger words present', () => {
    const brief = 'Build a REST API with proper error handling.';
    const result = extractBriefContext(brief);
    expect(result.nodeTypes).not.toContain('technique');
  });

  it('deduplicates keywords', () => {
    const brief = 'parser parser parser parser parser parser';
    const result = extractBriefContext(brief);
    const parserCount = result.keywords.filter((k) => k === 'parser').length;
    expect(parserCount).toBe(1);
  });

  it('handles a realistic brief with mixed content', () => {
    const brief = `# Implement GraphSearch

## Background
The knowledge graph uses \`personalizedPageRank\` for traversal.

## What to build
Create a search function using the \`graph_query\` tool.

## Acceptance Criteria
- Extract keywords from brief content
- Support snake_case and camelCase identifiers
- Handle edge cases properly`;

    const result: BriefContext = extractBriefContext(brief);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.keywords.length).toBeLessThanOrEqual(20);
    expect(result.keywords).toContain('personalizedpagerank');
    expect(result.keywords).toContain('graph_query');
    expect(result.nodeTypes).toContain('error');
    expect(result.nodeTypes).toContain('pattern');
    expect(result.nodeTypes).toContain('idea');
  });
});
