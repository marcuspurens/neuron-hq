import { type RunContext } from '../run.js';
import { withRetry } from './agent-utils.js';
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import { executeSharedBash, executeSharedReadFile, executeSharedWriteFile, executeSharedListFiles, coreToolDefinitions, type AgentToolContext } from './shared-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadPromptHierarchy, buildHierarchicalPrompt } from '../prompt-hierarchy.js';
import { loadOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import { scanDiff, formatScanReport } from '../security-scan.js';
import { extractBriefContext } from '../brief-context-extractor.js';
import { getGraphContextForBrief } from '../graph-context.js';
import { loadGraph } from '../knowledge-graph.js';
import type { NodeType } from '../knowledge-graph.js';
import { createLogger } from '../logger.js';
const logger = createLogger('agent:reviewer');

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
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;
  private baseDir: string;

  constructor(private ctx: RunContext, baseDir: string) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'reviewer.md');

    const config = resolveModelConfig('reviewer', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_reviewer ?? limits.max_iterations_per_run;
  }

  private get toolCtx(): AgentToolContext {
    return { ctx: this.ctx, agentRole: 'reviewer' };
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

      logger.info('Reviewer agent completed successfully.');
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

    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'reviewer',
    });

    const reviewerPrompt = buildHierarchicalPrompt(hierarchy, archiveSections, overlay);

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
      } catch {  /* intentional: implementer result may not exist */
        securityContext = '\n## Automated Security Scan\n\n⚠️ Could not read diff for security scan.';
      }
    }

    // Brief-based graph context: errors and patterns only
    let graphContextSection = '';
    try {
      const graphPath = path.join(this.baseDir, 'memory', 'graph.json');
      const graph = await loadGraph(graphPath);
      const briefContext = extractBriefContext(briefContent);
      // Reviewer only sees errors and patterns — filter nodeTypes
      const reviewerContext = {
        ...briefContext,
        nodeTypes: briefContext.nodeTypes.filter(t => t === 'error' || t === 'pattern') as NodeType[],
      };
      const graphResult = getGraphContextForBrief(graph, reviewerContext, {
        maxNodes: 10,
      });

      if (graphResult.nodes.length > 0) {
        const lines: string[] = [];
        lines.push('\n## Kända problem och mönster\n');
        lines.push('Dessa errors och patterns från tidigare körningar kan vara relevanta:\n');
        for (const entry of graphResult.nodes) {
          const n = entry.node;
          const prefix = n.type === 'error' ? '[E]' : '[P]';
          const desc = (n.properties.description as string) || '';
          const descShort = desc.length > 80 ? desc.substring(0, 77) + '...' : desc;
          lines.push(`- ${prefix} **${n.title}** — ${descShort}`);
        }
        graphContextSection = lines.join('\n');
      }
    } catch {  /* intentional: graph not available — skip context */
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
${handoffContent ? `\n# Implementer Handoff\n\n${handoffContent}\n` : ''}${securityContext}${graphContextSection}
# Your Mission

Review the current state of the workspace. For every acceptance criterion in the brief above,
run actual bash commands to verify whether it was delivered. Check git diff, run verifications,
assess risk (LOW/MED/HIGH), and write a STOPLIGHT report to report.md.
Block if policy is violated or verification fails.
`;

    return prependPreamble(this.baseDir, `${reviewerPrompt}\n\n${contextInfo}`);
  }

  private async loadBrief(): Promise<string> {
    const briefPath = path.join(this.ctx.runDir, 'brief.md');
    try {
      return await fs.readFile(briefPath, 'utf-8');
    } catch (err) {
      logger.error('[reviewer] writing reviewer result failed', { error: String(err) });
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
    } catch {  /* intentional: report.md may not exist yet */
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
        logger.info('Time limit reached. Stopping reviewer loop.');
        break;
      }

      logger.info('Reviewer iteration', { iteration: String(iteration), maxIterations: String(this.maxIterations) });

      try {
        const response = await withRetry(async () => {
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
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
            logger.info('Reviewer finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          logger.info('Reviewer finished (no tool calls).');
          break;
        }
      } catch (error) {
        logger.error('Error in reviewer loop', { error: String(error) });
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.info('Reviewer: max iterations reached.');
    }
    this.ctx.usage.recordIterations('reviewer', iteration, this.maxIterations);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      ...coreToolDefinitions({
        bash: 'Execute a bash command. Use for git diff, git log, git status, and running tests/checks.',
        readFile: 'Read the contents of a file.',
        writeFile: 'Write content to a file. Use to write report.md and questions.md to the runs directory.',
        listFiles: 'List files in a directory.',
      }),
      ...graphReadToolDefinitions(),
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        logger.info('Reviewer executing tool', { tool: block.name });
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'bash_exec':
              result = await executeSharedBash(this.toolCtx, (block.input as { command: string }).command);
              break;
            case 'read_file':
              result = await executeSharedReadFile(this.toolCtx, (block.input as { path: string }).path);
              break;
            case 'write_file': {
              const writeInput = block.input as { path: string; content: string };
              result = await executeSharedWriteFile(this.toolCtx, writeInput.path, writeInput.content, this.ctx.workspaceDir);
              break;
            }
            case 'list_files':
              result = await executeSharedListFiles(this.toolCtx, (block.input as { path?: string }).path);
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
}
