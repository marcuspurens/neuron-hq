import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockProcessExtractedText = vi.fn();
vi.mock('../../src/aurora/intake.js', () => ({
  processExtractedText: (...args: unknown[]) =>
    mockProcessExtractedText(...args),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock ollama module — skip auto-start in tests
vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
  getOllamaUrl: vi.fn().mockImplementation(() => process.env.OLLAMA_URL || 'http://localhost:11434'),
}));

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL_VISION;

  mockReadFile.mockResolvedValue(Buffer.from('fake-image-data'));

  mockProcessExtractedText.mockResolvedValue({
    documentNodeId: 'doc_abc123',
    chunkNodeIds: ['doc_abc123_chunk_0'],
    title: 'test.png',
    wordCount: 10,
    chunkCount: 1,
    crossRefsCreated: 0,
    crossRefMatches: [],
  });
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

const { analyzeImage, isVisionAvailable, ingestImage } = await import(
  '../../src/aurora/vision.js'
);

/* ------------------------------------------------------------------ */
/*  analyzeImage                                                       */
/* ------------------------------------------------------------------ */

describe('analyzeImage', () => {
  it('sends base64-encoded image to Ollama /api/generate', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'A cat sitting on a mat', done: true }),
    });

    const result = await analyzeImage('photo.png');

    expect(mockReadFile).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // Verify the body contains model, prompt, images, and stream: false
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('qwen3-vl:8b');
    expect(body.stream).toBe(false);
    expect(body.images).toHaveLength(1);
    expect(body.prompt).toContain('Describe this image');

    expect(result.description).toBe('A cat sitting on a mat');
    expect(result.modelUsed).toBe('qwen3-vl:8b');
  });

  it('uses custom model and prompt from options', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'Custom description', done: true }),
    });

    const result = await analyzeImage('photo.jpg', {
      model: 'llava:13b',
      prompt: 'What is this?',
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('llava:13b');
    expect(body.prompt).toBe('What is this?');
    expect(result.modelUsed).toBe('llava:13b');
  });

  it('uses OLLAMA_URL env var when set', async () => {
    process.env.OLLAMA_URL = 'http://custom:9999';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'desc', done: true }),
    });

    await analyzeImage('photo.png');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://custom:9999/api/generate',
      expect.anything(),
    );
  });

  it('uses OLLAMA_MODEL_VISION env var when set', async () => {
    process.env.OLLAMA_MODEL_VISION = 'llava:7b';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'desc', done: true }),
    });

    const result = await analyzeImage('photo.png');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('llava:7b');
    expect(result.modelUsed).toBe('llava:7b');
  });

  it('rejects unsupported image types', async () => {
    await expect(analyzeImage('document.pdf')).rejects.toThrow(
      'Unsupported image type',
    );
    await expect(analyzeImage('archive.zip')).rejects.toThrow(
      'Unsupported image type',
    );
  });

  it('supports all declared image extensions', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'desc', done: true }),
    });

    const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.gif'];
    for (const ext of extensions) {
      await analyzeImage(`file${ext}`);
    }
    expect(mockFetch).toHaveBeenCalledTimes(extensions.length);
  });

  it('throws on Ollama error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'model not found',
    });

    await expect(analyzeImage('photo.png')).rejects.toThrow(
      'Ollama vision failed (500): model not found',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  isVisionAvailable                                                  */
/* ------------------------------------------------------------------ */

describe('isVisionAvailable', () => {
  it('returns true when ensureOllama succeeds', async () => {
    const { ensureOllama } = await import('../../src/core/ollama.js');
    vi.mocked(ensureOllama).mockResolvedValueOnce(true);

    const result = await isVisionAvailable();
    expect(result).toBe(true);
    expect(ensureOllama).toHaveBeenCalledWith('qwen3-vl:8b');
  });

  it('returns false when ensureOllama fails', async () => {
    const { ensureOllama } = await import('../../src/core/ollama.js');
    vi.mocked(ensureOllama).mockResolvedValueOnce(false);

    const result = await isVisionAvailable();
    expect(result).toBe(false);
  });

  it('uses custom model parameter', async () => {
    const { ensureOllama } = await import('../../src/core/ollama.js');
    vi.mocked(ensureOllama).mockResolvedValueOnce(true);

    await isVisionAvailable('llava:13b');
    expect(ensureOllama).toHaveBeenCalledWith('llava:13b');
  });
});

/* ------------------------------------------------------------------ */
/*  ingestImage                                                        */
/* ------------------------------------------------------------------ */

describe('ingestImage', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'A detailed description', done: true }),
    });
  });

  it('calls analyzeImage then processExtractedText', async () => {
    const result = await ingestImage('photo.png');

    // Should have called fetch for analyzeImage
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should have called processExtractedText
    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'photo.png',
      'A detailed description',
      null,
      expect.objectContaining({
        source_type: 'vision',
        model_used: 'qwen3-vl:8b',
      }),
      {},
    );

    expect(result.description).toBe('A detailed description');
    expect(result.modelUsed).toBe('qwen3-vl:8b');
    expect(result.documentNodeId).toBe('doc_abc123');
  });

  it('uses custom title from options', async () => {
    await ingestImage('photo.png', { title: 'My Custom Title' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'My Custom Title',
      expect.any(String),
      null,
      expect.anything(),
      expect.objectContaining({ title: 'My Custom Title' }),
    );
  });

  it('passes ingest options through to processExtractedText', async () => {
    await ingestImage('photo.png', { scope: 'shared', type: 'document' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      expect.anything(),
      expect.objectContaining({ scope: 'shared', type: 'document' }),
    );
  });

  it('includes word_count and image_path in metadata', async () => {
    await ingestImage('photo.png');

    const metadata = mockProcessExtractedText.mock.calls[0][3];
    expect(metadata.word_count).toBeGreaterThan(0);
    expect(metadata.image_path).toContain('photo.png');
  });
});
