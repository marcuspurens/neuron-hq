import { type RunContext } from '../run.js';
import { searchMemoryFiles, withRetry } from './agent-utils.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

type MemoryFile = 'runs' | 'patterns' | 'errors';

const MEMORY_FILE_HEADERS: Record<MemoryFile, string> = {
  runs: '# Runs — Körningshistorik\n\nKörningsdagbok för Neuron HQ. Appendas automatiskt efter varje körning av Historian-agenten.\n\n',
  patterns:
    '# Patterns — Mönster som fungerar\n\nBeprövade lösningar och arbetssätt som konsekvent ger bra resultat.\nAppendas av Historian-agenten när ny lärdom identifieras.\n\n',
  errors:
    '# Errors — Misstag och lösningar\n\nDokumenterade fel, fallgropar och hur de löstes.\nAppendas av Historian-agenten när problem identifieras.\n\n',
};

/**
 * Historian Agent - writes run summaries to memory/runs.md, patterns to memory/patterns.md,
 * and errors to memory/errors.md. Runs last in every swarm run.
 */
export class HistorianAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;
  private memoryDir: string;

  constructor(
    private ctx: RunContext,
    baseDir: string
  ) {
    this.promptPath = path.join(baseDir, 'prompts', 'historian.md');
    this.memoryDir = path.join(baseDir, 'memory');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    this.anthropic = new Anthropic({ apiKey });

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_historian ?? limits.max_iterations_per_run;
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Run the historian — reads run artifacts and writes to memory files.
   */
  async run(): Promise<void> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'historian',
      tool: 'run',
      allowed: true,
      note: 'Historian agent started',
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      await this.runAgentLoop(systemPrompt);
      console.log('Historian agent completed.');
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'historian',
        tool: 'run',
        allowed: false,
        note: `Historian agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const historianPrompt = await this.loadPrompt();

    const today = new Date().toISOString().slice(0, 10);
    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Target**: ${this.ctx.target.name}
- **Date**: ${today}
- **Run artifacts**: ${this.ctx.runDir}

# Your Task

Read the run artifacts below (brief.md, report.md, questions.md) and write to the
appropriate memory files using the write_to_memory tool.

Required:
1. Always write a run summary to \`runs\`
2. Write to \`errors\` if blockers or failures occurred
3. Write to \`patterns\` if a new pattern worth repeating emerged

Artifacts to read:
- ${path.join(this.ctx.runDir, 'brief.md')}
- ${path.join(this.ctx.runDir, 'report.md')} (may be a generic fallback — use audit.jsonl as ground truth)
- ${path.join(this.ctx.runDir, 'questions.md')}
- ${path.join(this.ctx.runDir, 'audit.jsonl')} (lists every tool call — use this to verify what actually happened)
- ${path.join(this.ctx.runDir, 'merge_summary.md')} (may not exist — skip if missing)

If the brief involved Librarian, call read_memory_file(file="techniques") to count how many entries exist and verify what was written.
`;

    return `${historianPrompt}\n\n${contextInfo}`;
  }

  private async runAgentLoop(systemPrompt: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          `Read the run artifacts and write to the appropriate memory files.\n\n` +
          `Start by reading brief.md, then report.md, then questions.md. ` +
          `Then call write_to_memory for each file that needs an entry (always "runs", ` +
          `optionally "errors" and "patterns").`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping historian loop.');
        break;
      }

      console.log(`\n=== Historian iteration ${iteration}/${this.maxIterations} ===`);

      try {
        const response = await withRetry(async () => {
          const stream = this.anthropic.messages.stream({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages,
            tools: this.defineTools(),
          });

          let prefixPrinted = false;
          stream.on('text', (text) => {
            if (!prefixPrinted) {
              process.stdout.write('\n[Historian] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'historian',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (b: Anthropic.ContentBlock) => b.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Historian finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Historian finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in historian loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Historian: max iterations reached.');
    }
    this.ctx.usage.recordIterations('historian', iteration, this.maxIterations);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'read_file',
        description: 'Read a file from the runs directory or workspace.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to read',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'read_memory_file',
        description:
          'Read the current contents of a memory file. ' +
          'Use to verify what was written (e.g. count techniques.md entries after a Librarian run).',
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
          'Use to find related entries when writing Keywords/Relaterat fields.',
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
        name: 'write_to_memory',
        description:
          'Append a formatted entry to a memory file. ' +
          'Use file="runs" for run summaries (required every run), ' +
          'file="errors" for mistakes and problems, ' +
          'file="patterns" for reusable techniques that worked well.',
        input_schema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              enum: ['runs', 'patterns', 'errors'],
              description: 'Which memory file to write to',
            },
            entry: {
              type: 'string',
              description:
                'The formatted markdown entry to append (must follow the format from the prompt)',
            },
          },
          required: ['file', 'entry'],
        },
      },
      {
        name: 'update_error_status',
        description:
          'Update the **Status:** line of an existing entry in memory/errors.md. ' +
          'Use this instead of write_to_memory when closing an existing ⚠️ entry. ' +
          'Finds the section by exact title and replaces its Status line in place. ' +
          'Do NOT use write_to_memory to create a duplicate entry.',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'The exact section title (text after ## ) of the entry to update',
            },
            new_status: {
              type: 'string',
              description:
                'The new status text, e.g. "✅ Löst — fixed in run #12 by adding withRetry()"',
            },
          },
          required: ['title', 'new_status'],
        },
      },
      {
        name: 'grep_audit',
        description:
          'Search audit.jsonl for entries matching a keyword. More efficient than read_file ' +
          'when you only need to verify that a specific agent ran or a specific tool was called. ' +
          'Returns matching JSON lines formatted one per line, truncated to 3000 chars.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Keyword to search for (case-insensitive). E.g. agent role "librarian", ' +
                'tool name "write_to_techniques", or any other term.',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        console.log(`Historian executing tool: ${block.name}`);
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'read_file':
              result = await this.executeReadFile(block.input as { path: string });
              break;
            case 'read_memory_file':
              result = await this.executeReadMemoryFile(block.input as { file: string });
              break;
            case 'search_memory':
              result = await this.executeSearchMemory(block.input as { query: string });
              break;
            case 'write_to_memory':
              result = await this.executeWriteToMemory(
                block.input as { file: MemoryFile; entry: string }
              );
              break;
            case 'update_error_status':
              result = await this.executeUpdateErrorStatus(
                block.input as { title: string; new_status: string }
              );
              break;
            case 'grep_audit':
              result = await this.executeGrepAudit(block.input as { query: string });
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

  private async executeReadFile(input: { path: string }): Promise<string> {
    const { path: filePath } = input;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.ctx.runDir, filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'historian',
        tool: 'read_file',
        allowed: true,
        files_touched: [absolutePath],
      });
      return content;
    } catch {
      return `(file not found: ${filePath})`;
    }
  }

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
        role: 'historian',
        tool: 'read_memory_file',
        allowed: true,
        files_touched: [filePath],
      });
      return content;
    } catch {
      return `(file not found: ${file}.md)`;
    }
  }

  private async executeSearchMemory(input: { query: string }): Promise<string> {
    const { query } = input;
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'historian',
      tool: 'search_memory',
      allowed: true,
      note: `Searching memory files for: ${query}`,
    });
    return await searchMemoryFiles(query, this.memoryDir);
  }

  /**
   * Append an entry to a memory file.
   * Creates the file with a header if it doesn't exist.
   */
  async executeWriteToMemory(input: { file: MemoryFile; entry: string }): Promise<string> {
    const { file, entry } = input;

    const validFiles: MemoryFile[] = ['runs', 'patterns', 'errors'];
    if (!validFiles.includes(file)) {
      return `Error: Invalid memory file "${file}". Must be one of: runs, patterns, errors`;
    }

    const filePath = path.join(this.memoryDir, `${file}.md`);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'historian',
      tool: 'write_to_memory',
      allowed: true,
      files_touched: [filePath],
      note: `Writing to memory/${file}.md for run ${this.ctx.runid}`,
    });

    try {
      await fs.mkdir(this.memoryDir, { recursive: true });

      let existing = '';
      try {
        existing = await fs.readFile(filePath, 'utf-8');
      } catch {
        existing = MEMORY_FILE_HEADERS[file];
      }

      const updated = existing.trimEnd() + '\n\n' + entry.trim() + '\n';
      await fs.writeFile(filePath, updated, 'utf-8');

      return `Entry appended to memory/${file}.md`;
    } catch (error: any) {
      return `Error writing to memory/${file}.md: ${error.message}`;
    }
  }

  /**
   * Update the **Status:** line of an existing entry in errors.md in place.
   */
  private async executeUpdateErrorStatus(input: {
    title: string;
    new_status: string;
  }): Promise<string> {
    const { title, new_status } = input;
    const filePath = path.join(this.memoryDir, 'errors.md');

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return `Error: errors.md not found`;
    }

    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRegex = new RegExp(
      `(## ${escaped}\\n[\\s\\S]*?\\*\\*Status:\\*\\*)[^\\n]*`,
      'g'
    );

    if (!sectionRegex.test(content)) {
      return `Error: Section "${title}" not found in errors.md, or it has no **Status:** line`;
    }

    const updated = content.replace(
      new RegExp(`(## ${escaped}\\n[\\s\\S]*?\\*\\*Status:\\*\\*)[^\\n]*`, 'g'),
      `$1 ${new_status}`
    );

    await fs.writeFile(filePath, updated, 'utf-8');
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'historian',
      tool: 'update_error_status',
      allowed: true,
      files_touched: [filePath],
      note: `Updated status of "${title}" to: ${new_status}`,
    });

    return `Updated status of "${title}" in errors.md`;
  }

  /**
   * Search audit.jsonl for entries matching a keyword (case-insensitive).
   */
  private async executeGrepAudit(input: { query: string }): Promise<string> {
    const { query } = input;
    const filePath = path.join(this.ctx.runDir, 'audit.jsonl');

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      return `(audit.jsonl not found in ${this.ctx.runDir})`;
    }

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'historian',
      tool: 'grep_audit',
      allowed: true,
      note: `Searching audit.jsonl for: ${query}`,
    });

    const lowerQuery = query.toLowerCase();
    const matchingLines = raw
      .split('\n')
      .filter((line) => line.trim() && line.toLowerCase().includes(lowerQuery));

    if (matchingLines.length === 0) {
      return `No entries in audit.jsonl match "${query}".`;
    }

    const result = `Found ${matchingLines.length} matching entries:\n\n` + matchingLines.join('\n');

    // Truncate to avoid context overflow
    const MAX_CHARS = 3000;
    if (result.length > MAX_CHARS) {
      return result.slice(0, MAX_CHARS) + `\n\n[... truncated, ${result.length - MAX_CHARS} chars dropped ...]`;
    }
    return result;
  }

}
