/**
 * Brief context extractor module.
 * Parses brief markdown to extract searchable keywords and relevant node types.
 *
 * PURE module — no side effects, no I/O.
 */

import type { NodeType } from './knowledge-graph.js';

// ── Types ────────────────────────────────────────────────

export interface BriefContext {
  keywords: string[];
  nodeTypes: NodeType[];
}

// ── Constants ────────────────────────────────────────────

const MAX_KEYWORDS = 20;

/** Swedish stopwords (~50). */
const SWEDISH_STOPWORDS = new Set([
  'och', 'att', 'är', 'det', 'en', 'ett', 'som', 'har', 'inte', 'med',
  'för', 'den', 'till', 'var', 'han', 'hon', 'kan', 'ska', 'från', 'men',
  'om', 'sig', 'sina', 'hur', 'alla', 'andra', 'blev', 'bli', 'blir',
  'där', 'denna', 'dessa', 'dig', 'din', 'ditt', 'efter', 'eller', 'era',
  'ert', 'fem', 'fem', 'fick', 'finns', 'fyra', 'genom', 'ger', 'gjort',
  'hade', 'henne', 'här', 'hos', 'igen', 'ingen', 'när', 'redan', 'sedan',
  'ska', 'skulle', 'också', 'över',
]);

/** English stopwords (~50). */
const ENGLISH_STOPWORDS = new Set([
  'the', 'is', 'a', 'to', 'of', 'for', 'in', 'on', 'with', 'that',
  'this', 'from', 'and', 'or', 'but', 'not', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'an', 'it',
  'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she',
  'him', 'her', 'by', 'at', 'if', 'so', 'no', 'up',
]);

/** Combined stopwords. */
const STOPWORDS = new Set([...SWEDISH_STOPWORDS, ...ENGLISH_STOPWORDS]);

/** Keywords that signal technique node type should be included. */
const TECHNIQUE_KEYWORDS = ['paper', 'artikel', 'forskning', 'research', 'study'];

/** Regex for splitting on whitespace and common punctuation. */
const TOKEN_SPLIT = /[\s,;:!?(){}<>"'/\\|#*=+~^[\]]+/;

// ── Helpers ──────────────────────────────────────────────

/**
 * Extract terms found inside backticks from markdown content.
 */
function extractBacktickTerms(content: string): string[] {
  const matches = content.match(/`([^`]+)`/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Split a camelCase or PascalCase string into component words.
 * e.g. "extractBriefContext" → ["extract", "brief", "context"]
 */
function splitCamelCase(word: string): string[] {
  return word
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/**
 * Split a snake_case string into component words.
 * e.g. "brief_context" → ["brief", "context"]
 */
function splitSnakeCase(word: string): string[] {
  return word
    .split('_')
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3);
}

/**
 * Check if a word matches camelCase pattern (has both lower and upper case).
 */
function isCamelCase(word: string): boolean {
  return /[a-z][A-Z]/.test(word);
}

/**
 * Check if a word matches snake_case pattern.
 */
function isSnakeCase(word: string): boolean {
  return /\w+_\w+/.test(word);
}

/**
 * Tokenize text by splitting on whitespace and punctuation.
 * Filters out short words and stopwords. Returns lowercased tokens.
 */
function tokenize(text: string): string[] {
  return text
    .split(TOKEN_SPLIT)
    .map((w) => w.replace(/^[-_.]+|[-_.]+$/g, '').toLowerCase())
    .filter((w) => w.length >= 3)
    .filter((w) => !STOPWORDS.has(w));
}

// ── Main Function ────────────────────────────────────────

/**
 * Extract searchable keywords and relevant node types from brief markdown.
 *
 * @param briefContent - Raw markdown content of the brief
 * @returns BriefContext with extracted keywords and node types
 */
export function extractBriefContext(briefContent: string): BriefContext {
  const baseNodeTypes: NodeType[] = ['error', 'pattern', 'idea'];

  if (!briefContent.trim()) {
    return { keywords: [], nodeTypes: baseNodeTypes };
  }

  // Determine node types
  const lowerContent = briefContent.toLowerCase();
  const nodeTypes: NodeType[] = [...baseNodeTypes];
  if (TECHNIQUE_KEYWORDS.some((kw) => lowerContent.includes(kw))) {
    nodeTypes.push('technique');
  }

  // Priority terms: backtick terms, camelCase, snake_case
  const priorityKeywords: string[] = [];
  const seen = new Set<string>();

  // Extract backtick terms
  const backtickTerms = extractBacktickTerms(briefContent);
  for (const term of backtickTerms) {
    const lower = term.toLowerCase();
    // Add the full term (joined if multi-word)
    const joined = lower.replace(/\s+/g, '');
    if (joined.length >= 3 && !STOPWORDS.has(joined) && !seen.has(joined)) {
      priorityKeywords.push(joined);
      seen.add(joined);
    }
    // Also split camelCase / snake_case and add components
    if (isCamelCase(term)) {
      for (const part of splitCamelCase(term)) {
        if (!STOPWORDS.has(part) && !seen.has(part)) {
          priorityKeywords.push(part);
          seen.add(part);
        }
      }
    }
    if (isSnakeCase(term)) {
      for (const part of splitSnakeCase(term)) {
        if (!STOPWORDS.has(part) && !seen.has(part)) {
          priorityKeywords.push(part);
          seen.add(part);
        }
      }
    }
    // Tokenize the term for any remaining words
    for (const tok of tokenize(term)) {
      if (!seen.has(tok)) {
        priorityKeywords.push(tok);
        seen.add(tok);
      }
    }
  }

  // Scan raw tokens for camelCase and snake_case patterns in body text
  const rawTokens = briefContent.split(TOKEN_SPLIT);
  for (const raw of rawTokens) {
    const cleaned = raw.replace(/^[-_.`]+|[-_.`]+$/g, '');
    if (isCamelCase(cleaned)) {
      const lower = cleaned.toLowerCase();
      if (!seen.has(lower)) {
        priorityKeywords.push(lower);
        seen.add(lower);
      }
      for (const part of splitCamelCase(cleaned)) {
        if (!STOPWORDS.has(part) && !seen.has(part)) {
          priorityKeywords.push(part);
          seen.add(part);
        }
      }
    }
    if (isSnakeCase(cleaned)) {
      const lower = cleaned.toLowerCase();
      if (!seen.has(lower)) {
        priorityKeywords.push(lower);
        seen.add(lower);
      }
      for (const part of splitSnakeCase(cleaned)) {
        if (!STOPWORDS.has(part) && !seen.has(part)) {
          priorityKeywords.push(part);
          seen.add(part);
        }
      }
    }
  }

  // Regular tokens from the full content
  const regularKeywords: string[] = [];
  for (const tok of tokenize(briefContent)) {
    if (!seen.has(tok)) {
      regularKeywords.push(tok);
      seen.add(tok);
    }
  }

  // Combine: priority first, then regular, capped at MAX_KEYWORDS
  const keywords = [...priorityKeywords, ...regularKeywords].slice(0, MAX_KEYWORDS);

  return { keywords, nodeTypes };
}
