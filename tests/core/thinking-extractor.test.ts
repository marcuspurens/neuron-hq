import { describe, it, expect } from 'vitest';
import { extractThinking } from '../../src/core/thinking-extractor.js';

describe('extractThinking', () => {
  // =====================================================
  // Anthropic (Claude)
  // =====================================================
  describe('anthropic provider', () => {
    it('extracts text from a single thinking block', () => {
      const response = {
        content: [
          { type: 'thinking', text: 'Let me analyze this problem...' },
          { type: 'text', text: 'Here is my answer...' },
        ],
      };

      const result = extractThinking(response, 'anthropic');

      expect(result).toEqual({ text: 'Let me analyze this problem...' });
    });

    it('concatenates multiple thinking blocks', () => {
      const response = {
        content: [
          { type: 'thinking', text: 'First, let me consider...' },
          { type: 'text', text: 'Intermediate text' },
          { type: 'thinking', text: 'Now let me reconsider...' },
        ],
      };

      const result = extractThinking(response, 'anthropic');

      expect(result).toEqual({
        text: 'First, let me consider...\n\nNow let me reconsider...',
      });
    });

    it('returns null when no thinking blocks present', () => {
      const response = {
        content: [
          { type: 'text', text: 'Here is my answer...' },
        ],
      };

      const result = extractThinking(response, 'anthropic');

      expect(result).toBeNull();
    });

    it('returns null when content is not an array', () => {
      const response = { content: 'not an array' };

      const result = extractThinking(response, 'anthropic');

      expect(result).toBeNull();
    });

    it('returns null when response has no content field', () => {
      const response = { choices: [] };

      const result = extractThinking(response, 'anthropic');

      expect(result).toBeNull();
    });
  });

  // =====================================================
  // Stubs (OpenAI, DeepSeek, Ollama, unknown)
  // =====================================================
  describe('openai provider (stub)', () => {
    it('returns null for any response', () => {
      const response = {
        choices: [{ message: { reasoning: 'some reasoning', content: 'answer' } }],
      };

      expect(extractThinking(response, 'openai')).toBeNull();
    });
  });

  describe('deepseek provider (stub)', () => {
    it('returns null for any response', () => {
      const response = { content: '<think>reasoning</think>answer' };

      expect(extractThinking(response, 'deepseek')).toBeNull();
    });
  });

  describe('ollama provider (stub)', () => {
    it('returns null for any response', () => {
      const response = { content: '<thinking>reasoning</thinking>answer' };

      expect(extractThinking(response, 'ollama')).toBeNull();
    });
  });

  describe('unknown provider', () => {
    it('returns null for any response', () => {
      const response = { content: 'some response' };

      expect(extractThinking(response, 'unknown')).toBeNull();
    });
  });

  // =====================================================
  // Edge cases
  // =====================================================
  describe('edge cases', () => {
    it('returns null for null response', () => {
      expect(extractThinking(null, 'anthropic')).toBeNull();
    });

    it('returns null for undefined response', () => {
      expect(extractThinking(undefined, 'anthropic')).toBeNull();
    });

    it('returns null for non-object response', () => {
      expect(extractThinking('string response', 'anthropic')).toBeNull();
      expect(extractThinking(42, 'anthropic')).toBeNull();
    });
  });
});
