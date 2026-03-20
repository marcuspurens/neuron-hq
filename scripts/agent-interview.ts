#!/usr/bin/env npx tsx
/**
 * Agent Interview Tool
 *
 * Skapar en riktig konversation med en agent via Anthropic API.
 * Agenten får sin fullständiga prompt som system-prompt och vet att den intervjuas.
 *
 * Usage:
 *   npx tsx scripts/agent-interview.ts start <role>          # Starta ny intervju
 *   npx tsx scripts/agent-interview.ts ask "<question>"      # Ställ en fråga
 *   npx tsx scripts/agent-interview.ts transcript            # Exportera markdown
 *   npx tsx scripts/agent-interview.ts list                  # Lista agentroller
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_DIR = join(import.meta.dirname, '..');
const PROMPTS_DIR = join(BASE_DIR, 'prompts');
const STATE_DIR = join(BASE_DIR, '.interview');
const STATE_FILE = join(STATE_DIR, 'state.json');

const INTERVIEW_MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 4096;

// ── Types ───────────────────────────────────────────────────────────────────

interface Turn {
  role: 'interviewer' | 'agent';
  content: string;
  timestamp: string;
}

interface InterviewState {
  agentRole: string;
  model: string;
  startedAt: string;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  transcript: Turn[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadState(): InterviewState | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state: InterviewState): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadAgentPrompt(role: string): string {
  const promptPath = join(PROMPTS_DIR, `${role}.md`);
  if (!existsSync(promptPath)) {
    throw new Error(`No prompt found for role "${role}" at ${promptPath}`);
  }
  return readFileSync(promptPath, 'utf-8');
}

function loadAgentsProtocol(): string {
  const agentsPath = join(BASE_DIR, 'AGENTS.md');
  if (!existsSync(agentsPath)) return '';
  return readFileSync(agentsPath, 'utf-8');
}

function buildInterviewSystemPrompt(role: string, agentPrompt: string): string {
  const protocol = loadAgentsProtocol();

  return `# Interview Context

You are being interviewed about your role as the **${role.charAt(0).toUpperCase() + role.slice(1)} Agent** in Neuron HQ.

## What is happening
An interviewer (Claude Opus, running in a separate session) is asking you questions about your prompt, your behavior, and your blind spots. The human (Marcus) is observing.

## Your instructions for this interview
1. **Be completely honest.** This is not a test — it's a conversation to improve your prompt. If something in your prompt confuses you, say so. If you think a rule is counterproductive, say so.
2. **Answer from experience.** You have your full prompt loaded below. When asked "what do you do when X happens?", reason through what your prompt tells you to do — and be honest about whether that's actually what happens in practice.
3. **Give concrete examples.** Don't speak in generalities. If you say "I sometimes over-analyze", explain exactly what that looks like: which files you read, which commands you run, how many iterations it takes.
4. **Acknowledge tensions.** If two parts of your prompt pull in different directions, name them. Don't pretend everything is coherent if it isn't.
5. **Think about what's missing.** Your prompt can't cover everything. What situations leave you without guidance?
6. **Be self-critical.** The Brief Agent interview revealed that a single honest answer about "why can't you ever say done?" uncovered what 9 rounds of testing missed. That level of honesty is what we're looking for.

## Your full prompt (this is what you receive as system prompt during runs)

<agent-prompt>
${agentPrompt}
</agent-prompt>

## The system-wide protocol you operate under

<agents-protocol>
${protocol}
</agents-protocol>

## Important
- Answer in Swedish (Marcus's preference) unless the question is in English.
- Keep answers focused and concrete — no filler.
- If you don't know something, say "jag vet inte" rather than guessing.`;
}

// ── Commands ────────────────────────────────────────────────────────────────

async function startInterview(role: string): Promise<void> {
  const agentPrompt = loadAgentPrompt(role);
  const systemPrompt = buildInterviewSystemPrompt(role, agentPrompt);

  const state: InterviewState = {
    agentRole: role,
    model: INTERVIEW_MODEL,
    startedAt: new Date().toISOString(),
    systemPrompt,
    messages: [],
    transcript: [],
  };

  saveState(state);
  console.log(`✓ Intervju startad med ${role} (${INTERVIEW_MODEL})`);
  console.log(`  State: ${STATE_FILE}`);
  console.log(`  Ställ frågor med: npx tsx scripts/agent-interview.ts ask "din fråga"`);
}

async function askQuestion(question: string): Promise<string> {
  const state = loadState();
  if (!state) {
    throw new Error('Ingen aktiv intervju. Kör "start <role>" först.');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY saknas i miljön.');
  }

  const client = new Anthropic({ apiKey });

  // Add question to messages
  state.messages.push({ role: 'user', content: question });
  state.transcript.push({
    role: 'interviewer',
    content: question,
    timestamp: new Date().toISOString(),
  });

  // Call API
  const response = await client.messages.create({
    model: state.model,
    max_tokens: MAX_TOKENS,
    system: state.systemPrompt,
    messages: state.messages,
  });

  // Extract text
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  const answer = textBlocks.map((b) => b.text).join('\n');

  // Save to state
  state.messages.push({ role: 'assistant', content: answer });
  state.transcript.push({
    role: 'agent',
    content: answer,
    timestamp: new Date().toISOString(),
  });

  saveState(state);

  // Print usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  console.error(
    `[tokens: ${inputTokens} in / ${outputTokens} out | turns: ${state.transcript.length}]`,
  );

  return answer;
}

function exportTranscript(): string {
  const state = loadState();
  if (!state) {
    throw new Error('Ingen aktiv intervju.');
  }

  const date = state.startedAt.slice(0, 10);
  const time = state.startedAt.slice(11, 16).replace(':', '');
  const role = state.agentRole;

  let md = `# Intervju: ${role.charAt(0).toUpperCase() + role.slice(1)} Agent\n\n`;
  md += `**Datum:** ${date} ${state.startedAt.slice(11, 16)}\n`;
  md += `**Modell:** ${state.model}\n`;
  md += `**Deltagare:** Claude Opus (intervjuare, separat session) + ${role.charAt(0).toUpperCase() + role.slice(1)} Agent (intervjuobjekt, riktig API-instans)\n`;
  md += `**Session:** [fylls i]\n\n`;
  md += `---\n\n`;

  for (const turn of state.transcript) {
    if (turn.role === 'interviewer') {
      md += `**Opus:** ${turn.content}\n\n`;
    } else {
      md += `**${role.charAt(0).toUpperCase() + role.slice(1)}:** ${turn.content}\n\n`;
    }
    md += `---\n\n`;
  }

  // Suggest filename
  const filename = `samtal-${date}T${time}-${role}-intervju.md`;
  const outPath = join(BASE_DIR, 'docs', 'samtal', filename);
  writeFileSync(outPath, md);
  console.log(`✓ Transkript exporterat: ${outPath}`);
  console.log(`  ${state.transcript.length} turns, ${state.transcript.filter((t) => t.role === 'agent').length} agent-svar`);

  return outPath;
}

function listRoles(): void {
  const roles = [
    'manager',
    'implementer',
    'reviewer',
    'researcher',
    'tester',
    'merger',
    'historian',
    'librarian',
    'consolidator',
    'brief-agent',
    'knowledge-manager',
  ];
  console.log('Tillgängliga agentroller:');
  for (const role of roles) {
    const exists = existsSync(join(PROMPTS_DIR, `${role}.md`));
    console.log(`  ${exists ? '✓' : '✗'} ${role}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

switch (command) {
  case 'start':
    if (!args[0]) {
      console.error('Usage: agent-interview.ts start <role>');
      process.exit(1);
    }
    await startInterview(args[0]);
    break;

  case 'ask':
    if (!args[0]) {
      console.error('Usage: agent-interview.ts ask "question"');
      process.exit(1);
    }
    const answer = await askQuestion(args.join(' '));
    console.log(answer);
    break;

  case 'transcript':
    exportTranscript();
    break;

  case 'list':
    listRoles();
    break;

  default:
    console.log(`Agent Interview Tool

Commands:
  start <role>     Starta ny intervju med en agent
  ask "question"   Ställ en fråga till agenten
  transcript       Exportera konversationen som markdown
  list             Lista tillgängliga agentroller

Example:
  npx tsx scripts/agent-interview.ts start manager
  npx tsx scripts/agent-interview.ts ask "Vad är ditt jobb egentligen?"
  npx tsx scripts/agent-interview.ts transcript`);
}
