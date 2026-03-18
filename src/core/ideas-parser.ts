import { z } from 'zod';

/** Schema for a parsed idea from ideas.md */
export const ParsedIdeaSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  group: z.string(),
  impact: z.number().int().min(1).max(5).default(3),
  effort: z.number().int().min(1).max(5).default(3),
  risk: z.number().int().min(1).max(5).default(3),
});
export type ParsedIdea = z.infer<typeof ParsedIdeaSchema>;

/**
 * Parse ideas.md content into structured ideas.
 * Each ## heading = a group. Each - bullet or numbered item = an idea.
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
      const { impact, effort, risk } = extractImpactEffortRisk(text);

      ideas.push({
        title,
        description: text,
        group: currentGroup,
        impact,
        effort,
        risk,
      });
      continue;
    }

    // Numbered list: 1. **Title** — description  OR  1. Text
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numberedMatch) {
      const text = numberedMatch[1].trim();
      if (!text) continue;

      // Strip bold markers for title extraction
      const cleanText = text.replace(/\*\*/g, '');
      const title = extractTitle(cleanText);
      const { impact, effort, risk } = extractImpactEffortRisk(text);

      ideas.push({
        title,
        description: text,
        group: currentGroup,
        impact,
        effort,
        risk,
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
 * Try to detect impact/effort/risk from text keywords.
 * Returns numeric values 1-5 (defaults to 3 if not detected).
 */
export function extractImpactEffortRisk(text: string): {
  impact: number; effort: number; risk: number;
} {
  const lower = text.toLowerCase();

  // Impact detection (1-5)
  let impact = 3;
  if (lower.includes('critical') || lower.includes('transformative') || lower.includes('essential')) impact = 5;
  else if (lower.includes('high impact') || lower.includes('significant') || lower.includes('important')) impact = 4;
  else if (lower.includes('low impact') || lower.includes('minor') || lower.includes('nice to have')) impact = 2;
  else if (lower.includes('negligible') || lower.includes('cosmetic')) impact = 1;

  // Effort detection (1-5)
  let effort = 3;
  if (lower.includes('major refactor') || lower.includes('huge') || lower.includes('months')) effort = 5;
  else if (lower.includes('high effort') || lower.includes('complex') || lower.includes('weeks')) effort = 4;
  else if (lower.includes('low effort') || lower.includes('simple') || lower.includes('trivial') || lower.includes('quick fix')) effort = 2;
  else if (lower.includes('one-line') || lower.includes('one line')) effort = 1;

  // Risk detection (1-5)
  let risk = 3;
  if (lower.includes('breaking change') || lower.includes('dangerous') || lower.includes('risky')) risk = 5;
  else if (lower.includes('high risk')) risk = 4;
  else if (lower.includes('safe') || lower.includes('low risk') || lower.includes('no risk')) risk = 2;
  else if (lower.includes('zero risk') || lower.includes('additive')) risk = 1;

  return { impact, effort, risk };
}

/**
 * Backwards-compatible alias (returns only impact/effort as numbers).
 * @deprecated Use extractImpactEffortRisk instead.
 */
export function extractImpactEffort(text: string): { impact: number; effort: number } {
  const { impact, effort } = extractImpactEffortRisk(text);
  return { impact, effort };
}
