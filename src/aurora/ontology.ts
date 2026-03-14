import crypto from 'crypto';
import {
  loadAuroraGraph,
  saveAuroraGraph,
  addAuroraNode,
  addAuroraEdge,
  autoEmbedAuroraNodes,
} from './aurora-graph.js';
import { semanticSearch } from '../core/semantic-search.js';
import type { AuroraNode } from './aurora-schema.js';

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

export interface ConceptProperties {
  description: string;
  domain: string;
  facet: string; // 'topic' | 'entity' | 'method' | 'domain' | 'tool'
  aliases: string[];
  articleCount: number;
  depth: number; // 0 = root
  standardRefs?: Record<string, string>;
}

export interface ConceptNode extends AuroraNode {
  type: 'concept';
  properties: ConceptProperties & Record<string, unknown>;
}

export interface ConceptTreeNode {
  concept: ConceptNode;
  children: ConceptTreeNode[];
  articles: Array<{ id: string; title: string }>;
}

export interface ConceptSearchResult {
  id: string;
  title: string;
  description: string;
  facet: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Convert a concept name to a URL-safe slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Cast an AuroraNode to ConceptNode if it is a concept, or return null. */
function asConceptNode(node: AuroraNode | undefined): ConceptNode | null {
  if (!node || node.type !== 'concept') return null;
  return node as ConceptNode;
}

// ---------------------------------------------------------------------------
//  Core Functions
// ---------------------------------------------------------------------------

/**
 * Find or create a concept node. Deduplicates via semantic search (>=0.85).
 * If `broaderConceptName` is given, the broader concept is created/found
 * recursively and a `broader_than` edge is added (parent → child).
 */
export async function getOrCreateConcept(input: {
  name: string;
  description?: string;
  domain?: string;
  facet?: string;
  broaderConceptName?: string;
  standardRefs?: Record<string, string>;
  _depth?: number;
}): Promise<ConceptNode> {
  const depth = input._depth ?? 0;
  if (depth > 5) {
    throw new Error('getOrCreateConcept: max recursion depth exceeded');
  }

  // 1. Search for existing concept semantically
  let existingNode: ConceptNode | null = null;
  try {
    const hits = await semanticSearch(input.name, {
      table: 'aurora_nodes',
      type: 'concept',
      limit: 5,
      minSimilarity: 0.85,
    });
    if (hits.length > 0) {
      const graph = await loadAuroraGraph();
      const node = graph.nodes.find((n) => n.id === hits[0].id);
      existingNode = asConceptNode(node);
    }
  } catch {
    // Semantic search may fail (no DB / embeddings); fall through to create
  }

  if (existingNode) {
    // If the caller used a different name, add it as an alias
    if (existingNode.title !== input.name) {
      const aliases = Array.isArray(existingNode.properties.aliases)
        ? (existingNode.properties.aliases as string[])
        : [];
      if (!aliases.includes(input.name)) {
        aliases.push(input.name);
        let graph = await loadAuroraGraph();
        const idx = graph.nodes.findIndex((n) => n.id === existingNode!.id);
        if (idx !== -1) {
          const nodes = [...graph.nodes];
          nodes[idx] = {
            ...nodes[idx],
            properties: { ...nodes[idx].properties, aliases },
            updated: new Date().toISOString(),
          };
          graph = { ...graph, nodes, lastUpdated: new Date().toISOString() };
          await saveAuroraGraph(graph);
        }
      }
    }
    return existingNode;
  }

  // 2. Create new concept node
  let graph = await loadAuroraGraph();
  const slug = slugify(input.name);
  let id = `concept_${slug}`;
  if (graph.nodes.some((n) => n.id === id)) {
    id = `concept_${slug}_${crypto.randomUUID().slice(0, 8)}`;
  }

  const now = new Date().toISOString();
  const conceptNode: AuroraNode = {
    id,
    type: 'concept',
    title: input.name,
    properties: {
      description: input.description ?? '',
      domain: input.domain ?? 'general',
      facet: input.facet ?? 'topic',
      aliases: [],
      articleCount: 0,
      depth: 0,
      ...(input.standardRefs ? { standardRefs: input.standardRefs } : {}),
    },
    confidence: 0.8,
    scope: 'personal',
    created: now,
    updated: now,
  };

  graph = addAuroraNode(graph, conceptNode);
  await saveAuroraGraph(graph);

  // 3. Handle broader concept (parent)
  if (input.broaderConceptName) {
    const parent = await getOrCreateConcept({
      name: input.broaderConceptName,
      domain: input.domain,
      facet: input.facet ?? 'topic',
      _depth: depth + 1,
    });

    // Reload graph after recursive call may have modified it
    graph = await loadAuroraGraph();

    // Create broader_than edge: parent → child
    const edgeExists = graph.edges.some(
      (e) => e.from === parent.id && e.to === id && e.type === 'broader_than',
    );
    if (!edgeExists) {
      graph = addAuroraEdge(graph, {
        from: parent.id,
        to: id,
        type: 'broader_than',
        metadata: { createdBy: 'ontology', timestamp: now },
      });
    }

    // Update child depth
    const parentDepth =
      typeof parent.properties.depth === 'number' ? parent.properties.depth : 0;
    const childIdx = graph.nodes.findIndex((n) => n.id === id);
    if (childIdx !== -1) {
      const nodes = [...graph.nodes];
      nodes[childIdx] = {
        ...nodes[childIdx],
        properties: { ...nodes[childIdx].properties, depth: parentDepth + 1 },
        updated: now,
      };
      graph = { ...graph, nodes, lastUpdated: now };
    }

    await saveAuroraGraph(graph);
  }

  // 4. Auto-embed (non-fatal)
  try {
    await autoEmbedAuroraNodes([id]);
  } catch {
    // Non-fatal
  }

  // Reload final state to return
  const finalGraph = await loadAuroraGraph();
  const finalNode = finalGraph.nodes.find((n) => n.id === id);
  return finalNode as ConceptNode;
}

/**
 * Look up a single concept by ID. Returns null if not found.
 */
export async function getConcept(conceptId: string): Promise<ConceptNode | null> {
  const graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === conceptId);
  return asConceptNode(node);
}

/**
 * List concept nodes with optional filtering by domain, facet, roots-only,
 * or children of a specific parent.
 */
export async function listConcepts(options?: {
  domain?: string;
  facet?: string;
  rootsOnly?: boolean;
  parentId?: string;
}): Promise<ConceptNode[]> {
  const graph = await loadAuroraGraph();
  let concepts = graph.nodes.filter(
    (n): n is ConceptNode => n.type === 'concept',
  );

  if (options?.domain) {
    concepts = concepts.filter((c) => c.properties.domain === options.domain);
  }
  if (options?.facet) {
    concepts = concepts.filter((c) => c.properties.facet === options.facet);
  }
  if (options?.rootsOnly) {
    // Root concepts have no broader_than edge pointing TO them
    const childIds = new Set(
      graph.edges
        .filter((e) => e.type === 'broader_than')
        .map((e) => e.to),
    );
    concepts = concepts.filter((c) => !childIds.has(c.id));
  }
  if (options?.parentId) {
    // Children: broader_than edge where from=parentId, to=childId
    const childIds = new Set(
      graph.edges
        .filter((e) => e.type === 'broader_than' && e.from === options.parentId)
        .map((e) => e.to),
    );
    concepts = concepts.filter((c) => childIds.has(c.id));
  }

  concepts.sort((a, b) => a.title.localeCompare(b.title));
  return concepts;
}

/**
 * Build a concept tree starting from one root or all root concepts.
 */
export async function getConceptTree(
  rootId?: string,
  maxDepth: number = 5,
): Promise<ConceptTreeNode[]> {
  const graph = await loadAuroraGraph();

  /** Build a tree node recursively. */
  function buildTreeNode(
    conceptId: string,
    currentDepth: number,
  ): ConceptTreeNode | null {
    const node = graph.nodes.find((n) => n.id === conceptId);
    const concept = asConceptNode(node);
    if (!concept) return null;

    // Find children (broader_than edges where from=conceptId)
    const children: ConceptTreeNode[] = [];
    if (currentDepth < maxDepth) {
      const childEdges = graph.edges.filter(
        (e) => e.type === 'broader_than' && e.from === conceptId,
      );
      for (const edge of childEdges) {
        const child = buildTreeNode(edge.to, currentDepth + 1);
        if (child) children.push(child);
      }
      children.sort((a, b) => a.concept.title.localeCompare(b.concept.title));
    }

    // Find articles (about edges where from=articleId, to=conceptId)
    const articles = graph.edges
      .filter((e) => e.type === 'about' && e.to === conceptId)
      .map((e) => {
        const articleNode = graph.nodes.find((n) => n.id === e.from);
        return articleNode
          ? { id: articleNode.id, title: articleNode.title }
          : null;
      })
      .filter((a): a is { id: string; title: string } => a !== null);

    return { concept, children, articles };
  }

  if (rootId) {
    const tree = buildTreeNode(rootId, 0);
    return tree ? [tree] : [];
  }

  // Find all root concepts (no broader_than edge pointing TO them)
  const childIds = new Set(
    graph.edges.filter((e) => e.type === 'broader_than').map((e) => e.to),
  );
  const roots = graph.nodes
    .filter((n) => n.type === 'concept' && !childIds.has(n.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  const trees: ConceptTreeNode[] = [];
  for (const root of roots) {
    const tree = buildTreeNode(root.id, 0);
    if (tree) trees.push(tree);
  }
  return trees;
}

/**
 * Search concepts using semantic similarity.
 */
export async function searchConcepts(
  query: string,
  options?: { limit?: number },
): Promise<ConceptSearchResult[]> {
  const limit = options?.limit ?? 10;

  const results = await semanticSearch(query, {
    table: 'aurora_nodes',
    type: 'concept',
    limit,
    minSimilarity: 0.3,
  });

  const graph = await loadAuroraGraph();

  return results.map((r) => {
    const node = graph.nodes.find((n) => n.id === r.id);
    const props = node?.properties ?? {};
    return {
      id: r.id,
      title: r.title,
      description: (props.description as string) ?? '',
      facet: (props.facet as string) ?? 'topic',
      similarity: r.similarity,
    };
  });
}

/**
 * Link an article to one or more concepts, creating concepts as needed.
 * For backward compatibility, plain strings in the concepts array are
 * treated as `{ name: stringValue, facet: 'topic' }`.
 */
export async function linkArticleToConcepts(
  articleId: string,
  concepts: Array<
    | string
    | {
        name: string;
        facet?: string;
        broaderConcept?: string | null;
        standardRefs?: Record<string, string>;
      }
  >,
): Promise<{ conceptsLinked: number; conceptsCreated: number }> {
  let linked = 0;
  let created = 0;

  for (const raw of concepts) {
    const item =
      typeof raw === 'string'
        ? { name: raw, facet: 'topic' as string | undefined }
        : raw;

    // Track whether concept already existed before the call
    let existed = false;
    try {
      const hits = await semanticSearch(item.name, {
        table: 'aurora_nodes',
        type: 'concept',
        limit: 1,
        minSimilarity: 0.85,
      });
      existed = hits.length > 0;
    } catch {
      // Semantic search unavailable; assume new
    }

    const conceptNode = await getOrCreateConcept({
      name: item.name,
      facet: item.facet,
      broaderConceptName: item.broaderConcept ?? undefined,
      standardRefs: item.standardRefs,
    });

    if (!existed) created++;

    // Create 'about' edge: article → concept
    let graph = await loadAuroraGraph();
    const edgeExists = graph.edges.some(
      (e) =>
        e.from === articleId &&
        e.to === conceptNode.id &&
        e.type === 'about',
    );
    if (!edgeExists) {
      graph = addAuroraEdge(graph, {
        from: articleId,
        to: conceptNode.id,
        type: 'about',
        metadata: {
          createdBy: 'ontology',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Increment articleCount
    const idx = graph.nodes.findIndex((n) => n.id === conceptNode.id);
    if (idx !== -1) {
      const current = graph.nodes[idx];
      const count =
        typeof current.properties.articleCount === 'number'
          ? (current.properties.articleCount as number)
          : 0;
      const nodes = [...graph.nodes];
      nodes[idx] = {
        ...current,
        properties: { ...current.properties, articleCount: count + 1 },
        updated: new Date().toISOString(),
      };
      graph = { ...graph, nodes, lastUpdated: new Date().toISOString() };
    }

    await saveAuroraGraph(graph);
    linked++;
  }

  return { conceptsLinked: linked, conceptsCreated: created };
}

/**
 * Compute summary statistics for the concept ontology.
 */
export async function getOntologyStats(): Promise<{
  totalConcepts: number;
  maxDepth: number;
  orphanConcepts: number;
  domains: Record<string, number>;
  facets: Record<string, number>;
  topConcepts: Array<{ id: string; title: string; articleCount: number }>;
}> {
  const graph = await loadAuroraGraph();
  const concepts = graph.nodes.filter(
    (n): n is ConceptNode => n.type === 'concept',
  );

  // IDs involved in any broader_than edge
  const broaderEdges = graph.edges.filter((e) => e.type === 'broader_than');
  const involvedIds = new Set<string>();
  for (const e of broaderEdges) {
    involvedIds.add(e.from);
    involvedIds.add(e.to);
  }

  const orphanConcepts = concepts.filter((c) => !involvedIds.has(c.id)).length;

  let maxDepth = 0;
  const domains: Record<string, number> = {};
  const facets: Record<string, number> = {};

  for (const c of concepts) {
    const d = typeof c.properties.depth === 'number' ? c.properties.depth : 0;
    if (d > maxDepth) maxDepth = d;

    const domain = (c.properties.domain as string) ?? 'general';
    domains[domain] = (domains[domain] ?? 0) + 1;

    const facet = (c.properties.facet as string) ?? 'topic';
    facets[facet] = (facets[facet] ?? 0) + 1;
  }

  const topConcepts = [...concepts]
    .sort((a, b) => {
      const ac =
        typeof a.properties.articleCount === 'number'
          ? a.properties.articleCount
          : 0;
      const bc =
        typeof b.properties.articleCount === 'number'
          ? b.properties.articleCount
          : 0;
      return bc - ac;
    })
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      title: c.title,
      articleCount:
        typeof c.properties.articleCount === 'number'
          ? c.properties.articleCount
          : 0,
    }));

  return {
    totalConcepts: concepts.length,
    maxDepth,
    orphanConcepts,
    domains,
    facets,
    topConcepts,
  };
}

/**
 * Suggest potential concept merges by finding pairs with similarity
 * between 0.80 and 0.85 (just below the automatic dedup threshold).
 */
export async function suggestMerges(): Promise<
  Array<{
    concept1: { id: string; title: string };
    concept2: { id: string; title: string };
    similarity: number;
    suggestion: string;
  }>
> {
  const graph = await loadAuroraGraph();
  const concepts = graph.nodes.filter((n) => n.type === 'concept');
  const seen = new Set<string>();
  const suggestions: Array<{
    concept1: { id: string; title: string };
    concept2: { id: string; title: string };
    similarity: number;
    suggestion: string;
  }> = [];

  for (const concept of concepts) {
    let hits: Array<{ id: string; title: string; similarity: number }> = [];
    try {
      hits = await semanticSearch(concept.title, {
        table: 'aurora_nodes',
        type: 'concept',
        limit: 10,
        minSimilarity: 0.8,
      });
    } catch {
      continue;
    }

    for (const hit of hits) {
      if (hit.id === concept.id) continue;
      if (hit.similarity >= 0.85) continue; // already deduped threshold

      const pairKey = [concept.id, hit.id].sort().join('::');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      suggestions.push({
        concept1: { id: concept.id, title: concept.title },
        concept2: { id: hit.id, title: hit.title },
        similarity: hit.similarity,
        suggestion: `Consider merging '${concept.title}' and '${hit.title}' (similarity: ${hit.similarity.toFixed(2)})`,
      });
    }
  }

  return suggestions;
}
