import Anthropic from '@anthropic-ai/sdk';
import type { ModelConfig } from './model-registry.js';

/** Separator injected by prependPreamble between preamble and role prompt. */
const PREAMBLE_SEPARATOR = '\n\n---\n\n';

/**
 * Creates an Anthropic client for the given model config.
 * For 'anthropic' provider: uses Anthropic SDK directly.
 * For 'openai-compatible': uses Anthropic SDK with baseURL override.
 *
 * Returns { client, model, maxTokens } ready for messages.stream().
 */
export function createAgentClient(config: ModelConfig): {
  client: Anthropic;
  model: string;
  maxTokens: number;
} {
  const apiKey = process.env[config.apiKeyEnv ?? 'ANTHROPIC_API_KEY'];
  if (!apiKey) {
    const envVar = config.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
    throw new Error(`${envVar} environment variable not set`);
  }

  const client = new Anthropic({
    apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    defaultHeaders: {
      'anthropic-beta': 'output-128k-2025-02-19',
    },
  });

  return {
    client,
    model: config.model,
    maxTokens: config.maxTokens,
  };
}

/**
 * Convert a system prompt string into cacheable TextBlockParam[].
 *
 * Splits on the preamble separator (---) so that:
 *   Block 1 = preamble (cache_control) — reused across agents within cache TTL
 *   Block 2 = role prompt + context (cache_control) — reused across iterations
 *
 * If the prompt has no separator, returns a single cached block.
 *
 * Cache semantics (Anthropic):
 *   - Prefix-based: blocks 1+2 cached together per-agent
 *   - Block 1 alone cached and reusable across agents sharing the same preamble
 *   - Cache creation: +25% cost on first call
 *   - Cache reads: -90% cost on subsequent calls (within 5 min TTL)
 *   - Min cacheable size: 1024 tokens (Sonnet) / 2048 tokens (Opus)
 */
export function buildCachedSystemBlocks(
  systemPrompt: string,
): Anthropic.Messages.TextBlockParam[] {
  const sepIndex = systemPrompt.indexOf(PREAMBLE_SEPARATOR);

  if (sepIndex === -1) {
    return [
      { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
    ];
  }

  const preamble = systemPrompt.slice(0, sepIndex);
  const roleAndContext = systemPrompt.slice(sepIndex + PREAMBLE_SEPARATOR.length);

  return [
    { type: 'text' as const, text: preamble, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: roleAndContext, cache_control: { type: 'ephemeral' as const } },
  ];
}
