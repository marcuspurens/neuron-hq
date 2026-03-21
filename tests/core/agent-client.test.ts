import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAgentClient } from '../../src/core/agent-client.js';
import { DEFAULT_MODEL_CONFIG, type ModelConfig } from '../../src/core/model-registry.js';

describe('createAgentClient', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('creates Anthropic client with default config', () => {
    const { client, model, maxTokens } = createAgentClient(DEFAULT_MODEL_CONFIG);
    expect(client).toBeDefined();
    expect(model).toBe('claude-opus-4-6');
    expect(maxTokens).toBe(128000);
  });

  it('returns correct model and maxTokens from config', () => {
    const config: ModelConfig = {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 4096,
    };
    const { model, maxTokens } = createAgentClient(config);
    expect(model).toBe('claude-haiku-4-5-20251001');
    expect(maxTokens).toBe(4096);
  });

  it('uses custom apiKeyEnv', () => {
    process.env.CUSTOM_API_KEY = 'custom-test-key';
    const config: ModelConfig = {
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      maxTokens: 128000,
      apiKeyEnv: 'CUSTOM_API_KEY',
    };
    const { client } = createAgentClient(config);
    expect(client).toBeDefined();
    delete process.env.CUSTOM_API_KEY;
  });

  it('throws when API key env var is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createAgentClient(DEFAULT_MODEL_CONFIG)).toThrow(
      'ANTHROPIC_API_KEY environment variable not set'
    );
  });

  it('throws with custom env var name in error message', () => {
    const config: ModelConfig = {
      provider: 'anthropic',
      model: 'test-model',
      maxTokens: 128000,
      apiKeyEnv: 'CUSTOM_KEY',
    };
    expect(() => createAgentClient(config)).toThrow(
      'CUSTOM_KEY environment variable not set'
    );
  });

  it('creates client with baseUrl for openai-compatible', () => {
    const config: ModelConfig = {
      provider: 'openai-compatible',
      model: 'llama-3',
      maxTokens: 4096,
      baseUrl: 'http://localhost:11434',
    };
    const { client, model } = createAgentClient(config);
    expect(client).toBeDefined();
    expect(model).toBe('llama-3');
  });
});
