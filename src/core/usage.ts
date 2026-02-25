import fs from 'fs/promises';
import { type Usage, type RunId } from './types.js';

export class UsageTracker {
  private usage: Usage;

  constructor(runid: RunId, model: string = 'claude-sonnet-4-5-20250929') {
    this.usage = {
      runid,
      model,
      total_input_tokens: 0,
      total_output_tokens: 0,
      by_agent: {},
      tool_counts: {},
    };
  }

  /**
   * Record token usage for an agent.
   */
  recordTokens(
    agent: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    this.usage.total_input_tokens += inputTokens;
    this.usage.total_output_tokens += outputTokens;

    if (!this.usage.by_agent[agent]) {
      this.usage.by_agent[agent] = {
        input_tokens: 0,
        output_tokens: 0,
      };
    }

    this.usage.by_agent[agent].input_tokens += inputTokens;
    this.usage.by_agent[agent].output_tokens += outputTokens;
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
    return `Total tokens: ${total.toLocaleString()} (in: ${this.usage.total_input_tokens.toLocaleString()}, out: ${this.usage.total_output_tokens.toLocaleString()})`;
  }
}
