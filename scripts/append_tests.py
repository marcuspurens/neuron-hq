#!/usr/bin/env python3
"""Script to append new test blocks to agent-utils.test.ts and observer.test.ts."""

import re

# ─── Part A: agent-utils.test.ts ─────────────────────────────────────────────

agent_utils_path = 'tests/core/agent-utils.test.ts'

with open(agent_utils_path, 'r') as f:
    content = f.read()

# 1. Update the vitest import to include vi
content = content.replace(
    "import { describe, it, expect, afterEach } from 'vitest';",
    "import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';"
)

# 2. Update the agent-utils import to include new exports
content = content.replace(
    "import { searchMemoryFiles, truncateToolResult, trimMessages, MAX_TOOL_RESULT_CHARS, withRetry, isOverloadedError, isConnectionError, isRetryableError } from '../../src/core/agents/agent-utils.js';",
    "import { searchMemoryFiles, truncateToolResult, trimMessages, MAX_TOOL_RESULT_CHARS, withRetry, isOverloadedError, isConnectionError, isRetryableError, isEmptyResponse, EMPTY_RETRY_DELAYS, streamWithEmptyRetry } from '../../src/core/agents/agent-utils.js';"
)

# 3. Append the new describe blocks at the end
new_tests = """
describe('isEmptyResponse', () => {
  it('returns true when output_tokens is 0', () => {
    const msg = { usage: { output_tokens: 0 } } as unknown as Anthropic.Message;
    expect(isEmptyResponse(msg)).toBe(true);
  });

  it('returns false when output_tokens > 0', () => {
    const msg = { usage: { output_tokens: 42 } } as unknown as Anthropic.Message;
    expect(isEmptyResponse(msg)).toBe(false);
  });
});

describe('EMPTY_RETRY_DELAYS', () => {
  it('is [5000, 15000, 30000]', () => {
    expect(EMPTY_RETRY_DELAYS).toEqual([5_000, 15_000, 30_000]);
  });
});

describe('streamWithEmptyRetry', () => {
  it('returns immediately on success without delay', async () => {
    const mockMessage = {
      usage: { output_tokens: 10, input_tokens: 5 },
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
    } as unknown as Anthropic.Message;

    const mockStream = {
      on: vi.fn().mockReturnThis(),
      finalMessage: vi.fn().mockResolvedValue(mockMessage),
    };

    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue(mockStream),
        create: vi.fn(),
      },
    } as unknown as Anthropic;

    const result = await streamWithEmptyRetry({
      client: mockClient,
      model: 'claude-3-5-haiku-20241022',
      maxTokens: 1024,
      system: 'test system',
      messages: [{ role: 'user', content: 'test' }],
      tools: [],
      agent: 'historian',
    });

    expect(result).toBe(mockMessage);
    expect(mockClient.messages.stream).toHaveBeenCalledTimes(1);
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it('falls back to non-streaming after 3 empty streaming attempts', async () => {
    const emptyMessage = {
      usage: { output_tokens: 0, input_tokens: 5 },
      content: [],
      stop_reason: 'end_turn',
    } as unknown as Anthropic.Message;

    const fallbackMessage = {
      usage: { output_tokens: 15, input_tokens: 5 },
      content: [{ type: 'text', text: 'fallback' }],
      stop_reason: 'end_turn',
    } as unknown as Anthropic.Message;

    const mockStream = {
      on: vi.fn().mockReturnThis(),
      finalMessage: vi.fn().mockResolvedValue(emptyMessage),
    };

    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue(mockStream),
        create: vi.fn().mockResolvedValue(fallbackMessage),
      },
    } as unknown as Anthropic;

    // Use fake timers to avoid real delays
    vi.useFakeTimers();

    const resultPromise = streamWithEmptyRetry(
      {
        client: mockClient,
        model: 'claude-3-5-haiku-20241022',
        maxTokens: 1024,
        system: 'test system',
        messages: [{ role: 'user', content: 'test' }],
        tools: [],
        agent: 'historian',
      },
      3,
    );

    // Advance through all retry delays
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(mockClient.messages.stream).toHaveBeenCalledTimes(3);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    expect(result).toBe(fallbackMessage);

    vi.useRealTimers();
  });

  it('returns fallback response even if fallback also gives 0 tokens', async () => {
    const emptyMessage = {
      usage: { output_tokens: 0, input_tokens: 5 },
      content: [],
      stop_reason: 'end_turn',
    } as unknown as Anthropic.Message;

    const mockStream = {
      on: vi.fn().mockReturnThis(),
      finalMessage: vi.fn().mockResolvedValue(emptyMessage),
    };

    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue(mockStream),
        create: vi.fn().mockResolvedValue(emptyMessage),
      },
    } as unknown as Anthropic;

    vi.useFakeTimers();
    const resultPromise = streamWithEmptyRetry(
      {
        client: mockClient,
        model: 'claude-3-5-haiku-20241022',
        maxTokens: 1024,
        system: 'test system',
        messages: [{ role: 'user', content: 'test' }],
        tools: [],
        agent: 'historian',
      },
      3,
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // Should return the empty response (not throw)
    expect(result).toBe(emptyMessage);
    expect(result.usage.output_tokens).toBe(0);

    vi.useRealTimers();
  });
});
"""

content = content.rstrip() + '\n' + new_tests

with open(agent_utils_path, 'w') as f:
    f.write(content)

print(f"Updated {agent_utils_path}")

# ─── Part B: observer.test.ts ────────────────────────────────────────────────

observer_path = 'tests/agents/observer.test.ts'

with open(observer_path, 'r') as f:
    obs_content = f.read()

# Add the checkZeroTokenAgents describe block before the final closing });
new_observer_tests = """
  // ── checkZeroTokenAgents ──────────────────────────────────

  describe('checkZeroTokenAgents', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('flags a delegated agent with 0 output tokens as WARNING absence', () => {
      // Emit agent:start to register delegation
      eventBus.safeEmit('agent:start', { runid: '20260322-0150-test', agent: 'historian' });
      // Emit tokens with 0 output
      eventBus.safeEmit('tokens', { agent: 'historian', input: 1000, output: 0 });

      const observations = observer.analyzeRun();
      const zeroTokenObs = observations.filter(
        (o) => o.type === 'absence' && o.severity === 'WARNING' && o.agent === 'historian' && o.actualBehavior?.includes('0 output tokens'),
      );
      expect(zeroTokenObs.length).toBe(1);
    });

    it('does NOT flag a non-delegated agent with 0 output tokens', () => {
      // Only emit tokens but NOT agent:start (not delegated)
      eventBus.safeEmit('tokens', { agent: 'never-delegated-agent', input: 500, output: 0 });

      const observations = observer.analyzeRun();
      const zeroTokenObs = observations.filter(
        (o) => o.agent === 'never-delegated-agent' && o.actualBehavior?.includes('0 output tokens'),
      );
      expect(zeroTokenObs.length).toBe(0);
    });
  });
"""

# Insert before the final closing });
# The file ends with:
#   });
# (closing the describe('ObserverAgent') block)
# We need to insert before the last });

# Find the last occurrence of '});' at the top level
last_close_idx = obs_content.rfind('\n});')
if last_close_idx == -1:
    raise ValueError("Could not find closing }); in observer test file")

obs_content = obs_content[:last_close_idx] + '\n' + new_observer_tests + '\n});'

with open(observer_path, 'w') as f:
    f.write(obs_content)

print(f"Updated {observer_path}")
print("Done!")
