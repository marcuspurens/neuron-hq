import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { lookupDOI, searchCrossRef, ingestFromDOI, formatCitation } from '../../aurora/crossref.js';

export function registerCrossRefLookupTool(server: McpServer): void {
  server.tool(
    'neuron_crossref',
    'CrossRef DOI lookup — look up publication metadata, search papers, or import papers as Aurora nodes. Actions: lookup_doi, search_papers, ingest_doi.',
    {
      action: z.enum(['lookup_doi', 'search_papers', 'ingest_doi']),
      doi: z.string().optional().describe('DOI identifier (for lookup_doi, ingest_doi)'),
      query: z.string().optional().describe('Search query (for search_papers)'),
      author: z.string().optional().describe('Author filter (for search_papers)'),
      limit: z.number().optional().describe('Max results (for search_papers, default 5)'),
    },
    async (args) => {
      try {
        let result: unknown;

        switch (args.action) {
          case 'lookup_doi': {
            if (!args.doi) {
              return { content: [{ type: 'text' as const, text: 'Error: doi parameter required for lookup_doi' }] };
            }
            const work = await lookupDOI(args.doi);
            if (!work) {
              result = { found: false, doi: args.doi };
            } else {
              result = { found: true, work, citation_apa: formatCitation(work, 'apa') };
            }
            break;
          }
          case 'search_papers': {
            if (!args.query) {
              return { content: [{ type: 'text' as const, text: 'Error: query parameter required for search_papers' }] };
            }
            const results = await searchCrossRef({
              query: args.query,
              author: args.author,
              rows: args.limit ?? 5,
            });
            result = { total: results.length, papers: results };
            break;
          }
          case 'ingest_doi': {
            if (!args.doi) {
              return { content: [{ type: 'text' as const, text: 'Error: doi parameter required for ingest_doi' }] };
            }
            result = await ingestFromDOI(args.doi);
            break;
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  );
}
