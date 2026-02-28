import { type RunContext, checkEstop } from '../run.js';
import { ImplementerAgent } from './implementer.js';
import { ReviewerAgent } from './reviewer.js';
import { ResearcherAgent } from './researcher.js';
import { MergerAgent } from './merger.js';
import { HistorianAgent } from './historian.js';
import { TesterAgent } from './tester.js';
import { LibrarianAgent } from './librarian.js';
import { truncateToolResult, trimMessages, searchMemoryFiles, withRetry } from './agent-utils.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectTestStatus } from '../baseline.js';
import { validateHandoff, IMPLEMENTER_REQUIRED, REVIEWER_REQUIRED } from '../verification-gate.js';

const execAsync = promisify(exec);

/**
 * Manager Agent - orchestrates the swarm using Anthropic SDK.
 */
export class ManagerAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;

  private baseDir: string;
  private memoryDir: string;
  private librarianAutoTrigger: boolean;
  private testStatus: { testsExist: boolean; testFramework: string | null } | null = null;

  constructor(private ctx: RunContext, baseDir: string, librarianAutoTrigger = false) {
    this.baseDir = baseDir;
    this.librarianAutoTrigger = librarianAutoTrigger;
    this.promptPath = path.join(baseDir, 'prompts', 'manager.md');
    this.memoryDir = path.join(baseDir, 'memory');

    // Initialize Anthropic client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    this.anthropic = new Anthropic({ apiKey });

    // Get max iterations from policy limits
    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_manager ?? limits.max_iterations_per_run;
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

    // Detect test status
    this.testStatus = await detectTestStatus(this.ctx.workspaceDir);

    console.log('Baseline verification complete.');
  }

  /**
   * Build the system prompt for the manager agent.
   */
  private async buildSystemPrompt(): Promise<string> {
    const managerPrompt = await this.loadPrompt();

    const testStatusLine = this.testStatus
      ? (this.testStatus.testsExist
          ? `Test status: Tests exist (framework: ${this.testStatus.testFramework ?? 'unknown'})`
          : 'Test status: NO TESTS FOUND — Implementer must create test suite')
      : 'Test status: Not yet determined';

    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Time limit**: ${this.ctx.hours} hours (ends at ${this.ctx.endTime.toISOString()})
- **Workspace**: ${this.ctx.workspaceDir}
- **Run artifacts dir**: ${this.ctx.runDir}
- **Max iterations**: ${this.maxIterations}
- **${testStatusLine}**

# Available Tools

You have access to these tools:
- **bash_exec**: Execute bash commands (policy-gated)
- **read_file**: Read files from the workspace or run artifacts dir
- **write_file**: Write files to the workspace or run artifacts dir (policy-gated)
- **list_files**: List files in a directory

# Policy Constraints

All bash commands and file writes are subject to policy enforcement.
Commands not in the allowlist or matching forbidden patterns will be blocked.

# Your Mission

Work on the brief below. Plan, implement, and verify changes.
Stop when time limit approaches or when blockers are encountered.
`;

    // Add previous run context if available (for resume runs)
    let previousContext = '';
    if (this.ctx.previousRunContext) {
      previousContext = `\n\n# Previous Run Context (Resume)\n\nThis is a resumed run. Here is context from the previous run:\n\n${this.ctx.previousRunContext}`;
    }

    return `${managerPrompt}\n\n${contextInfo}${previousContext}`;
  }

  /**
   * Run the agent loop with tool execution.
   */
  private async runAgentLoop(systemPrompt: string, brief: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Here is your brief:\n\n${brief}\n\nPlease proceed with planning and implementation.${this.librarianAutoTrigger ? '\n\n⚡ Auto-trigger: After Historian has completed, automatically delegate to Librarian for an arxiv knowledge update.' : ''}`,
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


      // Check e-stop (STOP file in repo root)
      await checkEstop(this.baseDir, this.ctx.audit);

      console.log(`\n=== Manager iteration ${iteration}/${this.maxIterations} ===`);

      try {
        const trimmedMessages = trimMessages(messages);
        const response = await withRetry(async () => {
          const stream = this.anthropic.messages.stream({
            model: 'claude-opus-4-6',
            max_tokens: 8192,
            system: systemPrompt,
            messages: trimmedMessages,
            tools: this.defineTools(),
          });

          let prefixPrinted = false;
          stream.on('text', (text) => {
            if (!prefixPrinted) {
              process.stdout.write('\n[Manager] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
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
    this.ctx.usage.recordIterations('manager', iteration, this.maxIterations);
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
      {
        name: 'read_memory_file',
        description:
          'Read the current contents of a memory file. ' +
          'Use this to verify what Librarian wrote to techniques.md instead of using bash.',
        input_schema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              enum: ['runs', 'patterns', 'errors', 'techniques'],
              description: 'Which memory file to read (without .md extension)',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'search_memory',
        description:
          'Search across all memory files (runs, patterns, errors, techniques) for a keyword. ' +
          'Returns matching entries. Use to find related patterns or research before delegating.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The keyword or phrase to search for (case-insensitive)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'delegate_to_implementer',
        description:
          'Delegate a specific coding task to the Implementer agent. Use when you have a clear, well-defined implementation task.',
        input_schema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The specific coding task for the Implementer to carry out',
            },
          },
          required: ['task'],
        },
      },
      {
        name: 'delegate_to_reviewer',
        description:
          'Delegate a review of current workspace changes to the Reviewer agent. Use before committing or when risk assessment is needed.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_researcher',
        description:
          'Delegate research and idea generation to the Researcher agent. Use at the start of a run or when exploring unknowns.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_merger',
        description:
          'Delegate the merge step to the Merger agent. Use after Reviewer has approved changes. ' +
          'First call generates a merge plan and requests user approval. ' +
          'Second call (after user writes APPROVED in answers.md) copies files and commits.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_historian',
        description:
          'Delegate run summary writing to the Historian agent. ' +
          'Call this LAST — after all other agents have finished. ' +
          'The Historian reads the run artifacts and writes to memory/runs.md (always), ' +
          'memory/errors.md (if problems occurred), and memory/patterns.md (if new patterns emerged).',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_tester',
        description:
          'Delegate independent test execution to the Tester agent. ' +
          'Call this after the Implementer has finished, before or after the Reviewer. ' +
          'The Tester discovers the test framework, runs the full suite, and writes test_report.md.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_librarian',
        description:
          'Delegate research to the Librarian agent. ' +
          'The Librarian searches arxiv and Anthropic docs for recent AI techniques ' +
          'and writes new findings to memory/techniques.md. ' +
          'Call this manually when the user requests a knowledge update.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      ...graphReadToolDefinitions(),
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
            case 'read_memory_file':
              result = await this.executeReadMemoryFile(block.input as { file: string });
              break;
            case 'search_memory':
              result = await this.executeSearchMemory(block.input as { query: string });
              break;
            case 'delegate_to_implementer':
              result = await this.delegateToImplementer(block.input as { task: string });
              break;
            case 'delegate_to_reviewer':
              result = await this.delegateToReviewer();
              break;
            case 'delegate_to_researcher':
              result = await this.delegateToResearcher();
              break;
            case 'delegate_to_merger':
              result = await this.delegateToMerger();
              break;
            case 'delegate_to_historian':
              result = await this.delegateToHistorian();
              break;
            case 'delegate_to_tester':
              result = await this.delegateToTester();
              break;
            case 'delegate_to_librarian':
              result = await this.delegateToLibrarian();
              break;
            case 'graph_query':
            case 'graph_traverse': {
              const graphCtx: GraphToolContext = {
                graphPath: path.join(this.memoryDir, 'graph.json'),
                runId: this.ctx.runid,
                agent: 'manager',
                audit: this.ctx.audit,
              };
              result = await executeGraphTool(block.name, block.input as Record<string, unknown>, graphCtx);
              break;
            }
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
      const { stdout } = await execAsync(command, {
        cwd: this.ctx.workspaceDir,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: this.ctx.policy.getLimits().bash_timeout_seconds * 1000,
      });

      // Log successful execution
      await this.ctx.manifest.addCommand(command, 0);

      return truncateToolResult(stdout);
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

      return truncateToolResult(content);
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
   * Search all memory files for a keyword.
   */
  private async executeSearchMemory(input: { query: string }): Promise<string> {
    const { query } = input;
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'search_memory',
      allowed: true,
      note: `Searching memory for: ${query}`,
    });
    return searchMemoryFiles(query, this.memoryDir);
  }

  /**
   * Read a memory file from the memory/ directory.
   */
  private async executeReadMemoryFile(input: { file: string }): Promise<string> {
    const { file } = input;
    const validFiles = ['runs', 'patterns', 'errors', 'techniques'];
    if (!validFiles.includes(file)) {
      return `Error: Invalid memory file "${file}". Must be one of: ${validFiles.join(', ')}`;
    }

    const filePath = path.join(this.memoryDir, `${file}.md`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'manager',
        tool: 'read_memory_file',
        allowed: true,
        files_touched: [filePath],
      });
      return content;
    } catch {
      return `(file not found: ${file}.md)`;
    }
  }

  /**
   * Delegate a coding task to the Implementer agent.
   */
  private async delegateToImplementer(input: { task: string }): Promise<string> {
    console.log('Delegating to Implementer agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_implementer',
      allowed: true,
      note: `Delegating task: ${input.task.slice(0, 120)}`,
    });
    const implementer = new ImplementerAgent(this.ctx, this.baseDir);
    await implementer.run(input.task);

    // Read handoff file if it exists
    const handoffPath = path.join(this.ctx.runDir, 'implementer_handoff.md');
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      const missing = validateHandoff(handoff, IMPLEMENTER_REQUIRED);
      if (missing.length > 0) {
        return `Implementer completed but handoff missing sections: ${missing.join(', ')}. Consider re-delegating.\n\n--- IMPLEMENTER HANDOFF ---\n${handoff}`;
      }
      return `Implementer agent completed.\n\n--- IMPLEMENTER HANDOFF ---\n${handoff}`;
    } catch {
      return 'Implementer agent completed successfully. (No handoff written)';
    }
  }

  /**
   * Delegate a review to the Reviewer agent.
   */
  private async delegateToReviewer(): Promise<string> {
    console.log('Delegating to Reviewer agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_reviewer',
      allowed: true,
      note: 'Delegating review to Reviewer agent',
    });
    const reviewer = new ReviewerAgent(this.ctx, this.baseDir);
    await reviewer.run();

    // Read handoff file if it exists
    const handoffPath = path.join(this.ctx.runDir, 'reviewer_handoff.md');
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      const missing = validateHandoff(handoff, REVIEWER_REQUIRED);
      if (missing.length > 0) {
        return `Reviewer completed but handoff missing sections: ${missing.join(', ')}. Consider re-delegating.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
      }
      return `Reviewer agent completed.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
    } catch {
      return 'Reviewer agent completed successfully. (No handoff written)';
    }
  }

  /**
   * Delegate research to the Researcher agent.
   */
  private async delegateToResearcher(): Promise<string> {
    console.log('Delegating to Researcher agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_researcher',
      allowed: true,
      note: 'Delegating research to Researcher agent',
    });
    const researcher = new ResearcherAgent(this.ctx, this.baseDir);
    await researcher.run();
    return 'Researcher agent completed successfully.';
  }

  /**
   * Delegate run summary writing to the Historian agent.
   */
  private async delegateToLibrarian(): Promise<string> {
    console.log('Delegating to Librarian agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_librarian',
      allowed: true,
      note: 'Delegating research to Librarian agent',
    });
    const librarian = new LibrarianAgent(this.ctx, this.baseDir);
    await librarian.run();
    return 'Librarian agent completed. New techniques may have been added to memory/techniques.md.';
  }

  private async delegateToHistorian(): Promise<string> {
    console.log('Delegating to Historian agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_historian',
      allowed: true,
      note: 'Delegating run summary to Historian agent',
    });
    const historian = new HistorianAgent(this.ctx, this.baseDir);
    await historian.run();
    return 'Historian agent completed successfully.';
  }

  /**
   * Delegate independent test execution to the Tester agent.
   */
  private async delegateToTester(): Promise<string> {
    console.log('Delegating to Tester agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_tester',
      allowed: true,
      note: 'Delegating test execution to Tester agent',
    });
    const tester = new TesterAgent(this.ctx, this.baseDir);
    try {
      return await tester.run();
    } catch (error) {
      const msg =
        `TESTER ERROR: ${error}. ` +
        `Do NOT call delegate_to_tester again — retrying will cause the same failure. ` +
        `Report test results as unavailable and proceed to the next step.`;
      console.error('Tester agent failed:', error);
      return msg;
    }
  }

  /**
   * Delegate the merge step to the Merger agent.
   */
  private async delegateToMerger(): Promise<string> {
    console.log('Delegating to Merger agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_merger',
      allowed: true,
      note: 'Delegating merge to Merger agent',
    });
    const merger = new MergerAgent(this.ctx, this.baseDir);
    return await merger.run();
  }

  /**
   * Write default artifacts at end of run.
   * Only writes a file if it hasn't already been written by a sub-agent.
   */
  private async writeDefaultArtifacts(): Promise<void> {
    // questions.md: write if missing (no blockers by default)
    await this.writeIfAbsent('questions.md', async () => {
      await this.ctx.artifacts.writeQuestions([]);
    });

    // ideas.md: write if researcher didn't already write it
    await this.writeIfAbsent('ideas.md', async () => {
      await this.ctx.artifacts.writeIdeas('# Ideas\n\n(No research was conducted this run.)');
    });

    // knowledge.md: write if missing
    await this.writeIfAbsent('knowledge.md', async () => {
      const knowledge = [
        '# Knowledge',
        '',
        '## What we learned',
        `- Manager agent completed run for: ${this.ctx.target.name}`,
        '',
        '## Assumptions',
        '- See brief.md for task description',
        '',
        '## Open questions',
        '- None',
      ].join('\n');
      await this.ctx.artifacts.writeKnowledge(knowledge);
    });

    // sources.md: write if researcher didn't already write it
    await this.writeIfAbsent(path.join('research', 'sources.md'), async () => {
      await this.ctx.artifacts.writeSources('# Research Sources\n\n(No sources collected this run.)');
    });
  }

  /**
   * Write a file only if it doesn't already exist in the run dir.
   */
  private async writeIfAbsent(relativePath: string, write: () => Promise<void>): Promise<void> {
    const fullPath = path.join(this.ctx.runDir, relativePath);
    try {
      await fs.access(fullPath);
      // File exists — skip
    } catch {
      await write();
    }
  }
}
