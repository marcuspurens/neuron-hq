/**
 * Local model evaluation (optional, opt-in).
 *
 * TODO: Implement local model eval commands.
 * This will support:
 * - pnpm neuron local-model eval --provider ollama --model <MODEL> --runid <runid>
 * - pnpm neuron local-model eval --provider openai-compatible --base-url <URL> --model <MODEL> --runid <runid>
 *
 * NO auto-download, NO auto-pull. User must explicitly opt-in.
 */

export interface LocalModelEvalConfig {
  provider: 'ollama' | 'openai-compatible';
  model: string;
  baseUrl?: string;
  runid: string;
}

export class LocalModelEvaluator {
  // Placeholder - to be implemented
}
