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

/** Patterns for sub-bullets that are NOT ideas (tradeoffs, checklists) */
const NON_IDEA_BULLET = /^(pro:|con:|✅|❌)/i;

/** Detect the "detailed" format: ## N. Title (numbered heading = idea, not group) */
const NUMBERED_HEADING = /^(\d+)\.\s+(.+)/;

/**
 * Parse ideas.md content into structured ideas.
 *
 * Supports two formats:
 * 1. **List format**: ## heading = group, bullets/numbered items = ideas
 * 2. **Detailed format**: ## N. Title = idea (with multi-line body including Pro/Con)
 *
 * Defensive: skips malformed lines, never throws.
 */
export function parseIdeasMd(content: string): ParsedIdea[] {
  const ideas: ParsedIdea[] = [];
  const lines = content.split('\n');
  let currentGroup = 'General';

  // Detect format: if any ## heading matches "## N. Title", use detailed mode
  const isDetailed = lines.some(l => {
    const t = l.trim();
    return t.startsWith('## ') && NUMBERED_HEADING.test(t.slice(3).trim());
  });

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // ## heading
    if (trimmed.startsWith('## ')) {
      const headingText = trimmed.slice(3).trim();

      // Detailed format: ## N. Title is an idea, not a group
      if (isDetailed) {
        const m = headingText.match(NUMBERED_HEADING);
        if (m) {
          const bodyText = collectBody(lines, i + 1);
          const fullText = headingText + (bodyText ? '\n' + bodyText : '');
          const cleanTitle = m[2].replace(/\*\*/g, '').trim();
          const title = extractTitle(cleanTitle);
          const { impact, effort, risk } = extractImpactEffortRisk(fullText);

          ideas.push({
            title,
            description: fullText,
            group: currentGroup,
            impact,
            effort,
            risk,
          });
          continue;
        }
      }

      // Regular group heading
      currentGroup = headingText;
      continue;
    }

    // # heading = skip (top-level title)
    if (trimmed.startsWith('# ')) continue;

    // In detailed format, skip everything except ## headings (body is collected above)
    if (isDetailed) continue;

    // - bullet = idea (list format only)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = trimmed.slice(2).trim();
      if (!text) continue;
      if (NON_IDEA_BULLET.test(text)) continue;

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
 * Collect body text below a ## heading until the next ## or end of file.
 * Used in detailed format to extract full idea description for keyword scoring.
 */
function collectBody(lines: string[], startIdx: number): string {
  const bodyLines: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) break;
    if (trimmed === '---') break;
    bodyLines.push(trimmed);
  }
  return bodyLines.join('\n').trim();
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
