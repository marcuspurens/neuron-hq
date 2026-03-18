import { describe, it, expect } from 'vitest';
import {
  formatMs,
  buildSpeakerTimeline,
} from '../../src/aurora/speaker-timeline.js';
import type {
  WhisperSegment,
  DiarizationSegment,
} from '../../src/aurora/speaker-timeline.js';

describe('formatMs', () => {
  it('converts 0 to 00:00:00', () => {
    expect(formatMs(0)).toBe('00:00:00');
  });

  it('converts 90061 to 00:01:30 (floors to seconds)', () => {
    expect(formatMs(90061)).toBe('00:01:30');
  });

  it('converts 3723000 to 01:02:03', () => {
    expect(formatMs(3723000)).toBe('01:02:03');
  });
});

describe('buildSpeakerTimeline', () => {
  it('returns empty array for empty input', () => {
    expect(buildSpeakerTimeline([], [])).toEqual([]);
  });

  it('assigns speaker based on maximum overlap', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 5000, text: 'Hello world' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 3000, speaker: 'SPEAKER_A' },
      { start_ms: 2000, end_ms: 5000, speaker: 'SPEAKER_B' },
    ];
    // SPEAKER_A overlaps 0-3000 = 3000ms
    // SPEAKER_B overlaps 2000-5000 = 3000ms
    // Both equal; first one found wins (SPEAKER_A)
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    // With equal overlap, the first matching speaker is kept
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('Hello world');
  });

  it('assigns speaker with strictly more overlap', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 1000, end_ms: 6000, text: 'Testing overlap' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 2000, speaker: 'SPEAKER_A' },   // overlap: 1000ms
      { start_ms: 2000, end_ms: 7000, speaker: 'SPEAKER_B' }, // overlap: 4000ms
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('SPEAKER_B');
  });

  it('merges adjacent segments with the same speaker', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 3000, text: 'First part' },
      { start_ms: 3000, end_ms: 6000, text: 'second part' },
      { start_ms: 6000, end_ms: 9000, text: 'third part' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 9000, speaker: 'SPEAKER_A' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('First part second part third part');
    expect(result[0].start_ms).toBe(0);
    expect(result[0].end_ms).toBe(9000);
  });

  it('does not merge segments with different speakers', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 3000, text: 'Hello' },
      { start_ms: 3000, end_ms: 6000, text: 'World' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 3000, speaker: 'SPEAKER_A' },
      { start_ms: 3000, end_ms: 6000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[1].speaker).toBe('SPEAKER_B');
  });

  it('splits text exceeding 7 lines into multiple blocks', () => {
    // Generate text with ~160 words (>150, i.e. >7 lines at ~20 words/line)
    const longText = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 60000, text: longText },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 60000, speaker: 'SPEAKER_A' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result.length).toBeGreaterThan(1);
    // All blocks should have the same speaker
    for (const block of result) {
      expect(block.speaker).toBe('SPEAKER_A');
    }
    // Combined text should contain all words
    const combined = result.map((b) => b.text).join(' ');
    expect(combined).toContain('word0');
    expect(combined).toContain('word159');
  });

  it('assigns UNKNOWN when no diarization segments overlap', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 10000, end_ms: 15000, text: 'No overlap here' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_A' },
      { start_ms: 20000, end_ms: 25000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('UNKNOWN');
    expect(result[0].text).toBe('No overlap here');
  });

  it('assigns UNKNOWN when diarization array is empty', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 5000, text: 'Alone' },
    ];
    const result = buildSpeakerTimeline(whisper, []);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('UNKNOWN');
  });

  it('handles gaps between diarization segments correctly', () => {
    // Whisper segments: one in covered area, one in gap, one in another covered area
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 3000, text: 'Before gap' },
      { start_ms: 5000, end_ms: 8000, text: 'In the gap' },
      { start_ms: 10000, end_ms: 13000, text: 'After gap' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 4000, speaker: 'SPEAKER_A' },
      // Gap: 4000-10000 — no diarization
      { start_ms: 10000, end_ms: 15000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(3);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('Before gap');
    expect(result[1].speaker).toBe('UNKNOWN');
    expect(result[1].text).toBe('In the gap');
    expect(result[2].speaker).toBe('SPEAKER_B');
    expect(result[2].text).toBe('After gap');
  });

  it('returns blocks sorted by start_ms', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 6000, end_ms: 9000, text: 'Third' },
      { start_ms: 0, end_ms: 3000, text: 'First' },
      { start_ms: 3000, end_ms: 6000, text: 'Second' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 4000, speaker: 'SPEAKER_A' },
      { start_ms: 4000, end_ms: 10000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start_ms).toBeGreaterThanOrEqual(result[i - 1].start_ms);
    }
  });
});
