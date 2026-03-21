import Anthropic from '@anthropic-ai/sdk';
import type { ModelConfig } from './model-registry.js';

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
