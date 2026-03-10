import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRecall = vi.fn();
const mockRemember = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  recall: (...args: unknown[]) => mockRecall(...args),
  remember: (...args: unknown[]) => mockRemember(...args),
}));

// Import AFTER mocks
import {
  extractFromConversation,
  learnFromConversation,
  type ConversationMessage,
} from '../../src/aurora/conversation.js';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  mockRecall.mockReset();
  mockRemember.mockReset();
});

/* ------------------------------------------------------------------ */
/*  extractFromConversation() tests                                    */
/* ------------------------------------------------------------------ */

describe('extractFromConversation()', () => {
  it('extracts preference from "Jag föredrar X"', async () => {
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Jag föredrar TypeScript över Python för backend-utveckling i projektet' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('preference');
    expect(items[0].text).toContain('TypeScript');
  });

  it('extracts decision from "Vi bestämde att X"', async () => {
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Vi bestämde att vi ska använda PostgreSQL istället för SQLite i produktion' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('decision');
  });

  it('extracts fact from "X fungerar bra"', async () => {
    // The regex (.+)\s+fungerar bra captures the part BEFORE the phrase.
    // We need >= 5 words in the captured group to pass MIN_WORD_COUNT.
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Retry-logiken med exponential backoff i produktion fungerar bra' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('fact');
    expect(items[0].text.split(/\s+/).length).toBeGreaterThanOrEqual(5);
  });

  it('extracts insight from "Viktigt: X"', async () => {
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Viktigt: Policy-perimetern förhindrar 95% av alla farliga kommandon i systemet' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('insight');
  });

  it('ignores assistant messages', async () => {
    const messages: ConversationMessage[] = [
      { role: 'assistant', content: 'Jag föredrar TypeScript över Python för backend-utveckling i projektet' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(0);
  });

  it('ignores short texts (< 5 words)', async () => {
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Jag föredrar TypeScript' },
    ];

    const items = await extractFromConversation(messages);

    // 'TypeScript' is only 1 word, below MIN_WORD_COUNT of 5
    expect(items).toHaveLength(0);
  });

  it('deduplicates within conversation', async () => {
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'I prefer TypeScript over Python for all backend development' },
      { role: 'user', content: 'I prefer TypeScript over Python for all backend development' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(1);
  });

  it('returns empty list when no patterns match', async () => {
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Hej, hur mår du?' },
    ];

    const items = await extractFromConversation(messages);

    expect(items).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  learnFromConversation() tests                                      */
/* ------------------------------------------------------------------ */

describe('learnFromConversation()', () => {
  it('calls remember() for new items', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });
    mockRemember.mockResolvedValue({ action: 'created', nodeId: 'test-id' });

    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Jag föredrar TypeScript över Python för backend-utveckling i projektet' },
    ];

    const result = await learnFromConversation(messages);

    expect(mockRemember).toHaveBeenCalledOnce();
    expect(result.itemsNew).toBe(1);
  });

  it('skips duplicates when recall returns similarity >= 0.8', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        {
          text: 'x',
          type: 'fact',
          confidence: 0.7,
          similarity: 0.85,
          created: '2026-01-01T00:00:00.000Z',
          nodeId: 'existing-1',
        },
      ],
      totalFound: 1,
    });

    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Jag föredrar TypeScript över Python för backend-utveckling i projektet' },
    ];

    const result = await learnFromConversation(messages);

    expect(mockRemember).not.toHaveBeenCalled();
    expect(result.itemsDuplicate).toBe(1);
    expect(result.itemsNew).toBe(0);
  });

  it('dry-run mode does not store anything', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });

    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Jag föredrar TypeScript över Python för backend-utveckling i projektet' },
    ];

    const result = await learnFromConversation(messages, { dryRun: true });

    expect(mockRemember).not.toHaveBeenCalled();
    expect(result.itemsNew).toBe(1);
  });

  it('returns correct summary', async () => {
    // First call: no match (new item)
    mockRecall.mockResolvedValueOnce({ memories: [], totalFound: 0 });
    // Second call: match with high similarity (duplicate)
    mockRecall.mockResolvedValueOnce({
      memories: [
        {
          text: 'existing',
          type: 'fact',
          confidence: 0.7,
          similarity: 0.9,
          created: '2026-01-01T00:00:00.000Z',
          nodeId: 'existing-1',
        },
      ],
      totalFound: 1,
    });
    mockRemember.mockResolvedValue({ action: 'created', nodeId: 'new-id' });

    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Jag föredrar TypeScript över Python för backend-utveckling i projektet' },
      { role: 'user', content: 'Vi bestämde att vi ska använda PostgreSQL istället för SQLite i produktion' },
    ];

    const result = await learnFromConversation(messages);

    expect(result.itemsExtracted).toBe(2);
    expect(result.itemsNew).toBe(1);
    expect(result.itemsDuplicate).toBe(1);
    expect(result.items).toHaveLength(2);
  });
});
