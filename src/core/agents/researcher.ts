import { type RunContext } from '../run.js';
import { truncateToolResult, trimMessages } from './agent-utils.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Researcher Agent - reads code, generates ideas.md and sources.md.
 */
export class ResearcherAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;

  constructor(private ctx: RunContext, baseDir: string) {
    this.promptPath = path.join(baseDir, 'prompts', 'researcher.md');

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

    return `${researcherPrompt}\n\n${contextInfo}`;
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
        const response = await this.anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: trimMessages(messages),
          tools: this.defineTools(),
        });

        this.ctx.usage.recordTokens(
          'researcher',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        // Print agent reasoning (text blocks)
        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) {
            console.log(`\n[Researcher] ${block.text.trim()}`);
          }
        }

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
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'bash_exec',
        description:
          'Execute a bash command for code reading. Use grep, cat, find to explore the codebase.',
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
          'Write content to a file. Use to write ideas.md and sources.md to the runs directory.',
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
      role: 'researcher',
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
        role: 'researcher',
        tool: 'read_file',
        allowed: true,
        files_touched: [absolutePath],
      });

      return truncateToolResult(content);
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
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
      role: 'researcher',
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
    } catch (error: any) {
      return `Error listing files: ${error.message}`;
    }
  }
}
