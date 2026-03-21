import { describe, it, expect } from 'vitest';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  ModelConfigSchema,
  AgentModelMapSchema,
  AGENT_ROLES,
  type AgentModelMap,
} from '../../src/core/model-registry.js';

describe('resolveModelConfig', () => {
  it('returns default config when no overrides exist', () => {
    const config = resolveModelConfig('manager');
    expect(config).toEqual(DEFAULT_MODEL_CONFIG);
  });

  it('returns per-agent override when it exists', () => {
    const map: AgentModelMap = {
      researcher: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 4096,
      },
    };
    const config = resolveModelConfig('researcher', map);
    expect(config.model).toBe('claude-haiku-4-5-20251001');
    expect(config.maxTokens).toBe(4096);
  });

  it('falls back to default for role not in map', () => {
    const map: AgentModelMap = {
      researcher: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 4096,
      },
    };
    const config = resolveModelConfig('manager', map);
    expect(config).toEqual(DEFAULT_MODEL_CONFIG);
  });

  it('uses defaultOverride when no per-agent override', () => {
    const config = resolveModelConfig('manager', undefined, 'claude-sonnet-4-6');
    expect(config.model).toBe('claude-sonnet-4-6');
    expect(config.provider).toBe('anthropic');
  });

  it('per-agent override takes priority over defaultOverride', () => {
    const map: AgentModelMap = {
      researcher: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 4096,
      },
    };
    const config = resolveModelConfig('researcher', map, 'claude-sonnet-4-6');
    expect(config.model).toBe('claude-haiku-4-5-20251001');
  });

  it('handles empty agentModelMap', () => {
    const config = resolveModelConfig('manager', {});
    expect(config).toEqual(DEFAULT_MODEL_CONFIG);
  });

  it('returns default for unknown role string', () => {
    const config = resolveModelConfig('nonexistent-role');
    expect(config).toEqual(DEFAULT_MODEL_CONFIG);
  });
});

describe('ModelConfigSchema', () => {
  it('validates correct config', () => {
    const result = ModelConfigSchema.safeParse({
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      maxTokens: 128000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid provider', () => {
    const result = ModelConfigSchema.safeParse({
      provider: 'invalid-provider',
      model: 'some-model',
    });
    expect(result.success).toBe(false);
  });

  it('applies default maxTokens', () => {
    const result = ModelConfigSchema.parse({
      provider: 'anthropic',
      model: 'claude-opus-4-6',
    });
    expect(result.maxTokens).toBe(128000);
  });

  it('accepts openai-compatible provider', () => {
    const result = ModelConfigSchema.safeParse({
      provider: 'openai-compatible',
      model: 'llama-3',
      baseUrl: 'http://localhost:11434',
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentModelMapSchema', () => {
  it('validates map with multiple agents', () => {
    const result = AgentModelMapSchema.safeParse({
      researcher: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 4096,
      },
      historian: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates empty map', () => {
    const result = AgentModelMapSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('DEFAULT_MODEL_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_MODEL_CONFIG.provider).toBe('anthropic');
    expect(DEFAULT_MODEL_CONFIG.model).toBe('claude-opus-4-6');
    expect(DEFAULT_MODEL_CONFIG.maxTokens).toBe(128000);
  });
});

describe('AGENT_ROLES', () => {
  it('contains all 10 agent roles', () => {
    expect(AGENT_ROLES).toHaveLength(10);
    expect(AGENT_ROLES).toContain('manager');
    expect(AGENT_ROLES).toContain('brief-agent');
  });
});
