import { describe, it, expect } from 'vitest';
import {
  ParsedIdeaSchema,
  parseIdeasMd,
  extractImpactEffort,
  extractImpactEffortRisk,
} from '../../src/core/ideas-parser.js';

describe('ideas-parser', () => {
  // =====================================================
  // ParsedIdeaSchema
  // =====================================================
  describe('ParsedIdeaSchema', () => {
    it('validates a complete idea', () => {
      const valid = {
        title: 'Add event batching',
        description: 'Event batching for high-frequency events',
        group: 'Future Improvements',
        impact: 4,
        effort: 3,
        risk: 2,
      };
      expect(() => ParsedIdeaSchema.parse(valid)).not.toThrow();
    });

    it('applies default impact, effort, and risk when omitted', () => {
      const minimal = {
        title: 'Some idea',
        description: 'Description here',
        group: 'General',
      };
      const parsed = ParsedIdeaSchema.parse(minimal);
      expect(parsed.impact).toBe(3);
      expect(parsed.effort).toBe(3);
      expect(parsed.risk).toBe(3);
    });

    it('rejects idea with empty title', () => {
      const invalid = {
        title: '',
        description: 'desc',
        group: 'General',
      };
      expect(() => ParsedIdeaSchema.parse(invalid)).toThrow();
    });

    it('rejects idea with impact outside 1-5', () => {
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 0,
          effort: 3,
          risk: 3,
        }),
      ).toThrow();
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 6,
          effort: 3,
          risk: 3,
        }),
      ).toThrow();
    });

    it('rejects idea with effort outside 1-5', () => {
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 3,
          effort: 0,
          risk: 3,
        }),
      ).toThrow();
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 3,
          effort: 6,
          risk: 3,
        }),
      ).toThrow();
    });

    it('rejects idea with risk outside 1-5', () => {
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 3,
          effort: 3,
          risk: 0,
        }),
      ).toThrow();
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 3,
          effort: 3,
          risk: 6,
        }),
      ).toThrow();
    });

    it('rejects non-integer impact', () => {
      expect(() =>
        ParsedIdeaSchema.parse({
          title: 'Test',
          description: 'desc',
          group: 'General',
          impact: 2.5,
        }),
      ).toThrow();
    });
  });

  // =====================================================
  // parseIdeasMd
  // =====================================================
  describe('parseIdeasMd', () => {
    const sampleMd = `# Ideas

## For RT-1b (Dashboard Server + UI)
- EventBus is ready — subscribe with eventBus.on()
- \`eventBus.history\` provides reconnect state for late-joining clients

## Future Improvements
- Consider adding \`eventBus.onceAny()\` for one-shot wildcard listeners
- Event batching for high-frequency events
`;

    it('parses sample ideas.md into structured ideas', () => {
      const ideas = parseIdeasMd(sampleMd);
      expect(ideas).toHaveLength(4);
    });

    it('assigns correct groups based on ## headings', () => {
      const ideas = parseIdeasMd(sampleMd);
      expect(ideas[0].group).toBe('For RT-1b (Dashboard Server + UI)');
      expect(ideas[1].group).toBe('For RT-1b (Dashboard Server + UI)');
      expect(ideas[2].group).toBe('Future Improvements');
      expect(ideas[3].group).toBe('Future Improvements');
    });

    it('extracts title from first sentence', () => {
      const ideas = parseIdeasMd(sampleMd);
      // First idea has an em-dash which acts as sentence boundary
      expect(ideas[0].title).toBe('EventBus is ready');
    });

    it('stores full text as description', () => {
      const ideas = parseIdeasMd(sampleMd);
      expect(ideas[3].description).toBe(
        'Event batching for high-frequency events',
      );
    });

    it('handles empty content', () => {
      const ideas = parseIdeasMd('');
      expect(ideas).toEqual([]);
    });

    it('handles content with only headings and no bullets', () => {
      const md = `# Ideas\n\n## Group A\n\n## Group B\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas).toEqual([]);
    });

    it('assigns General group to bullets before any ## heading', () => {
      const md = `# Ideas\n- An orphan idea\n## Group A\n- Grouped idea\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].group).toBe('General');
      expect(ideas[1].group).toBe('Group A');
    });

    it('skips empty bullet lines', () => {
      const md = `- \n- Valid idea\n- \n`;
      const ideas = parseIdeasMd(md);
      expect(ideas).toHaveLength(1);
      expect(ideas[0].title).toBe('Valid idea');
    });

    it('handles * bullets as well as - bullets', () => {
      const md = `* Star bullet idea\n- Dash bullet idea\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas).toHaveLength(2);
      expect(ideas[0].description).toBe('Star bullet idea');
      expect(ideas[1].description).toBe('Dash bullet idea');
    });

    it('truncates very long titles to 80 chars', () => {
      const longText =
        'A'.repeat(100) + '. Second sentence that should not appear in title';
      const md = `- ${longText}\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].title.length).toBeLessThanOrEqual(80);
      expect(ideas[0].title).toMatch(/\.\.\.$/);
    });

    it('detects impact keywords in bullet text', () => {
      const md = `- This is critical for performance\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].impact).toBe(5);
    });

    it('detects effort keywords in bullet text', () => {
      const md = `- Simple change to fix the bug\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].effort).toBe(2);
    });

    it('defaults impact, effort, and risk to 3', () => {
      const md = `- Regular idea with no keywords\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].impact).toBe(3);
      expect(ideas[0].effort).toBe(3);
      expect(ideas[0].risk).toBe(3);
    });

    it('ignores non-bullet, non-heading lines', () => {
      const md = `# Ideas\n\nSome paragraph text\n\n## Group\n- Real idea\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas).toHaveLength(1);
    });

    it('handles indented bullets (trimmed)', () => {
      const md = `## Group\n  - Indented bullet\n    - Double indented\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas).toHaveLength(2);
    });

    it('parses numbered list items', () => {
      const md = `## Group\n1. First numbered idea\n2. Second numbered idea\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas).toHaveLength(2);
      expect(ideas[0].title).toBe('First numbered idea');
      expect(ideas[1].title).toBe('Second numbered idea');
      expect(ideas[0].group).toBe('Group');
    });

    it('strips bold markers from numbered list titles', () => {
      const md = `1. **Bold Title** — some description\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].title).toBe('Bold Title');
    });

    it('detects risk keywords in bullet text', () => {
      const md = `- This is a breaking change that needs care\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].risk).toBe(5);
    });
  });

  // =====================================================
  // extractImpactEffortRisk
  // =====================================================
  describe('extractImpactEffortRisk', () => {
    it('returns 3/3/3 for neutral text', () => {
      const result = extractImpactEffortRisk('Add a new feature');
      expect(result).toEqual({ impact: 3, effort: 3, risk: 3 });
    });

    it('detects impact 5 from "critical"', () => {
      const result = extractImpactEffortRisk('This is critical for the release');
      expect(result.impact).toBe(5);
    });

    it('detects impact 4 from "significant"', () => {
      const result = extractImpactEffortRisk(
        'Significant improvement to performance',
      );
      expect(result.impact).toBe(4);
    });

    it('detects impact 4 from "high impact"', () => {
      const result = extractImpactEffortRisk('High impact change needed');
      expect(result.impact).toBe(4);
    });

    it('detects impact 2 from "minor"', () => {
      const result = extractImpactEffortRisk('Minor tweak to logging');
      expect(result.impact).toBe(2);
    });

    it('detects impact 2 from "nice to have"', () => {
      const result = extractImpactEffortRisk('Nice to have feature');
      expect(result.impact).toBe(2);
    });

    it('detects impact 2 from "low impact"', () => {
      const result = extractImpactEffortRisk('Low impact cosmetic change');
      expect(result.impact).toBe(2);
    });

    it('detects impact 1 from "negligible"', () => {
      const result = extractImpactEffortRisk('Negligible change');
      expect(result.impact).toBe(1);
    });

    it('detects effort 4 from "complex"', () => {
      const result = extractImpactEffortRisk('Complex refactoring needed');
      expect(result.effort).toBe(4);
    });

    it('detects effort 5 from "major refactor"', () => {
      const result = extractImpactEffortRisk('Requires a major refactor');
      expect(result.effort).toBe(5);
    });

    it('detects effort 4 from "high effort"', () => {
      const result = extractImpactEffortRisk('High effort migration task');
      expect(result.effort).toBe(4);
    });

    it('detects effort 2 from "simple"', () => {
      const result = extractImpactEffortRisk('Simple config change');
      expect(result.effort).toBe(2);
    });

    it('detects effort 2 from "trivial"', () => {
      const result = extractImpactEffortRisk('Trivial fix for typo');
      expect(result.effort).toBe(2);
    });

    it('detects effort 2 from "quick fix"', () => {
      const result = extractImpactEffortRisk('Quick fix for the timeout');
      expect(result.effort).toBe(2);
    });

    it('detects effort 2 from "low effort"', () => {
      const result = extractImpactEffortRisk('Low effort documentation update');
      expect(result.effort).toBe(2);
    });

    it('detects effort 1 from "one-line"', () => {
      const result = extractImpactEffortRisk('One-line fix');
      expect(result.effort).toBe(1);
    });

    it('detects risk 5 from "breaking change"', () => {
      const result = extractImpactEffortRisk('This is a breaking change');
      expect(result.risk).toBe(5);
    });

    it('detects risk 4 from "high risk"', () => {
      const result = extractImpactEffortRisk('High risk deployment');
      expect(result.risk).toBe(4);
    });

    it('detects risk 2 from "safe"', () => {
      const result = extractImpactEffortRisk('Safe additive change');
      // 'safe' triggers risk=2, but 'additive' also triggers risk=1 — 'safe' matches first
      expect(result.risk).toBe(2);
    });

    it('detects risk 1 from "zero risk"', () => {
      const result = extractImpactEffortRisk('Zero risk documentation update');
      expect(result.risk).toBe(1);
    });

    it('handles combined high impact + low effort', () => {
      const result = extractImpactEffortRisk(
        'Critical but simple one-line fix',
      );
      expect(result.impact).toBe(5);
      expect(result.effort).toBe(2);
    });

    it('is case insensitive', () => {
      const result = extractImpactEffortRisk('CRITICAL and TRIVIAL fix');
      expect(result.impact).toBe(5);
      expect(result.effort).toBe(2);
    });
  });

  // =====================================================
  // extractImpactEffort (backwards compat alias)
  // =====================================================
  describe('extractImpactEffort', () => {
    it('returns only impact and effort as numbers', () => {
      const result = extractImpactEffort('Add a new feature');
      expect(result).toEqual({ impact: 3, effort: 3 });
      expect(result).not.toHaveProperty('risk');
    });

    it('detects impact 5 from "critical"', () => {
      const result = extractImpactEffort('This is critical for the release');
      expect(result.impact).toBe(5);
    });

    it('detects effort 2 from "simple"', () => {
      const result = extractImpactEffort('Simple config change');
      expect(result.effort).toBe(2);
    });
  });
});
