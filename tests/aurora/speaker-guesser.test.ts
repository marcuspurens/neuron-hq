import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';

// --- Mocks ---

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

const { mockLoadAuroraGraph, mockClaudeCreate } = vi.hoisted(() => ({
  mockLoadAuroraGraph: vi.fn(),
  mockClaudeCreate: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: '[{"speakerLabel":"SPEAKER_00","name":"Dario Amodei","confidence":85,"role":"CEO Anthropic","reason":"Discussed AI safety"}]',
      },
    ],
  }),
}));

vi.mock('../../src/aurora/aurora-graph.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/aurora/aurora-graph.js')
  >('../../src/aurora/aurora-graph.js');
  return {
    ...actual,
    loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
    saveAuroraGraph: vi.fn(),
  };
});

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
}));

vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: vi.fn().mockReturnValue({
    client: { messages: { create: mockClaudeCreate } },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
  }),
}));

import {
  guessSpeakers,
  buildSpeakerContext,
} from '../../src/aurora/speaker-guesser.js';

// --- Helpers ---

const now = new Date().toISOString();

function makeTranscriptNode(overrides?: Partial<AuroraNode>): AuroraNode {
  return {
    id: 'transcript-1',
    type: 'transcript',
    title: 'Interview with Dario Amodei',
    properties: {
      platform: 'YouTube',
      channelName: 'Lex Fridman',
      videoDescription: 'Dario Amodei, CEO of Anthropic, discusses AI safety and alignment research.',
      creators: null,
      rawSegments: [
        { speaker: 'SPEAKER_00', text: 'AI safety is critical for humanity.', start: 0, end: 5000 },
        { speaker: 'SPEAKER_00', text: 'We need to get alignment right.', start: 5000, end: 10000 },
        { speaker: 'SPEAKER_01', text: 'Tell me more about your approach.', start: 10000, end: 15000 },
        { speaker: 'SPEAKER_01', text: 'How does Anthropic differ from OpenAI?', start: 15000, end: 20000 },
      ],
      text: 'AI safety is critical for humanity...',
    },
    confidence: 0.9,
    scope: 'personal',
    created: now,
    updated: now,
    ...overrides,
  };
}

function makeVoicePrint(
  id: string,
  label: string,
  segments: number,
  duration: number,
): AuroraNode {
  return {
    id,
    type: 'voice_print',
    title: `Speaker: ${label}`,
    properties: {
      speakerLabel: label,
      segmentCount: segments,
      totalDurationMs: duration,
    },
    confidence: 0.7,
    scope: 'personal',
    created: now,
    updated: now,
  };
}

function makeGraph(
  nodes: AuroraNode[],
  edges: AuroraGraph['edges'] = [],
): AuroraGraph {
  return { nodes, edges, lastUpdated: now };
}

// --- Tests ---

describe('buildSpeakerContext', () => {
  it('extracts context from voice prints + rawSegments', () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const vp1 = makeVoicePrint('vp-1', 'SPEAKER_01', 2, 10000);

    const contexts = buildSpeakerContext(transcript, [vp0, vp1]);

    expect(contexts).toHaveLength(2);
    expect(contexts[0].speakerLabel).toBe('SPEAKER_00');
    expect(contexts[0].sampleText).toContain('AI safety');
    expect(contexts[0].durationMs).toBe(10000);
    expect(contexts[0].segmentCount).toBe(2);
    expect(contexts[1].speakerLabel).toBe('SPEAKER_01');
    expect(contexts[1].sampleText).toContain('Tell me more');
  });

  it('deduplicates voice prints with same label', () => {
    const transcript = makeTranscriptNode();
    const vp0a = makeVoicePrint('vp-0a', 'SPEAKER_00', 2, 5000);
    const vp0b = makeVoicePrint('vp-0b', 'SPEAKER_00', 1, 3000);

    const contexts = buildSpeakerContext(transcript, [vp0a, vp0b]);

    expect(contexts).toHaveLength(1);
    expect(contexts[0].speakerLabel).toBe('SPEAKER_00');
  });

  it('falls back to single speaker when no voice prints', () => {
    const transcript = makeTranscriptNode();

    const contexts = buildSpeakerContext(transcript, []);

    expect(contexts).toHaveLength(1);
    expect(contexts[0].speakerLabel).toBe('SPEAKER_00');
    expect(contexts[0].sampleText).toContain('AI safety');
  });

  it('uses properties.text fallback when no rawSegments', () => {
    const transcript = makeTranscriptNode({
      properties: {
        platform: 'YouTube',
        text: 'Fallback text content here.',
      },
    });

    const contexts = buildSpeakerContext(transcript, []);

    expect(contexts).toHaveLength(1);
    expect(contexts[0].sampleText).toBe('Fallback text content here.');
  });

  it('returns empty when no voice prints and no text at all', () => {
    const transcript = makeTranscriptNode({
      properties: { platform: 'YouTube' },
    });

    const contexts = buildSpeakerContext(transcript, []);

    expect(contexts).toHaveLength(0);
  });

  it('truncates sample text to 500 chars', () => {
    const longText = 'A'.repeat(600);
    const transcript = makeTranscriptNode({
      properties: {
        platform: 'YouTube',
        rawSegments: [
          { speaker: 'SPEAKER_00', text: longText, start: 0, end: 5000 },
        ],
      },
    });
    const vp = makeVoicePrint('vp-0', 'SPEAKER_00', 1, 5000);

    const contexts = buildSpeakerContext(transcript, [vp]);

    expect(contexts[0].sampleText.length).toBeLessThanOrEqual(500);
  });
});

describe('guessSpeakers', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockClaudeCreate.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws on non-existent transcript node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    await expect(guessSpeakers('missing-id')).rejects.toThrow(
      'Transcript node not found: missing-id',
    );
  });

  it('returns empty guesses when no speakers found', async () => {
    const transcript = makeTranscriptNode({
      properties: { platform: 'YouTube' },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript]));

    const result = await guessSpeakers('transcript-1');

    expect(result.guesses).toEqual([]);
    expect(result.modelUsed).toBe('none');
  });

  it('finds voice prints linked via derived_from edges', async () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: {
              content:
                '[{"speakerLabel":"SPEAKER_00","name":"Dario Amodei","confidence":85,"role":"CEO Anthropic","reason":"Discussed AI safety"}]',
            },
          }),
      }),
    );

    const result = await guessSpeakers('transcript-1');

    expect(result.guesses).toHaveLength(1);
    expect(result.guesses[0].speakerLabel).toBe('SPEAKER_00');
    expect(result.guesses[0].name).toBe('Dario Amodei');
    expect(result.guesses[0].confidence).toBe(85);
    expect(result.guesses[0].role).toBe('CEO Anthropic');
  });

  it('uses claude when model option is set', async () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    const result = await guessSpeakers('transcript-1', { model: 'claude' });

    expect(result.modelUsed).toBe('claude-haiku-4-5-20251001');
    expect(result.guesses).toHaveLength(1);
    expect(result.guesses[0].name).toBe('Dario Amodei');
    expect(mockClaudeCreate).toHaveBeenCalledOnce();
  });

  it('handles Ollama returning malformed JSON gracefully', async () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'This is not JSON at all' },
          }),
      }),
    );

    const result = await guessSpeakers('transcript-1');

    expect(result.guesses).toEqual([]);
    expect(result.modelUsed).toBe('gemma3');
  });

  it('extracts JSON array from wrapped response text', async () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: {
              content:
                'Here are the guesses:\n[{"speakerLabel":"SPEAKER_00","name":"Test","confidence":70,"role":"Host","reason":"intro"}]\nDone!',
            },
          }),
      }),
    );

    const result = await guessSpeakers('transcript-1');

    expect(result.guesses).toHaveLength(1);
    expect(result.guesses[0].name).toBe('Test');
  });

  it('passes channel name and description to LLM', async () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    const result = await guessSpeakers('transcript-1', { model: 'claude' });

    const callArgs = mockClaudeCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain('Channel: Lex Fridman');
    expect(userMsg).toContain('Video description: Dario Amodei, CEO of Anthropic');
    expect(result.guesses).toHaveLength(1);
  });

  it('passes creators list to LLM when present', async () => {
    const transcript = makeTranscriptNode({
      properties: {
        ...makeTranscriptNode().properties,
        creators: ['Alice Smith', 'Bob Jones'],
      },
    });
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    await guessSpeakers('transcript-1', { model: 'claude' });

    const callArgs = mockClaudeCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain('Creators: Alice Smith, Bob Jones');
  });

  it('falls back to platform when channelName is empty', async () => {
    const transcript = makeTranscriptNode({
      properties: {
        ...makeTranscriptNode().properties,
        channelName: '',
      },
    });
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    await guessSpeakers('transcript-1', { model: 'claude' });

    const callArgs = mockClaudeCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain('Channel: YouTube');
  });

  it('sets defaults for missing fields in LLM response', async () => {
    const transcript = makeTranscriptNode();
    const vp0 = makeVoicePrint('vp-0', 'SPEAKER_00', 2, 10000);
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-0', to: 'transcript-1', type: 'derived_from', metadata: {} },
    ];

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([transcript, vp0], edges));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: {
              content: '[{"speakerLabel":"SPEAKER_00"}]',
            },
          }),
      }),
    );

    const result = await guessSpeakers('transcript-1');

    expect(result.guesses).toHaveLength(1);
    expect(result.guesses[0].name).toBe('');
    expect(result.guesses[0].confidence).toBe(0);
    expect(result.guesses[0].role).toBe('');
    expect(result.guesses[0].reason).toBe('');
  });
});
