import { type RunContext } from '../run.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Merger Agent - copies verified workspace changes to the target repo and commits.
 *
 * Operates in two phases:
 * - PLAN: reads report.md, diffs workspace vs target, writes merge_plan.md, stops.
 * - EXECUTE: (after user writes APPROVED in answers.md) copies files, commits, writes summary.
 */
export class MergerAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;

  constructor(private ctx: RunContext, baseDir: string) {
    this.promptPath = path.join(baseDir, 'prompts', 'merger.md');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    this.anthropic = new Anthropic({ apiKey });

    this.maxIterations = ctx.policy.getLimits().max_iterations_per_run;
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
      const phase = await this.detectPhase();
      console.log(`Merger running in ${phase.toUpperCase()} phase.`);

      const systemPrompt = await this.buildSystemPrompt(phase);
      const result = await this.runAgentLoop(systemPrompt, phase);

      console.log('Merger agent completed.');
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

  /**
   * Detect which phase to run based on answers.md.
   */
  async detectPhase(): Promise<'plan' | 'execute'> {
    const answersPath = path.join(this.ctx.runDir, 'answers.md');
    try {
      const content = await fs.readFile(answersPath, 'utf-8');
      if (content.toUpperCase().includes('APPROVED')) {
        return 'execute';
      }
    } catch {
      // answers.md doesn't exist — plan phase
    }
    return 'plan';
  }

  private async buildSystemPrompt(phase: 'plan' | 'execute'): Promise<string> {
    const mergerPrompt = await this.loadPrompt();

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Target path**: ${this.ctx.target.path}
- **Workspace**: ${this.ctx.workspaceDir}
- **Run artifacts**: ${this.ctx.runDir}
- **Current phase**: ${phase.toUpperCase()}

# Available Tools

- **bash_exec**: Read-only commands in workspace (git diff, git status, ls, grep, cat)
- **bash_exec_in_target**: Commands in target repo (git add, git commit, git status)
- **read_file**: Read files from workspace or runs dir
- **write_file**: Write to runs dir only (merge_plan.md, questions.md, merge_summary.md)
- **copy_to_target**: Copy a single file from workspace to target repo

# Phase Instructions

${
  phase === 'plan'
    ? `PLAN: Read report.md, diff workspace vs target, write merge_plan.md and update questions.md. Do NOT copy files or commit. Stop when done.`
    : `EXECUTE: Read merge_plan.md, copy verified files to target with copy_to_target, commit with bash_exec_in_target, write merge_summary.md.`
}
`;

    return `${mergerPrompt}\n\n${contextInfo}`;
  }

  private async runAgentLoop(
    systemPrompt: string,
    phase: 'plan' | 'execute'
  ): Promise<string> {
    const initialMessage =
      phase === 'plan'
        ? `Generate the merge plan.\n\n` +
          `1. Read ${path.join(this.ctx.runDir, 'report.md')} to find ✅ VERIFIED items.\n` +
          `2. For each verified file, diff workspace vs target (use bash_exec + cat/grep).\n` +
          `3. Write merge_plan.md to ${this.ctx.runDir}.\n` +
          `4. Append approval request to ${path.join(this.ctx.runDir, 'questions.md')}.\n` +
          `5. Stop.`
        : `Execute the merge.\n\n` +
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
        console.log('Time limit reached. Stopping merger loop.');
        break;
      }

      console.log(`\n=== Merger iteration ${iteration}/${this.maxIterations} (${phase}) ===`);

      try {
        const stream = this.anthropic.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
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

        const response = await stream.finalMessage();
        if (prefixPrinted) process.stdout.write('\n');

        this.ctx.usage.recordTokens(
          'merger',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (b: Anthropic.ContentBlock) => b.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Merger finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Merger finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in merger loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Merger: max iterations reached.');
    }

    return phase === 'plan'
      ? 'MERGER_PLAN_READY: Merge plan written to merge_plan.md. User approval required before executing.'
      : 'MERGER_COMPLETE: Changes copied and committed to target repo.';
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'bash_exec',
        description:
          'Execute a bash command in the workspace. Use for read-only operations: git diff, git status, ls, grep, cat.',
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
        name: 'read_file',
        description: 'Read a file from the workspace or runs directory.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path or path relative to workspace',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description:
          'Write a file to the runs directory (merge_plan.md, questions.md, merge_summary.md).',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path (must be inside runs dir)',
            },
            content: {
              type: 'string',
              description: 'Content to write',
            },
          },
          required: ['path', 'content'],
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
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        console.log(`Merger executing tool: ${block.name}`);
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'bash_exec':
              result = await this.executeBash(block.input as { command: string });
              break;
            case 'bash_exec_in_target':
              result = await this.executeBashInTarget(block.input as { command: string });
              break;
            case 'read_file':
              result = await this.executeReadFile(block.input as { path: string });
              break;
            case 'write_file':
              result = await this.executeWriteFile(
                block.input as { path: string; content: string }
              );
              break;
            case 'copy_to_target':
              result = await this.executeCopyToTarget(
                block.input as { workspace_path: string; target_path: string }
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

  private async executeBash(input: { command: string }): Promise<string> {
    const { command } = input;
    const policyCheck = this.ctx.policy.checkBashCommand(command);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'merger',
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
      return stdout;
    } catch (error: any) {
      await this.ctx.manifest.addCommand(command, error.status || 1);
      return `Command failed (exit ${error.status || 1}):\n${error.stderr || error.message}`;
    }
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
    } catch (error: any) {
      await this.ctx.manifest.addCommand(command, error.status || 1);
      return `Command failed (exit ${error.status || 1}):\n${error.stderr || error.message}`;
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
        role: 'merger',
        tool: 'read_file',
        allowed: true,
        files_touched: [absolutePath],
      });
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  }

  private async executeWriteFile(input: {
    path: string;
    content: string;
  }): Promise<string> {
    const { path: filePath, content } = input;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.runDir, filePath);

    const policyCheck = this.ctx.policy.checkFileWriteScope(absolutePath, this.ctx.runid);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'merger',
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
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
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
    } catch (error: any) {
      return `Error copying file: ${error.message}`;
    }
  }
}
