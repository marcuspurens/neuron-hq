import { type RunContext } from '../run.js';
import { withRetry } from './agent-utils.js';
import { executeSharedBash, executeSharedReadFile, executeSharedWriteFile, executeSharedListFiles, coreToolDefinitions, type AgentToolContext } from './shared-tools.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient, buildCachedSystemBlocks } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import { createLogger } from '../logger.js';
const logger = createLogger('agent:tester');

/**
 * Tester Agent - independently runs the test suite and reports results.
 * Has no knowledge of what the Implementer did — pure quality gate.
 */
export class TesterAgent {
  private promptPath: string;
  private baseDir: string;
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;

  constructor(private ctx: RunContext, baseDir: string) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'tester.md');

    const config = resolveModelConfig('tester', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_tester ?? limits.max_iterations_per_run;
  }

  /** Shared tool context for the tester agent. */
  private get toolCtx(): AgentToolContext {
    return { ctx: this.ctx, agentRole: 'tester' };
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
      logger.info('Tester agent completed.');
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
    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'tester',
    });
    const overlayedPrompt = mergePromptWithOverlay(testerPrompt, overlay);

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

    return prependPreamble(this.baseDir, `${overlayedPrompt}\n\n${contextInfo}`);
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
        logger.info('Time limit reached. Stopping tester loop.');
        break;
      }

      logger.info('Tester iteration', { iteration: String(iteration), maxIterations: String(this.maxIterations) });

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
              process.stdout.write('\n[Tester] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'tester',
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_creation_input_tokens ?? 0,
          response.usage.cache_read_input_tokens ?? 0,
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
            logger.info('Tester finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          logger.info('Tester finished (no tool calls).');
          break;
        }
      } catch (error) {
        logger.error('Error in tester loop', { error: String(error) });
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.info('Tester: max iterations reached.');
    }

    this.ctx.usage.recordIterations('tester', iteration, this.maxIterations);
    return lastVerdict;
  }

  private defineTools(): Anthropic.Tool[] {
    return coreToolDefinitions({
      bash: 'Execute a bash command in the workspace. Use to run tests (pytest, npm test, etc.) and inspect files.',
      readFile: 'Read a file from the workspace (e.g. package.json, pyproject.toml).',
      writeFile: 'Write test_report.md to the runs directory.',
      listFiles: 'List files in a directory to discover test framework.',
    });
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        logger.info('Tester executing tool', { tool: block.name });
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'bash_exec':
              result = await executeSharedBash(this.toolCtx, (block.input as { command: string }).command, { includeStderr: true });
              break;
            case 'read_file':
              result = await executeSharedReadFile(this.toolCtx, (block.input as { path: string }).path);
              break;
            case 'write_file': {
              const writeInput = block.input as { path: string; content: string };
              result = await executeSharedWriteFile(this.toolCtx, writeInput.path, writeInput.content, this.ctx.runDir);
              break;
            }
            case 'list_files':
              result = await executeSharedListFiles(this.toolCtx, (block.input as { path?: string }).path);
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
}
