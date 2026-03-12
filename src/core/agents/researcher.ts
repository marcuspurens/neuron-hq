import { type RunContext } from '../run.js';
import { trimMessages, withRetry } from './agent-utils.js';
import { executeSharedBash, executeSharedReadFile, executeSharedWriteFile, executeSharedListFiles, coreToolDefinitions, type AgentToolContext } from './shared-tools.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';

/**
 * Researcher Agent - reads code, generates ideas.md and sources.md.
 */
export class ResearcherAgent {
  private promptPath: string;
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;
  private baseDir: string;

  constructor(private ctx: RunContext, baseDir: string) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'researcher.md');

    const config = resolveModelConfig('researcher', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_researcher ?? limits.max_iterations_per_run;
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  private get toolCtx(): AgentToolContext {
    return { ctx: this.ctx, agentRole: 'researcher' };
  }

  /**
   * Execute the researcher's research loop.
   */
  async run(): Promise<void> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'researcher',
      tool: 'run',
      allowed: true,
      note: 'Researcher agent started',
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      const brief = await this.ctx.artifacts.readBrief();
      await this.runAgentLoop(systemPrompt, brief);

      console.log('Researcher agent completed successfully.');
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'researcher',
        tool: 'run',
        allowed: false,
        note: `Researcher agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const researcherPrompt = await this.loadPrompt();
    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'researcher',
    });
    const overlayedPrompt = mergePromptWithOverlay(researcherPrompt, overlay);

    const limits = this.ctx.policy.getLimits();
    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Time limit**: ${this.ctx.hours} hours (ends at ${this.ctx.endTime.toISOString()})
- **Workspace**: ${this.ctx.workspaceDir}
- **Run artifacts**: ${this.ctx.runDir}
- **Max iterations**: ${this.maxIterations}

# Research Constraints

- Max web searches: ${limits.max_web_searches_per_run} (not yet implemented — use code reading)
- Max sources: ${limits.max_sources_per_research}
- Max ideas: ${limits.max_ideas}

# Available Tools

- **bash_exec**: Execute bash commands (use grep, cat, find for code reading)
- **read_file**: Read files from the workspace
- **write_file**: Write ideas.md and sources.md to the runs directory
- **list_files**: List files in a directory

# Your Mission

Read brief.md and the target codebase to understand what exists.
Generate ideas.md (impact/effort/risk analysis) and sources.md (code references + docs).
Focus on high-impact, low-effort opportunities.
`;

    return `${overlayedPrompt}\n\n${contextInfo}`;
  }

  private async runAgentLoop(systemPrompt: string, brief: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Based on this brief, please research the target codebase and generate ideas.

**Brief**:
${brief}

**What to produce**:
1. Explore the workspace with list_files and read_file to understand existing patterns
2. Write ${path.join(this.ctx.runDir, 'ideas.md')} with impact/effort/risk analysis (max ${this.ctx.policy.getLimits().max_ideas} ideas)
3. Write ${path.join(this.ctx.runDir, 'research/sources.md')} with code references and any relevant documentation links (max ${this.ctx.policy.getLimits().max_sources_per_research} sources)

Focus on high-impact, low-effort opportunities that fit the brief.`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping researcher loop.');
        break;
      }

      console.log(`\n=== Researcher iteration ${iteration}/${this.maxIterations} ===`);

      try {
        const response = await withRetry(async () => {
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
            system: systemPrompt,
            messages: trimMessages(messages),
            tools: this.defineTools(),
          });

          let prefixPrinted = false;
          stream.on('text', (text) => {
            if (!prefixPrinted) {
              process.stdout.write('\n[Researcher] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'researcher',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (block: Anthropic.ContentBlock) => block.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Researcher finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Researcher finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in researcher loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Researcher: max iterations reached.');
    }
    this.ctx.usage.recordIterations('researcher', iteration, this.maxIterations);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      ...coreToolDefinitions({
        bash: 'Execute a bash command for code reading. Use grep, cat, find to explore the codebase.',
        readFile: 'Read the contents of a file.',
        writeFile: 'Write content to a file. Use to write ideas.md and sources.md to the runs directory.',
        listFiles: 'List files in a directory.',
      }),
      ...graphReadToolDefinitions(),
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        console.log(`Researcher executing tool: ${block.name}`);
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'bash_exec':
              result = await executeSharedBash(this.toolCtx, (block.input as { command: string }).command, { truncate: true });
              break;
            case 'read_file':
              result = await executeSharedReadFile(this.toolCtx, (block.input as { path: string }).path, { truncate: true });
              break;
            case 'write_file': {
              const writeInput = block.input as { path: string; content: string };
              result = await executeSharedWriteFile(this.toolCtx, writeInput.path, writeInput.content, this.ctx.workspaceDir);
              break;
            }
            case 'list_files':
              result = await executeSharedListFiles(this.toolCtx, (block.input as { path?: string }).path);
              break;
            case 'graph_query':
            case 'graph_traverse': {
              const graphCtx: GraphToolContext = {
                graphPath: path.join(this.baseDir, 'memory', 'graph.json'),
                runId: this.ctx.runid,
                agent: 'researcher',
                audit: this.ctx.audit,
              };
              result = await executeGraphTool(block.name, block.input as Record<string, unknown>, graphCtx);
              break;
            }
            default:
              result = `Error: Unknown tool ${block.name}`;
          }

          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        } catch (error) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${error}`,
            is_error: true,
          });
        }
      }
    }

    return results;
  }
}
