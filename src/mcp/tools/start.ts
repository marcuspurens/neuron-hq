import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import { TargetsManager } from '../../core/targets.js';

const BASE_DIR = path.resolve(import.meta.dirname ?? '.', '../../..');

/** Register the neuron_start MCP tool on the given server. */
export function registerStartTool(server: McpServer): void {
  server.tool(
    'neuron_start',
    'Start a new Neuron HQ run. Requires confirm: true to actually start.',
    {
      target: z.string().describe('Target name (must exist in repos.yaml)'),
      brief: z.string().describe('Path to brief file (must be under briefs/)'),
      hours: z.number().optional().default(1).describe('Time limit in hours (max 4)'),
      model: z.string().optional().describe('Model override'),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Must be true to start the run'),
    },
    async (args) => {
      try {
        // Validate hours
        if (args.hours > 4) {
          return {
            content: [{ type: 'text' as const, text: 'Error: Maximum hours is 4' }],
            isError: true,
          };
        }

        // Validate brief path (must be under briefs/) using absolute path resolution
        // to prevent traversal attacks like 'briefs/../etc/passwd'
        const resolved = path.resolve(BASE_DIR, args.brief);
        const briefsDir = path.resolve(BASE_DIR, 'briefs');
        if (!resolved.startsWith(briefsDir + path.sep) && resolved !== briefsDir) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Brief path must be under briefs/ directory',
              },
            ],
            isError: true,
          };
        }

        // Validate target against repos.yaml
        const targetsManager = new TargetsManager(
          path.join(BASE_DIR, 'targets', 'repos.yaml'),
        );
        const targetInfo = await targetsManager.getTarget(args.target);
        if (!targetInfo) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Target '${args.target}' not found in repos.yaml`,
              },
            ],
            isError: true,
          };
        }

        // If not confirmed, return preview
        if (!args.confirm) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    message: 'Run preview - call again with confirm: true to start',
                    target: args.target,
                    brief: args.brief,
                    hours: args.hours,
                    model: args.model ?? 'default',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Start the run
        const cliArgs = [
          'tsx',
          'src/cli.ts',
          'run',
          args.target,
          '--brief',
          args.brief,
          '--hours',
          String(args.hours),
        ];
        if (args.model) {
          cliArgs.push('--model', args.model);
        }

        const child = spawn('npx', cliArgs, {
          cwd: BASE_DIR,
          detached: true,
          stdio: 'ignore',
        });
        child.unref();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  message: 'Run started successfully',
                  target: args.target,
                  brief: args.brief,
                  hours: args.hours,
                  pid: child.pid,
                  hint: 'Use neuron_runs to check status',
                },
                null,
                2,
              ),
            },
          ],
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
