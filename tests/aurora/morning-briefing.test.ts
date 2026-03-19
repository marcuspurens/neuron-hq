import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

const mockGetFreshnessReport = vi.fn();
vi.mock('../../src/aurora/freshness.js', () => ({
  getFreshnessReport: (...args: unknown[]) => mockGetFreshnessReport(...args),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
  }),
}));

const mockCreate = vi.fn();
vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: () => ({
    client: { messages: { create: mockCreate } },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
  }),
}));

vi.mock('../../src/core/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  renderBriefingMarkdown,
  generateQuestions,
  collectBriefingData,
  type BriefingData,

} from '../../src/aurora/morning-briefing.js';

// ─── Test Data ────────────────────────────────────────────────────────────────

function makeBriefingData(overrides?: Partial<BriefingData>): BriefingData {
  return {
    date: '2026-03-19',
    periodStart: new Date('2026-03-18T10:00:00'),
    periodEnd: new Date('2026-03-19T10:00:00'),
    newNodes: [],
    runs: [],
    newIdeas: [],
    staleSources: [],
    agingCount: 0,
    knowledgeGaps: [],
    questions: [],
    ...overrides,
  };
}

// ─── renderBriefingMarkdown (pure function) ───────────────────────────────────

describe('renderBriefingMarkdown()', () => {
  it('renders frontmatter with correct fields', () => {
    const data = makeBriefingData();
    const md = renderBriefingMarkdown(data);

    expect(md).toContain('---');
    expect(md).toContain('id: briefing-2026-03-19');
    expect(md).toContain('type: morning-briefing');
    expect(md).toContain('generated:');
    expect(md).toContain('period_start:');
    expect(md).toContain('period_end:');
  });

  it('renders heading with correct date', () => {
    const data = makeBriefingData();
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('# Morgon-briefing 2026-03-19');
  });

  it('shows empty message when no new nodes', () => {
    const data = makeBriefingData({ newNodes: [] });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('Inga nya noder senaste 24 timmarna.');
  });

  it('renders node table when nodes present', () => {
    const data = makeBriefingData({
      newNodes: [
        { type: 'fact', count: 5 },
        { type: 'document', count: 3 },
      ],
    });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('| Typ | Antal |');
    expect(md).toContain('| fact | 5 |');
    expect(md).toContain('| document | 3 |');
  });

  it('shows empty message when no runs', () => {
    const data = makeBriefingData({ runs: [] });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('Inga körningar senaste 24 timmarna.');
  });

  it('renders runs with status icons', () => {
    const data = makeBriefingData({
      runs: [
        { dirName: '20260319-1327-proj', title: 'My Run', status: 'green' },
        { dirName: '20260319-1400-fail', title: 'Failed Run', status: 'red' },
        { dirName: '20260319-1500-unk', title: 'Unknown Run', status: 'unknown' },
      ],
    });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('✅ **My Run**');
    expect(md).toContain('❌ **Failed Run**');
    expect(md).toContain('❓ **Unknown Run**');
  });

  it('shows empty message when no ideas', () => {
    const data = makeBriefingData({ newIdeas: [] });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('Inga nya idéer.');
  });

  it('renders ideas with confidence', () => {
    const data = makeBriefingData({
      newIdeas: [{ title: 'Cool Idea', confidence: 0.85, nodeId: 'n1' }],
    });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('**Cool Idea** — confidence 0.85');
  });

  it('renders stale sources section', () => {
    const data = makeBriefingData({
      staleSources: [
        { title: 'Old Source', nodeId: 'n2', daysSinceVerified: 45 },
      ],
    });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('**Old Source** — 45 dagar sedan verifiering');
  });

  it('renders aging count', () => {
    const data = makeBriefingData({ agingCount: 7 });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('7 noder närmar sig inaktualitet (status: aging).');
  });

  it('renders knowledge gaps', () => {
    const data = makeBriefingData({
      knowledgeGaps: [{ title: 'Unknown Topic', content: 'Need research', nodeId: 'g1' }],
    });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('**Unknown Topic**');
  });

  it('renders questions with metadata comments', () => {
    const data = makeBriefingData({
      questions: [
        { question: 'Test fråga?', source_node_id: 'q1', category: 'gap' },
      ],
    });
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('### Fråga 1: Test fråga?');
    expect(md).toContain('<!-- question_node_id: q1 -->');
    expect(md).toContain('<!-- question_category: gap -->');
    expect(md).toContain('<!-- svar: -->');
  });

  it('renders footer', () => {
    const data = makeBriefingData();
    const md = renderBriefingMarkdown(data);
    expect(md).toContain('*Genererad av Aurora · [[Morgon-briefing]]*');
  });
});

// ─── generateQuestions ────────────────────────────────────────────────────────

describe('generateQuestions()', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns empty array when no candidates', async () => {
    const data = makeBriefingData();
    const questions = await generateQuestions(data);
    expect(questions).toEqual([]);
  });

  it('uses AI when available and parses response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { question: 'AI fråga?', source_node_id: 'g1', category: 'gap' },
            { question: 'AI fråga 2?', source_node_id: 'g2', category: 'stale' },
            { question: 'AI fråga 3?', source_node_id: 'n1', category: 'idea' },
          ]),
        },
      ],
    });

    const data = makeBriefingData({
      knowledgeGaps: [{ title: 'Gap 1', content: 'x', nodeId: 'g1' }],
      staleSources: [{ title: 'Stale 1', nodeId: 'g2', daysSinceVerified: 30 }],
      newIdeas: [{ title: 'Idea 1', confidence: 0.9, nodeId: 'n1' }],
    });

    const questions = await generateQuestions(data);
    expect(questions).toHaveLength(3);
    expect(questions[0].question).toBe('AI fråga?');
    expect(questions[0].category).toBe('gap');
  });

  it('falls back to rule-based when AI fails', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const data = makeBriefingData({
      knowledgeGaps: [{ title: 'Gap X', content: 'x', nodeId: 'g1' }],
      staleSources: [{ title: 'Source Y', nodeId: 's1', daysSinceVerified: 60 }],
      newIdeas: [{ title: 'Idea Z', confidence: 0.75, nodeId: 'i1' }],
    });

    const questions = await generateQuestions(data);
    expect(questions).toHaveLength(3);
    expect(questions[0].question).toContain('Kunskapslucka: Gap X');
    expect(questions[1].question).toContain('Source Y verifierades senast för 60 dagar sedan');
    expect(questions[2].question).toContain('Ny idé: Idea Z (confidence 0.75)');
  });

  it('falls back when AI returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not JSON at all' }],
    });

    const data = makeBriefingData({
      knowledgeGaps: [{ title: 'Gap Only', content: 'x', nodeId: 'g1' }],
    });

    const questions = await generateQuestions(data);
    expect(questions).toHaveLength(1);
    expect(questions[0].question).toContain('Kunskapslucka: Gap Only');
    expect(questions[0].category).toBe('gap');
  });

  it('limits to max 3 questions', async () => {
    mockCreate.mockRejectedValue(new Error('fail'));

    const data = makeBriefingData({
      knowledgeGaps: [
        { title: 'G1', content: 'x', nodeId: 'g1' },
        { title: 'G2', content: 'x', nodeId: 'g2' },
      ],
      staleSources: [
        { title: 'S1', nodeId: 's1', daysSinceVerified: 30 },
        { title: 'S2', nodeId: 's2', daysSinceVerified: 40 },
      ],
      newIdeas: [
        { title: 'I1', confidence: 0.9, nodeId: 'i1' },
        { title: 'I2', confidence: 0.8, nodeId: 'i2' },
      ],
    });

    const questions = await generateQuestions(data);
    expect(questions.length).toBeLessThanOrEqual(3);
  });
});

// ─── collectBriefingData ──────────────────────────────────────────────────────

describe('collectBriefingData()', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetFreshnessReport.mockReset();
  });

  it('returns empty data when DB queries fail', async () => {
    mockQuery.mockRejectedValue(new Error('DB down'));
    mockGetFreshnessReport.mockRejectedValue(new Error('DB down'));

    const start = new Date('2026-03-18T10:00:00');
    const end = new Date('2026-03-19T10:00:00');

    const data = await collectBriefingData(start, end);

    expect(data.newNodes).toEqual([]);
    expect(data.newIdeas).toEqual([]);
    expect(data.staleSources).toEqual([]);
    expect(data.agingCount).toBe(0);
    expect(data.knowledgeGaps).toEqual([]);
  });

  it('correctly maps DB rows for new nodes', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('GROUP BY type')) {
        return { rows: [{ type: 'fact', count: 3 }, { type: 'concept', count: 1 }] };
      }
      return { rows: [] };
    });
    mockGetFreshnessReport.mockResolvedValue([]);

    const start = new Date('2026-03-18T10:00:00');
    const end = new Date('2026-03-19T10:00:00');

    const data = await collectBriefingData(start, end);

    expect(data.newNodes).toEqual([
      { type: 'fact', count: 3 },
      { type: 'concept', count: 1 },
    ]);
  });

  it('maps stale sources from freshness report', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetFreshnessReport.mockImplementation((opts: Record<string, unknown>) => {
      if (opts?.onlyStale) {
        return [
          { nodeId: 'n1', title: 'Stale Node', daysSinceVerified: 50 },
        ];
      }
      return [];
    });

    const start = new Date('2026-03-18T10:00:00');
    const end = new Date('2026-03-19T10:00:00');

    const data = await collectBriefingData(start, end);

    expect(data.staleSources).toEqual([
      { title: 'Stale Node', nodeId: 'n1', daysSinceVerified: 50 },
    ]);
  });

  it('counts aging nodes from freshness report', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetFreshnessReport.mockImplementation((opts: Record<string, unknown>) => {
      if (opts?.onlyStale) return [];
      return [
        { status: 'aging' },
        { status: 'aging' },
        { status: 'fresh' },
        { status: 'stale' },
      ];
    });

    const start = new Date('2026-03-18T10:00:00');
    const end = new Date('2026-03-19T10:00:00');

    const data = await collectBriefingData(start, end);
    expect(data.agingCount).toBe(2);
  });

  it('sets date string from periodEnd', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetFreshnessReport.mockResolvedValue([]);

    const start = new Date('2026-03-18T10:00:00');
    const end = new Date('2026-03-19T10:00:00');

    const data = await collectBriefingData(start, end);
    expect(data.date).toBe('2026-03-19');
    expect(data.periodStart).toBe(start);
    expect(data.periodEnd).toBe(end);
  });
});
