import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ---- Mock Anthropic SDK ---- */
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

/* ---- Mock fs/promises to return prompt template ---- */
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(
    'Du är en hjälpassistent.\n\nFråga: {{question}}\n\nVerktyg:\n{{tools}}',
  ),
}));

import { findTools, listAllToolsByCategory } from '../../src/mcp/tools/neuron-help.js';

describe('findTools', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('indexera video returns aurora_ingest_video in top results', async () => {
    // "video" and "indexera" are keywords for aurora_ingest_video
    const results = await findTools('indexera video');
    expect(results.map((r) => r.name)).toContain('aurora_ingest_video');
  });

  it('freshness returns tool from kvalitet category', async () => {
    // "freshness" is a keyword for aurora_freshness (category: kvalitet)
    const results = await findTools('freshness');
    expect(results.some((r) => r.category === 'kvalitet')).toBe(true);
  });

  it('senaste körningar returns neuron_runs', async () => {
    // "körningar" is an exact keyword for neuron_runs
    const results = await findTools('senaste körningar');
    expect(results.map((r) => r.name)).toContain('neuron_runs');
  });

  it('0 keyword matches triggers Haiku fallback', async () => {
    // "xyzzy blorg" matches no keywords, so Haiku should be called
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { name: 'aurora_search', reason: 'Generell sökning' },
          ]),
        },
      ],
    });

    const results = await findTools('xyzzy blorg');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(results.map((r) => r.name)).toContain('aurora_search');
  });

  it('Haiku timeout returns keyword fallback', async () => {
    // "video" matches keywords, so even if Haiku fails we get results
    mockCreate.mockRejectedValueOnce(new Error('timeout'));

    const results = await findTools('video indexera transkription film');
    // Should still have results from keyword matching despite Haiku failure
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.name)).toContain('aurora_ingest_video');
  });

  it('output format has name, reason, and category', async () => {
    const results = await findTools('video');
    for (const r of results) {
      expect(r.name).toBeTruthy();
      expect(r.reason).toBeTruthy();
      expect(r.category).toBeTruthy();
    }
  });

  it('empty question returns fallback message', async () => {
    const results = await findTools('');
    expect(results).toHaveLength(1);
    expect(results[0].reason).toContain('Hittade inget');
  });

  it('English query ingest a video works', async () => {
    // "video" and "ingest" are keywords for aurora_ingest_video
    const results = await findTools('ingest a video');
    expect(results.map((r) => r.name)).toContain('aurora_ingest_video');
  });
});

describe('listAllToolsByCategory', () => {
  it('returns a string with category headings', () => {
    const output = listAllToolsByCategory();
    expect(output).toContain('## sökning');
    expect(output).toContain('## insikter');
    expect(output).toContain('aurora_search');
  });
});
