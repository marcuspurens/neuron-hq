import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetConfig } from '../../src/core/config.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockReadFile = vi.fn();
const mockStat = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

const mockProcessExtractedText = vi.fn();
vi.mock('../../src/aurora/intake.js', () => ({
  processExtractedText: (...args: unknown[]) => mockProcessExtractedText(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockIsModelAvailable = vi.fn();
vi.mock('../../src/core/ollama.js', () => ({
  isModelAvailable: (...args: unknown[]) => mockIsModelAvailable(...args),
  getOllamaUrl: vi
    .fn()
    .mockImplementation(() => process.env.OLLAMA_URL || 'http://localhost:11434'),
}));

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_MODEL = 'aurora-vision-extract';

function mockChatResponse(content: string, extras: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      message: { role: 'assistant', content },
      done: true,
      load_duration: 100_000_000,
      prompt_eval_count: 50,
      eval_count: 30,
      eval_duration: 500_000_000,
      total_duration: 800_000_000,
      ...extras,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL_VISION;
  resetConfig();

  mockReadFile.mockImplementation((_path: string, encoding?: string) => {
    if (encoding === 'utf-8') {
      // Prompt file reads — return a realistic prompt string
      return Promise.resolve('Describe this image for indexing in a knowledge graph.');
    }
    // Image file reads — return binary data
    return Promise.resolve(Buffer.from('fake-image-data'));
  });
  mockStat.mockResolvedValue({ size: 1024 });

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

const { analyzeImage, isVisionAvailable, ingestImage } = await import('../../src/aurora/vision.js');

/* ------------------------------------------------------------------ */
/*  analyzeImage                                                       */
/* ------------------------------------------------------------------ */

describe('analyzeImage', () => {
  it('sends base64-encoded image to Ollama /api/chat', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('A cat sitting on a mat'));

    const result = await analyzeImage('photo.png');

    expect(mockReadFile).toHaveBeenCalled();
    expect(mockStat).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].images).toHaveLength(1);
    expect(body.messages[1].content).toContain('Describe this image for indexing');
    expect(body.options.temperature).toBe(0);

    expect(result.description).toBe('A cat sitting on a mat');
    expect(result.modelUsed).toBe(DEFAULT_MODEL);
  });

  it('returns diagnostics from Ollama response', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('description'));

    const result = await analyzeImage('photo.png');

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.model).toBe(DEFAULT_MODEL);
    expect(result.diagnostics!.loadDurationMs).toBe(100);
    expect(result.diagnostics!.evalTokens).toBe(30);
    expect(result.diagnostics!.promptTokens).toBe(50);
    expect(result.diagnostics!.imageSizeBytes).toBe(1024);
  });

  it('uses custom model and prompt from options', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('Custom description'));

    const result = await analyzeImage('photo.jpg', {
      model: 'llava:13b',
      prompt: 'What is this?',
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('llava:13b');
    expect(body.messages[1].content).toBe('What is this?');
    expect(result.modelUsed).toBe('llava:13b');
  });

  it('uses OLLAMA_URL env var when set', async () => {
    process.env.OLLAMA_URL = 'http://custom:9999';
    resetConfig();
    mockFetch.mockResolvedValue(mockChatResponse('desc'));

    await analyzeImage('photo.png');

    expect(mockFetch).toHaveBeenCalledWith('http://custom:9999/api/chat', expect.anything());
  });

  it('uses OLLAMA_MODEL_VISION env var when set', async () => {
    process.env.OLLAMA_MODEL_VISION = 'llava:7b';
    resetConfig();
    mockFetch.mockResolvedValue(mockChatResponse('desc'));

    const result = await analyzeImage('photo.png');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('llava:7b');
    expect(result.modelUsed).toBe('llava:7b');
  });

  it('rejects unsupported image types', async () => {
    await expect(analyzeImage('document.pdf')).rejects.toThrow('Unsupported image type');
    await expect(analyzeImage('archive.zip')).rejects.toThrow('Unsupported image type');
  });

  it('rejects images exceeding size limit', async () => {
    mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 });

    await expect(analyzeImage('huge.png')).rejects.toThrow('Image too large');
  });

  it('supports all declared image extensions', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('desc'));

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
      'Ollama vision failed (500): model not found'
    );
  });

  it('sends keep_alive in request', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('desc'));

    await analyzeImage('photo.png');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.keep_alive).toBe('10m');
  });
});

/* ------------------------------------------------------------------ */
/*  isVisionAvailable                                                  */
/* ------------------------------------------------------------------ */

describe('isVisionAvailable', () => {
  it('returns true when model is available', async () => {
    mockIsModelAvailable.mockResolvedValueOnce(true);

    const result = await isVisionAvailable();
    expect(result).toBe(true);
    expect(mockIsModelAvailable).toHaveBeenCalledWith(DEFAULT_MODEL);
  });

  it('returns false when model is not available', async () => {
    mockIsModelAvailable.mockResolvedValueOnce(false);

    const result = await isVisionAvailable();
    expect(result).toBe(false);
  });

  it('uses custom model parameter', async () => {
    mockIsModelAvailable.mockResolvedValueOnce(true);

    await isVisionAvailable('llava:13b');
    expect(mockIsModelAvailable).toHaveBeenCalledWith('llava:13b');
  });
});

/* ------------------------------------------------------------------ */
/*  ingestImage                                                        */
/* ------------------------------------------------------------------ */

describe('ingestImage', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(mockChatResponse('A detailed description'));
  });

  it('calls analyzeImage then processExtractedText', async () => {
    const result = await ingestImage('photo.png');

    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'photo.png',
      'A detailed description',
      null,
      expect.objectContaining({
        source_type: 'vision',
        model_used: DEFAULT_MODEL,
      }),
      {}
    );

    expect(result.description).toBe('A detailed description');
    expect(result.modelUsed).toBe(DEFAULT_MODEL);
    expect(result.documentNodeId).toBe('doc_abc123');
  });

  it('uses custom title from options', async () => {
    await ingestImage('photo.png', { title: 'My Custom Title' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'My Custom Title',
      expect.any(String),
      null,
      expect.anything(),
      expect.objectContaining({ title: 'My Custom Title' })
    );
  });

  it('passes ingest options through to processExtractedText', async () => {
    await ingestImage('photo.png', { scope: 'shared', type: 'document' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      expect.anything(),
      expect.objectContaining({ scope: 'shared', type: 'document' })
    );
  });

  it('includes word_count and image_path in metadata', async () => {
    await ingestImage('photo.png');

    const metadata = mockProcessExtractedText.mock.calls[0][3];
    expect(metadata.word_count).toBeGreaterThan(0);
    expect(metadata.image_path).toContain('photo.png');
  });
});
