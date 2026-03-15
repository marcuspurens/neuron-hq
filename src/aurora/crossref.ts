/**
 * CrossRef API client module for Aurora.
 *
 * Resolves DOIs and searches the CrossRef registry for academic works.
 * All API calls are non-fatal — errors return null or empty arrays.
 */

import { loadAuroraGraph, saveAuroraGraph, addAuroraNode, addAuroraEdge, findAuroraNodes } from './aurora-graph.js';
import type { AuroraNode, AuroraEdge } from './aurora-schema.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

export interface CrossRefWork {
  doi: string;
  title: string;
  authors: string[];
  published: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  abstract?: string;
  citationCount?: number;
  type: string;
  url: string;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

export const CROSSREF_USER_AGENT = 'NeuronHQ/1.0 (mailto:contact@neuronhq.dev)';

const RATE_LIMIT_MS = 1000;
const TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

/** Last request timestamp for rate limiting. */
let lastRequestTime = 0;

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Enforce rate limit: wait until 1s has elapsed since last request. */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();
}

/** Fetch with an AbortController-based timeout (10s). */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/** Retry a fetch-based operation once on timeout/network error. */
async function withRetry<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    await sleep(1000);
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }
}

/** Parse a CrossRef date-parts structure to ISO date string. */
function parseDateParts(dateObj: Record<string, unknown> | undefined): string {
  if (!dateObj) return '';
  const parts = dateObj['date-parts'] as number[][] | undefined;
  if (!parts || !Array.isArray(parts) || parts.length === 0) return '';
  const [year, month, day] = parts[0];
  if (!year) return '';
  const m = month ? String(month).padStart(2, '0') : '01';
  const d = day ? String(day).padStart(2, '0') : '01';
  return `${year}-${m}-${d}`;
}

/**
 * Transform a raw CrossRef API response item to our CrossRefWork interface.
 *
 * CrossRef returns title as array, author as array of {given, family},
 * published-print or published-online as {date-parts: [[year, month, day]]}, etc.
 */
export function parseCrossRefWork(item: Record<string, unknown>): CrossRefWork {
  const titles = item.title as string[] | undefined;
  const title = titles && titles.length > 0 ? titles[0] : '';

  const rawAuthors = item.author as Array<{ given?: string; family?: string }> | undefined;
  const authors = (rawAuthors ?? []).map((a) => {
    const given = a.given ?? '';
    const family = a.family ?? '';
    return `${given} ${family}`.trim();
  }).filter((name) => name.length > 0);

  const publishedPrint = item['published-print'] as Record<string, unknown> | undefined;
  const publishedOnline = item['published-online'] as Record<string, unknown> | undefined;
  const published = parseDateParts(publishedPrint) || parseDateParts(publishedOnline);

  const containerTitle = item['container-title'] as string[] | undefined;
  const journal = containerTitle && containerTitle.length > 0 ? containerTitle[0] : undefined;

  const doi = (item.DOI as string) ?? '';
  const abstract = item.abstract as string | undefined;
  const citationCount = typeof item['is-referenced-by-count'] === 'number'
    ? item['is-referenced-by-count'] as number
    : undefined;

  return {
    doi,
    title,
    authors,
    published,
    journal,
    volume: item.volume as string | undefined,
    issue: item.issue as string | undefined,
    pages: item.page as string | undefined,
    abstract: abstract ? abstract.replace(/<[^>]*>/g, '') : undefined,
    citationCount,
    type: (item.type as string) ?? 'unknown',
    url: `https://doi.org/${doi}`,
  };
}

// ---------------------------------------------------------------------------
//  API Functions
// ---------------------------------------------------------------------------

/**
 * Look up a single DOI in the CrossRef registry.
 * Returns null on 404 or timeout.
 */
export async function lookupDOI(doi: string): Promise<CrossRefWork | null> {
  return withRetry(async () => {
    await enforceRateLimit();
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': CROSSREF_USER_AGENT },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { message?: Record<string, unknown> };
    if (!data.message) return null;
    return parseCrossRefWork(data.message);
  }, null);
}

/**
 * Search CrossRef for works matching a query string.
 * If author is provided, uses query.bibliographic + query.author parameters.
 */
export async function searchCrossRef(input: {
  query: string;
  author?: string;
  rows?: number;
}): Promise<CrossRefWork[]> {
  const rows = input.rows ?? 5;

  return withRetry(async () => {
    await enforceRateLimit();

    let url: string;
    if (input.author) {
      url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(input.query)}&query.author=${encodeURIComponent(input.author)}&rows=${rows}`;
    } else {
      url = `https://api.crossref.org/works?query=${encodeURIComponent(input.query)}&rows=${rows}`;
    }

    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': CROSSREF_USER_AGENT },
    });
    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      message?: { items?: Array<Record<string, unknown>> };
    };
    const items = data.message?.items ?? [];
    return items.map(parseCrossRefWork);
  }, []);
}

// ---------------------------------------------------------------------------
//  Disambiguation
// ---------------------------------------------------------------------------

/**
 * Score 0.0–1.0 how well a CrossRefWork matches a concept.
 *
 * Weights:
 * - Title overlap vs concept name: 0.4
 * - Abstract overlap vs description: 0.3
 * - Journal relevance vs domain: 0.2
 * - Citation count as tiebreaker: 0.1
 */
export function crossrefDisambiguationScore(
  work: CrossRefWork,
  concept: { name: string; description?: string; domain?: string },
): number {
  // --- Title overlap (0.0–1.0) ---
  const workTitle = work.title.toLowerCase();
  const conceptName = concept.name.toLowerCase();
  let titleScore = 0;
  if (workTitle === conceptName) {
    titleScore = 1.0;
  } else if (
    workTitle.includes(conceptName) ||
    conceptName.includes(workTitle)
  ) {
    titleScore = 0.5;
  } else {
    const conceptWords = conceptName.split(/\W+/).filter((w) => w.length > 2);
    const shared = conceptWords.filter((w) => workTitle.includes(w));
    titleScore = conceptWords.length > 0
      ? Math.min(1.0, shared.length / conceptWords.length)
      : 0;
  }

  // --- Abstract overlap (0.0–1.0) ---
  let abstractScore = 0;
  const abstractText = (work.abstract ?? '').toLowerCase();
  const descText = (concept.description ?? '').toLowerCase();
  if (abstractText && descText) {
    const descWords = descText.split(/\W+/).filter((w) => w.length > 3);
    const shared = descWords.filter((w) => abstractText.includes(w));
    abstractScore = descWords.length > 0
      ? Math.min(1.0, shared.length / descWords.length)
      : 0;
  }

  // --- Journal relevance (0.0–1.0) ---
  let journalScore = 0;
  if (work.journal && concept.domain) {
    const journalLower = work.journal.toLowerCase();
    const domainLower = concept.domain.toLowerCase();
    if (journalLower.includes(domainLower) || domainLower.includes(journalLower)) {
      journalScore = 1.0;
    } else {
      const domainWords = domainLower.split(/\W+/).filter((w) => w.length > 3);
      const shared = domainWords.filter((w) => journalLower.includes(w));
      journalScore = domainWords.length > 0
        ? Math.min(1.0, shared.length / domainWords.length)
        : 0;
    }
  }

  // --- Citation count tiebreaker (0.0–1.0) ---
  const count = work.citationCount ?? 0;
  const citationScore = count / (count + 100);

  const raw = titleScore * 0.4 + abstractScore * 0.3 + journalScore * 0.2 + citationScore * 0.1;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Find related works by constructing a search query from title + description.
 * Filters results by crossrefDisambiguationScore >= 0.5.
 */
export async function findRelatedWorks(input: {
  title: string;
  description?: string;
  facet?: string;
  maxResults?: number;
}): Promise<CrossRefWork[]> {
  const query = input.description
    ? `${input.title} ${input.description}`
    : input.title;
  const maxResults = input.maxResults ?? 5;

  const results = await searchCrossRef({ query, rows: maxResults * 2 });

  const concept = {
    name: input.title,
    description: input.description,
    domain: input.facet,
  };

  return results
    .filter((work) => crossrefDisambiguationScore(work, concept) >= 0.5)
    .slice(0, maxResults);
}

// ---------------------------------------------------------------------------
//  Ingest & Citation
// ---------------------------------------------------------------------------

/**
 * Ingest a work from CrossRef by DOI into the Aurora graph.
 *
 * Creates a research-type AuroraNode, auto-tags concepts from title words,
 * and creates 'about' edges to matching concept nodes.
 */
export async function ingestFromDOI(doi: string): Promise<{
  nodeId: string;
  title: string;
  concepts: string[];
}> {
  const work = await lookupDOI(doi);
  if (!work) {
    throw new Error(`DOI not found: ${doi}`);
  }

  let graph = await loadAuroraGraph();
  const now = new Date().toISOString();
  const nodeId = crypto.randomUUID();

  const node: AuroraNode = {
    id: nodeId,
    type: 'research',
    title: work.title,
    properties: {
      abstract: work.abstract,
      authors: work.authors,
      journal: work.journal,
      volume: work.volume,
      issue: work.issue,
      pages: work.pages,
      published: work.published,
      citationCount: work.citationCount,
      type: work.type,
      standardRefs: { doi: work.doi },
    },
    confidence: 0.9,
    scope: 'shared',
    sourceUrl: work.url,
    created: now,
    updated: now,
  };

  graph = addAuroraNode(graph, node);

  // Auto-tag concepts from title: split into 2-3 word phrases
  const titleWords = work.title.split(/\s+/).filter((w) => w.length > 2);
  const matchedConcepts: string[] = [];

  for (let i = 0; i < titleWords.length - 1; i++) {
    const phrases = [
      titleWords.slice(i, i + 2).join(' '),
      ...(i + 2 < titleWords.length ? [titleWords.slice(i, i + 3).join(' ')] : []),
    ];
    for (const phrase of phrases) {
      const found = findAuroraNodes(graph, { type: 'concept', query: phrase });
      for (const conceptNode of found) {
        if (!matchedConcepts.includes(conceptNode.title)) {
          matchedConcepts.push(conceptNode.title);
          const edge: AuroraEdge = {
            from: nodeId,
            to: conceptNode.id,
            type: 'about',
            metadata: { createdBy: 'crossref-ingest', timestamp: now },
          };
          graph = addAuroraEdge(graph, edge);
        }
      }
    }
  }

  await saveAuroraGraph(graph);

  return { nodeId, title: work.title, concepts: matchedConcepts };
}

/**
 * Format a CrossRefWork as a citation string.
 *
 * Supports APA and MLA styles.
 */
export function formatCitation(work: CrossRefWork, style: 'apa' | 'mla'): string {
  const year = work.published ? work.published.slice(0, 4) : 'n.d.';

  if (style === 'apa') {
    return formatAPA(work, year);
  }
  return formatMLA(work, year);
}

/** Format APA citation: Smith, J., & Doe, J. (2023). Title. *Journal*, vol, pages. URL */
function formatAPA(work: CrossRefWork, year: string): string {
  const authorStr = work.authors
    .map((name) => {
      const parts = name.split(/\s+/);
      if (parts.length < 2) return name;
      const family = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map((p) => `${p[0]}.`).join(' ');
      return `${family}, ${initials}`;
    })
    .join(', & ');

  const parts: string[] = [];
  if (authorStr) parts.push(authorStr);
  parts.push(`(${year})`);
  parts.push(`${work.title}.`);

  if (work.journal) {
    let journalPart = `*${work.journal}*`;
    if (work.volume) journalPart += `, ${work.volume}`;
    if (work.pages) journalPart += `, ${work.pages}`;
    journalPart += '.';
    parts.push(journalPart);
  }

  parts.push(work.url);
  return parts.join(' ');
}

/** Format MLA citation: Smith, Jane, and John Doe. "Title." Journal vol.issue (year): pages. */
function formatMLA(work: CrossRefWork, year: string): string {
  const authorStr = work.authors.length > 0
    ? formatMLAAuthors(work.authors)
    : '';

  const parts: string[] = [];
  if (authorStr) parts.push(`${authorStr}.`);
  parts.push(`"${work.title}."`);

  if (work.journal) {
    let journalPart = work.journal;
    if (work.volume) {
      journalPart += ` ${work.volume}`;
      if (work.issue) journalPart += `.${work.issue}`;
    }
    journalPart += ` (${year})`;
    if (work.pages) journalPart += `: ${work.pages}`;
    journalPart += '.';
    parts.push(journalPart);
  }

  return parts.join(' ');
}

/** Format MLA author list: "Smith, Jane, and John Doe" */
function formatMLAAuthors(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) {
    return formatMLAFirstAuthor(authors[0]);
  }
  const first = formatMLAFirstAuthor(authors[0]);
  const rest = authors.slice(1).join(', and ');
  return `${first}, and ${rest}`;
}

/** Format MLA first author: "Smith, Jane" (family, given) */
function formatMLAFirstAuthor(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length < 2) return name;
  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(' ');
  return `${family}, ${given}`;
}
