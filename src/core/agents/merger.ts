import { type RunContext } from '../run.js';
import { saveTranscript } from '../transcript-saver.js';
import { GitOperations } from '../git.js';
import { withRetry } from './agent-utils.js';
import { executeSharedBash, executeSharedReadFile, executeSharedWriteFile, coreToolDefinitions, type AgentToolContext } from './shared-tools.js';
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
const logger = createLogger('agent:merger');

const execAsync = promisify(exec);

/**
 * Merger Agent - copies verified workspace changes to the target repo and commits.
 *
 * Single-phase agent that executes immediately when Reviewer gives GREEN.
 */
export class MergerAgent {
  private promptPath: string;
  private baseDir: string;
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;

  constructor(private ctx: RunContext, baseDir: string) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'merger.md');

    const config = resolveModelConfig('merger', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_merger ?? limits.max_iterations_per_run;
  }

  /** Shared tool context for the 3 standard tools. */
  private get toolCtx(): AgentToolContext {
    return { ctx: this.ctx, agentRole: 'merger' };
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Execute the merger. Returns a status string for the manager.
   */
  async run(): Promise<string> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'merger',
      tool: 'run',
      allowed: true,
      note: 'Merger agent started',
    });

    try {
      // Step 1: Read report.md and check for GREEN verdict
      const reportPath = path.join(this.ctx.runDir, 'report.md');
      let reportContent: string;
      try {
        reportContent = await fs.readFile(reportPath, 'utf-8');
      } catch {  /* intentional: report.md not found */
        return 'MERGER_BLOCKED: report.md not found. Reviewer must run first.';
      }

      if (!/\bGREEN\b/.test(reportContent)) {
        return 'MERGER_BLOCKED: Reviewer did not give GREEN. See report.md.';
      }

      logger.info('Merger running — Reviewer gave GREEN.');

      // Step 2: Run execute flow directly
      const systemPrompt = await this.buildSystemPrompt();
      const result = await this.runAgentLoop(systemPrompt);

      logger.info('Merger agent completed.');
      return result;
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'merger',
        tool: 'run',
        allowed: false,
        note: `Merger agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const mergerPrompt = await this.loadPrompt();
    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'merger',
    });
    const overlayedPrompt = mergePromptWithOverlay(mergerPrompt, overlay);

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Target path**: ${this.ctx.target.path}
- **Workspace**: ${this.ctx.workspaceDir}
- **Run artifacts**: ${this.ctx.runDir}
- **Current phase**: EXECUTE

# Available Tools

- **bash_exec**: Read-only commands in workspace (git diff, git status, ls, grep, cat)
- **bash_exec_in_target**: Commands in target repo (git add, git commit, git status)
- **read_file**: Read files from workspace or runs dir
- **write_file**: Write to runs dir only (merge_plan.md, questions.md, merge_summary.md)
- **copy_to_target**: Copy a single file from workspace to target repo

# Phase Instructions

EXECUTE: Read merge_plan.md, copy verified files to target with copy_to_target, commit with bash_exec_in_target, write merge_summary.md.
`;

    return prependPreamble(this.baseDir, `${overlayedPrompt}\n\n${contextInfo}`);
  }

  private async runAgentLoop(systemPrompt: string): Promise<string> {
    const initialMessage =
      `Execute the merge.\n\n` +
      `1. Read ${path.join(this.ctx.runDir, 'merge_plan.md')} for the list of files and commit message.\n` +
      `2. Copy each file using copy_to_target.\n` +
      `3. Run git add + git commit in target using bash_exec_in_target.\n` +
      `4. Write merge_summary.md to ${this.ctx.runDir}.\n` +
      `5. Stop.`;

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: initialMessage },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        logger.info('Time limit reached. Stopping merger loop.');
        break;
      }

      logger.info('Merger iteration', { iteration: String(iteration), maxIterations: String(this.maxIterations) });

      try {
        const response = await withRetry(async () => {
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
            system: buildCachedSystemBlocks(systemPrompt),
            messages,
            tools: this.defineTools(),
          });

          let prefixPrinted = false;
          stream.on('text', (text) => {
            if (!prefixPrinted) {
              process.stdout.write('\n[Merger] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'merger',
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_creation_input_tokens ?? 0,
          response.usage.cache_read_input_tokens ?? 0,
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (b: Anthropic.ContentBlock) => b.type === 'tool_use'
          );
          if (!hasToolUse) {
            logger.info('Merger finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          logger.info('Merger finished (no tool calls).');
          break;
        }
      } catch (error) {
        logger.error('Error in merger loop', { error: String(error) });
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.info('Merger: max iterations reached.');
      await emergencySave({
        agentName: 'merger',
        iteration,
        maxIterations: this.maxIterations,
        workspaceDir: this.ctx.workspaceDir,
        runDir: this.ctx.runDir,
        runid: this.ctx.runid,
        audit: this.ctx.audit,
      });
    }

    this.ctx.usage.recordIterations('merger', iteration, this.maxIterations);
    await saveTranscript(this.ctx.runDir, 'merger', messages);
    return 'MERGER_COMPLETE';
  }

  private defineTools(): Anthropic.Tool[] {
    const coreTools = coreToolDefinitions({
      bash: 'Execute a bash command in the workspace. Use for read-only operations: git diff, git status, ls, grep, cat.',
      readFile: 'Read a file from the workspace or runs directory.',
      writeFile: 'Write a file to the runs directory (merge_plan.md, questions.md, merge_summary.md).',
    });
    // Filter out list_files since merger doesn't need it
    const filteredCore = coreTools.filter(t => t.name !== 'list_files');
    return [
      ...filteredCore,
      {
        name: 'bash_exec_in_target',
        description:
          'Execute a bash command in the TARGET repo. Use for git add, git commit, git status in the real repo.',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute in the target repo',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'copy_to_target',
        description:
          'Copy a single file from the workspace to the target repo. Use for each verified file in the merge plan.',
        input_schema: {
          type: 'object',
          properties: {
            workspace_path: {
              type: 'string',
              description: 'Path relative to workspace root (e.g. src/app.py)',
            },
            target_path: {
              type: 'string',
              description:
                'Path relative to target repo root (usually same as workspace_path)',
            },
          },
          required: ['workspace_path', 'target_path'],
        },
      },
      {
        name: 'merge_task_branch',
        description: 'Merge a completed task branch into the main workspace branch. Returns merge result including success/failure and any conflict details.',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The task ID (e.g. T1, T2)',
            },
            source_branch: {
              type: 'string',
              description: 'The branch name to merge (e.g. neuron-run-123-task-T1)',
            },
          },
          required: ['task_id', 'source_branch'],
        },
      },
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        logger.info('Merger executing tool', { tool: block.name });
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'bash_exec':
              result = await executeSharedBash(this.toolCtx, (block.input as { command: string }).command);
              break;
            case 'bash_exec_in_target':
              result = await this.executeBashInTarget(block.input as { command: string });
              break;
            case 'read_file':
              result = await executeSharedReadFile(this.toolCtx, (block.input as { path: string }).path);
              break;
            case 'write_file': {
              const writeInput = block.input as { path: string; content: string };
              result = await executeSharedWriteFile(this.toolCtx, writeInput.path, writeInput.content, this.ctx.runDir);
              break;
            }
            case 'copy_to_target':
              result = await this.executeCopyToTarget(
                block.input as { workspace_path: string; target_path: string }
              );
              break;
            case 'merge_task_branch':
              result = await this.executeMergeTaskBranch(
                block.input as { task_id: string; source_branch: string }
              );
              break;
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

  private async executeBashInTarget(input: { command: string }): Promise<string> {
    const { command } = input;
    const policyCheck = this.ctx.policy.checkBashCommand(command);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'merger',
      tool: 'bash_exec_in_target',
      allowed: policyCheck.allowed,
      policy_event: policyCheck.reason,
      note: `Target command: ${command}`,
    });

    if (!policyCheck.allowed) {
      return `BLOCKED: ${policyCheck.reason}`;
    }

    try {
      const { stdout } = await execAsync(command, {
        cwd: this.ctx.target.path,
        maxBuffer: 10 * 1024 * 1024,
        timeout: this.ctx.policy.getLimits().bash_timeout_seconds * 1000,
      });
      await this.ctx.manifest.addCommand(command, 0);
      return stdout;
    } catch (error) {
      const e = error as { status?: number; stderr?: string; message?: string };
      await this.ctx.manifest.addCommand(command, e.status || 1);
      return `Command failed (exit ${e.status || 1}):\n${e.stderr || e.message}`;
    }
  }

  /**
   * Copy a file from workspace to target repo with path safety checks.
   */
  async executeCopyToTarget(input: {
    workspace_path: string;
    target_path: string;
  }): Promise<string> {
    const { workspace_path, target_path } = input;

    const srcAbsolute = path.isAbsolute(workspace_path)
      ? workspace_path
      : path.join(this.ctx.workspaceDir, workspace_path);

    const dstAbsolute = path.isAbsolute(target_path)
      ? target_path
      : path.join(this.ctx.target.path, target_path);

    // Safety: source must be inside workspace
    const normalizedSrc = path.resolve(srcAbsolute);
    const normalizedWorkspace = path.resolve(this.ctx.workspaceDir);
    if (!normalizedSrc.startsWith(normalizedWorkspace + path.sep) &&
        normalizedSrc !== normalizedWorkspace) {
      return `BLOCKED: Source path must be inside workspace. Got: ${normalizedSrc}`;
    }

    // Safety: destination must be inside target repo
    const normalizedDst = path.resolve(dstAbsolute);
    const normalizedTarget = path.resolve(this.ctx.target.path);
    if (!normalizedDst.startsWith(normalizedTarget + path.sep) &&
        normalizedDst !== normalizedTarget) {
      return `BLOCKED: Destination path must be inside target repo. Got: ${normalizedDst}`;
    }

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'merger',
      tool: 'copy_to_target',
      allowed: true,
      files_touched: [normalizedSrc, normalizedDst],
      note: `Copy: ${workspace_path} → ${target_path}`,
    });

    try {
      await fs.mkdir(path.dirname(normalizedDst), { recursive: true });
      await fs.copyFile(normalizedSrc, normalizedDst);
      return `Copied: ${workspace_path} → ${target_path}`;
    } catch (error) {
      return `Error copying file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async executeMergeTaskBranch(input: { task_id: string; source_branch: string }): Promise<string> {
    const { task_id, source_branch } = input;
    const git = new GitOperations(this.ctx.workspaceDir);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'merger',
      tool: 'merge_task_branch',
      allowed: true,
      note: `Merging task ${task_id} from branch ${source_branch}`,
    });

    try {
      // Check for conflicts first
      const conflicts = await git.detectMergeConflicts(source_branch);
      if (conflicts.length > 0) {
        const msg = `MERGE_CONFLICT: Task ${task_id} branch ${source_branch} conflicts with files: ${conflicts.join(', ')}. Merge aborted — no automatic conflict resolution.`;
        await this.ctx.audit.log({
          ts: new Date().toISOString(),
          role: 'merger',
          tool: 'merge_task_branch',
          allowed: true,
          note: msg,
        });
        return msg;
      }

      // Clean merge — proceed
      const sha = await git.mergeBranch(source_branch, `Merge task ${task_id} from ${source_branch}`);

      // Cleanup branch
      await git.deleteBranch(source_branch);

      return `MERGE_SUCCESS: Task ${task_id} merged successfully. Commit SHA: ${sha}. Branch ${source_branch} deleted.`;
    } catch (error) {
      return `MERGE_FAILED: Task ${task_id} merge failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
