import { type RunContext } from '../run.js';
import { truncateToolResult, trimMessages, withRetry } from './agent-utils.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { exec } from 'child_process';
import { promisify } from 'util';

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

      console.log('Implementer agent completed successfully.');
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
    } catch {
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
Keep diffs under 150 lines per iteration. Run fast checks after each change.
`;

    return `${overlayedPrompt}\n\n${contextInfo}`;
  }

  private async runAgentLoop(systemPrompt: string, task: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Your task:\n\n${task}\n\nPlease implement this change following the implementer guidelines. Keep diffs small (<150 lines), verify after each change, and follow existing code patterns.`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping implementer loop.');
        break;
      }

      console.log(`\n=== Implementer iteration ${iteration}/${this.maxIterations} ===`);

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
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (block: Anthropic.ContentBlock) => block.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Implementer finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Implementer finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in implementer loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Implementer: max iterations reached.');
    }
    this.ctx.usage.recordIterations('implementer', iteration, this.maxIterations);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'bash_exec',
        description:
          'Execute a bash command in the workspace. Subject to policy allowlist/forbidden patterns.',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to workspace or absolute path',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description:
          'Write content to a file. Subject to policy file scope validation.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to workspace or absolute path',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: 'List files in a directory.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (defaults to workspace root)',
            },
          },
        },
      },
      ...graphReadToolDefinitions(),
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        console.log(`Implementer executing tool: ${block.name}`);
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'bash_exec':
              result = await this.executeBash(block.input as { command: string });
              break;
            case 'read_file':
              result = await this.executeReadFile(block.input as { path: string });
              break;
            case 'write_file':
              result = await this.executeWriteFile(
                block.input as { path: string; content: string }
              );
              break;
            case 'list_files':
              result = await this.executeListFiles(block.input as { path?: string });
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

  private async executeBash(input: { command: string }): Promise<string> {
    const { command } = input;
    const policyCheck = this.ctx.policy.checkBashCommand(command);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'bash_exec',
      allowed: policyCheck.allowed,
      policy_event: policyCheck.reason,
      note: `Command: ${command}`,
    });

    if (!policyCheck.allowed) {
      return `BLOCKED: ${policyCheck.reason}`;
    }

    try {
      const { stdout } = await execAsync(command, {
        cwd: this.ctx.workspaceDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: this.ctx.policy.getLimits().bash_timeout_seconds * 1000,
      });

      await this.ctx.manifest.addCommand(command, 0);
      return truncateToolResult(stdout);
    } catch (error) {
      const e = error as { status?: number; stderr?: string; message?: string };
      await this.ctx.manifest.addCommand(command, e.status || 1);
      return `Command failed (exit ${e.status || 1}):\n${e.stderr || e.message}`;
    }
  }

  private async executeReadFile(input: { path: string }): Promise<string> {
    const { path: filePath } = input;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.workspaceDir, filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');

      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'implementer',
        tool: 'read_file',
        allowed: true,
        files_touched: [absolutePath],
      });

      return truncateToolResult(content);
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async executeWriteFile(input: { path: string; content: string }): Promise<string> {
    const { path: filePath, content } = input;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.workspaceDir, filePath);

    const policyCheck = this.ctx.policy.checkFileWriteScope(absolutePath, this.ctx.runid);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'write_file',
      allowed: policyCheck.allowed,
      policy_event: policyCheck.reason,
      files_touched: [absolutePath],
    });

    if (!policyCheck.allowed) {
      return `BLOCKED: ${policyCheck.reason}`;
    }

    try {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, 'utf-8');
      return `File written successfully: ${filePath}`;
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async executeListFiles(input: { path?: string }): Promise<string> {
    const dirPath = input.path
      ? path.isAbsolute(input.path)
        ? input.path
        : path.join(this.ctx.workspaceDir, input.path)
      : this.ctx.workspaceDir;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const formatted = entries
        .map((entry: { isDirectory: () => boolean; name: string }) => {
          const type = entry.isDirectory() ? 'DIR' : 'FILE';
          return `${type}\t${entry.name}`;
        })
        .join('\n');
      return formatted || '(empty directory)';
    } catch (error) {
      return `Error listing files: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
