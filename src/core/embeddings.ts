import { isDbAvailable } from './db.js';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimension: number;
}

/** Shape of the Ollama /api/embed response. */
interface OllamaEmbedResponse {
  embeddings: number[][];
}

/**
 * Ollama-based embedding via HTTP API.
 * Requires: ollama pull snowflake-arctic-embed
 */
export class OllamaEmbedding implements EmbeddingProvider {
  readonly dimension = 768;
  private baseUrl: string;
  private model: string;

  constructor(
    baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434',
    model = process.env.OLLAMA_MODEL_EMBED || 'snowflake-arctic-embed'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`);
    const data = (await resp.json()) as OllamaEmbedResponse;
    return data.embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!resp.ok) throw new Error(`Ollama embed batch failed: ${resp.status}`);
    const data = (await resp.json()) as OllamaEmbedResponse;
    return data.embeddings;
  }
}

/**
 * Check if embedding provider is available.
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  if (!(await isDbAvailable())) return false;
  try {
    const provider = getEmbeddingProvider();
    const result = await provider.embed('test');
    return result.length === provider.dimension;
  } catch {
    return false;
  }
}

let cachedProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) {
    cachedProvider = new OllamaEmbedding();
  }
  return cachedProvider;
}

/** Reset cached provider (for testing). */
export function resetEmbeddingProvider(): void {
  cachedProvider = null;
}
