import { z } from 'zod';

export const ModelProviderSchema = z.enum(['anthropic', 'openai-compatible']);

export const ModelConfigSchema = z.object({
  provider: ModelProviderSchema,
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  maxTokens: z.number().positive().default(128000),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const AGENT_ROLES = [
  'manager', 'implementer', 'reviewer', 'researcher',
  'tester', 'merger', 'historian', 'librarian', 'consolidator', 'brief-agent',
] as const;

export type AgentRole = typeof AGENT_ROLES[number];

export const AgentModelMapSchema = z.record(
  z.enum(AGENT_ROLES),
  ModelConfigSchema.optional(),
);

export type AgentModelMap = z.infer<typeof AgentModelMapSchema>;

/**
 * Default model config — used when no per-agent override exists.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxTokens: 128000,
};

/**
 * Resolve the model config for a given agent role.
 * Priority: per-agent override → defaultOverride → DEFAULT_MODEL_CONFIG
 */
export function resolveModelConfig(
  role: string,
  agentModelMap?: AgentModelMap,
  defaultOverride?: string,
): ModelConfig {
  // Check per-agent override first
  if (agentModelMap && role in agentModelMap) {
    const override = agentModelMap[role as AgentRole];
    if (override) return override;
  }

  // If CLI --model was provided, use it as default model
  if (defaultOverride) {
    return { ...DEFAULT_MODEL_CONFIG, model: defaultOverride };
  }

  return DEFAULT_MODEL_CONFIG;
}
