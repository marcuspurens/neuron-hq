import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildRetroUserMessage,
  buildFollowUpMessage,
  parseRetroResponse,
  runRetro,
} from '../../src/core/agents/observer-retro.js';
import type { RunArtifacts } from '../../src/core/agents/observer-retro.js';
import type { Observation } from '../../src/core/agents/observer.js';

// ── Module mocks (auto-hoisted by Vitest) ────────────────────────

vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: vi.fn(),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: vi.fn(() => ({
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 8192,
  })),
}));

vi.mock('../../src/core/pricing.js', () => ({
  calcCost: vi.fn(() => 0.01),
  getModelShortName: vi.fn(() => 'sonnet'),
}));

// ── Shared fixtures ──────────────────────────────────────────────

const ARTIFACTS: RunArtifacts = {
  reportContent: '# Report\nSome content.',
  knowledgeContent: '# Knowledge\nSome knowledge.',
  briefContent: '# Brief: Add OAuth support\n\nDescription here.',
  stoplight: 'GREEN',
};

const ARTIFACTS_EMPTY: RunArtifacts = {
  reportContent: '',
  knowledgeContent: '',
  briefContent: '',
  stoplight: 'YELLOW',
};

// ── buildRetroUserMessage ────────────────────────────────────────

describe('buildRetroUserMessage', () => {
  it('includes the agent role in the message', () => {
    const msg = buildRetroUserMessage('implementer', ARTIFACTS, []);
    expect(msg).toContain('implementer');
  });

  it('includes the stoplight status', () => {
    const msg = buildRetroUserMessage('manager', ARTIFACTS, []);
    expect(msg).toContain('GREEN');
  });

  it('includes the brief title extracted from briefContent', () => {
    const msg = buildRetroUserMessage('implementer', ARTIFACTS, []);
    expect(msg).toContain('Brief: Add OAuth support');
  });

  it('formats tool summary with counts', () => {
    const tools = ['read_file', 'write_file', 'read_file', 'bash_exec', 'read_file'];
    const msg = buildRetroUserMessage('implementer', ARTIFACTS, tools);
    expect(msg).toContain('read_file (3)');
    expect(msg).toContain('write_file (1)');
    expect(msg).toContain('bash_exec (1)');
  });

  it('shows "Inga tool-anrop registrerade" when tools list is empty', () => {
    const msg = buildRetroUserMessage('tester', ARTIFACTS, []);
    expect(msg).toContain('Inga tool-anrop registrerade');
  });

  it('includes the three standard questions', () => {
    const msg = buildRetroUserMessage('reviewer', ARTIFACTS, []);
    expect(msg).toContain('Hur gick det tycker du?');
    expect(msg).toContain('Vad funkade bäst i denna körning?');
    expect(msg).toContain('Vad funkade sämst, om något?');
  });

  it('includes instruction to answer under three headers', () => {
    const msg = buildRetroUserMessage('merger', ARTIFACTS, []);
    expect(msg).toContain('"Hur gick det"');
    expect(msg).toContain('"Bäst"');
    expect(msg).toContain('"Sämst"');
  });

  it('handles empty briefContent gracefully', () => {
    const msg = buildRetroUserMessage('historian', ARTIFACTS_EMPTY, []);
    expect(msg).toContain('okänd brief');
  });

  it('handles briefContent with only whitespace', () => {
    const artifacts = { ...ARTIFACTS, briefContent: '   \n\n  ' };
    const msg = buildRetroUserMessage('historian', artifacts, []);
    expect(msg).toContain('okänd brief');
  });

  it('does not throw on undefined toolSummary passed as empty', () => {
    expect(() => buildRetroUserMessage('merger', ARTIFACTS, [])).not.toThrow();
  });

  it('includes corpus framing for honest feedback', () => {
    const msg = buildRetroUserMessage('implementer', ARTIFACTS, []);
    expect(msg).toContain('ärlighet framför');
  });
});

// ── buildFollowUpMessage ─────────────────────────────────────────

describe('buildFollowUpMessage', () => {
  it('returns null when observations array is empty', () => {
    expect(buildFollowUpMessage([])).toBeNull();
  });

  it('returns a string when observations exist', () => {
    const obs: Observation[] = [
      {
        timestamp: '2026-03-22T06:00:00.000Z',
        agent: 'implementer',
        type: 'absence',
        severity: 'WARNING',
        promptClaim: 'Read every file you need',
        actualBehavior: '0 read_file calls observed',
        evidence: 'No read_file in audit log',
      },
    ];
    const result = buildFollowUpMessage(obs);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('includes promptClaim and actualBehavior in the message', () => {
    const obs: Observation[] = [
      {
        timestamp: '2026-03-22T06:00:00.000Z',
        agent: 'manager',
        type: 'anti-pattern',
        severity: 'WARNING',
        promptClaim: 'Delegate all tasks',
        actualBehavior: 'Only 1 delegation found',
        evidence: 'Audit log',
      },
    ];
    const result = buildFollowUpMessage(obs)!;
    expect(result).toContain('Delegate all tasks');
    expect(result).toContain('Only 1 delegation found');
  });

  it('includes the closing question', () => {
    const obs: Observation[] = [
      {
        timestamp: '2026-03-22T06:00:00.000Z',
        agent: 'tester',
        type: 'note',
        severity: 'INFO',
        promptClaim: 'Run all tests',
        actualBehavior: 'Only ran 2 tests',
        evidence: 'bash_exec count',
      },
    ];
    const result = buildFollowUpMessage(obs)!;
    expect(result).toContain('Kan du förklara vad som hände?');
  });

  it('includes all observations when multiple exist', () => {
    const obs: Observation[] = [
      {
        timestamp: '2026-03-22T06:00:00.000Z',
        agent: 'reviewer',
        type: 'absence',
        severity: 'WARNING',
        promptClaim: 'Claim A',
        actualBehavior: 'Behavior A',
        evidence: '',
      },
      {
        timestamp: '2026-03-22T06:01:00.000Z',
        agent: 'reviewer',
        type: 'note',
        severity: 'INFO',
        promptClaim: 'Claim B',
        actualBehavior: 'Behavior B',
        evidence: '',
      },
    ];
    const result = buildFollowUpMessage(obs)!;
    expect(result).toContain('Claim A');
    expect(result).toContain('Claim B');
    expect(result).toContain('Behavior A');
    expect(result).toContain('Behavior B');
  });
});

// ── parseRetroResponse ───────────────────────────────────────────

describe('parseRetroResponse', () => {
  it('parses ## headers correctly', () => {
    const text = [
      '## Hur gick det',
      'Det gick bra.',
      '## Bäst',
      'Koden var tydlig.',
      '## Sämst',
      'Inget att anmärka.',
    ].join('\n');

    const result = parseRetroResponse(text);
    expect(result.howDidItGo).toBe('Det gick bra.');
    expect(result.whatWorkedBest).toBe('Koden var tydlig.');
    expect(result.whatWorkedWorst).toBe('Inget att anmärka.');
  });

  it('parses # headers (single hash) correctly', () => {
    const text = [
      '# Hur gick det',
      'Gick OK.',
      '# Bäst',
      'Bra struktur.',
      '# Sämst',
      'Lite stökigt.',
    ].join('\n');

    const result = parseRetroResponse(text);
    expect(result.howDidItGo).toBe('Gick OK.');
    expect(result.whatWorkedBest).toBe('Bra struktur.');
    expect(result.whatWorkedWorst).toBe('Lite stökigt.');
  });

  it('parses **bold** headers correctly', () => {
    const text = [
      '**Hur gick det**',
      'Bra!',
      '**Bäst**',
      'Allt.',
      '**Sämst**',
      'Inget.',
    ].join('\n');

    const result = parseRetroResponse(text);
    expect(result.howDidItGo).toBe('Bra!');
    expect(result.whatWorkedBest).toBe('Allt.');
    expect(result.whatWorkedWorst).toBe('Inget.');
  });

  it('falls back to putting all text in howDidItGo when no headers found', () => {
    const text = 'Allt gick bra. Inga problem. Inga observationer.';
    const result = parseRetroResponse(text);
    expect(result.howDidItGo).toBe(text);
    expect(result.whatWorkedBest).toBe('');
    expect(result.whatWorkedWorst).toBe('');
  });

  it('handles empty string input', () => {
    const result = parseRetroResponse('');
    expect(result.howDidItGo).toBe('');
    expect(result.whatWorkedBest).toBe('');
    expect(result.whatWorkedWorst).toBe('');
  });

  it('handles multi-line section content', () => {
    const text = [
      '## Hur gick det',
      'Körningen gick bra.',
      'Alla tasks levererade.',
      '## Bäst',
      'Implementer löste allt snabbt.',
      '## Sämst',
      'Inget speciellt.',
    ].join('\n');

    const result = parseRetroResponse(text);
    expect(result.howDidItGo).toContain('Körningen gick bra.');
    expect(result.howDidItGo).toContain('Alla tasks levererade.');
    expect(result.whatWorkedBest).toContain('Implementer löste allt snabbt.');
  });

  it('handles partial headers (only some sections present)', () => {
    const text = [
      '## Hur gick det',
      'Det gick OK.',
      '## Bäst',
      'Koden var ren.',
    ].join('\n');

    const result = parseRetroResponse(text);
    expect(result.howDidItGo).toBe('Det gick OK.');
    expect(result.whatWorkedBest).toBe('Koden var ren.');
    expect(result.whatWorkedWorst).toBe('');
  });

  it('trims whitespace from section content', () => {
    const text = [
      '## Hur gick det',
      '',
      '  Bra körning.  ',
      '',
      '## Bäst',
      '  Snabbt.  ',
      '## Sämst',
      '  Inget.  ',
    ].join('\n');

    const result = parseRetroResponse(text);
    expect(result.howDidItGo).not.toMatch(/^\s/);
    expect(result.howDidItGo).not.toMatch(/\s$/);
  });
});

// ── runRetro ─────────────────────────────────────────────────────

describe('runRetro', () => {
  function makeMockClient(responses: Array<{ text: string; input: number; output: number } | Error>) {
    let callIdx = 0;
    return {
      messages: {
        create: vi.fn(async () => {
          const r = responses[callIdx++];
          if (!r) throw new Error('No more mock responses');
          if (r instanceof Error) throw r;
          return {
            content: [{ type: 'text', text: r.text }],
            usage: { input_tokens: r.input, output_tokens: r.output },
          };
        }),
      },
    };
  }

  const baseArtifacts: RunArtifacts = {
    reportContent: '# Report\nAll good.',
    knowledgeContent: '# Knowledge\nLearned stuff.',
    briefContent: '# Test Brief\nDoing a test.',
    stoplight: 'GREEN',
  };

  const agentPrompts = new Map([
    ['manager', 'You are the manager.'],
    ['implementer', 'You are the implementer.'],
  ]);

  const agentToolSummaries = new Map([
    ['manager', ['read_file', 'write_file', 'read_file']],
    ['implementer', ['bash_exec', 'write_file']],
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns RetroResponse for each agent in agentPrompts', async () => {
    const mockClient = makeMockClient([
      { text: '## Hur gick det\nBra.\n## Bäst\nAllt.\n## Sämst\nInget.', input: 500, output: 100 },
      { text: '## Hur gick det\nOK.\n## Bäst\nKoden.\n## Sämst\nInget.', input: 400, output: 80 },
    ]);
    const { createAgentClient: mockCreate } = await import('../../src/core/agent-client.js');
    (mockCreate as ReturnType<typeof vi.fn>).mockReturnValue({ client: mockClient, model: 'test-model', maxTokens: 2048 });

    const results = await runRetro([], baseArtifacts, agentPrompts, agentToolSummaries);
    expect(results).toHaveLength(2);
    expect(results[0].agent).toBe('manager');
    expect(results[0].howDidItGo).toBe('Bra.');
    expect(results[1].agent).toBe('implementer');
  });

  it('marks agent as "retro: failed" when API call throws', async () => {
    const mockClient = makeMockClient([
      new Error('Rate limit exceeded'),
      { text: '## Hur gick det\nBra.\n## Bäst\nAllt.\n## Sämst\nInget.', input: 500, output: 100 },
    ]);
    const { createAgentClient: mockCreate } = await import('../../src/core/agent-client.js');
    (mockCreate as ReturnType<typeof vi.fn>).mockReturnValue({ client: mockClient, model: 'test-model', maxTokens: 2048 });

    const results = await runRetro([], baseArtifacts, agentPrompts, agentToolSummaries);
    expect(results).toHaveLength(2);
    expect(results[0].howDidItGo).toBe('retro: failed');
    expect(results[0].whatWorkedWorst).toBe('Rate limit exceeded');
    expect(results[0].tokensUsed.input).toBe(0);
    expect(results[0].tokensUsed.output).toBe(0);
    // Second agent still succeeds
    expect(results[1].howDidItGo).toBe('Bra.');
  });

  it('marks agent as "retro: failed" on timeout (abort error)', async () => {
    const mockClient = makeMockClient([
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      { text: '## Hur gick det\nOK.\n## Bäst\nKod.\n## Sämst\nInget.', input: 300, output: 60 },
    ]);
    const { createAgentClient: mockCreate } = await import('../../src/core/agent-client.js');
    (mockCreate as ReturnType<typeof vi.fn>).mockReturnValue({ client: mockClient, model: 'test-model', maxTokens: 2048 });

    const results = await runRetro([], baseArtifacts, agentPrompts, agentToolSummaries);
    expect(results[0].howDidItGo).toBe('retro: failed');
    expect(results[0].whatWorkedWorst).toContain('aborted');
    expect(results[1].howDidItGo).toBe('OK.');
  });

  it('handles partial success (some agents fail, others succeed)', async () => {
    // Create a larger set of agents
    const manyPrompts = new Map([
      ['agent1', 'prompt1'], ['agent2', 'prompt2'], ['agent3', 'prompt3'],
      ['agent4', 'prompt4'], ['agent5', 'prompt5'],
    ]);
    const manyTools = new Map<string, string[]>();

    const mockClient = makeMockClient([
      { text: '## Hur gick det\nBra.\n## Bäst\nX.\n## Sämst\nY.', input: 100, output: 50 },
      new Error('Network timeout'),
      { text: '## Hur gick det\nOK.\n## Bäst\nA.\n## Sämst\nB.', input: 100, output: 50 },
      new Error('Server error 500'),
      { text: '## Hur gick det\nFine.\n## Bäst\nC.\n## Sämst\nD.', input: 100, output: 50 },
    ]);
    const { createAgentClient: mockCreate } = await import('../../src/core/agent-client.js');
    (mockCreate as ReturnType<typeof vi.fn>).mockReturnValue({ client: mockClient, model: 'test-model', maxTokens: 2048 });

    const results = await runRetro([], baseArtifacts, manyPrompts, manyTools);
    expect(results).toHaveLength(5);

    const succeeded = results.filter(r => r.howDidItGo !== 'retro: failed');
    const failed = results.filter(r => r.howDidItGo === 'retro: failed');
    expect(succeeded).toHaveLength(3);
    expect(failed).toHaveLength(2);
  });

  it('accumulates tokens correctly across agents', async () => {
    const mockClient = makeMockClient([
      { text: '## Hur gick det\nBra.\n## Bäst\nX.\n## Sämst\nY.', input: 1000, output: 200 },
      { text: '## Hur gick det\nOK.\n## Bäst\nA.\n## Sämst\nB.', input: 800, output: 150 },
    ]);
    const { createAgentClient: mockCreate } = await import('../../src/core/agent-client.js');
    (mockCreate as ReturnType<typeof vi.fn>).mockReturnValue({ client: mockClient, model: 'test-model', maxTokens: 2048 });

    const results = await runRetro([], baseArtifacts, agentPrompts, agentToolSummaries);

    const totalInput = results.reduce((sum, r) => sum + r.tokensUsed.input, 0);
    const totalOutput = results.reduce((sum, r) => sum + r.tokensUsed.output, 0);
    expect(totalInput).toBe(1800);
    expect(totalOutput).toBe(350);

    // Each agent's tokens tracked individually
    expect(results[0].tokensUsed.input).toBe(1000);
    expect(results[0].tokensUsed.output).toBe(200);
    expect(results[1].tokensUsed.input).toBe(800);
    expect(results[1].tokensUsed.output).toBe(150);
  });
});
