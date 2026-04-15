import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    OLLAMA_MODEL_POLISH: 'test-model',
  }),
}));

vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: vi.fn(),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  DEFAULT_MODEL_CONFIG: { model: 'test', maxTokens: 256 },
}));

import { generateTldr } from '../../src/aurora/transcript-tldr.js';
import { ensureOllama } from '../../src/core/ollama.js';

describe('generateTldr', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(ensureOllama).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns LLM-generated summary from Ollama', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: 'A2A enables agent-to-agent messaging while MCP connects agents to data sources.',
        },
      }),
    });

    const result = await generateTldr(
      'In this video we discuss two protocols...',
      { title: 'A2A vs MCP', channelName: 'IBM Technology' },
    );

    expect(result.tldr).toBe('A2A enables agent-to-agent messaging while MCP connects agents to data sources.');
    expect(result.modelUsed).toBe('test-model');
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('concise summarizer');
    expect(body.messages[1].content).toContain('A2A vs MCP');
    expect(body.messages[1].content).toContain('IBM Technology');
  });

  it('truncates transcript to 8000 chars', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'Summary of long text.' },
      }),
    });

    const longText = 'word '.repeat(5000);
    await generateTldr(longText, { title: 'Long Video' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg = body.messages[1].content as string;
    expect(userMsg.length).toBeLessThan(longText.length);
  });

  it('throws on Ollama failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });

    await expect(
      generateTldr('test text', { title: 'Test' }),
    ).rejects.toThrow('Ollama chat failed (500)');
  });

  it('trims whitespace from response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: '  Summary with spaces.  \n' },
      }),
    });

    const result = await generateTldr('text', { title: 'Test' });
    expect(result.tldr).toBe('Summary with spaces.');
  });

  it('handles empty response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '' } }),
    });

    const result = await generateTldr('text', { title: 'Test' });
    expect(result.tldr).toBe('');
  });
});
