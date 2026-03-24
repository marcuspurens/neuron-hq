import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logger.js';
const logger = createLogger('agent:utils');
import fs from 'fs/promises';
import path from 'path';

/**
 * Max characters returned from any single tool result.
 * ~3 chars/token → ~4000 tokens per result, well within limits.
 */
export const MAX_TOOL_RESULT_CHARS = 12_000;

/**
 * Max total characters in the messages array before trimming.
 * ~3 chars/token → ~100k tokens, leaves room for system prompt + response.
 */
export const MAX_MESSAGES_CHARS = 360_000;

/**
 * Minimum number of recent messages to always keep when trimming.
 */
const MIN_RECENT_MESSAGES = 10;

/**
 * Truncate a tool result string if it exceeds MAX_TOOL_RESULT_CHARS.
 */
export function truncateToolResult(result: string, maxChars = MAX_TOOL_RESULT_CHARS): string {
  if (result.length <= maxChars) return result;
  const kept = result.slice(0, maxChars);
  const dropped = result.length - maxChars;
  return `${kept}\n\n[... truncated ${dropped} chars ...]`;
}

/**
 * Estimate total character count of all messages.
 */
export function estimateMessagesChars(messages: Anthropic.MessageParam[]): number {
  return messages.reduce((sum, msg) => {
    if (typeof msg.content === 'string') return sum + msg.content.length;
    if (Array.isArray(msg.content)) {
      return (
        sum +
        msg.content.reduce((s, block) => {
          if ('text' in block && typeof block.text === 'string') return s + block.text.length;
          if ('content' in block && typeof block.content === 'string') return s + block.content.length;
          return s + 200; // rough estimate for other block types
        }, 0)
      );
    }
    return sum;
  }, 0);
}

/**
 * Number of most recent tool results to preserve in full.
 * Older tool results are replaced with a short placeholder to save tokens.
 */
const KEEP_RECENT_TOOL_RESULTS = 6;

/** Placeholder text for cleared tool results (~20 chars vs ~12k original). */
const CLEARED_TOOL_RESULT = '[Tool result cleared to save context]';

/**
 * Clear old tool result content from messages to reduce token usage.
 *
 * Preserves the most recent KEEP_RECENT_TOOL_RESULTS tool results in full.
 * Older tool results are replaced with a short placeholder. The tool_use and
 * tool_result blocks are kept (so the conversation flow makes sense to the model)
 * but the heavy content is removed.
 *
 * This is the client-side equivalent of Anthropic's server-side
 * clear_tool_uses_20250919 beta feature.
 */
export function clearOldToolResults(
  messages: Anthropic.MessageParam[],
  keepRecent = KEEP_RECENT_TOOL_RESULTS
): Anthropic.MessageParam[] {
  // Count total tool results (walking backwards to identify the recent ones)
  let totalToolResults = 0;
  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('type' in block && block.type === 'tool_result') {
          totalToolResults++;
        }
      }
    }
  }

  // Nothing to clear
  if (totalToolResults <= keepRecent) return messages;

  // Walk forward, clearing old tool results
  let toolResultIndex = 0;
  const clearBefore = totalToolResults - keepRecent;

  return messages.map((msg) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    let modified = false;
    const newContent = msg.content.map((block) => {
      if (!('type' in block) || block.type !== 'tool_result') return block;

      toolResultIndex++;
      if (toolResultIndex <= clearBefore) {
        modified = true;
        // Replace content but keep the block structure
        return { ...block, content: CLEARED_TOOL_RESULT };
      }
      return block;
    });

    return modified ? { ...msg, content: newContent } : msg;
  });
}

/**
 * Trim the messages array to stay within MAX_MESSAGES_CHARS.
 *
 * Two-phase strategy:
 *   Phase 1: Clear old tool result content (keeps message structure intact)
 *   Phase 2: If still over budget, drop oldest middle messages
 *
 * Always keeps the first message (the brief) and the most recent
 * MIN_RECENT_MESSAGES messages.
 */
export function trimMessages(
  messages: Anthropic.MessageParam[],
  maxChars = MAX_MESSAGES_CHARS
): Anthropic.MessageParam[] {
  // Phase 1: Clear old tool results first (preserves conversation flow)
  let trimmed = clearOldToolResults(messages);

  if (estimateMessagesChars(trimmed) <= maxChars) return trimmed;

  // Phase 2: Drop oldest middle messages if still over budget
  if (trimmed.length <= MIN_RECENT_MESSAGES + 1) return trimmed;

  while (
    estimateMessagesChars(trimmed) > maxChars &&
    trimmed.length > MIN_RECENT_MESSAGES + 1
  ) {
    const insertionNote: Anthropic.MessageParam = {
      role: 'user',
      content: '[Earlier conversation history was trimmed to stay within context limits.]',
    };

    const recent = trimmed.slice(-(MIN_RECENT_MESSAGES));
    trimmed = [trimmed[0], insertionNote, ...recent];

    if (trimmed.length <= MIN_RECENT_MESSAGES + 2) break;
  }

  return trimmed;
}

/**
 * Maximum number of retry attempts for overloaded API errors.
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay in ms for exponential backoff: 5s, 10s, 20s.
 */
export const RETRY_BASE_DELAY_MS = 5_000;

/**
 * Base delay in ms for connection error retries: 10s, 20s, 40s.
 */
export const CONNECTION_RETRY_BASE_DELAY_MS = 10_000;

/**
 * Returns true if an error is an Anthropic overloaded_error.
 */
export function isOverloadedError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('overloaded_error');
  }
  return false;
}

/**
 * Returns true if an error is a transient network/connection error worth retrying.
 */
export function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    const cause = (error as NodeJS.ErrnoException).cause as NodeJS.ErrnoException | undefined;
    const code = (error as NodeJS.ErrnoException).code ?? cause?.code ?? '';
    return (
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      msg.includes('Connection error') ||
      msg.includes('read ETIMEDOUT') ||
      msg.includes('connect ETIMEDOUT')
    );
  }
  return false;
}

/**
 * Returns true if the error is retryable (overloaded or transient connection error).
 */
export function isRetryableError(error: unknown): boolean {
  return isOverloadedError(error) || isConnectionError(error);
}

/**
 * Execute an async function with exponential backoff retry on overloaded_error.
 * Retries up to maxAttempts times. Other errors are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = MAX_RETRY_ATTEMPTS,
  baseDelayMs = RETRY_BASE_DELAY_MS
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = isConnectionError(error) ? CONNECTION_RETRY_BASE_DELAY_MS : baseDelayMs;
      const delayMs = delay * Math.pow(2, attempt - 1);
      const reason = isOverloadedError(error) ? 'API overloaded' : 'Connection error';
      logger.info('Retrying after error', { reason, delayMs: String(delayMs / 1000), attempt: String(attempt), maxAttempts: String(maxAttempts) });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // unreachable, but needed for TypeScript
  throw new Error('withRetry: exhausted all attempts');
}

/**
 * Returns true if the Anthropic response contains zero output tokens.
 */
export function isEmptyResponse(response: Anthropic.Message): boolean {
  return response.usage.output_tokens === 0;
}

/**
 * Delays (in ms) between empty-response retry attempts: 5s, 15s, 30s.
 */
export const EMPTY_RETRY_DELAYS = [5_000, 15_000, 30_000] as const;

/**
 * Options for streamWithEmptyRetry().
 */
export interface StreamWithRetryOptions {
  client: Anthropic;
  model: string;
  maxTokens: number;
  system: Anthropic.MessageCreateParams['system'];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  agent: string;          // for logging
  iteration?: number;     // for diagnostics (default 0)
  onText?: (text: string) => void; // streaming text callback
}

/**
 * Calls client.messages.stream() with 0-token retry logic.
 * - Retries up to maxEmptyRetries (default 3) times with exponential backoff (EMPTY_RETRY_DELAYS)
 * - Logs diagnostic info on each empty response
 * - Falls back to non-streaming client.messages.create() if all streaming retries give 0 tokens
 * - Returns the response even if fallback also gives 0 tokens (caller decides)
 */
export async function streamWithEmptyRetry(
  opts: StreamWithRetryOptions,
  maxEmptyRetries = 3,
): Promise<Anthropic.Message> {
  const { client, model, maxTokens, system, messages, tools, agent, iteration = 0, onText } = opts;

  for (let attempt = 0; attempt < maxEmptyRetries; attempt++) {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools,
    });

    if (onText) {
      stream.on('text', onText);
    }

    const response = await stream.finalMessage();

    if (!isEmptyResponse(response)) {
      return response;
    }

    // 0-token response — log diagnostics
    logger.warn('Empty response (0 output tokens)', {
      agent,
      iteration: String(iteration),
      retryAttempt: String(attempt + 1),
      maxRetries: String(maxEmptyRetries),
      systemPromptChars: String(
        typeof system === 'string'
          ? system.length
          : Array.isArray(system)
            ? system.reduce((acc, b) => acc + (typeof b === 'object' && 'text' in b && typeof b.text === 'string' ? b.text.length : 0), 0)
            : 0
      ),
      messagesChars: String(estimateMessagesChars(messages)),
      model,
    });

    if (attempt < maxEmptyRetries - 1) {
      const delay = EMPTY_RETRY_DELAYS[attempt] ?? EMPTY_RETRY_DELAYS[EMPTY_RETRY_DELAYS.length - 1];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All streaming retries gave 0 tokens — fallback to non-streaming
  logger.warn('All streaming retries gave 0 tokens, falling back to non-streaming', {
    agent,
    iteration: String(iteration),
    model,
  });

  const fallbackResponse = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools,
  });

  if (isEmptyResponse(fallbackResponse)) {
    logger.warn('Fallback non-streaming also gave 0 tokens', {
      agent,
      iteration: String(iteration),
      model,
    });
  }

  return fallbackResponse;
}

/**
 * Max characters returned from searchMemoryFiles.
 */
const MAX_SEARCH_RESULT_CHARS = 2000;

/**
 * Search all memory files for a query string (case-insensitive substring match).
 * Returns matching entries (sections starting with ## ) truncated to MAX_SEARCH_RESULT_CHARS.
 */
export async function searchMemoryFiles(query: string, memoryDir: string): Promise<string> {
  const files = ['runs.md', 'patterns.md', 'errors.md', 'techniques.md'];
  const lowerQuery = query.toLowerCase();
  const matches: string[] = [];

  for (const fileName of files) {
    const filePath = path.join(memoryDir, fileName);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {  /* intentional: memory file may not exist */
      continue;
    }

    // Split into sections by ## headers
    const sections = content.split(/(?=^## )/m);
    for (const section of sections) {
      if (section.toLowerCase().includes(lowerQuery)) {
        matches.push(`[${fileName}]\n${section.trim()}`);
      }
    }
  }

  if (matches.length === 0) {
    return `No matches found for "${query}" in memory files.`;
  }

  const result = matches.join('\n\n---\n\n');
  return truncateToolResult(result, MAX_SEARCH_RESULT_CHARS);
}
