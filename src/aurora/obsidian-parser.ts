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

export interface ParsedObsidianFile {
  id: string;
  speakers: ParsedSpeaker[];
  highlights: Highlight[];
  comments: Comment[];
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
export function extractSpeakers(
  frontmatter: Record<string, unknown>,
): ParsedSpeaker[] {
  const speakersObj = frontmatter.speakers;
  if (!speakersObj || typeof speakersObj !== 'object') return [];

  const result: ParsedSpeaker[] = [];
  for (const [label, value] of Object.entries(
    speakersObj as Record<string, unknown>,
  )) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    result.push({
      label,
      name: typeof v.name === 'string' ? v.name : '',
      confidence: typeof v.confidence === 'number' ? v.confidence : 0,
      role: typeof v.role === 'string' ? v.role : '',
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
  markdownBody: string,
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
  markdownBody: string,
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
  rawSegments: Array<{ start_ms: number }>,
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

/**
 * Main entry point. Parse an Obsidian markdown file with YAML frontmatter.
 * Returns null if no `id` in frontmatter or if the file is corrupt.
 */
export function parseObsidianFile(
  content: string,
): ParsedObsidianFile | null {
  try {
    const parsed = matter(content);
    const frontmatter = parsed.data as Record<string, unknown>;

    // Must have an id field
    const id = frontmatter.id;
    if (id === undefined || id === null) return null;

    const idStr = String(id);
    const speakers = extractSpeakers(frontmatter);
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

    return {
      id: idStr,
      speakers,
      highlights,
      comments,
    };
  } catch (err) {
    logger.warn('Failed to parse Obsidian file', {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return null;
  }
}
