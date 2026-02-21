import { type RunContext } from '../run.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';

/**
 * Manager Agent - orchestrates the swarm using Anthropic SDK.
 */
export class ManagerAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;

  constructor(private ctx: RunContext, baseDir: string) {
    this.promptPath = path.join(baseDir, 'prompts', 'manager.md');

    // Initialize Anthropic client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    this.anthropic = new Anthropic({ apiKey });

    // Get max iterations from policy limits
    this.maxIterations = ctx.policy.getLimits().max_iterations_per_run;
  }

  /**
   * Load the manager prompt.
   */
  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Execute the manager's run loop with Anthropic SDK.
   */
  async run(): Promise<void> {
    // Log manager start
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'run',
      allowed: true,
      note: 'Manager agent started with Anthropic SDK',
    });

    try {
      // 1. Run baseline verification
      await this.runBaseline();

      // 2. Load system prompt and brief
      const systemPrompt = await this.buildSystemPrompt();
      const brief = await this.ctx.artifacts.readBrief();

      // 3. Run agent loop
      await this.runAgentLoop(systemPrompt, brief);

      // 4. Write final artifacts
      await this.writeDefaultArtifacts();

      console.log('Manager agent completed successfully.');
    } catch (error) {
      console.error('Manager agent error:', error);

      // Log error to audit
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'manager',
        tool: 'run',
        allowed: false,
        note: `Manager agent failed: ${error}`,
      });

      throw error;
    }
  }

  /**
   * Run baseline verification before making changes.
   */
  private async runBaseline(): Promise<void> {
    console.log('Running baseline verification...');

    // Discover and run verification commands
    const commands = await this.ctx.verifier.discoverCommands();
    const result = await this.ctx.verifier.verify(commands);
    const baselineMarkdown = this.ctx.verifier.formatMarkdown(result);

    await this.ctx.artifacts.writeBaseline(baselineMarkdown);

    console.log('Baseline verification complete.');
  }

  /**
   * Build the system prompt for the manager agent.
   */
  private async buildSystemPrompt(): Promise<string> {
    const managerPrompt = await this.loadPrompt();

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Time limit**: ${this.ctx.hours} hours (ends at ${this.ctx.endTime.toISOString()})
- **Workspace**: ${this.ctx.workspaceDir}
- **Max iterations**: ${this.maxIterations}

# Available Tools

You have access to these tools:
- **bash_exec**: Execute bash commands (policy-gated)
- **read_file**: Read files from the workspace
- **write_file**: Write files to the workspace (policy-gated)
- **list_files**: List files in a directory

# Policy Constraints

All bash commands and file writes are subject to policy enforcement.
Commands not in the allowlist or matching forbidden patterns will be blocked.

# Your Mission

Work on the brief below. Plan, implement, and verify changes.
Stop when time limit approaches or when blockers are encountered.
`;

    return `${managerPrompt}\n\n${contextInfo}`;
  }

  /**
   * Run the agent loop with tool execution.
   */
  private async runAgentLoop(systemPrompt: string, brief: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Here is your brief:\n\n${brief}\n\nPlease proceed with planning and implementation.`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      // Check time limit
      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping agent loop.');
        break;
      }

      console.log(`\n=== Manager iteration ${iteration}/${this.maxIterations} ===`);

      try {
        const response = await this.anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages,
          tools: this.defineTools(),
        });

        // Track token usage
        this.ctx.usage.recordTokens(
          'manager',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        // Add assistant response to messages
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Check if agent wants to stop
        if (response.stop_reason === 'end_turn') {
          // Check if there are tool uses
          const hasToolUse = response.content.some(
            (block: Anthropic.ContentBlock) => block.type === 'tool_use'
          );

          if (!hasToolUse) {
            console.log('Agent finished (no more tool calls).');
            break;
          }
        }

        // Execute tools if present
        const toolResults = await this.executeTools(response.content);

        if (toolResults.length > 0) {
          // Add tool results to messages
          messages.push({
            role: 'user',
            content: toolResults,
          });
        } else {
          // No tool calls, agent is done
          console.log('Agent finished (no tool calls).');
          break;
        }

      } catch (error) {
        console.error('Error in agent loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Max iterations reached.');
    }
  }

  /**
   * Define tools available to the agent.
   */
  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'bash_exec',
        description: 'Execute a bash command in the workspace. Subject to policy allowlist/forbidden patterns.',
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
        description: 'Write content to a file. Subject to policy file scope validation.',
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

  /**
   * Execute tools from agent response.
   */
  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        console.log(`Executing tool: ${block.name}`);

        // Track tool call
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
              result = await this.executeListFiles(
                block.input as { path?: string }
              );
              break;
            default:
              result = `Error: Unknown tool ${block.name}`;
          }

          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
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

  /**
   * Execute bash command with policy gating.
   */
  private async executeBash(input: { command: string }): Promise<string> {
    const { command } = input;

    // Check policy
    const policyCheck = this.ctx.policy.checkBashCommand(command);

    // Log to audit
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'bash_exec',
      allowed: policyCheck.allowed,
      policy_event: policyCheck.reason,
      note: `Command: ${command}`,
    });

    if (!policyCheck.allowed) {
      return `BLOCKED: ${policyCheck.reason}`;
    }

    try {
      // Execute command in workspace directory
      const output = execSync(command, {
        cwd: this.ctx.workspaceDir,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: this.ctx.policy.getLimits().bash_timeout_seconds * 1000,
      });

      // Log successful execution
      await this.ctx.manifest.addCommand(command, 0);

      return output;
    } catch (error: any) {
      // Log failed execution
      await this.ctx.manifest.addCommand(command, error.status || 1);

      return `Command failed (exit ${error.status || 1}):\n${error.stderr || error.message}`;
    }
  }

  /**
   * Read a file.
   */
  private async executeReadFile(input: { path: string }): Promise<string> {
    const { path: filePath } = input;

    // Resolve path relative to workspace
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.workspaceDir, filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');

      // Log to audit
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'manager',
        tool: 'read_file',
        allowed: true,
        files_touched: [absolutePath],
      });

      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  }

  /**
   * Write a file with policy gating.
   */
  private async executeWriteFile(input: {
    path: string;
    content: string;
  }): Promise<string> {
    const { path: filePath, content } = input;

    // Resolve path relative to workspace
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.workspaceDir, filePath);

    // Check policy
    const policyCheck = this.ctx.policy.checkFileWriteScope(
      absolutePath,
      this.ctx.runid
    );

    // Log to audit
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'write_file',
      allowed: policyCheck.allowed,
      policy_event: policyCheck.reason,
      files_touched: [absolutePath],
    });

    if (!policyCheck.allowed) {
      return `BLOCKED: ${policyCheck.reason}`;
    }

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });

      // Write file
      await fs.writeFile(absolutePath, content, 'utf-8');

      return `File written successfully: ${filePath}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  }

  /**
   * List files in a directory.
   */
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

  /**
   * Write default artifacts at end of run.
   */
  private async writeDefaultArtifacts(): Promise<void> {
    // Write questions.md (empty for now - could be populated by agent)
    await this.ctx.artifacts.writeQuestions([]);

    // Write ideas.md (placeholder)
    const ideas = [
      '# Ideas for Future Work',
      '',
      '(To be populated by Researcher agent)',
    ].join('\n');
    await this.ctx.artifacts.writeIdeas(ideas);

    // Write knowledge.md (placeholder)
    const knowledge = [
      '# Knowledge',
      '',
      '## What we learned',
      '- Manager agent completed run with Anthropic SDK',
      '',
      '## Assumptions',
      '- Implementer, Reviewer, Researcher agents not yet integrated',
      '',
      '## Open questions',
      '- None',
    ].join('\n');
    await this.ctx.artifacts.writeKnowledge(knowledge);

    // Write sources.md (placeholder)
    const sources = [
      '# Research Sources',
      '',
      '(To be populated by Researcher agent)',
    ].join('\n');
    await this.ctx.artifacts.writeSources(sources);
  }
}
