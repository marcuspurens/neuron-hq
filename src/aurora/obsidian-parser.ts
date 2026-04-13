/**
 * Pure parsing module for Obsidian markdown files with YAML frontmatter.
 * No side effects (no DB, no file I/O) — receives strings and returns parsed data.
 */

import matter from 'gray-matter';
import { createLogger } from '../core/logger.js';

const logger = createLogger('obsidian:parser');

// --- Types ---

export interface ParsedSpeaker {
  label: string;
  name: string;
  title: string;
  organization: string;
  confidence: number;
  role: string;
}

export interface Highlight {
  segment_start_ms: number;
  tag: string;
}

export interface Comment {
  segment_start_ms: number;
  text: string;
}

export interface ParsedTimelineBlock {
  timecode_ms: number;
  speaker: string;
  text: string;
}

export interface ParsedObsidianFile {
  id: string;
  speakers: ParsedSpeaker[];
  highlights: Highlight[];
  comments: Comment[];
  tags: string[] | null;
  timelineBlocks: ParsedTimelineBlock[] | null;
  title: string | null;
  confidence: number | null;
  textContent: string | null;
  exportedAt: string | null;
}

export interface BriefingAnswer {
  questionIndex: number;
  questionText: string;
  answer: string;
  questionNodeId: string | null;
  questionCategory: 'gap' | 'stale' | 'idea' | null;
  sentiment: 'positive' | 'negative' | 'neutral';
}

// --- Known tags for highlight extraction ---

const KNOWN_TAGS = new Set(['highlight', 'key-insight', 'quote', 'follow-up']);

// --- Regex patterns ---

/** Matches `### HH:MM:SS — Speaker` headers (em dash U+2014). */
const TIMECODE_HEADER_RE = /^###\s+(\d{2}:\d{2}:\d{2})\s+\u2014\s+(.*)$/;

/** Matches `#tag` in a line. */
const TAG_RE = /#([\w-]+)/g;

/** Matches `<!-- kommentar: text -->`. */
const COMMENT_RE = /<!--\s*kommentar:\s*(.*?)\s*-->/g;

// --- Briefing feedback regex patterns ---

/** Matches `### Fråga N: question text` headers. */
const QUESTION_HEADER_RE = /^###\s+Fråga\s+(\d+):\s+(.+)$/;

/** Matches `<!-- question_node_id: id -->`. */
const QUESTION_NODE_ID_RE = /<!--\s*question_node_id:\s*(.*?)\s*-->/;

/** Matches `<!-- question_category: category -->`. */
const QUESTION_CATEGORY_RE = /<!--\s*question_category:\s*(.*?)\s*-->/;

/** Matches `<!-- svar: answer text -->`. */
const ANSWER_RE = /<!--\s*svar:\s*(.*?)\s*-->/;

// --- Exported functions ---

/**
 * Convert a timecode string "HH:MM:SS" to milliseconds.
 */
export function parseTimecodeToMs(timecode: string): number {
  const parts = timecode.split(':');
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map(Number);
  return (h * 3600 + m * 60 + s) * 1000;
}

/**
 * Extract speakers from frontmatter speakers object.
 *
 * Expected YAML format:
 * ```yaml
 * speakers:
 *   SPEAKER_00:
 *     name: "Marcus"
 *     confidence: 0.85
 *     role: "host"
 * ```
 */
export function extractSpeakers(frontmatter: Record<string, unknown>): ParsedSpeaker[] {
  const speakersObj = frontmatter.speakers;
  if (!speakersObj || typeof speakersObj !== 'object') return [];

  const result: ParsedSpeaker[] = [];
  for (const [label, value] of Object.entries(speakersObj as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    result.push({
      label,
      name: typeof v.name === 'string' ? v.name : '',
      title: typeof v.title === 'string' ? v.title : '',
      organization: typeof v.organization === 'string' ? v.organization : '',
      confidence: typeof v.confidence === 'number' ? v.confidence : 0,
      role: typeof v.role === 'string' ? v.role : '',
    });
  }
  return result;
}

/** Extract speakers from markdown table in ## Talare section. */
export function extractSpeakersFromTable(markdownBody: string): ParsedSpeaker[] {
  const sectionMatch = markdownBody.match(/## Talare\s*\n([\s\S]*?)(?=\n## |\n$|$)/);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];

  const lines = section.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return [];

  const headerCells = lines[0]
    .split('|')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  const colIndex = {
    label: headerCells.indexOf('label'),
    namn: headerCells.indexOf('namn'),
    titel: headerCells.indexOf('titel'),
    organisation: headerCells.indexOf('organisation'),
    roll: headerCells.indexOf('roll'),
    konfidenspoäng: headerCells.indexOf('konfidenspoäng'),
  };

  if (colIndex.label === -1) return [];

  const result: ParsedSpeaker[] = [];
  for (let i = 2; i < lines.length; i++) {
    const rawCells = lines[i].split('|');
    const cells = rawCells.slice(1, -1).map((c) => c.trim());

    const label = cells[colIndex.label]?.trim() ?? '';
    if (!label) continue;

    const confStr = colIndex.konfidenspoäng >= 0 ? (cells[colIndex.konfidenspoäng] ?? '') : '';
    const confidence = confStr ? Number(confStr) : 0;

    result.push({
      label,
      name: colIndex.namn >= 0 ? (cells[colIndex.namn] ?? '') : '',
      title: colIndex.titel >= 0 ? (cells[colIndex.titel] ?? '') : '',
      organization: colIndex.organisation >= 0 ? (cells[colIndex.organisation] ?? '') : '',
      confidence: isNaN(confidence) ? 0 : confidence,
      role: colIndex.roll >= 0 ? (cells[colIndex.roll] ?? '') : '',
    });
  }
  return result;
}

/**
 * Extract highlights from markdown body by scanning for timecode headers
 * with known hash-tags.
 *
 * Pattern: `### HH:MM:SS — Speaker #tag1 #tag2`
 * Only known tags (highlight, key-insight, quote, follow-up) are extracted.
 */
export function extractHighlights(
  markdownBody: string
): Array<{ timecode_ms: number; tag: string }> {
  const results: Array<{ timecode_ms: number; tag: string }> = [];
  const lines = markdownBody.split('\n');

  for (const line of lines) {
    const headerMatch = TIMECODE_HEADER_RE.exec(line);
    if (!headerMatch) continue;

    const timecodeMs = parseTimecodeToMs(headerMatch[1]);
    const rest = headerMatch[2];

    // Reset lastIndex for global regex reuse
    TAG_RE.lastIndex = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = TAG_RE.exec(rest)) !== null) {
      const tag = tagMatch[1];
      if (KNOWN_TAGS.has(tag)) {
        results.push({ timecode_ms: timecodeMs, tag });
      }
    }
  }

  return results;
}

/**
 * Extract HTML comments matching `<!-- kommentar: text -->` and associate
 * each with the nearest preceding `### HH:MM:SS` header.
 */
export function extractComments(
  markdownBody: string
): Array<{ timecode_ms: number; text: string }> {
  const results: Array<{ timecode_ms: number; text: string }> = [];
  const lines = markdownBody.split('\n');

  let currentTimecodeMs: number | null = null;

  for (const line of lines) {
    // Check if this line is a timecode header
    const headerMatch = TIMECODE_HEADER_RE.exec(line);
    if (headerMatch) {
      currentTimecodeMs = parseTimecodeToMs(headerMatch[1]);
    }

    // Check for comments in this line
    COMMENT_RE.lastIndex = 0;
    let commentMatch: RegExpExecArray | null;
    while ((commentMatch = COMMENT_RE.exec(line)) !== null) {
      if (currentTimecodeMs === null) {
        logger.warn('Comment found before any timecode header, skipping', {
          text: commentMatch[1],
        });
        continue;
      }
      results.push({
        timecode_ms: currentTimecodeMs,
        text: commentMatch[1],
      });
    }
  }

  return results;
}

/**
 * Find the raw segment whose start_ms is closest to the given timecode.
 * Returns the segment's start_ms if within 5000ms tolerance, or null.
 */
export function matchSegmentTime(
  timecodeMs: number,
  rawSegments: Array<{ start_ms: number }>
): number | null {
  if (rawSegments.length === 0) return null;

  let closestMs: number | null = null;
  let closestDelta = Infinity;

  for (const seg of rawSegments) {
    const delta = Math.abs(seg.start_ms - timecodeMs);
    if (delta < closestDelta) {
      closestDelta = delta;
      closestMs = seg.start_ms;
    }
  }

  if (closestDelta <= 5000 && closestMs !== null) {
    return closestMs;
  }
  return null;
}

// --- Briefing feedback functions ---

const VALID_CATEGORIES = new Set(['gap', 'stale', 'idea']);

/**
 * Analyse the sentiment of a briefing answer text.
 *
 * - Contains 👍 → 'positive'
 * - Starts with 'ja' or 'yes' (case-insensitive) → 'positive'
 * - Contains 👎 → 'negative'
 * - Starts with 'nej' or 'no' (case-insensitive) → 'negative'
 * - Otherwise → 'neutral'
 */
export function parseSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  if (text.includes('\u{1F44D}')) return 'positive';
  if (/^(ja|yes)\b/i.test(text.trim())) return 'positive';
  if (text.includes('\u{1F44E}')) return 'negative';
  if (/^(nej|no)\b/i.test(text.trim())) return 'negative';
  return 'neutral';
}

/**
 * Parse the markdown body of a morning-briefing file to extract user answers.
 *
 * Scans for `### Fråga N: text` headers, then collects metadata comments
 * (question_node_id, question_category) and the `<!-- svar: ... -->` answer.
 * Empty answers are skipped.
 */
export function extractBriefingAnswers(markdownBody: string): BriefingAnswer[] {
  const results: BriefingAnswer[] = [];
  const lines = markdownBody.split('\n');

  let currentIndex: number | null = null;
  let currentText = '';
  let currentNodeId: string | null = null;
  let currentCategory: 'gap' | 'stale' | 'idea' | null = null;

  for (const line of lines) {
    // Check for question header
    const headerMatch = QUESTION_HEADER_RE.exec(line);
    if (headerMatch) {
      currentIndex = parseInt(headerMatch[1], 10);
      currentText = headerMatch[2];
      currentNodeId = null;
      currentCategory = null;
      continue;
    }

    // Check for question_node_id comment
    const nodeIdMatch = QUESTION_NODE_ID_RE.exec(line);
    if (nodeIdMatch && currentIndex !== null) {
      const id = nodeIdMatch[1].trim();
      currentNodeId = id.length > 0 ? id : null;
      continue;
    }

    // Check for question_category comment
    const categoryMatch = QUESTION_CATEGORY_RE.exec(line);
    if (categoryMatch && currentIndex !== null) {
      const cat = categoryMatch[1].trim();
      currentCategory = VALID_CATEGORIES.has(cat) ? (cat as 'gap' | 'stale' | 'idea') : null;
      continue;
    }

    // Check for answer comment
    const answerMatch = ANSWER_RE.exec(line);
    if (answerMatch && currentIndex !== null) {
      const answer = answerMatch[1].trim();
      if (answer.length === 0) continue; // Skip empty answers

      results.push({
        questionIndex: currentIndex,
        questionText: currentText,
        answer,
        questionNodeId: currentNodeId,
        questionCategory: currentCategory,
        sentiment: parseSentiment(answer),
      });
    }
  }

  return results;
}

export function extractTimelineBlocks(markdownBody: string): ParsedTimelineBlock[] {
  const results: ParsedTimelineBlock[] = [];
  const lines = markdownBody.split('\n');

  let currentTimecodeMs: number | null = null;
  let currentSpeaker = '';
  let currentTextLines: string[] = [];

  const flush = () => {
    if (currentTimecodeMs !== null) {
      const text = currentTextLines.join('\n').trim();
      if (text.length > 0) {
        results.push({ timecode_ms: currentTimecodeMs, speaker: currentSpeaker, text });
      }
    }
  };

  for (const line of lines) {
    const headerMatch = TIMECODE_HEADER_RE.exec(line);
    if (headerMatch) {
      flush();
      currentTimecodeMs = parseTimecodeToMs(headerMatch[1]);
      const rest = headerMatch[2];
      currentSpeaker = rest.replace(/#[\w-]+/g, '').trim();
      currentTextLines = [];
      continue;
    }

    if (currentTimecodeMs !== null) {
      if (!COMMENT_RE.test(line)) {
        COMMENT_RE.lastIndex = 0;
        currentTextLines.push(line);
      }
      COMMENT_RE.lastIndex = 0;
    }
  }
  flush();

  return results;
}

/**
 * Extracts the first H1 heading from a markdown body.
 * Returns null if none found.
 */
export function extractTitle(markdownBody: string): string | null {
  const match = markdownBody.match(/^# (.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extracts text content under "## Innehåll" heading.
 * Reads until the next "## " heading or end of string.
 * Returns null if section not found, or if section exists but is empty after trimming.
 */
export function extractContentSection(markdownBody: string): string | null {
  // Match "## Innehåll" only at the start of a line (prevents matching inline occurrences)
  const headingMatch = markdownBody.match(/^## Innehåll[ \t]*$/m);
  if (!headingMatch || headingMatch.index === undefined) return null;

  // Content starts after the heading line
  const afterHeadingStart = headingMatch.index + headingMatch[0].length;
  const afterHeading = markdownBody.slice(afterHeadingStart);

  // Find the next "## " section at start of line
  const nextSectionMatch = afterHeading.match(/^## /m);
  const section =
    nextSectionMatch?.index !== undefined
      ? afterHeading.slice(0, nextSectionMatch.index)
      : afterHeading;

  const trimmed = section.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Main entry point. Parse an Obsidian markdown file with YAML frontmatter.
 * Returns null if no `id` in frontmatter or if the file is corrupt.
 */
export function parseObsidianFile(content: string): ParsedObsidianFile | null {
  try {
    const parsed = matter(content);
    const frontmatter = parsed.data as Record<string, unknown>;

    // Must have an id field
    const id = frontmatter.id;
    if (id === undefined || id === null) return null;

    const idStr = String(id);
    const tableSpeakers = extractSpeakersFromTable(parsed.content);
    const speakers = tableSpeakers.length > 0 ? tableSpeakers : extractSpeakers(frontmatter);
    const rawHighlights = extractHighlights(parsed.content);
    const rawComments = extractComments(parsed.content);

    // Map timecode_ms → segment_start_ms for the output interfaces
    const highlights: Highlight[] = rawHighlights.map((h) => ({
      segment_start_ms: h.timecode_ms,
      tag: h.tag,
    }));

    const comments: Comment[] = rawComments.map((c) => ({
      segment_start_ms: c.timecode_ms,
      text: c.text,
    }));

    const rawTags = frontmatter.tags;
    const tags = Array.isArray(rawTags) ? rawTags.map(String).filter((t) => t.length > 0) : null;

    const title = extractTitle(parsed.content);
    const rawConfidence = frontmatter['confidence'];
    const confidence = typeof rawConfidence === 'number' ? rawConfidence : null;
    const textContent = extractContentSection(parsed.content);
    const exportedAt =
      typeof frontmatter['exported_at'] === 'string' ? frontmatter['exported_at'] : null;

    const rawTimelineBlocks = extractTimelineBlocks(parsed.content);
    const timelineBlocks = rawTimelineBlocks.length > 0 ? rawTimelineBlocks : null;

    return {
      id: idStr,
      speakers,
      highlights,
      comments,
      tags,
      timelineBlocks,
      title,
      confidence,
      textContent,
      exportedAt,
    };
  } catch (err) {
    logger.warn('Failed to parse Obsidian file', {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return null;
  }
}
