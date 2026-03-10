import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLearnFromConversation = vi.fn();
vi.mock('../../src/aurora/conversation.js', () => ({
  learnFromConversation: (...args: unknown[]) => mockLearnFromConversation(...args),
}));

const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  default: { readFile: (...args: unknown[]) => mockReadFile(...args) },
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import { auroraLearnConversationCommand } from '../../src/commands/aurora-learn-conversation.js';

describe('aurora:learn-conversation command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockLearnFromConversation.mockReset();
    mockReadFile.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('reads file and shows extraction results', async () => {
    const messages = [
      { role: 'user', content: 'I prefer TypeScript over Python for all backend development' },
    ];
    mockReadFile.mockResolvedValue(JSON.stringify(messages));
    mockLearnFromConversation.mockResolvedValue({
      itemsExtracted: 1,
      itemsNew: 1,
      itemsDuplicate: 0,
      items: [{ type: 'preference', text: 'TypeScript over Python for all backend development', confidence: 0.6, source: 'conversation' }],
    });

    await auroraLearnConversationCommand('test.json', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('1 messages');
    expect(output).toContain('Extracted 1 items');
    expect(output).toContain('1 new items stored');
  });

  it('shows "No items extracted" for empty conversation', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ role: 'user', content: 'Hello' }]));
    mockLearnFromConversation.mockResolvedValue({
      itemsExtracted: 0,
      itemsNew: 0,
      itemsDuplicate: 0,
      items: [],
    });

    await auroraLearnConversationCommand('empty.json', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('No items extracted');
  });

  it('passes --dry-run option correctly', async () => {
    const messages = [{ role: 'user', content: 'test' }];
    mockReadFile.mockResolvedValue(JSON.stringify(messages));
    mockLearnFromConversation.mockResolvedValue({
      itemsExtracted: 1,
      itemsNew: 1,
      itemsDuplicate: 0,
      items: [{ type: 'fact', text: 'some extracted fact with enough words', confidence: 0.6, source: 'conversation' }],
    });

    await auroraLearnConversationCommand('test.json', { dryRun: true });

    expect(mockLearnFromConversation).toHaveBeenCalledWith(
      messages,
      { dryRun: true },
    );
    const output = consoleOutput.join('\n');
    expect(output).toContain('Dry run');
  });
});
