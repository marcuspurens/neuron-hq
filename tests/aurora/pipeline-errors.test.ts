import { describe, it, expect } from 'vitest';
import {
  PipelineError,
  STEP_ERRORS,
  wrapPipelineStep,
} from '../../src/aurora/pipeline-errors.js';

describe('PipelineError', () => {
  it('is instanceof Error', () => {
    const err = new PipelineError('test_step', 'msg', 'suggestion', new Error('orig'));
    expect(err).toBeInstanceOf(Error);
  });

  it('has correct properties', () => {
    const original = new Error('original error');
    const err = new PipelineError('extract_video', 'user msg', 'try this', original);

    expect(err.name).toBe('PipelineError');
    expect(err.step).toBe('extract_video');
    expect(err.userMessage).toBe('user msg');
    expect(err.message).toBe('user msg');
    expect(err.suggestion).toBe('try this');
    expect(err.originalError).toBe(original);
  });
});

describe('STEP_ERRORS', () => {
  const expectedSteps = [
    'extract_video',
    'transcribe_audio',
    'diarize_audio',
    'extract_url',
    'autoEmbedAuroraNodes',
    'findNeuronMatchesForAurora',
  ];

  it('contains all 6 steps with non-empty userMessage and suggestion', () => {
    for (const step of expectedSteps) {
      const info = STEP_ERRORS[step];
      expect(info, `Missing step: ${step}`).toBeDefined();
      expect(info.userMessage.length).toBeGreaterThan(0);
      expect(info.suggestion.length).toBeGreaterThan(0);
    }
  });
});

describe('wrapPipelineStep()', () => {
  it('converts generic Error to PipelineError', async () => {
    await expect(
      wrapPipelineStep('extract_video', () => Promise.reject(new Error('network fail'))),
    ).rejects.toThrow(PipelineError);

    try {
      await wrapPipelineStep('extract_video', () => Promise.reject(new Error('network fail')));
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      const pe = err as PipelineError;
      expect(pe.step).toBe('extract_video');
      expect(pe.userMessage).toBe('Videon kunde inte laddas ner.');
      expect(pe.originalError.message).toBe('network fail');
    }
  });

  it('preserves existing PipelineError (no double-wrap)', async () => {
    const original = new PipelineError('diarize_audio', 'orig msg', 'orig suggestion', new Error('x'));

    try {
      await wrapPipelineStep('extract_video', () => Promise.reject(original));
    } catch (err) {
      expect(err).toBe(original);
      expect((err as PipelineError).step).toBe('diarize_audio');
      expect((err as PipelineError).userMessage).toBe('orig msg');
    }
  });

  it('passes through successful results', async () => {
    const result = await wrapPipelineStep('extract_video', () => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('unknown step gets fallback message', async () => {
    try {
      await wrapPipelineStep('unknown_step', () => Promise.reject(new Error('boom')));
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      const pe = err as PipelineError;
      expect(pe.step).toBe('unknown_step');
      expect(pe.userMessage).toBe("Steg 'unknown_step' misslyckades.");
      expect(pe.suggestion).toBe('Försök igen eller kontakta support.');
    }
  });
});
