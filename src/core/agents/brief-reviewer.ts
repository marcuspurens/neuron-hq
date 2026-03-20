import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { trimMessages, withRetry } from './agent-utils.js';
import { createLogger } from '../logger.js';
import { buildRepoContext, loadExampleBriefs } from './brief-context.js';

const logger = createLogger('agent:brief-reviewer');

/**
 * A single turn in a review conversation.
 */
export interface ReviewTurn {
  role: 'reviewer' | 'author';
  content: string;
  ts: string;
}

/**
 * Persisted review conversation state.
 */
export interface ReviewConversation {
  briefFile: string;
  target: string;
  turns: ReviewTurn[];
  started: string;
  lastUpdated: string;
}

/**
 * Non-interactive brief reviewer. Uses a dedicated reviewer prompt to
 * critically evaluate briefs. Supports multi-turn dialogue via persisted
 * conversation state.
 */
export class BriefReviewer {
  private model!: string;
  private maxTokens!: number;
  private client!: Anthropic;

  constructor(
    private targetName: string,
    private baseDir: string
  ) {}

  /**
   * Initialize the API client and model config.
   */
  private async init(): Promise<void> {
    const config = resolveModelConfig('brief-agent');
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.maxTokens = maxTokens;
  }

  /**
   * Build the full system prompt including repo context and example briefs.
   */
  private async buildSystemPrompt(): Promise<string> {
    const promptPath = join(this.baseDir, 'prompts', 'brief-reviewer.md');
    const basePrompt = readFileSync(promptPath, 'utf-8');

    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'brief-reviewer',
    });
    const overlayedPrompt = mergePromptWithOverlay(basePrompt, overlay);

    const repoContext = buildRepoContext(this.baseDir);
    const examples = loadExampleBriefs(this.baseDir);
    const today = new Date().toISOString().slice(0, 10);

    return [
      overlayedPrompt,
      '\n\n## Repository Context\n\n',
      `Target: ${this.targetName}\nDate: ${today}\n\n`,
      repoContext,
      '\n\n## Example Briefs (for reference)\n\n',
      examples,
    ].join('');
  }

  /**
   * Send a message and get a response (non-streaming).
   */
  private async sendMessage(
    systemPrompt: string,
    messages: Anthropic.MessageParam[]
  ): Promise<string> {
    const trimmedMessages = trimMessages(messages);
    const response = await withRetry(async () => {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: trimmedMessages,
      });
      return stream.finalMessage();
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    return textBlock?.text ?? '';
  }

  /**
   * Review a brief. First call starts a new conversation.
   * Subsequent calls with a reply continue the dialogue.
   */
  async review(briefContent: string, conversationFile?: string): Promise<{
    feedback: string;
    conversationFile: string;
  }> {
    await this.init();
    const systemPrompt = await this.buildSystemPrompt();

    // Load or create conversation
    let conversation = this.loadConversation(conversationFile);
    const isNewConversation = !conversation;

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
        content: `Granska denna brief:\n\n${briefContent}`,
      },
    ];

    // Add previous turns as continued dialogue
    for (const turn of conversation.turns) {
      messages.push({
        role: turn.role === 'reviewer' ? 'assistant' : 'user',
        content: turn.content,
      });
    }

    const feedback = await this.sendMessage(systemPrompt, messages);

    // Save conversation state
    conversation.turns.push({
      role: 'reviewer',
      content: feedback,
      ts: new Date().toISOString(),
    });
    conversation.lastUpdated = new Date().toISOString();

    const savedPath = this.saveConversation(conversation, conversationFile);

    logger.info('Review complete', {
      turns: conversation.turns.length,
      conversationFile: savedPath,
      isNewConversation,
    });

    return { feedback, conversationFile: savedPath };
  }

  /**
   * Continue a review conversation with a response from the author.
   */
  async respond(
    briefContent: string,
    authorResponse: string,
    conversationFile: string
  ): Promise<{ feedback: string; conversationFile: string }> {
    const conversation = this.loadConversation(conversationFile);
    if (!conversation) {
      throw new Error(`Conversation file not found: ${conversationFile}`);
    }

    // Add the author's response
    conversation.turns.push({
      role: 'author',
      content: authorResponse,
      ts: new Date().toISOString(),
    });

    // Save and then run review with updated conversation
    this.saveConversation(conversation, conversationFile);

    return this.review(briefContent, conversationFile);
  }

  /**
   * Load a persisted conversation from disk.
   */
  private loadConversation(filePath?: string): ReviewConversation | null {
    if (!filePath || !existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      logger.warn('Failed to parse conversation file', { filePath });
      return null;
    }
  }

  /**
   * Save conversation state to disk. Returns the file path.
   */
  private saveConversation(
    conversation: ReviewConversation,
    existingPath?: string
  ): string {
    const reviewsDir = join(this.baseDir, 'runs', 'reviews');
    mkdirSync(reviewsDir, { recursive: true });

    const filePath = existingPath ?? join(
      reviewsDir,
      `review-${Date.now()}.json`
    );
    writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
    return filePath;
  }
}

/**
 * Entry point for CLI: review a brief file.
 */
export async function runBriefReview(
  targetName: string,
  briefFile: string,
  opts: { reply?: string; conversation?: string } = {}
): Promise<void> {
  const { BASE_DIR } = await import('../../cli.js');
  const { resolve } = await import('node:path');

  const briefContent = readFileSync(resolve(briefFile), 'utf-8');
  const reviewer = new BriefReviewer(targetName, BASE_DIR);

  let result;
  if (opts.reply && opts.conversation) {
    result = await reviewer.respond(briefContent, opts.reply, resolve(opts.conversation));
  } else {
    result = await reviewer.review(briefContent, opts.conversation ? resolve(opts.conversation) : undefined);
  }

  console.log(result.feedback);
  console.log(`\n---\nKonversation sparad: ${result.conversationFile}`);
}
