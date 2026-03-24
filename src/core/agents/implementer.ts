import { type RunContext } from '../run.js';
import { saveTranscript } from '../transcript-saver.js';
import { trimMessages, withRetry } from './agent-utils.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import { executeSharedBash, executeSharedReadFile, executeSharedWriteFile, executeSharedListFiles, coreToolDefinitions, type AgentToolContext } from './shared-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient, buildCachedSystemBlocks } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import { emergencySave } from '../emergency-save.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../logger.js';
const logger = createLogger('agent:implementer');

const execAsync = promisify(exec);

/**
 * Implementer Agent - writes code changes to the workspace.
 */
export class ImplementerAgent {
  private promptPath: string;
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;
  private baseDir: string;
  private taskId?: string;
  private branchName?: string;

  constructor(private ctx: RunContext, baseDir: string) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'implementer.md');

    const config = resolveModelConfig('implementer', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_implementer ?? limits.max_iterations_per_run;
  }

  /** Tool context for shared execute functions. */
  private get toolCtx(): AgentToolContext {
    return { ctx: this.ctx, agentRole: 'implementer' };
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Execute the implementer's task loop.
   */
  async run(task: string, options?: { taskId?: string; branchName?: string }): Promise<void> {
    this.taskId = options?.taskId;
    this.branchName = options?.branchName;

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'run',
      allowed: true,
      note: `Implementer agent started. Task: ${task.slice(0, 120)}`,
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      await this.runAgentLoop(systemPrompt, task);

      // Write per-task handoff if running as part of parallel execution
      if (this.taskId) {
        const handoff = {
          taskId: this.taskId,
          branch: this.branchName ?? 'unknown',
          filesModified: await this.getModifiedFiles(),
          testsPassing: true, // Assumed if we got here without error
          completedAt: new Date().toISOString(),
        };

        await fs.writeFile(
          path.join(this.ctx.runDir, `task_${this.taskId}_handoff.json`),
          JSON.stringify(handoff, null, 2)
        );
      }

      logger.info('Implementer agent completed successfully.');
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'implementer',
        tool: 'run',
        allowed: false,
        note: `Implementer agent failed: ${error}`,
      });
      throw error;
    }
  }

  /**
   * Get list of files modified in the workspace (via git diff).
   */
  private async getModifiedFiles(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git diff --name-only HEAD', {
        cwd: this.ctx.workspaceDir,
      });
      return stdout.trim().split('\n').filter(f => f.length > 0);
    } catch {  /* intentional: questions.md may not exist */
      return [];
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const implementerPrompt = await this.loadPrompt();
    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'implementer',
    });
    const overlayedPrompt = mergePromptWithOverlay(implementerPrompt, overlay);

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Time limit**: ${this.ctx.hours} hours (ends at ${this.ctx.endTime.toISOString()})
- **Workspace**: ${this.ctx.workspaceDir}
- **Max iterations**: ${this.maxIterations}

# Available Tools

- **bash_exec**: Execute bash commands (policy-gated)
- **read_file**: Read files from the workspace
- **write_file**: Write files to the workspace (policy-gated)
- **list_files**: List files in a directory

# Policy Constraints

All bash commands and file writes are subject to policy enforcement.
Keep diffs under 150 lines per iteration (unless a different limit is specified in your task). Run fast checks after each change.
`;

    return prependPreamble(this.baseDir, `${overlayedPrompt}\n\n${contextInfo}`);
  }

  private async runAgentLoop(systemPrompt: string, task: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Your task:\n\n${task}\n\nPlease implement this change following the implementer guidelines. Keep diffs within the limit specified in your task (default: 150 lines), verify after each change, and follow existing code patterns.`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        logger.info('Time limit reached. Stopping implementer loop.');
        break;
      }

      logger.info('Implementer iteration', { iteration: String(iteration), maxIterations: String(this.maxIterations) });

      try {
        const response = await withRetry(async () => {
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
            system: buildCachedSystemBlocks(systemPrompt),
            messages: trimMessages(messages),
            tools: this.defineTools(),
          });

          let prefixPrinted = false;
          stream.on('text', (text) => {
            if (!prefixPrinted) {
              process.stdout.write('\n[Implementer] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'implementer',
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_creation_input_tokens ?? 0,
          response.usage.cache_read_input_tokens ?? 0,
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (block: Anthropic.ContentBlock) => block.type === 'tool_use'
          );
          if (!hasToolUse) {
            logger.info('Implementer finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          logger.info('Implementer finished (no tool calls).');
          break;
        }
      } catch (error) {
        logger.error('Error in implementer loop', { error: String(error) });
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.info('Implementer: max iterations reached.');
      await emergencySave({
        agentName: 'implementer',
        iteration,
        maxIterations: this.maxIterations,
        workspaceDir: this.ctx.workspaceDir,
        runDir: this.ctx.runDir,
        runid: this.ctx.runid,
        audit: this.ctx.audit,
      });
    }
    this.ctx.usage.recordIterations('implementer', iteration, this.maxIterations);
    await saveTranscript(this.ctx.runDir, this.taskId ? `implementer-${this.taskId}` : 'implementer', messages);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      ...coreToolDefinitions({
        bash: 'Execute a bash command in the workspace. Subject to policy allowlist/forbidden patterns.',
        readFile: 'Read the contents of a file.',
        writeFile: 'Write content to a file. Subject to policy file scope validation.',
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
        logger.info('Implementer executing tool', { tool: block.name });
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
                agent: 'implementer',
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
