/**
 * transcript-saver.ts — Saves full agent conversation transcripts to disk.
 *
 * AI Act compliance: Art. 12 (logging), Art. 13 (transparency).
 * Every agent's complete conversation is preserved for audit and analysis.
 *
 * Non-fatal: all errors are caught and logged, never thrown.
 */
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createLogger } from './logger.js';

const logger = createLogger('transcript');

/**
 * Save a full agent conversation transcript to runs/<runid>/transcripts/<agent>.jsonl
 *
 * Each line is a JSON object with: { role, content, ts }
 * Content is preserved as-is (string or ContentBlock array) for full fidelity.
 */
export async function saveTranscript(
  runDir: string,
  agent: string,
  messages: Anthropic.MessageParam[],
): Promise<void> {
  try {
    if (!messages || messages.length === 0) {
      logger.info('No messages to save', { agent });
      return;
    }

    const dir = path.join(runDir, 'transcripts');
    await fs.mkdir(dir, { recursive: true });

    const ts = new Date().toISOString();
    const lines: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      lines.push(JSON.stringify({
        turn: i,
        role: msg.role,
        content: msg.content,
        ts,
      }));
    }

    const filePath = path.join(dir, `${agent}.jsonl`);
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

    logger.info('Transcript saved', {
      agent,
      turns: String(messages.length),
      path: filePath,
    });
  } catch (err) {
    logger.error('Failed to save transcript', { agent, error: String(err) });
  }
}
