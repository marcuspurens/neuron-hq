import { type RunContext, checkEstop } from '../run.js';
import { saveTranscript } from '../transcript-saver.js';
import { ImplementerAgent } from './implementer.js';
import { ReviewerAgent } from './reviewer.js';
import { ResearcherAgent } from './researcher.js';
import { MergerAgent } from './merger.js';
import { TesterAgent } from './tester.js';
import { LibrarianAgent } from './librarian.js';
import { trimMessages, searchMemoryFiles, withRetry } from './agent-utils.js';
import { executeSharedBash, executeSharedReadFile, executeSharedWriteFile, executeSharedListFiles, coreToolDefinitions, type AgentToolContext } from './shared-tools.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient, buildCachedSystemBlocks } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { detectTestStatus } from '../baseline.js';
import { validateHandoff, IMPLEMENTER_REQUIRED, REVIEWER_REQUIRED } from '../verification-gate.js';
import { validateTaskPlan, type TaskPlan } from '../task-splitter.js';
import { taskBranchName, type TaskBranchStatus } from '../parallel-coordinator.js';
import { GitOperations } from '../git.js';
import { loadPromptHierarchy, buildHierarchicalPrompt } from '../prompt-hierarchy.js';
import { loadOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import {
  ImplementerResultSchema,
  ReviewerResultSchema,
  type ImplementerResult,
  type ReviewerResult,
} from '../messages.js';
import { generateAdaptiveHints } from './adaptive-hints.js';
import { getBeliefs, classifyBrief } from '../run-statistics.js';
import { eventBus } from '../event-bus.js';
import { extractThinking } from '../thinking-extractor.js';
import { extractDecisions } from '../decision-extractor.js';
import { emergencySave } from '../emergency-save.js';
import { createLogger } from '../logger.js';
import { loadGraph, rankIdeas } from '../knowledge-graph.js';
import { extractBriefContext } from '../brief-context-extractor.js';
import { getGraphContextForBrief, formatGraphContextForManager } from '../graph-context.js';
const logger = createLogger('agent:manager');


/**
 * Pure function — appends the diff limit to a task description.
 * Always injects the diff limit so it's explicit to Implementer.
 * @param taskDescription - The task string
 * @param maxDiffLines - Optional per-task override. Default 150.
 */
export function buildTaskString(taskDescription: string, maxDiffLines?: number): string {
  const limit = maxDiffLines ?? 150;
  return `${taskDescription}\nDiff limit for this task: ${limit} lines.`;
}

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
  private testStatus: { testsExist: boolean; testFramework: string | null } | null = null;
  private _emittedDecisionIds = new Set<string>();
  private _accumulatedThinking = '';
  private _graphContextLog: {
    managerNodes: number;
    reviewerNodes: number;
    patterns: number;
    errors: number;
    ideas: number;
    keywords: string[];
    pprCount: number;
  } | null = null;

  constructor(private ctx: RunContext, baseDir: string, librarianAutoTrigger = false) {
    this.baseDir = baseDir;
    this.librarianAutoTrigger = librarianAutoTrigger;
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

  /** Shared-tool context for this agent. */
  private get toolCtx(): AgentToolContext {
    return { ctx: this.ctx, agentRole: 'manager' };
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

      logger.info('Manager agent completed successfully.');
    } catch (error) {
      logger.error('Manager agent error', { error: String(error) });

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
    logger.info('Running baseline verification...');

    // Discover and run verification commands
    const commands = await this.ctx.verifier.discoverCommands();
    const result = await this.ctx.verifier.verify(commands);
    const baselineMarkdown = this.ctx.verifier.formatMarkdown(result);

    await this.ctx.artifacts.writeBaseline(baselineMarkdown);

    // Detect test status
    this.testStatus = await detectTestStatus(this.ctx.workspaceDir);

    logger.info('Baseline verification complete.');
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


    // Adaptive performance hints from run statistics
    let adaptiveSection = '';
    try {
      const beliefs = await getBeliefs();
      if (beliefs.length > 0) {
        const briefPath = path.join(this.ctx.runDir, 'brief.md');
        const briefType = await classifyBrief(briefPath);
        const hints = generateAdaptiveHints(beliefs, briefType);
        adaptiveSection = hints.promptSection;

        // Log hints to audit
        await this.ctx.audit.log({
          ts: new Date().toISOString(),
          role: 'manager',
          tool: 'adaptive_hints',
          allowed: true,
          note: `Generated ${hints.warnings.length} warnings, ${hints.strengths.length} strengths`,
        });
      }
    } catch {  /* intentional: DB not available — skip adaptive hints */
      // DB not available or other error — skip adaptive hints (graceful degradation)
    }

    // Brief-based graph context (replaces static top-5 ideas)
    let graphSection = '';
    try {
      const graphPath = path.join(this.baseDir, 'memory', 'graph.json');
      const graph = await loadGraph(graphPath);
      const briefContent = await this.ctx.artifacts.readBrief();
      const briefContext = extractBriefContext(briefContent);
      const graphResult = getGraphContextForBrief(graph, briefContext);

      // Store graph context info for logging
      this._graphContextLog = {
        managerNodes: graphResult.nodes.length,
        reviewerNodes: 0,  // Will be set by reviewer separately
        patterns: graphResult.nodes.filter(n => n.node.type === 'pattern').length,
        errors: graphResult.nodes.filter(n => n.node.type === 'error').length,
        ideas: graphResult.nodes.filter(n => n.node.type === 'idea').length,
        keywords: briefContext.keywords.slice(0, 10),
        pprCount: graphResult.nodes.filter(n => n.source === 'ppr').length,
      };
      
      const totalNodes = graphResult.nodes.length;
      
      if (totalNodes >= 3) {
        // Enough brief-specific context — use it exclusively
        graphSection = formatGraphContextForManager(graphResult);
      } else if (totalNodes > 0) {
        // 1-2 nodes: supplement with top-5 ideas
        const topIdeas = rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] });
        graphSection = formatGraphContextForManager(graphResult, topIdeas);
      } else {
        // 0 nodes: fallback to top-5 ideas (existing behavior)
        const topIdeas = rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] });
        if (topIdeas.length > 0) {
          graphSection = formatGraphContextForManager({ nodes: [], summary: 'Inga relevanta noder hittades.' }, topIdeas);
        }
        // If no ideas either → graphSection stays empty (AC14: omit section entirely)
      }
    } catch {  /* intentional: graph not available — skip graph section */
    }

    return prependPreamble(this.baseDir, `${managerPrompt}\n\n${contextInfo}${previousContext}${adaptiveSection}${graphSection}`);
  }

  /**
   * Run the agent loop with tool execution.
   */
  private async runAgentLoop(systemPrompt: string, brief: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Here is your brief:\n\n${brief}\n\nPlease proceed with planning and implementation.${this.librarianAutoTrigger ? '\n\n⚡ Auto-trigger: After Historian has completed, automatically delegate to Researcher for an arxiv knowledge update.' : ''}`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      // Check time limit
      if (new Date() > this.ctx.endTime) {
        logger.info('Time limit reached. Stopping agent loop.');
        const elapsed = Date.now() - this.ctx.startTime.getTime();
        const total = this.ctx.endTime.getTime() - this.ctx.startTime.getTime();
        eventBus.safeEmit('time', {
          runid: this.ctx.runid,
          elapsed,
          remaining: Math.max(0, total - elapsed),
          percent: Math.min(100, Math.round((elapsed / total) * 100)),
        });
        break;
      }


      // Check e-stop (STOP file in repo root)
      await checkEstop(this.baseDir, this.ctx.audit);

      logger.info('Manager iteration', { iteration: String(iteration), maxIterations: String(this.maxIterations) });
      eventBus.safeEmit('iteration', {
        runid: this.ctx.runid,
        agent: 'manager',
        current: iteration,
        max: this.maxIterations,
      });

      try {
        const trimmedMessages = trimMessages(messages);
        const response = await withRetry(async () => {
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
            system: buildCachedSystemBlocks(systemPrompt),
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
            eventBus.safeEmit('agent:text', { runid: this.ctx.runid, agent: 'manager', text });
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');

          // Extract thinking (extended thinking / reasoning) if available
          const thinking = extractThinking(msg, 'anthropic');
          if (thinking) {
            eventBus.safeEmit('agent:thinking', {
              runid: this.ctx.runid,
              agent: 'manager',
              text: thinking.text,
            });
          }

          // Live decision extraction from thinking
          if (thinking) {
            this._accumulatedThinking += '\n' + thinking.text;
            this._emitLiveDecisions();
          }

          return msg;
        });

        // Track token usage (including cache metrics)
        this.ctx.usage.recordTokens(
          'manager',
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_creation_input_tokens ?? 0,
          response.usage.cache_read_input_tokens ?? 0,
        );
        eventBus.safeEmit('tokens', {
          runid: this.ctx.runid,
          agent: 'manager',
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        });

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
            logger.info('Agent finished (no more tool calls).');
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
          logger.info('Agent finished (no tool calls).');
          break;
        }

      } catch (error) {
        logger.error('Error in agent loop', { error: String(error) });
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.info('Max iterations reached.');
      // Emergency save: preserve uncommitted work
      await emergencySave({
        agentName: 'manager',
        iteration,
        maxIterations: this.maxIterations,
        workspaceDir: this.ctx.workspaceDir,
        runDir: this.ctx.runDir,
        runid: this.ctx.runid,
        audit: this.ctx.audit,
      });
    }
    this.ctx.usage.recordIterations('manager', iteration, this.maxIterations);
    await saveTranscript(this.ctx.runDir, 'manager', messages);
  }

  /**
   * Extract decisions from accumulated thinking text and emit new ones.
   * Uses a Set to avoid emitting duplicates.
   */
  private _emitLiveDecisions(): void {
    try {
      const decisions = extractDecisions(
        this._accumulatedThinking,
        [], // audit entries not needed for thinking-based extraction
        [], // agent events not needed here
        this.ctx.runid,
        'manager',
      );
      for (const d of decisions) {
        if (!this._emittedDecisionIds.has(d.id)) {
          this._emittedDecisionIds.add(d.id);
          eventBus.safeEmit('decision', {
            runid: this.ctx.runid,
            agent: d.agent,
            decision: d,
          });
        }
      }
    } catch {  /* intentional: non-fatal decision extraction failure */
      // Non-fatal - decision extraction failure should never break the run
    }
  }

  /**
   * Define tools available to the agent.
   */
  private defineTools(): Anthropic.Tool[] {
    return [
      ...coreToolDefinitions(),
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
            maxDiffLines: {
              type: 'number',
              description: 'Optional: the per-task diff limit for this task (from TaskPlan). If omitted, defaults to 150.',
            },
            maxDiffJustification: {
              type: 'string',
              description: 'Optional: justification for the override. Required when maxDiffLines is set.',
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
          'Delegate a review of current workspace changes to the Reviewer agent. ' +
          'Call AFTER Tester — Reviewer reads test_report.md to focus review on untested areas. ' +
          'Use before committing or when risk assessment is needed.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_researcher',
        description:
          'Delegate external research to the Researcher agent. ' +
          'The Researcher searches arxiv and documentation for recent AI techniques ' +
          'and writes new findings to memory/techniques.md. ' +
          'Call this on milestone runs or when the user requests a knowledge update.',
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
        name: 'delegate_to_tester',
        description:
          'Delegate independent test execution to the Tester agent. ' +
          'Call this after the Implementer has finished, BEFORE the Reviewer. ' +
          'The Tester runs tests, classifies failures (code/environment/infrastructure), ' +
          'compares against baseline, and writes test_report.md with diagnostic analysis. ' +
          'Reviewer should run AFTER Tester so it can use the test report.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delegate_to_librarian',
        description:
          'Delegate per-run research to the Librarian agent. ' +
          'The Librarian searches the codebase, memory, and web for run-relevant insights ' +
          'and writes research_brief.md. ' +
          'Use at the start of a run or when exploring unknowns.',
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
                  maxDiffLines: {
                    type: 'number',
                    description: "Optional: Override the warn-level diff limit for this task. Must be > 0. Requires maxDiffJustification.",
                  },
                  maxDiffJustification: {
                    type: 'string',
                    description: "Required if maxDiffLines is set. Must be at least 10 characters. Valid: 'mechanical renames', 'test-only additions'. Invalid: 'complex' or 'need more space'.",
                  },
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
        logger.info('Executing tool', { tool: block.name });

        // Track tool call
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
            case 'read_memory_file':
              result = await this.executeReadMemoryFile(block.input as { file: string });
              break;
            case 'search_memory':
              result = await this.executeSearchMemory(block.input as { query: string });
              break;
            case 'delegate_to_implementer':
              result = await this.delegateToImplementer(block.input as { task: string; maxDiffLines?: number; maxDiffJustification?: string });
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
            case 'write_task_plan':
              result = await this.executeWriteTaskPlan(block.input as {
                tasks: Array<{
                  id: string;
                  description: string;
                  files: string[];
                  passCriterion: string;
                  dependsOn?: string[];
                  maxDiffLines?: number;
                  maxDiffJustification?: string;
                }>
              });
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
   * Write a structured task plan to the run directory.
   */
  private async executeWriteTaskPlan(input: { tasks: Array<{ id: string; description: string; files: string[]; passCriterion: string; dependsOn?: string[]; maxDiffLines?: number; maxDiffJustification?: string }> }): Promise<string> {
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


    eventBus.safeEmit('task:plan', {
      runid: this.ctx.runid,
      tasks: plan.tasks.map(t => ({ id: t.id, description: t.description })),
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
    } catch {  /* intentional: memory file not found */
      return `(file not found: ${file}.md)`;
    }
  }

  /**
   * Delegate a coding task to the Implementer agent.
   */
  private async delegateToImplementer(input: { task: string; maxDiffLines?: number; maxDiffJustification?: string }): Promise<string> {
    // maxDiffLines from TaskPlan maps to overrideWarnLines in policy.checkDiffSize()
    // — both mean "per-task WARN threshold override". BLOCK threshold is always 300 (diff_block_lines).
    const taskString = buildTaskString(input.task, input.maxDiffLines);

    logger.info('Delegating to Implementer agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_implementer',
      allowed: true,
      note: `Delegating task: ${input.task.slice(0, 120)}`,
    });

    // Audit-log override if maxDiffLines is set
    if (input.maxDiffLines !== undefined) {
      const blockLimit = this.ctx.policy.getLimits().diff_block_lines;
      const effectiveLimit = Math.min(input.maxDiffLines, blockLimit);
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'manager',
        tool: 'delegate_to_implementer',
        allowed: true,
        note: JSON.stringify({
          event: 'diff_override_set',
          task: input.task.slice(0, 120),
          default_limit: 150,
          override_limit: input.maxDiffLines,
          effective_limit: effectiveLimit,
          justification: input.maxDiffJustification ?? '(not provided)',
        }),
      });
    }

    eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'implementer', task: taskString.slice(0, 200) });
    const implementer = new ImplementerAgent(this.ctx, this.baseDir);
    await implementer.run(taskString);

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
    } catch {  /* intentional: no JSON result file */
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
      
      eventBus.safeEmit('agent:end', { runid: this.ctx.runid, agent: 'implementer' });
      this._emitLiveDecisions();
      return result;
    } catch {  /* intentional: handoff file not readable */
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

    logger.info('Delegating parallel wave', { waveIndex: String(wave_index), taskCount: String(tasks.length) });
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
        eventBus.safeEmit('task:status', { runid: this.ctx.runid, taskId: task.id, status: 'running', description: task.description, branch: branchName });

        // Create per-task context with isolated workspace
        const taskCtx: RunContext = { ...this.ctx, workspaceDir: worktreePath };

        // Run implementer in isolated worktree
        const implementer = new ImplementerAgent(taskCtx, this.baseDir);
        await implementer.run(task.description, { taskId: task.id, branchName });

        status.status = 'completed';
        eventBus.safeEmit('task:status', { runid: this.ctx.runid, taskId: task.id, status: 'completed', description: task.description, branch: branchName });
        status.testsPassing = true;

        // Read handoff if exists
        try {
          const handoffPath = path.join(this.ctx.runDir, `task_${task.id}_handoff.json`);
          const handoffData = JSON.parse(await fs.readFile(handoffPath, 'utf-8'));
          status.filesModified = handoffData.filesModified ?? [];
        } catch {  /* intentional: no handoff file */
          // No handoff file
        }
      } catch (error: unknown) {
        status.status = 'failed';
        eventBus.safeEmit('task:status', { runid: this.ctx.runid, taskId: task.id, status: 'failed', description: task.description, branch: branchName });
        status.error = error instanceof Error ? error.message : String(error);
      }

      // Clean up worktree
      try {
        await git.removeWorktree(worktreePath);
      } catch {  /* intentional: best-effort worktree cleanup */
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
    logger.info('Delegating to Reviewer agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_reviewer',
      allowed: true,
      note: 'Delegating review to Reviewer agent',
    });
    eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'reviewer' });
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
        if (parsed.data.findings?.length) {
          const severityCounts = { BLOCK: 0, SUGGEST: 0, NOTE: 0 };
          for (const f of parsed.data.findings) {
            severityCounts[f.severity]++;
          }
          await this.ctx.audit.log({
            ts: new Date().toISOString(),
            role: 'manager',
            tool: 'agent_message',
            allowed: true,
            note: JSON.stringify({
              event: 'agent_message',
              payload_type: 'ReviewerFindings',
              counts: severityCounts,
              blockFindings: parsed.data.findings.filter(f => f.severity === 'BLOCK').map(f => f.id),
            }),
          });
        }
      }
    } catch {  /* intentional: no JSON result file */
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
        let resultSuffix = `\n\n--- STRUCTURED RESULT ---\nVerdict: ${structuredResult.verdict}\nTests: ${structuredResult.testsPassing}/${structuredResult.testsRun}\nBlockers: ${structuredResult.blockers.length}\nSuggestions: ${structuredResult.suggestions.length}`;
        if (structuredResult.findings?.length) {
          resultSuffix += `\n\n--- FINDINGS ---`;
          for (const f of structuredResult.findings) {
            resultSuffix += `\n[${f.severity}] ${f.id}: ${f.description}`;
            if (f.file) resultSuffix += ` (${f.file}${f.line ? ':' + f.line : ''})`;
          }
        }
        result += resultSuffix;
      }
      
      if (structuredResult?.verdict) {
        const stoplightMap: Record<string, 'GREEN' | 'YELLOW' | 'RED'> = { GREEN: 'GREEN', YELLOW: 'YELLOW', RED: 'RED' };
        if (stoplightMap[structuredResult.verdict]) {
          eventBus.safeEmit('stoplight', { runid: this.ctx.runid, status: stoplightMap[structuredResult.verdict] });
        }
      }
      eventBus.safeEmit('agent:end', { runid: this.ctx.runid, agent: 'reviewer' });
      this._emitLiveDecisions();
      return result;
    } catch {  /* intentional: handoff file not readable */
      if (structuredResult) {
        let resultSuffix = `\n\n--- STRUCTURED RESULT ---\nVerdict: ${structuredResult.verdict}\nTests: ${structuredResult.testsPassing}/${structuredResult.testsRun}\nBlockers: ${structuredResult.blockers.length}\nSuggestions: ${structuredResult.suggestions.length}`;
        if (structuredResult.findings?.length) {
          resultSuffix += `\n\n--- FINDINGS ---`;
          for (const f of structuredResult.findings) {
            resultSuffix += `\n[${f.severity}] ${f.id}: ${f.description}`;
            if (f.file) resultSuffix += ` (${f.file}${f.line ? ':' + f.line : ''})`;
          }
        }
        return `Reviewer agent completed.${resultSuffix}`;
      }
      return 'Reviewer agent completed successfully. (No handoff written)';
    }
  }

  /**
   * Delegate external research (arxiv, papers) to the Researcher agent.
   */
  private async delegateToResearcher(): Promise<string> {
    logger.info('Delegating to Researcher agent (external research, arxiv)...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_researcher',
      allowed: true,
      note: 'Delegating external research (arxiv, techniques) to Researcher agent',
    });
    eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'researcher' });
    const researcher = new ResearcherAgent(this.ctx, this.baseDir);
    await researcher.run();
    eventBus.safeEmit('agent:end', { runid: this.ctx.runid, agent: 'researcher' });
    this._emitLiveDecisions();
    return 'Researcher agent completed. New techniques may have been added to memory/techniques.md.';
  }

  /**
   * Delegate per-run research (codebase, memory, web) to the Librarian agent.
   */
  private async delegateToLibrarian(): Promise<string> {
    logger.info('Delegating to Librarian agent (per-run research)...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_librarian',
      allowed: true,
      note: 'Delegating per-run research to Librarian agent',
    });
    eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'librarian' });
    const librarian = new LibrarianAgent(this.ctx, this.baseDir);
    await librarian.run();
    eventBus.safeEmit('agent:end', { runid: this.ctx.runid, agent: 'librarian' });
    return 'Librarian agent completed. See research_brief.md in runs directory.';
  }

  /**
   * Delegate independent test execution to the Tester agent.
   */
  private async delegateToTester(): Promise<string> {
    logger.info('Delegating to Tester agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_tester',
      allowed: true,
      note: 'Delegating test execution to Tester agent',
    });
    eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'tester' });
    const tester = new TesterAgent(this.ctx, this.baseDir);
    try {
      const testerResult = await tester.run();
      eventBus.safeEmit('agent:end', { runid: this.ctx.runid, agent: 'tester' });
      return testerResult;
    } catch (error) {
      const msg =
        `TESTER ERROR: ${error}. ` +
        `Do NOT call delegate_to_tester again — retrying will cause the same failure. ` +
        `Report test results as unavailable and proceed to the next step.`;
      logger.error('Tester agent failed', { error: String(error) });
      return msg;
    }
  }

  /**
   * Delegate the merge step to the Merger agent.
   */
  private async delegateToMerger(): Promise<string> {
    logger.info('Delegating to Merger agent...');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'delegate_to_merger',
      allowed: true,
      note: 'Delegating merge to Merger agent',
    });
    eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'merger' });
    const merger = new MergerAgent(this.ctx, this.baseDir);
    const mergerResult = await merger.run();
    eventBus.safeEmit('agent:end', { runid: this.ctx.runid, agent: 'merger' });
    return mergerResult;
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

    // Append graph context log to knowledge.md (AC19, AC20)
    try {
      const log = this._graphContextLog;
      const logLines = [
        '## Grafkontext injicerad',
        '',
      ];
      if (log) {
        logLines.push(`- **Manager:** ${log.managerNodes} noder injicerade (${log.patterns} patterns, ${log.errors} errors, ${log.ideas} idéer)`);
        logLines.push(`- **Keyword-matchade:** ${log.keywords.length > 0 ? log.keywords.join(', ') : '(inga)'}`);
        logLines.push(`- **PPR-expanderade:** ${log.pprCount} noder via PPR från keyword-seeds`);
      } else {
        logLines.push('- **Manager:** 0 noder injicerade (graf ej tillgänglig)');
      }
      await this.ctx.artifacts.appendKnowledge(logLines.join('\n'));
    } catch {  /* intentional: non-critical — do not fail the run if logging fails */
    }

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
    } catch {  /* intentional: file may not exist */
      await write();
    }
  }
}
