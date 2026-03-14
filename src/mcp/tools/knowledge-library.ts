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

/** Register the neuron_knowledge_library MCP tool on the given server. */
export function registerKnowledgeLibraryTool(server: McpServer): void {
  server.tool(
    'neuron_knowledge_library',
    'Manage the knowledge library — synthesized articles from Aurora knowledge base. Actions: list, search, read, history, synthesize, refresh, import.',
    {
      action: z.enum(['list', 'search', 'read', 'history', 'synthesize', 'refresh', 'import']),
      query: z.string().optional().describe('Search query (for search action)'),
      articleId: z.string().optional().describe('Article ID (for read/history/refresh)'),
      topic: z.string().optional().describe('Topic to synthesize (for synthesize action)'),
      domain: z.string().optional().describe('Domain filter (for list/synthesize/import)'),
      tags: z.array(z.string()).optional().describe('Tags filter (for list/import)'),
      title: z.string().optional().describe('Article title (for import)'),
      content: z.string().optional().describe('Article content markdown (for import)'),
      limit: z.number().optional().describe('Max results (for list/search)'),
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
