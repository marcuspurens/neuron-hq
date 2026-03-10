import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSuggestResearch = vi.fn();
const mockSuggestResearchBatch = vi.fn();
vi.mock('../../src/aurora/gap-brief.js', () => ({
  suggestResearch: (...args: unknown[]) => mockSuggestResearch(...args),
  suggestResearchBatch: (...args: unknown[]) => mockSuggestResearchBatch(...args),
}));

import { auroraSuggestResearchCommand } from '../../src/commands/aurora-suggest-research.js';

function defaultSuggestion() {
  return {
    primaryGap: { question: 'How does pyannote diarization work?', askedAt: '2026-03-09T09:00:00Z', frequency: 5 },
    relatedGaps: [
      { question: 'What voices can pyannote identify?', askedAt: '2026-03-09T08:00:00Z', frequency: 3 },
    ],
    knownFacts: [
      { title: 'pyannote.audio for voice identification', confidence: 0.8, freshnessStatus: 'fresh' },
    ],
    brief: {
      background: 'pyannote.audio is used for voice identification.',
      gap: 'Documentation about diarization is missing.',
      suggestions: ['Read pyannote docs', 'Test with multi-speaker video'],
    },
    metadata: { generatedAt: '2026-03-09T15:00:00Z', totalRelatedGaps: 1, totalKnownFacts: 1 },
  };
}

describe('aurora:suggest-research command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockSuggestResearch.mockReset();
    mockSuggestResearchBatch.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows research suggestion for single question', async () => {
    mockSuggestResearch.mockResolvedValue(defaultSuggestion());

    await auroraSuggestResearchCommand('How does pyannote diarization work?', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Research Suggestion');
    expect(output).toContain('pyannote');
    expect(output).toContain('Related gaps (1)');
    expect(output).toContain('Known facts (1)');
    expect(output).toContain('Background:');
    expect(output).toContain('Gap:');
    expect(output).toContain('Suggestions:');
  });

  it('shows batch results with --top', async () => {
    const suggestion1 = defaultSuggestion();
    const suggestion2 = {
      ...defaultSuggestion(),
      primaryGap: { question: 'How to use whisper for transcription?', askedAt: '2026-03-09T10:00:00Z', frequency: 4 },
    };
    mockSuggestResearchBatch.mockResolvedValue([suggestion1, suggestion2]);

    await auroraSuggestResearchCommand(undefined, { top: '3' });

    const output = consoleOutput.join('\n');
    expect(output).toContain('Top 2 Research Suggestions');
    expect(output).toContain('How does pyannote diarization work?');
    expect(output).toContain('How to use whisper for transcription?');
  });

  it('handles empty gaps result', async () => {
    mockSuggestResearchBatch.mockResolvedValue([]);

    await auroraSuggestResearchCommand(undefined, { top: '3' });

    const output = consoleOutput.join('\n');
    expect(output).toContain('No knowledge gaps found');
  });

  it('passes --max-facts option', async () => {
    mockSuggestResearch.mockResolvedValue(defaultSuggestion());

    await auroraSuggestResearchCommand('How does pyannote diarization work?', { maxFacts: '5' });

    expect(mockSuggestResearch).toHaveBeenCalledWith(
      'How does pyannote diarization work?',
      expect.objectContaining({ maxFacts: 5 }),
    );
  });

  it('handles error gracefully', async () => {
    mockSuggestResearch.mockRejectedValue(new Error('DB unavailable'));

    await auroraSuggestResearchCommand('How does pyannote diarization work?', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('DB unavailable');
  });
});
