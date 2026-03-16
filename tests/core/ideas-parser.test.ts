import { describe, it, expect } from 'vitest';
import {
  ParsedIdeaSchema,
  parseIdeasMd,
  extractImpactEffort,
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
        impact: 'high',
        effort: 'medium',
      };
      expect(() => ParsedIdeaSchema.parse(valid)).not.toThrow();
    });

    it('applies default impact and effort when omitted', () => {
      const minimal = {
        title: 'Some idea',
        description: 'Description here',
        group: 'General',
      };
      const parsed = ParsedIdeaSchema.parse(minimal);
      expect(parsed.impact).toBe('medium');
      expect(parsed.effort).toBe('medium');
    });

    it('rejects idea with empty title', () => {
      const invalid = {
        title: '',
        description: 'desc',
        group: 'General',
      };
      expect(() => ParsedIdeaSchema.parse(invalid)).toThrow();
    });

    it('rejects idea with invalid impact', () => {
      const invalid = {
        title: 'Test',
        description: 'desc',
        group: 'General',
        impact: 'extreme',
      };
      expect(() => ParsedIdeaSchema.parse(invalid)).toThrow();
    });

    it('rejects idea with invalid effort', () => {
      const invalid = {
        title: 'Test',
        description: 'desc',
        group: 'General',
        effort: 'huge',
      };
      expect(() => ParsedIdeaSchema.parse(invalid)).toThrow();
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
      expect(ideas[0].impact).toBe('high');
    });

    it('detects effort keywords in bullet text', () => {
      const md = `- Simple change to fix the bug\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].effort).toBe('low');
    });

    it('defaults impact and effort to medium', () => {
      const md = `- Regular idea with no keywords\n`;
      const ideas = parseIdeasMd(md);
      expect(ideas[0].impact).toBe('medium');
      expect(ideas[0].effort).toBe('medium');
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
  });

  // =====================================================
  // extractImpactEffort
  // =====================================================
  describe('extractImpactEffort', () => {
    it('returns medium/medium for neutral text', () => {
      const result = extractImpactEffort('Add a new feature');
      expect(result).toEqual({ impact: 'medium', effort: 'medium' });
    });

    it('detects high impact from "critical"', () => {
      const result = extractImpactEffort('This is critical for the release');
      expect(result.impact).toBe('high');
    });

    it('detects high impact from "significant"', () => {
      const result = extractImpactEffort(
        'Significant improvement to performance',
      );
      expect(result.impact).toBe('high');
    });

    it('detects high impact from "high impact"', () => {
      const result = extractImpactEffort('High impact change needed');
      expect(result.impact).toBe('high');
    });

    it('detects low impact from "minor"', () => {
      const result = extractImpactEffort('Minor tweak to logging');
      expect(result.impact).toBe('low');
    });

    it('detects low impact from "nice to have"', () => {
      const result = extractImpactEffort('Nice to have feature');
      expect(result.impact).toBe('low');
    });

    it('detects low impact from "low impact"', () => {
      const result = extractImpactEffort('Low impact cosmetic change');
      expect(result.impact).toBe('low');
    });

    it('detects high effort from "complex"', () => {
      const result = extractImpactEffort('Complex refactoring needed');
      expect(result.effort).toBe('high');
    });

    it('detects high effort from "major refactor"', () => {
      const result = extractImpactEffort('Requires a major refactor');
      expect(result.effort).toBe('high');
    });

    it('detects high effort from "high effort"', () => {
      const result = extractImpactEffort('High effort migration task');
      expect(result.effort).toBe('high');
    });

    it('detects low effort from "simple"', () => {
      const result = extractImpactEffort('Simple config change');
      expect(result.effort).toBe('low');
    });

    it('detects low effort from "trivial"', () => {
      const result = extractImpactEffort('Trivial fix for typo');
      expect(result.effort).toBe('low');
    });

    it('detects low effort from "quick fix"', () => {
      const result = extractImpactEffort('Quick fix for the timeout');
      expect(result.effort).toBe('low');
    });

    it('detects low effort from "low effort"', () => {
      const result = extractImpactEffort('Low effort documentation update');
      expect(result.effort).toBe('low');
    });

    it('handles combined high impact + low effort', () => {
      const result = extractImpactEffort(
        'Critical but simple one-line fix',
      );
      expect(result.impact).toBe('high');
      expect(result.effort).toBe('low');
    });

    it('is case insensitive', () => {
      const result = extractImpactEffort('CRITICAL and TRIVIAL fix');
      expect(result.impact).toBe('high');
      expect(result.effort).toBe('low');
    });
  });
});
