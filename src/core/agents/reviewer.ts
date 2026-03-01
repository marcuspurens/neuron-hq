import { type RunContext } from '../run.js';
import { withRetry } from './agent-utils.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadPromptHierarchy, buildHierarchicalPrompt } from '../prompt-hierarchy.js';
import { scanDiff, formatScanReport } from '../security-scan.js';

const execAsync = promisify(exec);

/**
 * Detect if the brief classifies this change as HIGH risk.
 */
export function isHighRisk(briefContent: string): boolean {
  const riskSection = briefContent.match(/##\s*Risk[\s\S]*?(?=##|$)/i);
  if (!riskSection) return false;
  return /\*\*High\.?\*\*/i.test(riskSection[0]);
}

/**
 * Reviewer Agent - validates changes, assesses risk, writes STOPLIGHT report.
 */
export class ReviewerAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;
  private baseDir: string;

  constructor(private ctx: RunContext, baseDir: string) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'reviewer.md');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    this.anthropic = new Anthropic({ apiKey });

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_reviewer ?? limits.max_iterations_per_run;
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Execute the reviewer's review loop.
   */
  async run(): Promise<void> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'reviewer',
      tool: 'run',
      allowed: true,
      note: 'Reviewer agent started',
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      await this.runAgentLoop(systemPrompt);

      console.log('Reviewer agent completed successfully.');
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'reviewer',
        tool: 'run',
        allowed: false,
        note: `Reviewer agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const hierarchy = await loadPromptHierarchy(this.promptPath);

    // Always include self-check and handoff (high value, small size)
    const archiveSections: string[] = ['self-check', 'handoff'];

    // Include two-phase and no-tests sections (small, include by default for safety)
    archiveSections.push('two-phase', 'no-tests');

    // Load security-review archive for HIGH risk briefs
    const briefContent = await this.loadBrief();
    if (isHighRisk(briefContent)) {
      archiveSections.push('security-review');
    }

    const reviewerPrompt = buildHierarchicalPrompt(hierarchy, archiveSections);

    const limits = this.ctx.policy.getLimits();
    const handoffContent = await this.loadImplementerHandoff();

    // Run automated security scan for HIGH risk briefs
    let securityContext = '';
    if (isHighRisk(briefContent)) {
      try {
        const { stdout: diff } = await execAsync('git diff HEAD', {
          cwd: this.ctx.workspaceDir,
          maxBuffer: 10 * 1024 * 1024,
        });
        const scanResult = scanDiff(diff);
        securityContext = `\n## Automated Security Scan\n\n${formatScanReport(scanResult)}`;
        if (scanResult.has_critical) {
          securityContext += '\n\n⚠️ CRITICAL security findings detected — this MUST be RED unless findings are false positives.';
        }
      } catch {
        securityContext = '\n## Automated Security Scan\n\n⚠️ Could not read diff for security scan.';
      }
    }

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Time limit**: ${this.ctx.hours} hours (ends at ${this.ctx.endTime.toISOString()})
- **Workspace**: ${this.ctx.workspaceDir}
- **Run artifacts**: ${this.ctx.runDir}
- **Max iterations**: ${this.maxIterations}

# Policy Limits

- Diff warn threshold: ${limits.diff_warn_lines} lines
- Diff block threshold: ${limits.diff_block_lines} lines

# Available Tools

- **bash_exec**: Execute bash commands (use for git diff, git log, git status, tests)
- **read_file**: Read files from the workspace and run artifacts
- **write_file**: Write files to the runs directory (report.md, questions.md)
- **list_files**: List files in a directory

# Brief (Acceptance Criteria to Verify)

${briefContent}
${handoffContent ? `\n# Implementer Handoff\n\n${handoffContent}\n` : ''}${securityContext}
# Your Mission

Review the current state of the workspace. For every acceptance criterion in the brief above,
run actual bash commands to verify whether it was delivered. Check git diff, run verifications,
assess risk (LOW/MED/HIGH), and write a STOPLIGHT report to report.md.
Block if policy is violated or verification fails.
`;

    return `${reviewerPrompt}\n\n${contextInfo}`;
  }

  private async loadBrief(): Promise<string> {
    const briefPath = path.join(this.ctx.runDir, 'brief.md');
    try {
      return await fs.readFile(briefPath, 'utf-8');
    } catch {
      return '(brief.md not found — cannot verify acceptance criteria)';
    }
  }

  /**
   * Load implementer handoff file if it exists.
   */
  private async loadImplementerHandoff(): Promise<string | null> {
    const handoffPath = path.join(this.ctx.runDir, 'implementer_handoff.md');
    try {
      return await fs.readFile(handoffPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async runAgentLoop(systemPrompt: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Please review the current changes in the workspace.

Steps:
1. Run \`git diff\` and \`git status\` to see what changed
2. For EVERY acceptance criterion in the brief, run actual commands to verify:
   - Use \`ls <file>\` to confirm files exist
   - Use \`grep -r "<function>" .\` to confirm code exists
   - Run tests if available
   Report the actual command output. Mark ✅ VERIFIED or ❌ NOT VERIFIED based on real output.
3. Assess risk level (LOW/MED/HIGH)
4. Write report to ${path.join(this.ctx.runDir, 'report.md')} — start with the Swedish summary table,
   then the "Planerat vs Levererat" table, then the STOPLIGHT section
5. If there are blockers, update questions.md

IMPORTANT: Never claim something is done without running a command to verify it.`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping reviewer loop.');
        break;
      }

      console.log(`\n=== Reviewer iteration ${iteration}/${this.maxIterations} ===`);

      try {
        const response = await withRetry(async () => {
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
              process.stdout.write('\n[Reviewer] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'reviewer',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (block: Anthropic.ContentBlock) => block.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Reviewer finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Reviewer finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in reviewer loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Reviewer: max iterations reached.');
    }
    this.ctx.usage.recordIterations('reviewer', iteration, this.maxIterations);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'bash_exec',
        description:
          'Execute a bash command. Use for git diff, git log, git status, and running tests/checks.',
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
          'Write content to a file. Use to write report.md and questions.md to the runs directory.',
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
        console.log(`Reviewer executing tool: ${block.name}`);
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
                agent: 'reviewer',
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
      role: 'reviewer',
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

  private async executeReadFile(input: { path: string }): Promise<string> {
    const { path: filePath } = input;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.workspaceDir, filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');

      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'reviewer',
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
      : path.join(this.ctx.workspaceDir, filePath);

    const policyCheck = this.ctx.policy.checkFileWriteScope(absolutePath, this.ctx.runid);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'reviewer',
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
