import { describe, it, expect } from 'vitest';
import { buildCachedSystemBlocks } from '../../src/core/agent-client.js';
import { clearOldToolResults } from '../../src/core/agents/agent-utils.js';
import type Anthropic from '@anthropic-ai/sdk';

describe('buildCachedSystemBlocks', () => {
  it('splits on preamble separator into two cached blocks', () => {
    const prompt = 'This is the preamble\n\n---\n\nThis is the role prompt';
    const blocks = buildCachedSystemBlocks(prompt);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('This is the preamble');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1].text).toBe('This is the role prompt');
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('returns single cached block when no separator exists', () => {
    const prompt = 'Just a simple prompt without separator';
    const blocks = buildCachedSystemBlocks(prompt);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(prompt);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('handles empty string', () => {
    const blocks = buildCachedSystemBlocks('');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('');
  });

  it('splits on first separator only', () => {
    const prompt = 'Preamble\n\n---\n\nRole prompt\n\n---\n\nMore content';
    const blocks = buildCachedSystemBlocks(prompt);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('Preamble');
    expect(blocks[1].text).toBe('Role prompt\n\n---\n\nMore content');
  });

  it('all blocks have type text', () => {
    const prompt = 'A\n\n---\n\nB';
    const blocks = buildCachedSystemBlocks(prompt);
    for (const block of blocks) {
      expect(block.type).toBe('text');
    }
  });
});

describe('clearOldToolResults', () => {
  function makeToolResultMessage(content: string, toolUseId: string): Anthropic.MessageParam {
    return {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: toolUseId, content },
      ],
    };
  }

  function makeTextMessage(text: string, role: 'user' | 'assistant' = 'user'): Anthropic.MessageParam {
    return { role, content: text };
  }

  it('does nothing when fewer tool results than keepRecent', () => {
    const messages: Anthropic.MessageParam[] = [
      makeTextMessage('brief'),
      makeToolResultMessage('file content 1', 'id1'),
      makeToolResultMessage('file content 2', 'id2'),
    ];

    const result = clearOldToolResults(messages, 6);
    expect(result).toBe(messages); // same reference — no changes
  });

  it('clears old tool results beyond keepRecent', () => {
    const messages: Anthropic.MessageParam[] = [
      makeTextMessage('brief'),
      makeToolResultMessage('OLD content 1', 'id1'),
      makeToolResultMessage('OLD content 2', 'id2'),
      makeToolResultMessage('KEEP content 3', 'id3'),
      makeToolResultMessage('KEEP content 4', 'id4'),
    ];

    const result = clearOldToolResults(messages, 2);

    // First two tool results should be cleared
    const block1 = (result[1].content as Array<{ content?: string }>)[0];
    expect(block1.content).toBe('[Tool result cleared to save context]');

    const block2 = (result[2].content as Array<{ content?: string }>)[0];
    expect(block2.content).toBe('[Tool result cleared to save context]');

    // Last two should be preserved
    const block3 = (result[3].content as Array<{ content?: string }>)[0];
    expect(block3.content).toBe('KEEP content 3');

    const block4 = (result[4].content as Array<{ content?: string }>)[0];
    expect(block4.content).toBe('KEEP content 4');
  });

  it('preserves non-tool-result messages untouched', () => {
    const messages: Anthropic.MessageParam[] = [
      makeTextMessage('brief'),
      makeTextMessage('response', 'assistant'),
      makeToolResultMessage('OLD', 'id1'),
      makeToolResultMessage('KEEP', 'id2'),
    ];

    const result = clearOldToolResults(messages, 1);

    // Text messages unchanged
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toBe(messages[1]);

    // Old tool result cleared
    const cleared = (result[2].content as Array<{ content?: string }>)[0];
    expect(cleared.content).toBe('[Tool result cleared to save context]');

    // Recent tool result kept
    const kept = (result[3].content as Array<{ content?: string }>)[0];
    expect(kept.content).toBe('KEEP');
  });

  it('handles messages with multiple tool results in one message', () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result' as const, tool_use_id: 'id1', content: 'OLD1' },
          { type: 'tool_result' as const, tool_use_id: 'id2', content: 'OLD2' },
        ],
      },
      makeToolResultMessage('KEEP', 'id3'),
    ];

    const result = clearOldToolResults(messages, 1);

    const blocks = result[0].content as Array<{ content?: string }>;
    expect(blocks[0].content).toBe('[Tool result cleared to save context]');
    expect(blocks[1].content).toBe('[Tool result cleared to save context]');

    const kept = (result[1].content as Array<{ content?: string }>)[0];
    expect(kept.content).toBe('KEEP');
  });

  it('preserves tool_use_id and type on cleared results', () => {
    const messages: Anthropic.MessageParam[] = [
      makeToolResultMessage('OLD content', 'toolu_abc123'),
      makeToolResultMessage('KEEP', 'toolu_def456'),
    ];

    const result = clearOldToolResults(messages, 1);
    const cleared = (result[0].content as Array<{ type: string; tool_use_id: string }>)[0];
    expect(cleared.type).toBe('tool_result');
    expect(cleared.tool_use_id).toBe('toolu_abc123');
  });

  it('default keepRecent is 6', () => {
    const messages: Anthropic.MessageParam[] = [];
    for (let i = 0; i < 8; i++) {
      messages.push(makeToolResultMessage(`content ${i}`, `id${i}`));
    }

    const result = clearOldToolResults(messages);

    // First 2 should be cleared (8 - 6 = 2)
    const first = (result[0].content as Array<{ content?: string }>)[0];
    expect(first.content).toBe('[Tool result cleared to save context]');

    const second = (result[1].content as Array<{ content?: string }>)[0];
    expect(second.content).toBe('[Tool result cleared to save context]');

    // 3rd onwards should be preserved
    const third = (result[2].content as Array<{ content?: string }>)[0];
    expect(third.content).toBe('content 2');
  });
});

describe('UsageTracker cache metrics', () => {
  it('tracks cache creation and read tokens', async () => {
    const { UsageTracker } = await import('../../src/core/usage.js');
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');

    tracker.recordTokens('manager', 1000, 200, 500, 0);   // first call: cache creation
    tracker.recordTokens('manager', 1000, 200, 0, 500);   // second call: cache read

    const usage = tracker.getUsage();
    expect(usage.total_cache_creation_tokens).toBe(500);
    expect(usage.total_cache_read_tokens).toBe(500);
    expect(usage.by_agent.manager.cache_creation_tokens).toBe(500);
    expect(usage.by_agent.manager.cache_read_tokens).toBe(500);
  });

  it('defaults cache tokens to 0 when not provided', async () => {
    const { UsageTracker } = await import('../../src/core/usage.js');
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');

    tracker.recordTokens('implementer', 1000, 200);

    const usage = tracker.getUsage();
    expect(usage.total_cache_creation_tokens).toBe(0);
    expect(usage.total_cache_read_tokens).toBe(0);
  });

  it('formatSummary includes cache info when present', async () => {
    const { UsageTracker } = await import('../../src/core/usage.js');
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');

    tracker.recordTokens('manager', 1000, 200, 0, 800);

    const summary = tracker.formatSummary();
    expect(summary).toContain('cache read: 800');
  });

  it('formatSummary omits cache info when no cache reads', async () => {
    const { UsageTracker } = await import('../../src/core/usage.js');
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');

    tracker.recordTokens('manager', 1000, 200);

    const summary = tracker.formatSummary();
    expect(summary).not.toContain('cache');
  });
});
