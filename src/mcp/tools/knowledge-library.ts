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
} from '../../aurora/knowledge-library.js';
import {
  getConceptTree,
  getConcept,
  listConcepts,
  getOntologyStats,
  suggestMerges,
  searchConcepts,
} from '../../aurora/ontology.js';

// Re-export for external consumers so imports are not flagged as unused
export { getConcept, searchConcepts };

/** Register the neuron_knowledge_library MCP tool on the given server. */
export function registerKnowledgeLibraryTool(server: McpServer): void {
  server.tool(
    'neuron_knowledge_library',
    'Manage the knowledge library — synthesized articles from Aurora knowledge base. Actions: list, search, read, history, synthesize, refresh, import, browse, concepts, ontology_stats, merge_suggestions.',
    {
      action: z.enum(['list', 'search', 'read', 'history', 'synthesize', 'refresh', 'import', 'browse', 'concepts', 'ontology_stats', 'merge_suggestions']),
      query: z.string().optional().describe('Search query (for search action)'),
      articleId: z.string().optional().describe('Article ID (for read/history/refresh)'),
      topic: z.string().optional().describe('Topic to synthesize (for synthesize action)'),
      domain: z.string().optional().describe('Domain filter (for list/synthesize/import)'),
      tags: z.array(z.string()).optional().describe('Tags filter (for list/import)'),
      title: z.string().optional().describe('Article title (for import)'),
      content: z.string().optional().describe('Article content markdown (for import)'),
      limit: z.number().optional().describe('Max results (for list/search)'),
      conceptName: z.string().optional().describe('Concept name (for browse/concepts)'),
      facet: z.string().optional().describe('Facet filter: topic, entity, method, domain, tool'),
      maxDepth: z.number().optional().describe('Max tree depth (for browse)'),
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
