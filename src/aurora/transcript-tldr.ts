import path from 'path';
import fs from 'fs/promises';
import type Anthropic from '@anthropic-ai/sdk';
import { ensureOllama, getOllamaUrl } from '../core/ollama.js';
import { getConfig } from '../core/config.js';
import { createAgentClient } from '../core/agent-client.js';
import { AURORA_MODELS, AURORA_TOKENS } from './llm-defaults.js';
import { DEFAULT_MODEL_CONFIG } from '../core/model-registry.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:transcript-tldr');

export interface TldrOptions {
  model?: 'ollama' | 'claude';
  ollamaModel?: string;
}

export interface TldrResult {
  tldr: string;
  modelUsed: string;
}

let _systemPrompt: string | null = null;
async function getSystemPrompt(): Promise<string> {
  if (!_systemPrompt) {
    const p = path.resolve(import.meta.dirname ?? '.', '../../prompts/transcript-tldr.md');
    _systemPrompt = await fs.readFile(p, 'utf-8');
  }
  return _systemPrompt;
}

const MAX_TRANSCRIPT_CHARS = 8000;

export async function generateTldr(
  transcriptText: string,
  context: { title: string; channelName?: string },
  options?: TldrOptions,
): Promise<TldrResult> {
  const truncated = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS);

  let userMessage = `Title: ${context.title}`;
  if (context.channelName) {
    userMessage += `\nChannel: ${context.channelName}`;
  }
  userMessage += `\n\nTranscript:\n${truncated}`;

  const backend = options?.model ?? 'ollama';

  if (backend === 'claude') {
    return callClaude(userMessage);
  }
  return callOllama(userMessage, options?.ollamaModel);
}

async function callOllama(
  userMessage: string,
  ollamaModel?: string,
): Promise<TldrResult> {
  const model = ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;
  await ensureOllama(model);

  const baseUrl = getOllamaUrl();
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: await getSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      think: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama chat failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const content = (data.message?.content ?? '').trim();

  logger.info('Generated tldr', { model, length: content.length });
  return { tldr: content, modelUsed: model };
}

async function callClaude(userMessage: string): Promise<TldrResult> {
  const config = {
    ...DEFAULT_MODEL_CONFIG,
    model: AURORA_MODELS.fast,
    maxTokens: AURORA_TOKENS.short,
  };

  const { client, model } = createAgentClient(config);

  const response = await client.messages.create({
    model,
    max_tokens: AURORA_TOKENS.short,
    system: await getSystemPrompt(),
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  logger.info('Generated tldr', { model, length: content.length });
  return { tldr: content.trim(), modelUsed: model };
}
