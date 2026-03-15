/**
 * External ID lookup module for Aurora concepts.
 *
 * Resolves concept names to external identifiers (Wikidata, ROR, ORCID, DOI)
 * using public APIs. All API calls are non-fatal — errors return {}.
 */

import { loadAuroraGraph, saveAuroraGraph } from './aurora-graph.js';
import type { AuroraNode } from './aurora-schema.js';
import { findRelatedWorks, searchCrossRef } from './crossref.js';
import type { CrossRefWork } from './crossref.js';

// Re-export CrossRef utilities for downstream consumers
export { searchCrossRef };
export type { CrossRefWork };

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

export interface ExternalIds {
  wikidata?: string;
  ror?: string;
  orcid?: string;
  doi?: string;
  wikidataLabel?: string;
  wikidataDescription?: string;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch with an AbortController-based timeout. */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    // First failure — wait 1 s then retry once
    await sleep(1000);
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }
}

const ORG_KEYWORDS = [
  'university', 'institute', 'foundation', 'inc', 'ltd', 'ab',
  'corp', 'corporation', 'hospital', 'college', 'school',
  'department', 'ministry', 'agency', 'council', 'association',
  'society', 'center', 'centre', 'laboratory', 'lab', 'group',
  'company', 'gmbh', 'pty', 'plc', 'llc', 'co.',
];

/** Heuristic: does the name look like a person (Firstname Lastname)? */
function looksLikePerson(name: string, description?: string): boolean {
  const lower = (description ?? '').toLowerCase();
  if (ORG_KEYWORDS.some((kw) => lower.includes(kw))) return false;

  const words = name.trim().split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  // Each word starts with uppercase and has no org keywords
  const allCapitalized = words.every((w) => /^[A-Z]/.test(w));
  const nameLower = name.toLowerCase();
  const hasOrgKeyword = ORG_KEYWORDS.some((kw) => nameLower.includes(kw));
  return allCapitalized && !hasOrgKeyword;
}

/** Heuristic: does the name look like an organisation? */
function looksLikeOrganisation(name: string, description?: string): boolean {
  const combined = `${name} ${description ?? ''}`.toLowerCase();
  return ORG_KEYWORDS.some((kw) => combined.includes(kw));
}

// ---------------------------------------------------------------------------
//  Disambiguation
// ---------------------------------------------------------------------------

interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

interface ConceptInfo {
  name: string;
  description?: string;
  domain?: string;
  facet?: string;
}

/**
 * Score 0.0–1.0 how well a Wikidata result matches our concept.
 *
 * Weighted: name match × 0.6 + description overlap × 0.3 + domain relevance × 0.1
 */
export function disambiguationScore(
  wikidataResult: WikidataSearchResult,
  concept: ConceptInfo,
): number {
  // --- Name matching (0.0–1.0) ---
  let nameScore = 0;
  const rLabel = wikidataResult.label ?? '';
  const cName = concept.name ?? '';
  if (rLabel === cName) {
    nameScore = 1.0;
  } else if (rLabel.toLowerCase() === cName.toLowerCase()) {
    nameScore = 0.9;
  } else if (
    rLabel.toLowerCase().includes(cName.toLowerCase()) ||
    cName.toLowerCase().includes(rLabel.toLowerCase())
  ) {
    nameScore = 0.5;
  }

  // --- Description overlap (0.0–1.0, contributes up to 0.3 via weight) ---
  let descScore = 0;
  const wdDesc = (wikidataResult.description ?? '').toLowerCase();
  const conceptDesc = `${concept.description ?? ''} ${concept.domain ?? ''}`.toLowerCase();
  if (wdDesc && conceptDesc.trim()) {
    const conceptWords = conceptDesc.split(/\W+/).filter((w) => w.length > 3);
    const shared = conceptWords.filter((w) => wdDesc.includes(w));
    descScore = conceptWords.length > 0
      ? Math.min(1.0, shared.length / conceptWords.length)
      : 0;
  }

  // --- Domain relevance (0.0–1.0, contributes up to 0.1 via weight) ---
  let domainScore = 0;
  if (wdDesc && concept.domain) {
    if (wdDesc.includes(concept.domain.toLowerCase())) {
      domainScore = 1.0;
    }
  }
  if (wdDesc && concept.facet) {
    if (wdDesc.includes(concept.facet.toLowerCase())) {
      domainScore = Math.max(domainScore, 0.5);
    }
  }

  const raw = nameScore * 0.6 + descScore * 0.3 + domainScore * 0.1;
  return Math.max(0, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
//  API Lookups
// ---------------------------------------------------------------------------

/**
 * Search Wikidata for matching entities and return the best match
 * if its disambiguation score meets the threshold (>= 0.6).
 */
export async function lookupWikidata(
  name: string,
  facet?: string,
  description?: string,
  domain?: string,
): Promise<ExternalIds> {
  return withRetry(async () => {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) return {};
    const data = (await resp.json()) as { search?: WikidataSearchResult[] };
    const results = data.search ?? [];
    if (results.length === 0) return {};

    const concept: ConceptInfo = { name, description, domain, facet };
    let bestScore = 0;
    let bestResult: WikidataSearchResult | undefined;
    for (const r of results) {
      const score = disambiguationScore(r, concept);
      if (score > bestScore) {
        bestScore = score;
        bestResult = r;
      }
    }

    if (bestScore >= 0.6 && bestResult) {
      return {
        wikidata: bestResult.id,
        wikidataLabel: bestResult.label,
        wikidataDescription: bestResult.description,
      };
    }
    return {};
  }, {});
}

/**
 * Look up an organisation in the ROR registry.
 */
export async function lookupROR(name: string): Promise<ExternalIds> {
  return withRetry(async () => {
    const url = `https://api.ror.org/v2/organizations?query=${encodeURIComponent(name)}`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) return {};
    const data = (await resp.json()) as {
      items?: Array<{ id: string; names?: Array<{ value: string }> }>;
    };
    const items = data.items ?? [];
    if (items.length === 0) return {};

    const first = items[0];
    // Check name similarity (case-insensitive includes)
    const matchesName =
      first.names?.some((n) => n.value.toLowerCase().includes(name.toLowerCase())) ??
      false;
    const nameMatchesItem = name
      .toLowerCase()
      .includes((first.names?.[0]?.value ?? '').toLowerCase());
    if (matchesName || nameMatchesItem) {
      return { ror: first.id };
    }
    return {};
  }, {});
}

/**
 * Look up a person in the ORCID registry.
 */
export async function lookupORCID(name: string): Promise<ExternalIds> {
  return withRetry(async () => {
    const url = `https://pub.orcid.org/v3.0/search/?q=${encodeURIComponent(name)}`;
    const resp = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return {};
    const data = (await resp.json()) as {
      result?: Array<{ 'orcid-identifier'?: { path?: string } }>;
    };
    const results = data.result ?? [];
    if (results.length === 0) return {};

    const path = results[0]?.['orcid-identifier']?.path;
    if (path) {
      return { orcid: path };
    }
    return {};
  }, {});
}

/**
 * Look up a CrossRef DOI for a concept by searching for related works.
 * Returns the DOI of the best-matching work, or {} if none found.
 */
export async function lookupCrossRefDOI(
  name: string,
  facet?: string,
  description?: string,
  _domain?: string,
): Promise<ExternalIds> {
  return withRetry(async () => {
    const results = await findRelatedWorks({
      title: name,
      description,
      facet,
      maxResults: 3,
    });
    if (results.length === 0) return {};
    // Best match is first (already sorted by score in findRelatedWorks)
    return { doi: results[0].doi };
  }, {});
}

// ---------------------------------------------------------------------------
//  Main Router
// ---------------------------------------------------------------------------

/**
 * Look up external IDs for a concept based on its facet.
 *
 * Entity facet uses heuristics to decide between person (ORCID) and
 * organisation (ROR) lookups, with Wikidata as fallback.
 * Topic and method facets get Wikidata + CrossRef DOI lookup.
 * All other facets go directly to Wikidata.
 */
export async function lookupExternalIds(input: {
  name: string;
  facet: string;
  description?: string;
  domain?: string;
}): Promise<ExternalIds> {
  const { name, facet, description, domain } = input;

  if (facet === 'entity') {
    if (looksLikePerson(name, description)) {
      const orcidResult = await lookupORCID(name);
      const wdResult = await lookupWikidata(name, facet, description, domain);
      return { ...wdResult, ...orcidResult };
    }
    if (looksLikeOrganisation(name, description)) {
      const rorResult = await lookupROR(name);
      const wdResult = await lookupWikidata(name, facet, description, domain);
      return { ...wdResult, ...rorResult };
    }
    return lookupWikidata(name, facet, description, domain);
  }

  const result = await lookupWikidata(name, facet, description, domain);

  if (facet === 'topic' || facet === 'method') {
    const doiResult = await lookupCrossRefDOI(name, facet, description, domain);
    return { ...result, ...doiResult };
  }

  return result;
}

// ---------------------------------------------------------------------------
//  Backfill
// ---------------------------------------------------------------------------

/**
 * Backfill external IDs for concept nodes that lack standardRefs.
 *
 * Rate-limits to one API call per second. Supports dry-run mode
 * and optional facet filtering.
 */
export async function backfillExternalIds(
  options?: { dryRun?: boolean; facet?: string },
): Promise<{ updated: number; skipped: number; failed: number }> {
  const graph = await loadAuroraGraph();
  let concepts = graph.nodes.filter(
    (n): n is AuroraNode & { properties: { facet: string; description?: string; domain?: string; standardRefs?: Record<string, string> } } =>
      n.type === 'concept',
  );

  if (options?.facet) {
    concepts = concepts.filter((c) => c.properties.facet === options.facet);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const concept of concepts) {
    const refs = concept.properties.standardRefs;
    if (refs && Object.keys(refs).length > 0) {
      skipped++;
      continue;
    }

    try {
      const ids = await lookupExternalIds({
        name: concept.title,
        facet: concept.properties.facet as string,
        description: concept.properties.description as string | undefined,
        domain: concept.properties.domain as string | undefined,
      });

      const hasValues = Object.values(ids).some((v) => v !== undefined);
      if (hasValues) {
        if (options?.dryRun) {
          console.error(
            `[dry-run] Would update ${concept.title}: ${JSON.stringify(ids)}`,
          );
        } else {
          concept.properties.standardRefs = ids as unknown as Record<string, string>;
          concept.updated = new Date().toISOString();
        }
        updated++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }

    await sleep(1000);
  }

  // Second pass: CrossRef DOI for concepts without doi
  for (const concept of concepts) {
    const refs = concept.properties.standardRefs as Record<string, string> | undefined;
    if (refs?.doi) continue; // Already has DOI
    const facet = concept.properties.facet as string;
    if (facet !== 'topic' && facet !== 'method') continue; // Only topic/method

    try {
      const doiResult = await lookupCrossRefDOI(
        concept.title,
        facet,
        concept.properties.description as string | undefined,
        concept.properties.domain as string | undefined,
      );
      if (doiResult.doi) {
        if (options?.dryRun) {
          console.error(`[dry-run] Would add DOI for ${concept.title}: ${doiResult.doi}`);
        } else {
          concept.properties.standardRefs = { ...refs, doi: doiResult.doi } as unknown as Record<string, string>;
          concept.updated = new Date().toISOString();
        }
        updated++;
      }
    } catch {
      failed++;
    }
    await sleep(1000);
  }

  if (!options?.dryRun && updated > 0) {
    await saveAuroraGraph({ ...graph, nodes: graph.nodes, lastUpdated: new Date().toISOString() });
  }

  return { updated, skipped, failed };
}
