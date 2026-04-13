import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  listArticles,
  searchArticles,
  getArticle,
  getArticleHistory,
  importArticle,
  synthesizeArticle,
  refreshArticle,
  compileConceptArticle,
} from '../../aurora/knowledge-library.js';
import {
  getConceptTree,
  getConcept,
  listConcepts,
  getOntologyStats,
  suggestMerges,
  searchConcepts,
} from '../../aurora/ontology.js';
import { lookupExternalIds, backfillExternalIds } from '../../aurora/external-ids.js';
import type { AuroraNode } from '../../aurora/aurora-schema.js';

// Re-export for external consumers so imports are not flagged as unused
export { getConcept, searchConcepts };

async function resolveConceptId(args: { conceptId?: string; conceptName?: string }): Promise<string> {
  if (args.conceptId) return args.conceptId;
  if (!args.conceptName) throw new Error('conceptId or conceptName required');
  const concepts = await listConcepts();
  const found = concepts.find(
    (c) => c.title.toLowerCase() === args.conceptName!.toLowerCase(),
  );
  if (!found) throw new Error(`Concept not found: ${args.conceptName}`);
  return found.id;
}

/** Register the neuron_knowledge_library MCP tool on the given server. */
export function registerKnowledgeLibraryTool(server: McpServer): void {
  server.tool(
    'neuron_knowledge_library',
    'Manage the knowledge library — synthesized articles from Aurora knowledge base. Actions: list, search, read, history, synthesize, refresh, import, browse, concepts, ontology_stats, merge_suggestions, lookup_external_ids, backfill_ids, export_jsonld, compile_concept, concept_article, concept_index.',
    {
      action: z.enum(['list', 'search', 'read', 'history', 'synthesize', 'refresh', 'import', 'browse', 'concepts', 'ontology_stats', 'merge_suggestions', 'lookup_external_ids', 'backfill_ids', 'export_jsonld', 'compile_concept', 'concept_article', 'concept_index']),
      query: z.string().optional().describe('Search query (for search action)'),
      articleId: z.string().optional().describe('Article ID (for read/history/refresh)'),
      topic: z.string().optional().describe('Topic to synthesize (for synthesize action)'),
      domain: z.string().optional().describe('Domain filter (for list/synthesize/import)'),
      tags: z.array(z.string()).optional().describe('Tags filter (for list/import)'),
      title: z.string().optional().describe('Article title (for import)'),
      content: z.string().optional().describe('Article content markdown (for import)'),
      limit: z.number().optional().describe('Max results (for list/search)'),
      conceptName: z.string().optional().describe('Concept name (for browse/concepts/compile_concept/concept_article)'),
      conceptId: z.string().optional().describe('Concept ID (for compile_concept/concept_article)'),
      facet: z.string().optional().describe('Facet filter: topic, entity, method, domain, tool'),
      maxDepth: z.number().optional().describe('Max tree depth (for browse)'),
      dryRun: z.boolean().optional().describe('Dry run mode for backfill_ids'),
      nodeId: z.string().optional().describe('Node ID for single node export (export_jsonld)'),
      scope: z.string().optional().describe('Export scope: ontology, articles, all (for export_jsonld)'),
      includeEbucore: z.boolean().optional().describe('Include EBUCore fields in export (default true)'),
    },
    async (args) => {
      try {
        let result: unknown;

        switch (args.action) {
          case 'list':
            result = await listArticles({
              domain: args.domain,
              tags: args.tags,
              limit: args.limit,
            });
            break;
          case 'search':
            if (!args.query) throw new Error('query required for search');
            result = await searchArticles(args.query, {
              limit: args.limit,
            });
            break;
          case 'read':
            if (!args.articleId) throw new Error('articleId required for read');
            result = await getArticle(args.articleId);
            if (!result) throw new Error(`Article not found: ${args.articleId}`);
            break;
          case 'history':
            if (!args.articleId) throw new Error('articleId required for history');
            result = await getArticleHistory(args.articleId);
            break;
          case 'synthesize':
            if (!args.topic) throw new Error('topic required for synthesize');
            result = await synthesizeArticle(args.topic, {
              domain: args.domain,
            });
            break;
          case 'refresh':
            if (!args.articleId) throw new Error('articleId required for refresh');
            result = await refreshArticle(args.articleId);
            break;
          case 'import':
            if (!args.title || !args.content) throw new Error('title and content required for import');
            result = await importArticle({
              title: args.title,
              content: args.content,
              domain: args.domain ?? 'general',
              tags: args.tags,
            });
            break;
          case 'browse': {
            // Find concept ID if conceptName provided
            let rootId: string | undefined;
            if (args.conceptName) {
              const concepts = await listConcepts();
              const found = concepts.find(
                (c) => c.title.toLowerCase() === args.conceptName!.toLowerCase(),
              );
              if (found) rootId = found.id;
            }
            const tree = await getConceptTree(rootId, args.maxDepth ?? 5);
            // Filter by facet if specified
            const filtered = args.facet
              ? tree.filter((t) => (t.concept.properties.facet as string) === args.facet)
              : tree;
            result = filtered;
            break;
          }
          case 'concepts': {
            if (!args.conceptName) throw new Error('conceptName required for concepts');
            const concepts = await listConcepts();
            const target = concepts.find(
              (c) => c.title.toLowerCase() === args.conceptName!.toLowerCase(),
            );
            if (!target) throw new Error(`Concept not found: ${args.conceptName}`);
            const conceptTree = await getConceptTree(target.id, 1);
            result = { concept: target, tree: conceptTree };
            break;
          }
          case 'ontology_stats':
            result = await getOntologyStats();
            break;
          case 'merge_suggestions':
            result = await suggestMerges();
            break;
          case 'lookup_external_ids': {
            if (!args.conceptName) throw new Error('conceptName required for lookup_external_ids');
            const lookupResult = await lookupExternalIds({
              name: args.conceptName,
              facet: args.facet ?? 'topic',
              description: undefined,
              domain: args.domain,
            });
            result = lookupResult;
            break;
          }
          case 'backfill_ids': {
            const backfillResult = await backfillExternalIds({
              dryRun: args.dryRun ?? false,
              facet: args.facet,
            });
            result = backfillResult;
            break;
          }
          case 'export_jsonld': {
            const { nodeToJsonLd, ontologyToJsonLd, JSONLD_CONTEXT } = await import('../../aurora/jsonld-export.js');
            const { loadAuroraGraph } = await import('../../aurora/aurora-graph.js');

            const exportOptions = {
              includeEbucore: args.includeEbucore ?? true,
            };

            if (args.nodeId) {
              const graph = await loadAuroraGraph();
              const node = graph.nodes.find((n: { id: string }) => n.id === args.nodeId);
              if (!node) throw new Error(`Node not found: ${args.nodeId}`);
              result = nodeToJsonLd(node, exportOptions);
            } else {
              const exportScope = (args.scope ?? 'ontology') as 'ontology' | 'articles' | 'all';
              if (exportScope === 'ontology') {
                result = await ontologyToJsonLd(exportOptions);
              } else {
                const graph = await loadAuroraGraph();
                let nodes = graph.nodes;
                if (exportScope === 'articles') {
                  nodes = nodes.filter((n: { type: string }) => n.type === 'article');
                }
                const items = nodes.map((n: AuroraNode) =>
                  nodeToJsonLd(n, { includeContext: false, ...exportOptions }),
                );
                result = { '@context': JSONLD_CONTEXT, '@graph': items };
              }
            }
            break;
          }
          case 'compile_concept': {
            const resolvedId = await resolveConceptId(args);
            const article = await compileConceptArticle(resolvedId);
            result = {
              articleId: article.id,
              title: article.title,
              abstract: article.properties.abstract,
              wordCount: article.properties.wordCount,
              sourceCount: (article.properties.sourceNodeIds as string[])?.length ?? 0,
            };
            break;
          }
          case 'concept_article': {
            const resolvedId = await resolveConceptId(args);
            const concept = await getConcept(resolvedId);
            if (!concept) throw new Error(`Concept not found: ${resolvedId}`);
            const compiledId = concept.properties.compiledArticleId as string | undefined;
            if (!compiledId) {
              result = { error: 'Konceptet har ingen kompilerad artikel ännu. Kör compile_concept först.' };
              break;
            }
            const article = await getArticle(compiledId);
            if (!article) {
              result = { error: `Kompilerad artikel ${compiledId} hittades inte i grafen.` };
              break;
            }
            result = {
              content: article.properties.content,
              abstract: article.properties.abstract,
              stale: concept.properties.compiledStale ?? false,
              compiledAt: concept.properties.compiledAt,
              wordCount: article.properties.wordCount,
            };
            break;
          }
          case 'concept_index': {
            const allConcepts = await listConcepts();
            const index = allConcepts.map((c) => ({
              id: c.id,
              title: c.title,
              facet: c.properties.facet,
              domain: c.properties.domain,
              articleCount: c.properties.articleCount ?? 0,
              compiled: typeof c.properties.compiledAt === 'string',
              stale: c.properties.compiledStale === true,
              compiledAt: c.properties.compiledAt ?? null,
            }));
            index.sort((a, b) => (b.articleCount as number) - (a.articleCount as number));
            result = { totalConcepts: index.length, concepts: index };
            break;
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
