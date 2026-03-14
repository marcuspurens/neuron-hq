import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUTO_KM_CONFIG,
  shouldRunAutoKM,
  extractTopicFromBrief,
  type AutoKMConfig,
} from '../../src/core/auto-km.js';

// --- Tests ---

describe('auto-km', () => {
  // =====================================================
  // DEFAULT_AUTO_KM_CONFIG
  // =====================================================
  describe('DEFAULT_AUTO_KM_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_AUTO_KM_CONFIG).toEqual({
        enabled: false,
        minRunsBetween: 3,
        maxActionsPerRun: 3,
        skipOnRed: true,
        topicFromBrief: true,
      });
    });
  });

  // =====================================================
  // shouldRunAutoKM
  // =====================================================
  describe('shouldRunAutoKM', () => {
    const enabledConfig: AutoKMConfig = {
      enabled: true,
      minRunsBetween: 3,
      maxActionsPerRun: 3,
      skipOnRed: true,
      topicFromBrief: true,
    };

    it('returns false when config.enabled is false', () => {
      expect(shouldRunAutoKM('GREEN', DEFAULT_AUTO_KM_CONFIG, null, 10)).toBe(false);
    });

    it('returns true when enabled and all conditions met (null lastKMRunNumber)', () => {
      expect(shouldRunAutoKM('GREEN', enabledConfig, null, 10)).toBe(true);
    });

    it('returns false when stoplight is RED and skipOnRed is true', () => {
      expect(shouldRunAutoKM('RED', enabledConfig, null, 10)).toBe(false);
    });

    it('returns true when stoplight is RED but skipOnRed is false', () => {
      const config: AutoKMConfig = { ...enabledConfig, skipOnRed: false };
      expect(shouldRunAutoKM('RED', config, null, 10)).toBe(true);
    });

    it('returns true when stoplight is YELLOW', () => {
      expect(shouldRunAutoKM('YELLOW', enabledConfig, null, 10)).toBe(true);
    });

    it('returns false when not enough runs since last KM run', () => {
      expect(shouldRunAutoKM('GREEN', enabledConfig, 8, 10)).toBe(false);
    });

    it('returns true when exactly minRunsBetween runs have passed', () => {
      expect(shouldRunAutoKM('GREEN', enabledConfig, 7, 10)).toBe(true);
    });

    it('returns true when more than minRunsBetween runs have passed', () => {
      expect(shouldRunAutoKM('GREEN', enabledConfig, 5, 10)).toBe(true);
    });

    it('returns false when lastKMRunNumber equals currentRunNumber', () => {
      expect(shouldRunAutoKM('GREEN', enabledConfig, 10, 10)).toBe(false);
    });
  });

  // =====================================================
  // extractTopicFromBrief
  // =====================================================
  describe('extractTopicFromBrief', () => {
    it('extracts the first heading', () => {
      const brief = '# Implement Auto-KM\n\nSome description.';
      expect(extractTopicFromBrief(brief)).toBe('Implement Auto-KM');
    });

    it('returns first non-empty line when no heading exists', () => {
      const brief = 'This is a brief without headings.\nMore text.';
      expect(extractTopicFromBrief(brief)).toBe('This is a brief without headings.');
    });

    it('skips empty lines before heading', () => {
      const brief = '\n\n# Real Heading\nContent.';
      expect(extractTopicFromBrief(brief)).toBe('Real Heading');
    });

    it('returns empty string for empty brief', () => {
      expect(extractTopicFromBrief('')).toBe('');
    });

    it('returns empty string for brief with only whitespace lines', () => {
      expect(extractTopicFromBrief('  \n  \n  ')).toBe('');
    });

    it('prefers heading over non-heading first line', () => {
      const brief = 'Not a heading\n# Actual Heading';
      // The first non-empty line is "Not a heading", which comes first
      expect(extractTopicFromBrief(brief)).toBe('Not a heading');
    });

    it('trims whitespace from heading text', () => {
      const brief = '#   Spaced Heading  ';
      expect(extractTopicFromBrief(brief)).toBe('Spaced Heading');
    });
  });
});
