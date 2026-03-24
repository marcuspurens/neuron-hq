import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient, buildCachedSystemBlocks } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { trimMessages, truncateToolResult, withRetry } from './agent-utils.js';
import { createLogger } from '../logger.js';
import {
  graphReadToolDefinitions,
  executeGraphTool,
  type GraphToolContext,
} from './graph-tools.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('agent:code-anchor');

// ── Tool definitions ────────────────────────────────────────────────

function codeAnchorToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: 'read_file',
      description:
        'Read the contents of a file. Use this to verify code references in the brief.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to project root (e.g. src/core/agents/consolidator.ts)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'list_files',
      description:
        'List files in a directory. Use this to check if files exist.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Directory path relative to project root. Empty string or "." for root.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'bash_exec',
      description:
        'Run a bash command (read-only: grep, find, wc, head, tail, cat). ' +
        'Use this to search for function names, type definitions, imports, etc.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute. Examples: grep -rn "functionName" src/, find src -name "*.ts" -type f',
          },
        },
        required: ['command'],
      },
    },
    ...graphReadToolDefinitions(),
  ];
}

// ── Conversation persistence ────────────────────────────────────────

export interface VerificationTurn {
  role: 'verifier' | 'author';
  content: string;
  ts: string;
}

export interface VerificationConversation {
  briefFile: string;
  target: string;
  turns: VerificationTurn[];
  started: string;
  lastUpdated: string;
}

// ── Max iterations for the agent loop ───────────────────────────────

const MAX_ITERATIONS = 40;

// ── Main agent class ────────────────────────────────────────────────

/**
 * Code Anchor — verifies code references in briefs against actual code.
 *
 * Standalone agent (no RunContext needed). Uses tools to read files,
 * search code, and query the knowledge graph.
 */
export class CodeAnchor {
  private model!: string;
  private maxTokens!: number;
  private client!: Anthropic;

  constructor(
    private targetName: string,
    private baseDir: string,
  ) {}

  private async init(): Promise<void> {
    const config = resolveModelConfig('code-anchor');
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.maxTokens = maxTokens;
  }

  /**
   * Build the full system prompt.
   */
  private async buildSystemPrompt(): Promise<string> {
    const promptPath = join(this.baseDir, 'prompts', 'code-anchor.md');
    const basePrompt = readFileSync(promptPath, 'utf-8');

    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'code-anchor',
    });
    const overlayedPrompt = mergePromptWithOverlay(basePrompt, overlay);

    const today = new Date().toISOString().slice(0, 10);
    const contextSection = [
      '\n\n## Verifieringskontext\n\n',
      `Target: ${this.targetName}\nDatum: ${today}\n`,
      `Projektrot: ${this.baseDir}\n`,
    ].join('');

    return prependPreamble(this.baseDir, overlayedPrompt + contextSection);
  }

  /**
   * Execute a tool call and return the result string.
   */
  private async executeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    switch (name) {
      case 'read_file':
        return this.executeReadFile(input.path as string);
      case 'list_files':
        return this.executeListFiles(input.path as string);
      case 'bash_exec':
        return this.executeBash(input.command as string);
      case 'graph_query':
      case 'graph_traverse':
      case 'graph_semantic_search':
      case 'graph_ppr': {
        const graphCtx = this.createGraphContext();
        return executeGraphTool(name, input, graphCtx);
      }
      default:
        return `Error: Unknown tool ${name}`;
    }
  }

  private executeReadFile(filePath: string): string {
    const resolved = resolvePath(this.baseDir, filePath);

    // Safety: ensure path is within baseDir
    if (!resolved.startsWith(this.baseDir)) {
      return `Error: Path ${filePath} is outside project directory.`;
    }

    if (!existsSync(resolved)) {
      return `Error: File not found: ${filePath}`;
    }

    try {
      const content = readFileSync(resolved, 'utf-8');
      // Add line numbers for easier reference
      const numbered = content
        .split('\n')
        .map((line, i) => `${String(i + 1).padStart(4)}  ${line}`)
        .join('\n');
      return truncateToolResult(numbered);
    } catch (err) {
      return `Error reading file: ${err}`;
    }
  }

  private executeListFiles(dirPath: string): string {
    const resolved = resolvePath(this.baseDir, dirPath || '.');

    if (!resolved.startsWith(this.baseDir)) {
      return `Error: Path ${dirPath} is outside project directory.`;
    }

    if (!existsSync(resolved)) {
      return `Error: Directory not found: ${dirPath}`;
    }

    try {
      const entries = readdirSync(resolved);
      const annotated = entries.map((entry) => {
        const fullPath = join(resolved, entry);
        try {
          const stat = statSync(fullPath);
          return stat.isDirectory() ? `${entry}/` : entry;
        } catch {
          return entry;
        }
      });
      return annotated.join('\n');
    } catch (err) {
      return `Error listing directory: ${err}`;
    }
  }

  private async executeBash(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.baseDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
      });
      const output = stdout.trim();
      return truncateToolResult(output || stderr.trim() || '(no output)');
    } catch (error) {
      const e = error as { code?: number; status?: number; stderr?: string; stdout?: string; message?: string };
      const exitCode = e.code ?? e.status ?? 1;
      const output = [e.stdout || '', e.stderr || ''].filter(Boolean).join('\n').trim();
      // grep returns exit 1 on no match — that's not an error
      if (exitCode === 1 && (!output || output.length < 5)) {
        return '(no matches found)';
      }
      return output || `Command failed (exit ${exitCode}): ${e.message}`;
    }
  }

  private createGraphContext(): GraphToolContext {
    return {
      graphPath: join(this.baseDir, 'memory', 'graph.json'),
      runId: 'code-anchor',
      agent: 'code-anchor',
      audit: {
        log: async () => {
          // No-op audit for standalone agent
        },
      },
    };
  }

  /**
   * Run the agent loop: send brief, execute tools, collect report.
   */
  private async runAgentLoop(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
  ): Promise<string> {
    let lastTextResponse = '';

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      logger.info('Iteration', { iteration: String(iteration) });

      const response = await withRetry(async () => {
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: this.maxTokens,
          system: buildCachedSystemBlocks(systemPrompt),
          messages: trimMessages(messages),
          tools: codeAnchorToolDefinitions(),
        });

        // Stream text output to console
        let prefixPrinted = false;
        stream.on('text', (text) => {
          if (!prefixPrinted) {
            process.stdout.write('\n[Code Anchor] ');
            prefixPrinted = true;
          }
          process.stdout.write(text);
        });

        const msg = await stream.finalMessage();
        if (prefixPrinted) process.stdout.write('\n');
        return msg;
      });

      // Extract text content
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (textBlocks.length > 0) {
        lastTextResponse = textBlocks.map((b) => b.text).join('\n');
      }

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Check for tool calls
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        logger.info('Agent finished (no tool calls).');
        break;
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        logger.info('Executing tool', { tool: block.name });
        try {
          const result = await this.executeTool(
            block.name,
            block.input as Record<string, unknown>,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${error}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return lastTextResponse;
  }

  /**
   * Verify code references in a brief. First call starts a new conversation.
   * Subsequent calls with a conversationFile continue the dialogue.
   */
  async verify(briefContent: string, conversationFile?: string): Promise<{
    report: string;
    conversationFile: string;
  }> {
    await this.init();
    const systemPrompt = await this.buildSystemPrompt();

    // Load or create conversation
    let conversation = this.loadConversation(conversationFile);

    if (!conversation) {
      conversation = {
        briefFile: '',
        target: this.targetName,
        turns: [],
        started: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };
    }

    // Build messages from conversation history
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Verifiera kodreferenserna i denna brief mot den faktiska kodbasen:\n\n${briefContent}`,
      },
    ];

    // Add previous turns
    for (const turn of conversation.turns) {
      messages.push({
        role: turn.role === 'verifier' ? 'assistant' : 'user',
        content: turn.content,
      });
    }

    const report = await this.runAgentLoop(systemPrompt, messages);

    // Save conversation state
    conversation.turns.push({
      role: 'verifier',
      content: report,
      ts: new Date().toISOString(),
    });
    conversation.lastUpdated = new Date().toISOString();

    const savedPath = this.saveConversation(conversation, conversationFile);

    logger.info('Verification complete', {
      turns: String(conversation.turns.length),
      conversationFile: savedPath,
    });

    return { report, conversationFile: savedPath };
  }

  /**
   * Continue a verification with a response (e.g. updated brief).
   */
  async respond(
    briefContent: string,
    authorResponse: string,
    conversationFile: string,
  ): Promise<{ report: string; conversationFile: string }> {
    const conversation = this.loadConversation(conversationFile);
    if (!conversation) {
      throw new Error(`Conversation file not found: ${conversationFile}`);
    }

    conversation.turns.push({
      role: 'author',
      content: authorResponse,
      ts: new Date().toISOString(),
    });

    this.saveConversation(conversation, conversationFile);

    return this.verify(briefContent, conversationFile);
  }

  private loadConversation(filePath?: string): VerificationConversation | null {
    if (!filePath || !existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      logger.warn('Failed to parse conversation file', { filePath });
      return null;
    }
  }

  private saveConversation(
    conversation: VerificationConversation,
    existingPath?: string,
  ): string {
    const verificationsDir = join(this.baseDir, 'runs', 'verifications');
    mkdirSync(verificationsDir, { recursive: true });

    const filePath = existingPath ?? join(
      verificationsDir,
      `verification-${Date.now()}.json`,
    );
    writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
    return filePath;
  }
}

// ── CLI entry point ─────────────────────────────────────────────────

/**
 * Entry point for CLI: verify code references in a brief.
 */
export async function runBriefVerify(
  targetName: string,
  briefFile: string,
  opts: { reply?: string; conversation?: string } = {},
): Promise<void> {
  const { BASE_DIR } = await import('../../cli.js');
  const { resolve } = await import('node:path');

  const briefContent = readFileSync(resolve(briefFile), 'utf-8');
  const anchor = new CodeAnchor(targetName, BASE_DIR);

  let result;
  if (opts.reply && opts.conversation) {
    result = await anchor.respond(briefContent, opts.reply, resolve(opts.conversation));
  } else {
    result = await anchor.verify(briefContent, opts.conversation ? resolve(opts.conversation) : undefined);
  }

  console.log(result.report);
  console.log(`\n---\nVerifiering sparad: ${result.conversationFile}`);
}
