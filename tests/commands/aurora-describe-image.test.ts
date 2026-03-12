import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyzeImage = vi.fn();
const mockIngestImage = vi.fn();
const mockIsVisionAvailable = vi.fn();
vi.mock('../../src/aurora/vision.js', () => ({
  analyzeImage: (...args: unknown[]) => mockAnalyzeImage(...args),
  ingestImage: (...args: unknown[]) => mockIngestImage(...args),
  isVisionAvailable: (...args: unknown[]) => mockIsVisionAvailable(...args),
}));

import { auroraDescribeImageCommand } from '../../src/commands/aurora-describe-image.js';

describe('aurora:describe-image command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockAnalyzeImage.mockReset();
    mockIngestImage.mockReset();
    mockIsVisionAvailable.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows image description and ingest result', async () => {
    mockIsVisionAvailable.mockResolvedValue(true);
    mockIngestImage.mockResolvedValue({
      description: 'A diagram showing architecture',
      modelUsed: 'test-vision-model',
      documentNodeId: 'doc_img_abc123',
      wordCount: 256,
      chunkCount: 3,
      crossRefsCreated: 1,
    });

    await auroraDescribeImageCommand('test.png', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Description');
    expect(output).toContain('Indexed');
    expect(output).toContain('doc_img_abc123');
    expect(output).toContain('256');
    expect(output).toContain('3');
    expect(output).toContain('1');
  });

  it('passes title and prompt options', async () => {
    mockIsVisionAvailable.mockResolvedValue(true);
    mockIngestImage.mockResolvedValue({
      description: 'Some description',
      modelUsed: 'test-model',
      documentNodeId: 'doc_img_xyz',
      wordCount: 100,
      chunkCount: 2,
      crossRefsCreated: 0,
    });

    await auroraDescribeImageCommand('photo.jpg', { title: 'My Title', prompt: 'Custom prompt' });

    expect(mockIngestImage).toHaveBeenCalledWith(
      'photo.jpg',
      expect.objectContaining({ title: 'My Title', prompt: 'Custom prompt' }),
    );
  });

  it('describe-only mode shows description without ingesting', async () => {
    mockIsVisionAvailable.mockResolvedValue(true);
    mockAnalyzeImage.mockResolvedValue({
      description: 'A landscape',
      modelUsed: 'test-model',
    });

    await auroraDescribeImageCommand('landscape.png', { describeOnly: true });

    expect(mockAnalyzeImage).toHaveBeenCalled();
    expect(mockIngestImage).not.toHaveBeenCalled();
    const output = consoleOutput.join('\n');
    expect(output).toContain('A landscape');
  });

  it('shows error when Ollama is unavailable', async () => {
    mockIsVisionAvailable.mockResolvedValue(false);

    await auroraDescribeImageCommand('test.png', {});

    expect(consoleErrors.join('\n')).toContain('not available');
  });
});
