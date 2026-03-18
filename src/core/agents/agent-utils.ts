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
function estimateMessagesChars(messages: Anthropic.MessageParam[]): number {
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
 * Trim the messages array to stay within MAX_MESSAGES_CHARS.
 *
 * Strategy: always keep the first message (the brief) and the most recent
 * MIN_RECENT_MESSAGES messages. Drop the oldest middle messages until we're
 * under budget.
 */
export function trimMessages(
  messages: Anthropic.MessageParam[],
  maxChars = MAX_MESSAGES_CHARS
): Anthropic.MessageParam[] {
  if (estimateMessagesChars(messages) <= maxChars) return messages;

  // Always keep first message (brief) + at least MIN_RECENT_MESSAGES at the end
  if (messages.length <= MIN_RECENT_MESSAGES + 1) return messages;

  let trimmed = [...messages];

  while (
    estimateMessagesChars(trimmed) > maxChars &&
    trimmed.length > MIN_RECENT_MESSAGES + 1
  ) {
    // Drop the oldest message after index 0 (keep brief + recent)
    const insertionNote: Anthropic.MessageParam = {
      role: 'user',
      content: '[Earlier conversation history was trimmed to stay within context limits.]',
    };

    // Remove from index 1 (keep index 0 = brief)
    const recent = trimmed.slice(-(MIN_RECENT_MESSAGES));
    trimmed = [trimmed[0], insertionNote, ...recent];

    // If we can't trim further, break to avoid infinite loop
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
