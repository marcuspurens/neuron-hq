import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

// Mock intake module
const mockIngestUrl = vi.fn();
const mockIngestDocument = vi.fn();
vi.mock('../../src/aurora/intake.js', () => ({
  ingestUrl: (...args: unknown[]) => mockIngestUrl(...args),
  ingestDocument: (...args: unknown[]) => mockIngestDocument(...args),
}));

import { auroraIngestCommand } from '../../src/commands/aurora-ingest.js';

describe('aurora:ingest command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockIsWorkerAvailable.mockReset();
    mockIngestUrl.mockReset();
    mockIngestDocument.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows worker not available message when Python missing', async () => {
    mockIsWorkerAvailable.mockResolvedValue(false);

    await auroraIngestCommand('https://example.com', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('not available');
  });

  it('ingests URL and shows correct output', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_abc123',
      chunkNodeIds: ['doc_abc123_chunk_0', 'doc_abc123_chunk_1'],
      title: 'Test Article',
      wordCount: 500,
      chunkCount: 2,
    });

    await auroraIngestCommand('https://example.com/article', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Test Article');
    expect(output).toContain('doc_abc123');
    expect(output).toContain('2');
    expect(output).toContain('personal');
  });

  it('ingests local file and shows correct output', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestDocument.mockResolvedValue({
      documentNodeId: 'doc_xyz789',
      chunkNodeIds: [],
      title: 'Notes',
      wordCount: 50,
      chunkCount: 0,
    });

    await auroraIngestCommand('./notes.md', {});

    expect(mockIngestDocument).toHaveBeenCalled();
    expect(mockIngestUrl).not.toHaveBeenCalled();
    const output = consoleOutput.join('\n');
    expect(output).toContain('Notes');
  });

  it('passes scope and type options', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_1',
      chunkNodeIds: [],
      title: 'Research',
      wordCount: 100,
      chunkCount: 0,
    });

    await auroraIngestCommand('https://example.com', { scope: 'shared', type: 'research' });

    expect(mockIngestUrl).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ scope: 'shared', type: 'research' }),
    );
  });

  it('shows error message on failure', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestUrl.mockRejectedValue(new Error('Network timeout'));

    await auroraIngestCommand('https://bad-url.com', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('Network timeout');
  });

  it('passes maxChunks option', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_2',
      chunkNodeIds: [],
      title: 'Doc',
      wordCount: 200,
      chunkCount: 0,
    });

    await auroraIngestCommand('https://example.com', { maxChunks: '5' });

    expect(mockIngestUrl).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ maxChunks: 5 }),
    );
  });
});
