import fs from 'fs/promises';
import { type Usage, type RunId } from './types.js';
import { DEFAULT_MODEL_CONFIG } from './model-registry.js';

export class UsageTracker {
  private usage: Usage;

  constructor(runid: RunId, model: string = DEFAULT_MODEL_CONFIG.model) {
    this.usage = {
      runid,
      model,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_creation_tokens: 0,
      total_cache_read_tokens: 0,
      by_agent: {},
      tool_counts: {},
    };
  }

  /**
   * Record token usage for an agent, including cache metrics.
   */
  recordTokens(
    agent: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens = 0,
    cacheReadTokens = 0,
  ): void {
    this.usage.total_input_tokens += inputTokens;
    this.usage.total_output_tokens += outputTokens;
    this.usage.total_cache_creation_tokens =
      (this.usage.total_cache_creation_tokens ?? 0) + cacheCreationTokens;
    this.usage.total_cache_read_tokens =
      (this.usage.total_cache_read_tokens ?? 0) + cacheReadTokens;

    if (!this.usage.by_agent[agent]) {
      this.usage.by_agent[agent] = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
      };
    }

    this.usage.by_agent[agent].input_tokens += inputTokens;
    this.usage.by_agent[agent].output_tokens += outputTokens;
    this.usage.by_agent[agent].cache_creation_tokens =
      (this.usage.by_agent[agent].cache_creation_tokens ?? 0) + cacheCreationTokens;
    this.usage.by_agent[agent].cache_read_tokens =
      (this.usage.by_agent[agent].cache_read_tokens ?? 0) + cacheReadTokens;
  }

  /**
   * Record a tool call.
   */
  recordToolCall(toolName: string): void {
    this.usage.tool_counts[toolName] =
      (this.usage.tool_counts[toolName] || 0) + 1;
  }

  /**
   * Record iteration counts for an agent.
   */
  recordIterations(agent: string, used: number, limit: number): void {
    if (!this.usage.by_agent[agent]) {
      this.usage.by_agent[agent] = { input_tokens: 0, output_tokens: 0 };
    }
    this.usage.by_agent[agent].iterations_used = used;
    this.usage.by_agent[agent].iterations_limit = limit;
  }

  /**
   * Get current usage data.
   */
  getUsage(): Usage {
    return { ...this.usage };
  }

  /**
   * Save usage data to file.
   */
  async save(filePath: string): Promise<void> {
    const content = JSON.stringify(this.usage, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Load usage data from file.
   */
  static async load(filePath: string): Promise<Usage> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Format usage as a summary string.
   */
  formatSummary(): string {
    const total = this.usage.total_input_tokens + this.usage.total_output_tokens;
    const cacheRead = this.usage.total_cache_read_tokens ?? 0;
    const cacheCreate = this.usage.total_cache_creation_tokens ?? 0;
    const cachePart = cacheRead > 0
      ? `, cache read: ${cacheRead.toLocaleString()}, cache create: ${cacheCreate.toLocaleString()}`
      : '';
    return `Total tokens: ${total.toLocaleString()} (in: ${this.usage.total_input_tokens.toLocaleString()}, out: ${this.usage.total_output_tokens.toLocaleString()}${cachePart})`;
  }
}
