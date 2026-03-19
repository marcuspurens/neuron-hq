import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateMorningBriefing } from '../../aurora/morning-briefing.js';

/** Register the aurora_morning_briefing MCP tool on the given server. */
export function registerAuroraMorningBriefingTool(server: McpServer): void {
  server.tool(
    'aurora_morning_briefing',
    'Generate a daily morning briefing with new nodes, recent runs, stale sources, knowledge gaps, and 3 questions for Marcus. Writes a markdown file to the Obsidian vault.',
    {
      date: z.string().optional().describe('Date for briefing in YYYY-MM-DD format (defaults to today)'),
      force: z.boolean().optional().default(false).describe('Overwrite existing briefing for the same date'),
    },
    async (args) => {
      try {
        const result = await generateMorningBriefing({
          date: args.date,
          force: args.force,
        });

        const summary = [
          `Morgon-briefing för ${result.data.date}`,
          `Fil: ${result.filePath}`,
          `Nya noder: ${result.data.newNodes.reduce((s, n) => s + n.count, 0)}`,
          `Körningar: ${result.data.runs.length}`,
          `Nya idéer: ${result.data.newIdeas.length}`,
          `Inaktuella källor: ${result.data.staleSources.length}`,
          `Kunskapsluckor: ${result.data.knowledgeGaps.length}`,
          `Frågor: ${result.data.questions.length}`,
        ].join('\n');

        return {
          content: [
            { type: 'text' as const, text: summary },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
