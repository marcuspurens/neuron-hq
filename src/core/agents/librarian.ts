import { type RunContext } from '../run.js';
import { withRetry } from './agent-utils.js';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const FETCH_MAX_BYTES = 50_000;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Librarian Agent - searches arxiv and Anthropic docs for recent AI research,
 * then writes structured entries to memory/techniques.md.
 * Triggered manually via delegate_to_librarian in the Manager.
 */
export class LibrarianAgent {
  private promptPath: string;
  private anthropic: Anthropic;
  private maxIterations: number;
  private memoryDir: string;

  constructor(
    private ctx: RunContext,
    baseDir: string
  ) {
    this.promptPath = path.join(baseDir, 'prompts', 'librarian.md');
    this.memoryDir = path.join(baseDir, 'memory');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    this.anthropic = new Anthropic({ apiKey });

    this.maxIterations = ctx.policy.getLimits().max_iterations_per_run;
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Run the librarian — searches for recent research and updates techniques.md.
   */
  async run(): Promise<void> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'librarian',
      tool: 'run',
      allowed: true,
      note: 'Librarian agent started',
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      await this.runAgentLoop(systemPrompt);
      console.log('Librarian agent completed.');
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'librarian',
        tool: 'run',
        allowed: false,
        note: `Librarian agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const librarianPrompt = await this.loadPrompt();

    const today = new Date().toISOString().slice(0, 10);
    const contextInfo = `
# Run Context

- **Run ID**: ${this.ctx.runid}
- **Date**: ${today}
- **Memory directory**: ${this.memoryDir}

# Your Task

Search arxiv for recent papers on AI agent memory and autonomous software development.
Write new findings to memory/techniques.md. Check the existing file first to avoid duplicates.
`;

    return `${librarianPrompt}\n\n${contextInfo}`;
  }

  private async runAgentLoop(systemPrompt: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          `Search arxiv for recent papers on agent memory and autonomous coding. ` +
          `First read the current memory/techniques.md to check what's already there. ` +
          `Then search for new papers and write entries for any that aren't already documented.`,
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        console.log('Time limit reached. Stopping librarian loop.');
        break;
      }

      console.log(`\n=== Librarian iteration ${iteration}/${this.maxIterations} ===`);

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
              process.stdout.write('\n[Librarian] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'librarian',
          response.usage.input_tokens,
          response.usage.output_tokens
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (b: Anthropic.ContentBlock) => b.type === 'tool_use'
          );
          if (!hasToolUse) {
            console.log('Librarian finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          console.log('Librarian finished (no tool calls).');
          break;
        }
      } catch (error) {
        console.error('Error in librarian loop:', error);
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      console.log('Librarian: max iterations reached.');
    }
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      {
        name: 'fetch_url',
        description:
          'Fetch content from a URL (e.g. arxiv API). Returns plain text, truncated at 50 000 chars. ' +
          'Use for arxiv API queries: https://export.arxiv.org/api/query?search_query=<topic>&max_results=5',
        input_schema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'read_memory_file',
        description: 'Read the current contents of a memory file (techniques, runs, patterns, or errors).',
        input_schema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              enum: ['techniques', 'runs', 'patterns', 'errors'],
              description: 'Which memory file to read',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'write_to_techniques',
        description:
          'Append a formatted entry to memory/techniques.md. ' +
          'Call this once per new paper or technique that is not already documented.',
        input_schema: {
          type: 'object',
          properties: {
            entry: {
              type: 'string',
              description: 'The formatted markdown entry to append (must follow the format from the prompt)',
            },
          },
          required: ['entry'],
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
        console.log(`Librarian executing tool: ${block.name}`);
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'fetch_url':
              result = await this.executeFetchUrl(block.input as { url: string });
              break;
            case 'read_memory_file':
              result = await this.executeReadMemoryFile(block.input as { file: string });
              break;
            case 'write_to_techniques':
              result = await this.executeWriteToTechniques(block.input as { entry: string });
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

  /**
   * Fetch a URL using Node.js built-in fetch, with timeout and size limit.
   */
  async executeFetchUrl(input: { url: string }): Promise<string> {
    const { url } = input;

    // Basic safety check — only allow http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `Error: Only http/https URLs are allowed`;
    }

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'librarian',
      tool: 'fetch_url',
      allowed: true,
      note: `Fetching: ${url}`,
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const text = await response.text();
      const truncated = text.slice(0, FETCH_MAX_BYTES);
      const suffix = text.length > FETCH_MAX_BYTES ? `\n\n[truncated at ${FETCH_MAX_BYTES} chars]` : '';

      return truncated + suffix;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return `Error: Request timed out after ${FETCH_TIMEOUT_MS}ms`;
      }
      return `Error fetching URL: ${error.message}`;
    }
  }

  /**
   * Read the current contents of a memory file.
   */
  async executeReadMemoryFile(input: { file: string }): Promise<string> {
    const { file } = input;
    const validFiles = ['techniques', 'runs', 'patterns', 'errors'];
    if (!validFiles.includes(file)) {
      return `Error: Invalid memory file "${file}". Must be one of: ${validFiles.join(', ')}`;
    }

    const filePath = path.join(this.memoryDir, `${file}.md`);

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'librarian',
      tool: 'read_memory_file',
      allowed: true,
      files_touched: [filePath],
    });

    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return `(memory/${file}.md not found — file will be created when you write to it)`;
    }
  }

  /**
   * Append an entry to memory/techniques.md.
   * Creates the file with a header if it doesn't exist.
   */
  async executeWriteToTechniques(input: { entry: string }): Promise<string> {
    const { entry } = input;
    const filePath = path.join(this.memoryDir, 'techniques.md');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'librarian',
      tool: 'write_to_techniques',
      allowed: true,
      files_touched: [filePath],
      note: `Appending technique entry`,
    });

    try {
      await fs.mkdir(this.memoryDir, { recursive: true });

      let existing = '';
      try {
        existing = await fs.readFile(filePath, 'utf-8');
      } catch {
        existing =
          '# Techniques — Externa forskningsrön\n\n' +
          'Relevanta rön från AI-forskning och Anthropic-dokumentation.\n' +
          'Uppdateras av Librarian-agenten.\n\n';
      }

      const updated = existing.trimEnd() + '\n\n' + entry.trim() + '\n';
      await fs.writeFile(filePath, updated, 'utf-8');

      return `Entry appended to memory/techniques.md`;
    } catch (error: any) {
      return `Error writing to memory/techniques.md: ${error.message}`;
    }
  }
}
