import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAuroraPdfEvalTool(server: McpServer): void {
  server.tool(
    'aurora_pdf_eval',
    'Evaluate PDF pipeline output against facit YAML files. Scores text extraction (40%) and vision analysis (60%). Supports single facit file or directory of facits.',
    {
      facit_path: z
        .string()
        .min(1)
        .describe('Path to a facit YAML file or directory containing facit YAML files'),
      pdf_path: z
        .string()
        .optional()
        .describe('Path to PDF file for live evaluation (if no pre-existing pipeline JSON)'),
      format: z
        .enum(['summary', 'json'])
        .optional()
        .default('summary')
        .describe('Output format: human-readable summary or raw JSON'),
    },
    async (args) => {
      try {
        const { readFile, readdir, stat } = await import('fs/promises');
        const { extname, join, resolve } = await import('path');
        const { parseFacit, evalPdfPage, evalFromPipelineJson, formatEvalSummary } = await import(
          '../../aurora/pdf-eval.js'
        );

        const facitStat = await stat(args.facit_path);
        let results: Awaited<ReturnType<typeof evalPdfPage>>[];

        if (facitStat.isDirectory()) {
          const entries = await readdir(args.facit_path);
          const yamlFiles = entries.filter((e: string) => extname(e) === '.yaml').sort();

          if (yamlFiles.length === 0) {
            return {
              content: [{ type: 'text' as const, text: 'No .yaml facit files found in directory' }],
              isError: true,
            };
          }

          results = [];
          for (const yamlFile of yamlFiles) {
            const fullPath = join(args.facit_path, yamlFile);
            const content = await readFile(fullPath, 'utf-8');
            const facit = parseFacit(content);

            const pipelineJsonPath = fullPath.replace('.yaml', '_pipeline.json');
            try {
              const pipelineRaw = await readFile(pipelineJsonPath, 'utf-8');
              const pipelineJson = JSON.parse(pipelineRaw) as Record<string, unknown>;
              results.push(evalFromPipelineJson(pipelineJson, facit));
            } catch {
              if (args.pdf_path) {
                const result = await evalPdfPage(resolve(args.pdf_path), fullPath);
                results.push(result);
              }
              // Skip facits without pipeline JSON and no --pdf
            }
          }
        } else {
          const content = await readFile(args.facit_path, 'utf-8');
          const facit = parseFacit(content);

          const pipelineJsonPath = args.facit_path.replace('.yaml', '_pipeline.json');
          try {
            const pipelineRaw = await readFile(pipelineJsonPath, 'utf-8');
            const pipelineJson = JSON.parse(pipelineRaw) as Record<string, unknown>;
            results = [evalFromPipelineJson(pipelineJson, facit)];
          } catch {
            if (args.pdf_path) {
              results = [await evalPdfPage(resolve(args.pdf_path), args.facit_path)];
            } else {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: 'No pipeline JSON found and no pdf_path specified',
                  },
                ],
                isError: true,
              };
            }
          }
        }

        const output =
          args.format === 'json'
            ? JSON.stringify(results, null, 2)
            : formatEvalSummary(results);

        return { content: [{ type: 'text' as const, text: output }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
