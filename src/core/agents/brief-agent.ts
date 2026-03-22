import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient, buildCachedSystemBlocks } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TargetsManager } from '../targets.js';
import { trimMessages, withRetry } from './agent-utils.js';
import { createLogger } from '../logger.js';
import { buildRepoContext, loadExampleBriefs } from './brief-context.js';
const logger = createLogger('agent:brief');

/**
 * Generate a URL-safe slug from a text string.
 * Handles Swedish characters (ä→a, ö→o, å→a) and special chars.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Interactive Brief Agent that guides users through creating structured briefs
 * via a streaming conversational chat loop.
 */
export class BriefAgent {
  private briefModel!: string;
  private briefMaxTokens!: number;

  constructor(
    private targetName: string,
    private baseDir: string,
    private rl?: readline.Interface
  ) {}

  /**
   * Run the interactive brief creation chat session.
   * @returns Path to the generated brief file.
   */
  async run(): Promise<string> {
    const ownRl = !this.rl;
    if (!this.rl) {
      this.rl = readline.createInterface({ input: stdin, output: stdout });
    }

    try {
      const config = resolveModelConfig('brief-agent');
      const { client: anthropic, model: briefModel, maxTokens: briefMaxTokens } = createAgentClient(config);
      this.briefModel = briefModel;
      this.briefMaxTokens = briefMaxTokens;
      const systemPrompt = readFileSync(join(this.baseDir, 'prompts', 'brief-agent.md'), 'utf-8');
      const overlay = await loadOverlay(this.baseDir, {
        model: this.briefModel,
        role: 'brief-agent',
      });
      const overlayedSystemPrompt = mergePromptWithOverlay(systemPrompt, overlay);
      const repoContext = buildRepoContext(this.baseDir);
      const exampleBriefs = loadExampleBriefs(this.baseDir);
      const today = new Date().toISOString().slice(0, 10);

      const assembledPrompt = [
        overlayedSystemPrompt,
        '\n\n## Repository Context\n\n',
        `Target: ${this.targetName}\nDate: ${today}\n\n`,
        repoContext,
        '\n\n## Example Briefs\n\n',
        exampleBriefs,
      ].join('');
      const fullSystemPrompt = await prependPreamble(this.baseDir, assembledPrompt);

      const messages: Anthropic.MessageParam[] = [];

      // Initial greeting from Claude
      const openingMsg = 'Hej! Jag vill skapa en ny brief.';
      const greeting = await this.streamResponse(
        anthropic,
        fullSystemPrompt,
        [{ role: 'user', content: openingMsg }]
      );
      messages.push({ role: 'user', content: openingMsg });
      messages.push({ role: 'assistant', content: greeting });

      const MAX_TURNS = 30;
      let briefPath = '';

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const userInput = await this.rl!.question('\n> ');
        if (!userInput.trim()) continue;

        messages.push({ role: 'user', content: userInput });

        const response = await this.streamResponse(
          anthropic,
          fullSystemPrompt,
          messages
        );
        messages.push({ role: 'assistant', content: response });

        if (response.includes('✅ Brief created:')) {
          briefPath = this.extractAndSaveBrief(response);
          break;
        }
      }

      return briefPath;
    } finally {
      if (ownRl && this.rl) {
        this.rl.close();
      }
    }
  }

  /**
   * Stream a response from the Anthropic API, printing tokens as they arrive.
   * Follows the same pattern as manager.ts.
   */
  private async streamResponse(
    anthropic: Anthropic,
    systemPrompt: string,
    messages: Anthropic.MessageParam[]
  ): Promise<string> {
    const trimmedMessages = trimMessages(messages);
    const response = await withRetry(async () => {
      const stream = anthropic.messages.stream({
        model: this.briefModel,
        max_tokens: this.briefMaxTokens,
        system: buildCachedSystemBlocks(systemPrompt),
        messages: trimmedMessages,
      });

      let prefixPrinted = false;
      stream.on('text', (text) => {
        if (!prefixPrinted) {
          process.stdout.write('\n[Brief Agent] ');
          prefixPrinted = true;
        }
        process.stdout.write(text);
      });

      const msg = await stream.finalMessage();
      if (prefixPrinted) process.stdout.write('\n');
      return msg;
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    return textBlock?.text ?? '';
  }

  /**
   * Extract brief content from Claude's response and save it to disk.
   */
  private extractAndSaveBrief(response: string): string {
    const briefMatch = response.match(
      /(# Brief[\s\S]*?)(?=\n✅ Brief created:|$)/
    );
    const briefContent = briefMatch ? briefMatch[1].trim() : response;

    const titleMatch = briefContent.match(/# Brief — (.+)/);
    const title = titleMatch ? titleMatch[1] : 'untitled';
    const slug = generateSlug(title).slice(0, 60);

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${today}-${slug}.md`;
    const briefsDir = join(this.baseDir, 'briefs');
    mkdirSync(briefsDir, { recursive: true });
    const fullPath = join(briefsDir, filename);
    writeFileSync(fullPath, briefContent, 'utf-8');

    return fullPath;
  }
}

/**
 * Entry point called from CLI.
 * Resolves target, creates BriefAgent, calls run(), prints path.
 */
export async function runBriefAgent(targetName: string): Promise<void> {
  const { BASE_DIR } = await import('../../cli.js');

  const targetsManager = new TargetsManager(
    join(BASE_DIR, 'targets', 'repos.yaml')
  );
  const target = await targetsManager.getTarget(targetName);

  if (!target) {
    logger.error('Target not found', { target: targetName });
    logger.error('Use "neuron target list" to see available targets.');
    process.exit(1);
  }

  const agent = new BriefAgent(targetName, BASE_DIR);
  const briefPath = await agent.run();

  if (briefPath) {
    logger.info('Brief created', { path: briefPath });
  }
}
