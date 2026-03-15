/**
 * JSON-LD export for Aurora knowledge graph.
 * Includes pure functions and async graph-based export functions.
 */

import type { AuroraNode } from './aurora-schema.js';
import { getEbucoreMetadata } from './ebucore-metadata.js';
import { loadAuroraGraph } from './aurora-graph.js';
import fs from 'fs/promises';

/** Standard JSON-LD context for Aurora exports. */
export const JSONLD_CONTEXT: Record<string, string> = {
  'schema': 'https://schema.org/',
  'skos': 'http://www.w3.org/2004/02/skos/core#',
  'ebucore': 'urn:ebu:metadata-schema:ebucore',
  'dc': 'http://purl.org/dc/elements/1.1/',
  'dcterms': 'http://purl.org/dc/terms/',
  'wikidata': 'http://www.wikidata.org/entity/',
  'name': 'schema:name',
  'description': 'schema:description',
  'broader': 'skos:broader',
  'narrower': 'skos:narrower',
  'prefLabel': 'skos:prefLabel',
  'altLabel': 'skos:altLabel',
  'dateCreated': 'schema:dateCreated',
  'dateModified': 'schema:dateModified',
  'author': 'schema:author',
  'about': 'schema:about',
  'sameAs': 'schema:sameAs',
  'identifier': 'schema:identifier',
};

/** Options for JSON-LD export. */
export interface JsonLdExportOptions {
  /** Include @context in the output. Default: true */
  includeContext?: boolean;
  /** Include EBUCore metadata for transcript nodes. Default: true */
  includeEbucore?: boolean;
  /** Include sameAs external identifiers. Default: true */
  includeExternalIds?: boolean;
  /** Pretty-print JSON output. Default: true */
  prettyPrint?: boolean;
}

/**
 * Build a sameAs array from standardRefs.
 *
 * Maps known ref types to their canonical URIs:
 * - wikidata Q-number → http://www.wikidata.org/entity/Q...
 * - ror → passthrough (already a full URL)
 * - orcid → https://orcid.org/...
 * - doi → https://doi.org/...
 */
export function buildSameAs(standardRefs: Record<string, string>): object[] {
  const result: object[] = [];

  for (const [key, value] of Object.entries(standardRefs)) {
    if (value === undefined || value === null || value === '') continue;

    switch (key) {
      case 'wikidata':
        result.push({ '@id': `http://www.wikidata.org/entity/${value}` });
        break;
      case 'ror':
        result.push({ '@id': value });
        break;
      case 'orcid':
        result.push({ '@id': `https://orcid.org/${value}` });
        break;
      case 'doi':
        result.push({ '@id': `https://doi.org/${value}` });
        break;
      default:
        // Unknown ref type: include as-is if it looks like a URL
        if (value.startsWith('http://') || value.startsWith('https://')) {
          result.push({ '@id': value });
        }
        break;
    }
  }

  return result;
}

/**
 * Convert an AuroraNode to a JSON-LD object.
 *
 * Pure function — no async, no DB calls. Mapping depends on node.type:
 * - concept → skos:Concept
 * - article → schema:Article
 * - transcript → ebucore:EditorialObject
 * - other → schema:Thing
 */
export function nodeToJsonLd(
  node: AuroraNode,
  options?: JsonLdExportOptions,
): object {
  const includeContext = options?.includeContext !== false;
  const includeEbucore = options?.includeEbucore !== false;
  const includeExternalIds = options?.includeExternalIds !== false;

  let result: Record<string, unknown> = {};

  if (includeContext) {
    result['@context'] = JSONLD_CONTEXT;
  }

  switch (node.type) {
    case 'concept':
      result = {
        ...result,
        ...buildConceptJsonLd(node, includeExternalIds),
      };
      break;
    case 'article':
      result = { ...result, ...buildArticleJsonLd(node) };
      break;
    case 'transcript':
      result = {
        ...result,
        ...buildTranscriptJsonLd(node, includeEbucore),
      };
      break;
    default:
      result = { ...result, ...buildGenericJsonLd(node) };
      break;
  }

  return result;
}

/** Build JSON-LD for a concept node (skos:Concept). */
function buildConceptJsonLd(
  node: AuroraNode,
  includeExternalIds: boolean,
): Record<string, unknown> {
  const props = node.properties;
  const result: Record<string, unknown> = {
    '@type': 'skos:Concept',
    '@id': `urn:aurora:concept:${node.id}`,
    'prefLabel': node.title,
    'description': props.description,
    'identifier': node.id,
    'dateCreated': node.created,
    'dateModified': node.updated,
  };

  // aliases → altLabel (omit if empty)
  const aliases = props.aliases;
  if (Array.isArray(aliases) && aliases.length > 0) {
    result['altLabel'] = aliases;
  }

  // sameAs from standardRefs
  if (includeExternalIds && props.standardRefs) {
    const refs = props.standardRefs as Record<string, string>;
    const sameAs = buildSameAs(refs);
    if (sameAs.length > 0) {
      result['sameAs'] = sameAs;
    }
  }

  return result;
}

/** Build JSON-LD for an article node (schema:Article). */
function buildArticleJsonLd(node: AuroraNode): Record<string, unknown> {
  const props = node.properties;
  const result: Record<string, unknown> = {
    '@type': 'schema:Article',
    '@id': `urn:aurora:article:${node.id}`,
    'name': node.title,
    'description': props.abstract,
    'schema:wordCount': props.wordCount,
    'dateCreated': node.created,
    'dateModified': node.updated,
  };

  // about → concept references (omit if empty)
  const concepts = props.concepts;
  if (Array.isArray(concepts) && concepts.length > 0) {
    result['about'] = concepts.map((cid: unknown) => ({
      '@id': `urn:aurora:concept:${cid}`,
    }));
  }

  return result;
}

/** Build JSON-LD for a transcript node (ebucore:EditorialObject). */
function buildTranscriptJsonLd(
  node: AuroraNode,
  includeEbucore: boolean,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    '@type': 'ebucore:EditorialObject',
    '@id': `urn:aurora:transcript:${node.id}`,
    'name': node.title,
    'dateCreated': node.created,
    'dateModified': node.updated,
  };

  if (includeEbucore) {
    const ebucoreFields = getEbucoreMetadata(node);
    Object.assign(result, ebucoreFields);
  }

  return result;
}

/** Build JSON-LD for a generic node (schema:Thing). */
function buildGenericJsonLd(node: AuroraNode): Record<string, unknown> {
  return {
    '@type': 'schema:Thing',
    '@id': `urn:aurora:${node.type}:${node.id}`,
    'name': node.title,
    'dateCreated': node.created,
    'dateModified': node.updated,
  };
}

/** Regex patterns for valid sameAs URIs. */
const SAME_AS_PATTERNS = [
  /^http:\/\/www\.wikidata\.org\/entity\/Q\d+$/,
  /^https:\/\/ror\.org\/\w+$/,
  /^https:\/\/orcid\.org\/[\d-]+$/,
  /^https?:\/\/.+/,
];

/** Validation result from validateJsonLd. */
export interface JsonLdValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a JSON-LD document.
 *
 * Checks:
 * - @context exists (at top level or in nested objects)
 * - Every object with @type also has @id
 * - All @id values are unique
 * - sameAs URIs match valid patterns
 */
export function validateJsonLd(jsonld: object): JsonLdValidationResult {
  const errors: string[] = [];
  const doc = jsonld as Record<string, unknown>;
  const allIds: string[] = [];

  // Check for @context at top level
  let hasContext = '@context' in doc;

  // If it has a @graph array, validate each item
  const graph = doc['@graph'];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      if (typeof item === 'object' && item !== null) {
        const itemObj = item as Record<string, unknown>;
        if ('@context' in itemObj) hasContext = true;
        validateObject(itemObj, errors, allIds);
      }
    }
  } else {
    // Single object
    validateObject(doc, errors, allIds);
  }

  if (!hasContext) {
    errors.push('Missing @context');
  }

  // Check for duplicate @id values
  const seen = new Set<string>();
  for (const id of allIds) {
    if (seen.has(id)) {
      errors.push(`Duplicate @id: ${id}`);
    }
    seen.add(id);
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a single JSON-LD object, collecting errors and @id values. */
function validateObject(
  obj: Record<string, unknown>,
  errors: string[],
  allIds: string[],
): void {
  // Every object with @type must also have @id
  if ('@type' in obj && !('@id' in obj)) {
    errors.push(`Object with @type "${obj['@type']}" is missing @id`);
  }

  // Collect @id
  if (typeof obj['@id'] === 'string') {
    allIds.push(obj['@id']);
  }

  // Validate sameAs URIs
  const sameAs = obj['sameAs'];
  if (Array.isArray(sameAs)) {
    for (const entry of sameAs) {
      if (typeof entry === 'object' && entry !== null) {
        const entryObj = entry as Record<string, unknown>;
        const id = entryObj['@id'];
        if (typeof id === 'string') {
          const isValid = SAME_AS_PATTERNS.some((p) => p.test(id));
          if (!isValid) {
            errors.push(`Invalid sameAs URI: ${id}`);
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Async graph-based export functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export an article with its linked concepts as JSON-LD.
 * Loads graph to resolve concept references from 'about' edges.
 */
export async function articleToJsonLd(
  articleId: string,
  options?: JsonLdExportOptions,
): Promise<object> {
  const graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === articleId);
  if (!node || node.type !== 'article') {
    throw new Error(`Article not found: ${articleId}`);
  }

  const result = nodeToJsonLd(node, {
    ...options,
    includeContext: false,
  }) as Record<string, unknown>;

  // Find concepts linked via 'about' edges (from=article, to=concept)
  const conceptEdges = graph.edges.filter(
    (e) => e.type === 'about' && e.from === articleId,
  );
  if (conceptEdges.length > 0) {
    const linkedConcepts = conceptEdges
      .map((e) => graph.nodes.find((n) => n.id === e.to))
      .filter((n): n is AuroraNode => n !== null && n !== undefined)
      .map((n) =>
        nodeToJsonLd(n, {
          includeContext: false,
          includeExternalIds: options?.includeExternalIds,
          includeEbucore: options?.includeEbucore,
        }),
      );

    if (linkedConcepts.length > 0) {
      result['about'] = linkedConcepts;
    }
  }

  const includeContext = options?.includeContext !== false;
  if (includeContext) {
    return { '@context': JSONLD_CONTEXT, ...result };
  }
  return result;
}

/**
 * Export a concept tree as JSON-LD with broader/narrower relations.
 */
export async function conceptTreeToJsonLd(
  rootConcept: string,
  options?: JsonLdExportOptions,
): Promise<object> {
  const graph = await loadAuroraGraph();
  const rootNode = graph.nodes.find((n) => n.id === rootConcept);
  if (!rootNode || rootNode.type !== 'concept') {
    throw new Error(`Concept not found: ${rootConcept}`);
  }

  const items: object[] = [];
  const visited = new Set<string>();

  function collectTree(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const treeNode = graph.nodes.find((n) => n.id === nodeId);
    if (!treeNode || treeNode.type !== 'concept') return;

    const jsonld = nodeToJsonLd(treeNode, {
      includeContext: false,
      includeExternalIds: options?.includeExternalIds,
      includeEbucore: options?.includeEbucore,
    }) as Record<string, unknown>;

    // Find children (broader_than edges where from=this node)
    const childEdges = graph.edges.filter(
      (e) => e.type === 'broader_than' && e.from === nodeId,
    );
    if (childEdges.length > 0) {
      jsonld['narrower'] = childEdges.map((e) => ({
        '@id': `urn:aurora:concept:${e.to}`,
      }));
    }

    // Find parent (broader_than edges where to=this node)
    const parentEdges = graph.edges.filter(
      (e) => e.type === 'broader_than' && e.to === nodeId,
    );
    if (parentEdges.length > 0) {
      jsonld['broader'] = {
        '@id': `urn:aurora:concept:${parentEdges[0].from}`,
      };
    }

    items.push(jsonld);

    // Recurse into children
    for (const edge of childEdges) {
      collectTree(edge.to);
    }
  }

  collectTree(rootConcept);

  const includeContext = options?.includeContext !== false;
  if (items.length === 1) {
    return includeContext
      ? { '@context': JSONLD_CONTEXT, ...(items[0] as Record<string, unknown>) }
      : items[0];
  }
  return {
    ...(includeContext ? { '@context': JSONLD_CONTEXT } : {}),
    '@graph': items,
  };
}

/**
 * Export the entire ontology (all concepts + their relations) as JSON-LD.
 */
export async function ontologyToJsonLd(
  options?: JsonLdExportOptions,
): Promise<object> {
  const graph = await loadAuroraGraph();
  const concepts = graph.nodes.filter((n) => n.type === 'concept');

  const items = concepts.map((conceptNode) => {
    const jsonld = nodeToJsonLd(conceptNode, {
      includeContext: false,
      includeExternalIds: options?.includeExternalIds,
      includeEbucore: options?.includeEbucore,
    }) as Record<string, unknown>;

    // Add broader/narrower from edges
    const childEdges = graph.edges.filter(
      (e) => e.type === 'broader_than' && e.from === conceptNode.id,
    );
    if (childEdges.length > 0) {
      jsonld['narrower'] = childEdges.map((e) => ({
        '@id': `urn:aurora:concept:${e.to}`,
      }));
    }

    const parentEdges = graph.edges.filter(
      (e) => e.type === 'broader_than' && e.to === conceptNode.id,
    );
    if (parentEdges.length > 0) {
      jsonld['broader'] = {
        '@id': `urn:aurora:concept:${parentEdges[0].from}`,
      };
    }

    return jsonld;
  });

  const includeContext = options?.includeContext !== false;
  return {
    ...(includeContext ? { '@context': JSONLD_CONTEXT } : {}),
    '@graph': items,
  };
}

/**
 * Export to a file. Returns stats about what was exported.
 */
export async function exportToFile(
  filePath: string,
  scope: 'ontology' | 'articles' | 'all',
  options?: JsonLdExportOptions,
): Promise<{ nodeCount: number; edgeCount: number; fileSize: number }> {
  const graph = await loadAuroraGraph();
  let data: object;

  if (scope === 'ontology') {
    data = await ontologyToJsonLd(options);
  } else if (scope === 'articles') {
    const articles = graph.nodes.filter((n) => n.type === 'article');
    const items = articles.map((n) =>
      nodeToJsonLd(n, {
        includeContext: false,
        includeExternalIds: options?.includeExternalIds,
        includeEbucore: options?.includeEbucore,
      }),
    );
    const includeContext = options?.includeContext !== false;
    data = {
      ...(includeContext ? { '@context': JSONLD_CONTEXT } : {}),
      '@graph': items,
    };
  } else {
    // scope === 'all'
    const items = graph.nodes.map((n) =>
      nodeToJsonLd(n, {
        includeContext: false,
        includeExternalIds: options?.includeExternalIds,
        includeEbucore: options?.includeEbucore,
      }),
    );
    const includeContext = options?.includeContext !== false;
    data = {
      ...(includeContext ? { '@context': JSONLD_CONTEXT } : {}),
      '@graph': items,
    };
  }

  const prettyPrint = options?.prettyPrint !== false;
  const json = prettyPrint
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);

  await fs.writeFile(filePath, json, 'utf-8');

  // Count nodes and edges based on scope
  let nodeCount = 0;
  let edgeCount = 0;
  if (scope === 'ontology') {
    nodeCount = graph.nodes.filter((n) => n.type === 'concept').length;
    edgeCount = graph.edges.filter(
      (e) => e.type === 'broader_than',
    ).length;
  } else if (scope === 'articles') {
    nodeCount = graph.nodes.filter((n) => n.type === 'article').length;
    edgeCount = graph.edges.filter(
      (e) => e.type === 'about' || e.type === 'summarizes',
    ).length;
  } else {
    nodeCount = graph.nodes.length;
    edgeCount = graph.edges.length;
  }

  return { nodeCount, edgeCount, fileSize: Buffer.byteLength(json) };
}
