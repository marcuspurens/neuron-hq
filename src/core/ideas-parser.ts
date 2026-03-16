import { z } from 'zod';

/** Schema for a parsed idea from ideas.md */
export const ParsedIdeaSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  group: z.string(),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  effort: z.enum(['low', 'medium', 'high']).default('medium'),
});
export type ParsedIdea = z.infer<typeof ParsedIdeaSchema>;

/**
 * Parse ideas.md content into structured ideas.
 * Each ## heading = a group. Each - bullet = an idea.
 * Defensive: skips malformed lines, never throws.
 */
export function parseIdeasMd(content: string): ParsedIdea[] {
  const ideas: ParsedIdea[] = [];
  const lines = content.split('\n');
  let currentGroup = 'General';

  for (const line of lines) {
    const trimmed = line.trim();

    // ## heading = group
    if (trimmed.startsWith('## ')) {
      currentGroup = trimmed.slice(3).trim();
      continue;
    }

    // # heading = skip (top-level title)
    if (trimmed.startsWith('# ')) continue;

    // - bullet = idea
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = trimmed.slice(2).trim();
      if (!text) continue;

      // Title: first sentence or up to 80 chars
      const title = extractTitle(text);
      const { impact, effort } = extractImpactEffort(text);

      ideas.push({
        title,
        description: text,
        group: currentGroup,
        impact,
        effort,
      });
    }
  }

  return ideas;
}

/**
 * Extract a short title from idea text.
 * Uses first sentence (up to period/dash) or first 80 chars.
 */
function extractTitle(text: string): string {
  // Try first sentence
  const sentenceMatch = text.match(/^([^.!?—]+)/);
  const raw = sentenceMatch ? sentenceMatch[1].trim() : text;

  // Truncate to 80 chars
  if (raw.length > 80) {
    return raw.slice(0, 77) + '...';
  }
  return raw;
}

/**
 * Try to detect impact/effort from text keywords.
 * Returns defaults ('medium'/'medium') if not detected.
 */
export function extractImpactEffort(text: string): {
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
} {
  const lower = text.toLowerCase();

  let impact: 'low' | 'medium' | 'high' = 'medium';
  let effort: 'low' | 'medium' | 'high' = 'medium';

  // Impact detection
  if (
    lower.includes('high impact') ||
    lower.includes('critical') ||
    lower.includes('significant')
  ) {
    impact = 'high';
  } else if (
    lower.includes('low impact') ||
    lower.includes('minor') ||
    lower.includes('nice to have')
  ) {
    impact = 'low';
  }

  // Effort detection
  if (
    lower.includes('high effort') ||
    lower.includes('complex') ||
    lower.includes('major refactor')
  ) {
    effort = 'high';
  } else if (
    lower.includes('low effort') ||
    lower.includes('simple') ||
    lower.includes('trivial') ||
    lower.includes('quick fix')
  ) {
    effort = 'low';
  }

  return { impact, effort };
}
