// Pricing per million tokens (USD)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'sonnet': { input: 3.0, output: 15.0 },
  'haiku': { input: 0.80, output: 4.0 },
  'opus': { input: 15.0, output: 75.0 },
};

/**
 * Map a full model name to a short pricing key.
 */
export function getModelShortName(model: string): string {
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('opus')) return 'opus';
  return 'sonnet';
}

/**
 * Map a full model name to a human-readable label.
 */
export function getModelLabel(model: string): string {
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  return model;
}

/**
 * Calculate the USD cost for a given number of input/output tokens and model key.
 * Falls back to sonnet pricing if the model key is unknown.
 */
export function calcCost(inputTokens: number, outputTokens: number, modelKey: string): number {
  const pricing = MODEL_PRICING[modelKey] ?? MODEL_PRICING['sonnet'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
