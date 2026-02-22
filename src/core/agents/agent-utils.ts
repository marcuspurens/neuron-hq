import Anthropic from '@anthropic-ai/sdk';

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
