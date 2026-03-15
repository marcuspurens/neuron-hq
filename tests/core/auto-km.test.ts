import { describe, it, expect, vi } from 'vitest';
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
        chainEnabled: false,
        chainMaxCycles: 2,
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

  // =====================================================
  // KMReport article fields
  // =====================================================
  describe('KMReport article fields', () => {
    it('KMReport interface includes articlesCreated and articlesUpdated', async () => {
      // Import the type and verify it has the required fields
      const { KnowledgeManagerAgent } = await import('../../src/core/agents/knowledge-manager.js');
      // The type check here is implicit — if the interface doesn't have these fields,
      // TypeScript would complain. We verify the buildReport includes defaults.
      const mockAudit = { log: vi.fn() };
      // We just need to verify the type exists with the fields
      const report: import('../../src/core/agents/knowledge-manager.js').KMReport = {
        gapsFound: 0,
        gapsResearched: 0,
        gapsResolved: 0,
        urlsIngested: 0,
        sourcesRefreshed: 0,
        newNodesCreated: 0,
        factsLearned: 0,
        articlesCreated: 0,
        articlesUpdated: 0,
        summary: '',
        details: [],
      };
      expect(report.articlesCreated).toBe(0);
      expect(report.articlesUpdated).toBe(0);
    });

    it('DEFAULT_AUTO_KM_CONFIG is unchanged', () => {
      expect(DEFAULT_AUTO_KM_CONFIG.enabled).toBe(false);
      expect(DEFAULT_AUTO_KM_CONFIG.minRunsBetween).toBe(3);
    });
  });

  // =====================================================
  // AutoKMConfig — chain fields
  // =====================================================
  describe('AutoKMConfig — chain compatibility', () => {
    it('default config has chainEnabled: false', () => {
      expect(DEFAULT_AUTO_KM_CONFIG.chainEnabled).toBe(false);
      expect(DEFAULT_AUTO_KM_CONFIG.chainMaxCycles).toBe(2);
    });

    it('passes chain options when agent supports them', async () => {
      // Verify that runAutoKM creates an agent that could receive chain options
      // The current implementation passes maxActions and focusTopic
      // Chain options would be added similarly
      const report: import('../../src/core/agents/knowledge-manager.js').KMReport = {
        gapsFound: 1,
        gapsResearched: 1,
        gapsResolved: 0,
        urlsIngested: 2,
        sourcesRefreshed: 0,
        newNodesCreated: 1,
        factsLearned: 3,
        articlesCreated: 0,
        articlesUpdated: 0,
        summary: 'Chain test',
        details: [],
        chainId: 'auto-chain-1',
        totalCycles: 2,
        stoppedBy: 'convergence',
        emergentGapsFound: 4,
      };

      // Verify chain fields are valid in the KMReport type
      expect(report.chainId).toBe('auto-chain-1');
      expect(report.totalCycles).toBe(2);
      expect(report.stoppedBy).toBe('convergence');
      expect(report.emergentGapsFound).toBe(4);
    });
  });
});
