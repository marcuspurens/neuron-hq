import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { TargetsManager } from '../targets.js';

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
 * Interactive Brief Agent that guides users through creating structured briefs.
 * Does NOT use RunContext — operates standalone from the CLI.
 */
export class BriefAgent {
  constructor(
    private targetName: string,
    private baseDir: string,
    private rl?: readline.Interface
  ) {}

  /**
   * Run the interactive brief creation session.
   * @returns Path to the generated brief file.
   */
  async run(): Promise<string> {
    const ownRl = !this.rl;
    if (!this.rl) {
      this.rl = readline.createInterface({ input: stdin, output: stdout });
    }

    try {
      const answers = await this.askQuestions();
      const repoContext = this.getRepoContext();
      const briefContent = await this.generateBrief(answers, repoContext);
      const briefPath = this.writeBrief(answers.goal, briefContent);
      return briefPath;
    } finally {
      if (ownRl && this.rl) {
        this.rl.close();
      }
    }
  }

  private async askQuestions(): Promise<BriefAnswers> {
    const rl = this.rl!;

    const goal = await rl.question(
      'Vad vill du uppnå med den här körningen? '
    );

    console.log(
      'Hur vet du att det lyckades? (acceptanskriterier — en per rad, avsluta med tom rad)'
    );
    const criteria: string[] = [];
    let line = await rl.question('> ');
    while (line.trim() !== '') {
      criteria.push(line.trim());
      line = await rl.question('> ');
    }

    const filesInput = await rl.question(
      'Vilka filer tror du berörs? (eller tryck Enter för att låta agenten föreslå) '
    );

    const risk = await rl.question('Hur hög är risken? (low/medium/high) ');

    return {
      goal,
      criteria,
      files: filesInput.trim() || null,
      risk: normalizeRisk(risk.trim()),
    };
  }

  private getRepoContext(): string {
    const parts: string[] = [];

    try {
      const tree = execSync('find . -maxdepth 3 -type f | head -80', {
        cwd: this.baseDir,
        encoding: 'utf-8',
        timeout: 5000,
      });
      parts.push('## File tree (top 80 files)\n```\n' + tree.trim() + '\n```');
    } catch {
      parts.push('## File tree\n(could not read)');
    }

    try {
      const log = execSync('git log --oneline -5', {
        cwd: this.baseDir,
        encoding: 'utf-8',
        timeout: 5000,
      });
      parts.push('## Recent git history\n```\n' + log.trim() + '\n```');
    } catch {
      parts.push('## Recent git history\n(could not read)');
    }

    return parts.join('\n\n');
  }

  private async generateBrief(
    answers: BriefAnswers,
    repoContext: string
  ): Promise<string> {
    const systemPrompt = this.loadSystemPrompt();
    const exampleBriefs = this.loadExampleBriefs();

    const today = new Date().toISOString().slice(0, 10);
    const userMessage = `
# User Answers

**Goal:** ${answers.goal}

**Acceptance Criteria:**
${answers.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Files:** ${answers.files ?? '(none provided — please suggest based on repo structure)'}

**Risk:** ${answers.risk}

# Repository Context

**Target:** ${this.targetName}
**Date:** ${today}

${repoContext}

# Example Briefs

${exampleBriefs}

---

Please generate a complete brief in the exact format specified in your instructions.
`;

    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = message.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    return textBlock?.text ?? '';
  }

  private loadSystemPrompt(): string {
    const promptPath = join(this.baseDir, 'prompts', 'brief-agent.md');
    return readFileSync(promptPath, 'utf-8');
  }

  private loadExampleBriefs(): string {
    const briefsDir = join(this.baseDir, 'briefs');
    try {
      const files = readdirSync(briefsDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, 2);

      return files
        .map((f) => {
          const content = readFileSync(join(briefsDir, f), 'utf-8');
          return `### ${f}\n\n${content}`;
        })
        .join('\n\n---\n\n');
    } catch {
      return '(no example briefs found)';
    }
  }

  private writeBrief(goal: string, content: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const slug = generateSlug(goal).slice(0, 60);
    const filename = `${today}-${slug}.md`;
    const briefsDir = join(this.baseDir, 'briefs');

    mkdirSync(briefsDir, { recursive: true });
    const fullPath = join(briefsDir, filename);
    writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }
}

/** Normalize risk input to uppercase standard form. */
function normalizeRisk(input: string): string {
  const lower = input.toLowerCase();
  if (lower === 'low') return 'LOW';
  if (lower === 'medium' || lower === 'med') return 'MEDIUM';
  if (lower === 'high') return 'HIGH';
  return 'MEDIUM';
}

interface BriefAnswers {
  goal: string;
  criteria: string[];
  files: string | null;
  risk: string;
}

/**
 * Entry point called from CLI.
 * Resolves target, creates BriefAgent, calls run(), prints path.
 */
export async function runBriefAgent(targetName: string): Promise<void> {
  // Dynamic import to get BASE_DIR without circular dependency
  const { BASE_DIR } = await import('../../cli.js');

  const targetsManager = new TargetsManager(
    join(BASE_DIR, 'targets', 'repos.yaml')
  );
  const target = await targetsManager.getTarget(targetName);

  if (!target) {
    console.error(`Error: target '${targetName}' not found.`);
    console.error('Use "neuron target list" to see available targets.');
    process.exit(1);
  }

  const agent = new BriefAgent(targetName, BASE_DIR);
  const briefPath = await agent.run();

  console.log(`\n✅ Brief created: ${briefPath}`);
}
