import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBriefing = vi.fn();
vi.mock('../../src/aurora/briefing.js', () => ({
  briefing: (...args: unknown[]) => mockBriefing(...args),
}));

import { auroraBriefingCommand } from '../../src/commands/aurora-briefing.js';

function defaultBriefingResult() {
  return {
    topic: 'TypeScript',
    summary: 'Vi har 2 fakta om TypeScript patterns.',
    facts: [
      { title: 'TypeScript strict mode', type: 'fact', confidence: 0.8, similarity: 0.92, text: 'TS strict mode' },
      { title: 'Type guards', type: 'fact', confidence: 0.9, similarity: 0.85 },
    ],
    timeline: [
      { title: 'TypeScript Best Practices', type: 'document', createdAt: '2026-03-09T10:00:00Z', confidence: 0.9 },
    ],
    gaps: [
      { question: 'What are TypeScript testing patterns?', frequency: 2, askedAt: '2026-03-09T09:00:00Z' },
    ],
    crossRefs: {
      neuron: [{ title: 'strict-mode-enforcement', type: 'pattern', similarity: 0.89 }],
      aurora: [{ title: 'TypeScript Best Practices', type: 'document', similarity: 0.92 }],
    },
    metadata: {
      generatedAt: '2026-03-09T15:00:00Z',
      totalSources: 3,
      totalGaps: 1,
      totalCrossRefs: 2,
    },
    integrityIssues: [],
  };
}

describe('aurora:briefing command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockBriefing.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows all sections', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    await auroraBriefingCommand('TypeScript', {});

    const output = consoleOutput.join('\n');
    // Check that all sections are present
    expect(output).toContain('Briefing');
    expect(output).toContain('TypeScript');
    expect(output).toContain('Sammanfattning');
    expect(output).toContain('Vi har 2 fakta');
    expect(output).toContain('Fakta (2)');
    expect(output).toContain('TypeScript strict mode');
    expect(output).toContain('Tidslinje (1)');
    expect(output).toContain('TypeScript Best Practices');
    expect(output).toContain('Kunskapsluckor (1)');
    expect(output).toContain('What are TypeScript testing patterns?');
    expect(output).toContain('Kopplingar');
    expect(output).toContain('strict-mode-enforcement');
    expect(output).toContain('3 källor');
    expect(output).toContain('1 luckor');
    expect(output).toContain('2 kopplingar');
  });

  it('passes --max-facts option', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    await auroraBriefingCommand('TypeScript', { maxFacts: '3' });

    expect(mockBriefing).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ maxFacts: 3 }),
    );
  });

  it('passes --max-timeline option', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    await auroraBriefingCommand('TypeScript', { maxTimeline: '5' });

    expect(mockBriefing).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ maxTimeline: 5 }),
    );
  });

  it('passes --max-gaps option', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    await auroraBriefingCommand('TypeScript', { maxGaps: '2' });

    expect(mockBriefing).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ maxGaps: 2 }),
    );
  });

  it('passes --max-cross-refs option', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    await auroraBriefingCommand('TypeScript', { maxCrossRefs: '1' });

    expect(mockBriefing).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ maxCrossRefs: 1 }),
    );
  });

  it('shows clear message for empty result', async () => {
    mockBriefing.mockResolvedValue({
      topic: 'nonexistent',
      summary: 'Inga fakta hittades om "nonexistent".',
      facts: [],
      timeline: [],
      gaps: [],
      crossRefs: { neuron: [], aurora: [] },
      metadata: {
        generatedAt: '2026-03-09T15:00:00Z',
        totalSources: 0,
        totalGaps: 0,
        totalCrossRefs: 0,
      },
      integrityIssues: [],
    });

    await auroraBriefingCommand('nonexistent', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Inga fakta hittades');
    expect(output).toContain('Inga kopplingar');
    expect(output).toContain('0 källor');
  });

  it('shows error on failure', async () => {
    mockBriefing.mockRejectedValue(new Error('Database connection failed'));

    await auroraBriefingCommand('TypeScript', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('Database connection failed');
  });
});
