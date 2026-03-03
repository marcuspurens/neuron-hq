import { type RunContext, checkEstop } from '../run.js';
import { ImplementerAgent } from './implementer.js';
import { ReviewerAgent } from './reviewer.js';
import { ResearcherAgent } from './researcher.js';
import { MergerAgent } from './merger.js';
import { HistorianAgent } from './historian.js';
import { TesterAgent } from './tester.js';
import { LibrarianAgent } from './librarian.js';
import { ConsolidatorAgent } from './consolidator.js';
import { truncateToolResult, trimMessages, searchMemoryFiles, withRetry } from './agent-utils.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectTestStatus } from '../baseline.js';
import { validateHandoff, IMPLEMENTER_REQUIRED, REVIEWER_REQUIRED } from '../verification-gate.js';
import { validateTaskPlan, type TaskPlan } from '../task-splitter.js';
import { taskBranchName, type TaskBranchStatus } from '../parallel-coordinator.js';
import { GitOperations } from '../git.js';
import { loadPromptHierarchy, buildHierarchicalPrompt } from '../prompt-hierarchy.js';
import { loadOverlay } from '../prompt-overlays.js';
import {
  ImplementerResultSchema,
  ReviewerResultSchema,
  type ImplementerResult,
  type ReviewerResult,
} from '../messages.js';

const execAsync = promisify(exec);

/**
 * Manager Agent - orchestrates the swarm using Anthropic SDK.
 */
export class ManagerAgent {
  private promptPath: string;
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;

  private baseDir: string;
  private memoryDir: string;
  private librarianAutoTrigger: boolean;
  private consolidationAutoTrigger: boolean;
  private testStatus: { testsExist: boolean; testFramework: string | null } | null = null;

  constructor(private ctx: RunContext, baseDir: string, librarianAutoTrigger = false, consolidationAutoTrigger = false) {
    this.baseDir = baseDir;
    this.librarianAutoTrigger = librarianAutoTrigger;
    this.consolidationAutoTrigger = consolidationAutoTrigger;
    this.promptPath = path.join(baseDir, 'prompts', 'manager.md');
    this.memoryDir = path.join(baseDir, 'memory');

    // Initialize Anthropic client
    const config = resolveModelConfig('manager', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

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
    const hierarchy = await loadPromptHierarchy(this.promptPath);

    // Decide which archive sections to include based on context
    const archiveSections: string[] = [];

    // Always include task-planning and knowledge-graph in early iterations
    archiveSections.push('task-planning', 'knowledge-graph');

    // Include after-researcher (small, useful)
    archiveSections.push('after-researcher');

    // Include auto-trigger sections (small, conditional logic is in the prompt text itself)
    archiveSections.push('auto-librarian', 'auto-meta');

    // Include parallel execution instructions
    archiveSections.push('parallel-tasks');

    // Include no-tests if baseline says so
    if (this.testStatus && !this.testStatus.testsExist) {
      archiveSections.push('no-tests');
    }

    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'manager',
    });

    const managerPrompt = buildHierarchicalPrompt(hierarchy, archiveSections, overlay);

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
        content: `Here is your brief:\n\n${brief}\n\nPlease proceed with planning and implementation.${this.librarianAutoTrigger ? '\n\n⚡ Auto-trigger: After Historian has completed, automatically delegate to Librarian for an arxiv knowledge update.' : ''}${this.consolidationAutoTrigger ? '\n\n⚡ Consolidation-trigger: After Historian completes, delegate to Consolidator for knowledge graph consolidation before Librarian.' : ''}`,
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
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
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
        name: 'delegate_parallel_wave',
        description: 'Delegate a wave of independent tasks to parallel Implementers. Each runs on its own git branch. Uses Promise.allSettled() so failures in one task do not affect others. Input: array of task objects with id, description, and files.',
        input_schema: {
          type: 'object',
          properties: {
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  description: { type: 'string' },
                  files: { type: 'array', items: { type: 'string' } },
                },
                required: ['id', 'description'],
              },
              description: 'Array of independent tasks to run in parallel',
            },
            wave_index: {
              type: 'number',
              description: 'Wave number (for logging)',
            },
          },
          required: ['tasks'],
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
      {
        name: 'delegate_to_consolidator',
        description:
          'Delegate knowledge graph consolidation to the Consolidator agent. ' +
          'The Consolidator merges duplicate nodes, strengthens connections, ' +
          'identifies knowledge gaps, and archives stale nodes. ' +
          'Runs after Historian, before Librarian.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'write_task_plan',
        description: 'Write a structured task plan to task_plan.md in the run directory. Call this BEFORE delegating to Implementer.',
        input_schema: {
          type: 'object' as const,
          properties: {
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  description: { type: 'string' },
                  files: { type: 'array', items: { type: 'string' } },
                  passCriterion: { type: 'string' },
                  dependsOn: { type: 'array', items: { type: 'string' } },
                },
                required: ['id', 'description', 'files', 'passCriterion'],
              },
            },
          },
          required: ['tasks'],
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
            case 'delegate_parallel_wave':
              result = await this.delegateParallelWave(
                block.input as { tasks: Array<{ id: string; description: string; files?: string[] }>; wave_index?: number }
              );
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
            case 'delegate_to_consolidator':
              result = await this.delegateToConsolidator();
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
            case 'write_task_plan':
              result = await this.executeWriteTaskPlan(block.input as { tasks: Array<{ id: string; description: string; files: string[]; passCriterion: string; dependsOn?: string[] }> });
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
   * Write a structured task plan to the run directory.
   */
  private async executeWriteTaskPlan(input: { tasks: Array<{ id: string; description: string; files: string[]; passCriterion: string; dependsOn?: string[] }> }): Promise<string> {
    const plan: TaskPlan = { tasks: input.tasks };
    const errors = validateTaskPlan(plan);

    if (errors.length > 0) {
      return `Task plan validation failed:\n${errors.map(e => `- ${e}`).join('\n')}`;
    }

    // Build markdown
    const lines: string[] = ['# Task Plan\n'];
    for (const task of plan.tasks) {
      const deps = task.dependsOn?.length ? ` (depends on: ${task.dependsOn.join(', ')})` : '';
      lines.push(`## ${task.id}: ${task.description}${deps}\n`);
      lines.push(`- **Files**: ${task.files.join(', ')}`);
      lines.push(`- **Pass criterion**: ${task.passCriterion}`);
      lines.push('- **Status**: ⏳ pending\n');
    }

    const content = lines.join('\n');
    const planPath = path.join(this.ctx.runDir, 'task_plan.md');

    await fs.mkdir(path.dirname(planPath), { recursive: true });
    await fs.writeFile(planPath, content, 'utf-8');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'write_task_plan',
      allowed: true,
      note: `Task plan written with ${plan.tasks.length} tasks`,
    });

    return `Task plan written to task_plan.md with ${plan.tasks.length} tasks:\n${plan.tasks.map(t => `- ${t.id}: ${t.description}`).join('\n')}`;
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

    // Try to read structured JSON result first
    let structuredResult: ImplementerResult | null = null;
    const jsonPath = path.join(this.ctx.runDir, 'implementer_result.json');
    try {
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const parsed = ImplementerResultSchema.safeParse(JSON.parse(jsonContent));
      if (parsed.success) {
        structuredResult = parsed.data;
        await this.ctx.audit.log({
          ts: new Date().toISOString(),
          role: 'manager',
          tool: 'agent_message',
          allowed: true,
          note: JSON.stringify({
            event: 'agent_message',
            from: 'implementer',
            to: 'manager',
            payload_type: 'ImplementerResult',
            confidence: parsed.data.confidence,
          }),
        });
      }
    } catch {
      // No JSON result file — fallback to markdown handoff
    }

    // Read markdown handoff (always — for human readability)
    const handoffPath = path.join(this.ctx.runDir, 'implementer_handoff.md');
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      const missing = validateHandoff(handoff, IMPLEMENTER_REQUIRED);
      
      let result: string;
      if (missing.length > 0) {
        result = `Implementer completed but handoff missing sections: ${missing.join(', ')}. Consider re-delegating.\n\n--- IMPLEMENTER HANDOFF ---\n${handoff}`;
      } else {
        result = `Implementer agent completed.\n\n--- IMPLEMENTER HANDOFF ---\n${handoff}`;
      }
      
      // Append structured result summary if available
      if (structuredResult) {
        result += `\n\n--- STRUCTURED RESULT ---\nConfidence: ${structuredResult.confidence}\nFiles modified: ${structuredResult.filesModified.length}\nRisks: ${structuredResult.risks.length}\nTests passing: ${structuredResult.testsPassing}`;
      }
      
      return result;
    } catch {
      if (structuredResult) {
        return `Implementer agent completed.\n\n--- STRUCTURED RESULT ---\nConfidence: ${structuredResult.confidence}\nFiles modified: ${structuredResult.filesModified.length}\nRisks: ${structuredResult.risks.length}\nTests passing: ${structuredResult.testsPassing}`;
      }
      return 'Implementer agent completed successfully. (No handoff written)';
    }
  }

  /**
   * Delegates a wave of independent tasks to parallel Implementers.
   * Each Implementer works on its own branch.
   * Uses Promise.allSettled() — if one fails, others continue.
   */
  private async delegateParallelWave(
    input: { tasks: Array<{ id: string; description: string; files?: string[] }>; wave_index?: number }
  ): Promise<string> {
    const { tasks, wave_index = 0 } = input;

    console.log(`Delegating parallel wave ${wave_index} with ${tasks.length} tasks...`);
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_parallel_wave',
      allowed: true,
      note: `Wave ${wave_index}: ${tasks.map(t => t.id).join(', ')}`,
    });

    const git = new GitOperations(this.ctx.workspaceDir);

    // Enforce max_parallel_implementers limit
    const maxParallel = this.ctx.policy.getLimits().max_parallel_implementers ?? 3;

    // Process tasks in chunks respecting the limit
    const allStatuses: TaskBranchStatus[] = [];

    for (let chunkStart = 0; chunkStart < tasks.length; chunkStart += maxParallel) {
      const chunk = tasks.slice(chunkStart, chunkStart + maxParallel);

    // Create worktrees and run implementers in true parallel
    const promises = chunk.map(async (task) => {
      const branchName = taskBranchName(this.ctx.runid, task.id);
      const worktreePath = `${this.ctx.workspaceDir}-task-${task.id}`;
      const status: TaskBranchStatus = {
        taskId: task.id,
        branch: branchName,
        status: 'pending',
        filesModified: [],
      };

      try {
        // Create isolated worktree with its own branch
        await git.addWorktree(worktreePath, branchName);
        status.status = 'running';

        // Create per-task context with isolated workspace
        const taskCtx: RunContext = { ...this.ctx, workspaceDir: worktreePath };

        // Run implementer in isolated worktree
        const implementer = new ImplementerAgent(taskCtx, this.baseDir);
        await implementer.run(task.description, { taskId: task.id, branchName });

        status.status = 'completed';
        status.testsPassing = true;

        // Read handoff if exists
        try {
          const handoffPath = path.join(this.ctx.runDir, `task_${task.id}_handoff.json`);
          const handoffData = JSON.parse(await fs.readFile(handoffPath, 'utf-8'));
          status.filesModified = handoffData.filesModified ?? [];
        } catch {
          // No handoff file
        }
      } catch (error: unknown) {
        status.status = 'failed';
        status.error = error instanceof Error ? error.message : String(error);
      }

      // Clean up worktree
      try {
        await git.removeWorktree(worktreePath);
      } catch {
        // Best effort — worktree may not exist if addWorktree failed
      }

      return status;
    });

    // Wait for all tasks in this chunk to complete (allSettled ensures all run)
    const results = await Promise.allSettled(promises);

    // Collect results for this chunk
    const chunkStatuses: TaskBranchStatus[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        taskId: chunk[i].id,
        branch: taskBranchName(this.ctx.runid, chunk[i].id),
        status: 'failed' as const,
        filesModified: [],
        error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
      };
    });

    allStatuses.push(...chunkStatuses);
    } // end chunk loop

    // Build summary
    const statuses = allStatuses;
    const completed = statuses.filter(s => s.status === 'completed');
    const failed = statuses.filter(s => s.status === 'failed');

    let summary = `--- PARALLEL WAVE ${wave_index} RESULTS ---\n`;
    summary += `Total: ${tasks.length} | Completed: ${completed.length} | Failed: ${failed.length}\n\n`;

    for (const s of statuses) {
      summary += `- ${s.taskId} [${s.status}]`;
      if (s.branch) summary += ` branch: ${s.branch}`;
      if (s.filesModified.length > 0) summary += ` files: ${s.filesModified.join(', ')}`;
      if (s.error) summary += ` error: ${s.error}`;
      summary += '\n';
    }

    return summary;
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

    // Try to read structured JSON result first
    let structuredResult: ReviewerResult | null = null;
    const jsonPath = path.join(this.ctx.runDir, 'reviewer_result.json');
    try {
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const parsed = ReviewerResultSchema.safeParse(JSON.parse(jsonContent));
      if (parsed.success) {
        structuredResult = parsed.data;
        await this.ctx.audit.log({
          ts: new Date().toISOString(),
          role: 'manager',
          tool: 'agent_message',
          allowed: true,
          note: JSON.stringify({
            event: 'agent_message',
            from: 'reviewer',
            to: 'manager',
            payload_type: 'ReviewerResult',
            verdict: parsed.data.verdict,
          }),
        });
      }
    } catch {
      // No JSON result file — fallback to markdown handoff
    }

    // Read markdown handoff
    const handoffPath = path.join(this.ctx.runDir, 'reviewer_handoff.md');
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      const missing = validateHandoff(handoff, REVIEWER_REQUIRED);
      
      let result: string;
      if (missing.length > 0) {
        result = `Reviewer completed but handoff missing sections: ${missing.join(', ')}. Consider re-delegating.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
      } else {
        result = `Reviewer agent completed.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
      }
      
      // Append structured result summary if available
      if (structuredResult) {
        result += `\n\n--- STRUCTURED RESULT ---\nVerdict: ${structuredResult.verdict}\nTests: ${structuredResult.testsPassing}/${structuredResult.testsRun}\nBlockers: ${structuredResult.blockers.length}\nSuggestions: ${structuredResult.suggestions.length}`;
      }
      
      return result;
    } catch {
      if (structuredResult) {
        return `Reviewer agent completed.\n\n--- STRUCTURED RESULT ---\nVerdict: ${structuredResult.verdict}\nTests: ${structuredResult.testsPassing}/${structuredResult.testsRun}\nBlockers: ${structuredResult.blockers.length}\nSuggestions: ${structuredResult.suggestions.length}`;
      }
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

  private async delegateToConsolidator(): Promise<string> {
    console.log('Delegating to Consolidator agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_consolidator',
      allowed: true,
      note: 'Delegating graph consolidation to Consolidator agent',
    });
    const consolidator = new ConsolidatorAgent(this.ctx, this.baseDir);
    await consolidator.run();
    return 'Consolidator agent completed. Check consolidation_report.md for details.';
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
