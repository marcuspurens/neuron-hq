/**
 * Extracts thinking/reasoning data from model responses.
 * Normalizes all providers to a `{ text: string } | null` return type.
 */

/**
 * Supported providers for thinking extraction.
 */
export type ThinkingProvider = 'anthropic' | 'openai' | 'deepseek' | 'ollama' | 'unknown';

/**
 * Extracts thinking/reasoning from a model response.
 * Normalizes all providers to { text: string }.
 * Returns null if the model did not expose thinking.
 */
export function extractThinking(
  response: unknown,
  provider: ThinkingProvider,
): { text: string } | null {
  if (response == null || typeof response !== 'object') {
    return null;
  }

  switch (provider) {
    case 'anthropic':
      return extractAnthropicThinking(response);
    case 'openai':
      return extractOpenAIThinking(response);
    case 'deepseek':
      return extractDeepSeekThinking();
    case 'ollama':
      return extractOllamaThinking();
    case 'unknown':
      return extractUnknownThinking();
    default:
      return null;
  }
}

/**
 * Extracts thinking blocks from an Anthropic Claude response.
 *
 * The Anthropic SDK returns response.content as an array of content blocks.
 * When extended thinking is enabled, one or more blocks have
 * `type: 'thinking'` and a `text` field.
 */
function extractAnthropicThinking(response: object): { text: string } | null {
  if (!('content' in response) || !Array.isArray((response as Record<string, unknown>).content)) {
    return null;
  }

  const content = (response as Record<string, unknown>).content as unknown[];
  const thinkingTexts: string[] = [];

  for (const block of content) {
    if (
      block != null &&
      typeof block === 'object' &&
      'type' in block &&
      'text' in block &&
      (block as Record<string, unknown>).type === 'thinking' &&
      typeof (block as Record<string, unknown>).text === 'string'
    ) {
      thinkingTexts.push((block as Record<string, unknown>).text as string);
    }
  }

  if (thinkingTexts.length === 0) {
    return null;
  }

  return { text: thinkingTexts.join('\n\n') };
}

/**
 * Stub for OpenAI reasoning extraction.
 * Checks response.choices[0].message.reasoning but currently returns null.
 */
function extractOpenAIThinking(_response: object): null {
  // TODO: implement extraction from response.choices[0].message.reasoning when provider is used
  return null;
}

/**
 * Stub for DeepSeek thinking extraction.
 */
function extractDeepSeekThinking(): null {
  // TODO: implement <think> regex extraction when provider is used
  return null;
}

/**
 * Stub for Ollama thinking extraction.
 */
function extractOllamaThinking(): null {
  // TODO: implement <thinking> regex extraction when provider is used
  return null;
}

/**
 * Fallback for unknown providers: tries all regex patterns.
 * Since only Claude is fully implemented, currently returns null.
 */
function extractUnknownThinking(): null {
  // TODO: try all regex patterns (<think>, <thinking>, etc.) as fallback chain
  return null;
}
