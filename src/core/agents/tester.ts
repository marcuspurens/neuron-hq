import { type RunContext } from '../run.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Tester Agent - independently runs the test suite and reports results.
 * Has no knowledge of what the Implementer did — pure quality gate.
 */
export class TesterAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;

  constructor(private ctx: RunContext, baseDir: string) {
    this.promptPath = path.join(baseDir, 'prompts', 'tester.md');

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
   * Run the tester — discovers test framework, runs tests, writes test_report.md.
   * Returns a one-line verdict string.
   */
  async run(): Promise<string> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'tester',
      tool: 'run',
      allowed: true,
      note: 'Tester agent started',
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      const verdict = await this.runAgentLoop(systemPrompt);
      console.log('Tester agent completed.');
      return verdict;
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'tester',
        tool: 'run',
        allowed: false,
        note: `Tester agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const testerPrompt = await this.loadPrompt();

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Workspace**: ${this.ctx.workspaceDir}
- **Run artifacts**: ${this.ctx.runDir}
- **Test report path**: ${path.join(this.ctx.runDir, 'test_report.md')}

# Your Task

Discover the test framework in the workspace, run the full test suite,
and write test_report.md to the run artifacts directory.
`;

    return `${testerPrompt}\n\n${contextInfo}`;
  }

  private async runAgentLoop(systemPrompt: string): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          `Discover the test framework and run the full test suite in the workspace.\n\n` +
          `1. Use list_files to inspect the workspace root.\n` +
          `2. Identify the test framework.\n` +
          `3. Run the tests with bash_exec.\n` +
          `4. Write test_report.md to ${path.join(this.ctx.runDir, 'test_report.md')}.\n` +
          `5. Return your one-line verdict.`,
      },
    ];

    let iteration = 0;
    let lastVerdict = 'TESTS UNKNOWN: Tester did not complete.';

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping tester loop.');
        break;
      }

      console.log(`\n=== Tester iteration ${iteration}/${this.maxIterations} ===`);

      try {
        const stream = this.anthropic.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: this.defineTools(),
        });

        let prefixPrinted = false;
        stream.on('text', (text) => {
          if (!prefixPrinted) {
            process.stdout.write('\n[Tester] ');
            prefixPrinted = true;
          }
          process.stdout.write(text);
        });

        const response = await stream.finalMessage();
        if (prefixPrinted) process.stdout.write('\n');

        this.ctx.usage.recordTokens(
          'tester',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        // Extract any text verdict from the last text block
        for (const block of response.content) {
          if (block.type === 'text' && block.text.match(/^(TESTS (PASS|FAIL)|NO TESTS)/i)) {
            lastVerdict = block.text.trim().split('\n')[0];
          }
        }

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (b: Anthropic.ContentBlock) => b.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Tester finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Tester finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in tester loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Tester: max iterations reached.');
    }

    return lastVerdict;
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'bash_exec',
        description:
          'Execute a bash command in the workspace. Use to run tests (pytest, npm test, etc.) and inspect files.',
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
        description: 'Read a file from the workspace (e.g. package.json, pyproject.toml).',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path or workspace-relative path',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write test_report.md to the runs directory.',
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
        name: 'list_files',
        description: 'List files in a directory to discover test framework.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path (defaults to workspace root)',
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
        console.log(`Tester executing tool: ${block.name}`);
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
      role: 'tester',
      tool: 'bash_exec',
      allowed: policyCheck.allowed,
      policy_event: policyCheck.reason,
      note: `Command: ${command}`,
    });

    if (!policyCheck.allowed) {
      return `BLOCKED: ${policyCheck.reason}`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.ctx.workspaceDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: this.ctx.policy.getLimits().bash_timeout_seconds * 1000,
      });
      await this.ctx.manifest.addCommand(command, 0);
      // Include stderr in output — test runners often write results to stderr
      return (stdout + (stderr ? '\n' + stderr : '')).trim();
    } catch (error: any) {
      await this.ctx.manifest.addCommand(command, error.status || 1);
      // For test runners, exit code != 0 means tests failed — include full output
      const out = [
        error.stdout || '',
        error.stderr || '',
      ].filter(Boolean).join('\n');
      return `Exit ${error.status || 1}:\n${out || error.message}`;
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
        role: 'tester',
        tool: 'read_file',
        allowed: true,
        files_touched: [absolutePath],
      });
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  }

  private async executeWriteFile(input: { path: string; content: string }): Promise<string> {
    const { path: filePath, content } = input;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.runDir, filePath);

    const policyCheck = this.ctx.policy.checkFileWriteScope(absolutePath, this.ctx.runid);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'tester',
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
