import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { UsageTracker } from '../src/core/usage.js';

describe('UsageTracker', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should track token usage', () => {
    const tracker = new UsageTracker('20260221-1430-test' as any);

    tracker.recordTokens('manager', 100, 50);
    tracker.recordTokens('implementer', 200, 100);

    const usage = tracker.getUsage();
    expect(usage.total_input_tokens).toBe(300);
    expect(usage.total_output_tokens).toBe(150);
  });

  it('should track usage by agent', () => {
    const tracker = new UsageTracker('20260221-1430-test' as any);

    tracker.recordTokens('manager', 100, 50);
    tracker.recordTokens('manager', 50, 25);

    const usage = tracker.getUsage();
    expect(usage.by_agent['manager'].input_tokens).toBe(150);
    expect(usage.by_agent['manager'].output_tokens).toBe(75);
  });

  it('should track tool calls', () => {
    const tracker = new UsageTracker('20260221-1430-test' as any);

    tracker.recordToolCall('bash');
    tracker.recordToolCall('bash');
    tracker.recordToolCall('read');

    const usage = tracker.getUsage();
    expect(usage.tool_counts['bash']).toBe(2);
    expect(usage.tool_counts['read']).toBe(1);
  });

  it('should save and load usage data', async () => {
    const tracker = new UsageTracker('20260221-1430-test' as any);
    tracker.recordTokens('manager', 100, 50);

    const usageFile = path.join(tempDir, 'usage.json');
    await tracker.save(usageFile);

    const loaded = await UsageTracker.load(usageFile);
    expect(loaded.total_input_tokens).toBe(100);
  });

  it('should format summary', () => {
    const tracker = new UsageTracker('20260221-1430-test' as any);
    tracker.recordTokens('manager', 1000, 500);

    const summary = tracker.formatSummary();
    expect(summary).toContain('1,500');
    expect(summary).toContain('1,000');
    expect(summary).toContain('500');
  });
});
