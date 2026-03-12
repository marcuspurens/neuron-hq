import { type RunContext } from '../run.js';
import { truncateToolResult } from './agent-utils.js';
import type Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Context needed by all shared tool execute functions. */
export interface AgentToolContext {
  ctx: RunContext;
  agentRole: string;
}

/** Options for executeSharedBash. */
export interface BashOptions {
  /** If true, applies truncateToolResult() to stdout on success. Default false. */
  truncate?: boolean;
  /** If true, includes stderr in output (tester needs this). Default false. */
  includeStderr?: boolean;
}

/** Options for executeSharedReadFile. */
export interface ReadFileOptions {
  /** If true, applies truncateToolResult() to content. Default false. */
  truncate?: boolean;
}

// ---------------------------------------------------------------------------
// Execute functions
// ---------------------------------------------------------------------------

/**
 * Execute a bash command with policy check, audit logging, and manifest tracking.
 *
 * Behaviour mirrors the per-agent executeBash implementations:
 * - `includeStderr: false` (default): success returns stdout; error returns
 *   `Command failed (exit <code>):\n<stderr || message>`.
 * - `includeStderr: true` (tester mode): success returns
 *   `(stdout + (stderr ? '\n' + stderr : '')).trim()`; error returns
 *   `Exit <code>:\n<stdout>\n<stderr>`.
 */
export async function executeSharedBash(
  toolCtx: AgentToolContext,
  command: string,
  options?: BashOptions,
): Promise<string> {
  const { ctx, agentRole } = toolCtx;
  const truncate = options?.truncate ?? false;
  const includeStderr = options?.includeStderr ?? false;

  const policyCheck = ctx.policy.checkBashCommand(command);

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: agentRole as 'implementer',
    tool: 'bash_exec',
    allowed: policyCheck.allowed,
    policy_event: policyCheck.reason,
    note: `Command: ${command}`,
  });

  if (!policyCheck.allowed) {
    return `BLOCKED: ${policyCheck.reason}`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: ctx.workspaceDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: ctx.policy.getLimits().bash_timeout_seconds * 1000,
    });

    await ctx.manifest.addCommand(command, 0);

    if (includeStderr) {
      return (stdout + (stderr ? '\n' + stderr : '')).trim();
    }

    return truncate ? truncateToolResult(stdout) : stdout;
  } catch (error) {
    const e = error as { status?: number; stderr?: string; stdout?: string; message?: string };
    await ctx.manifest.addCommand(command, e.status || 1);

    if (includeStderr) {
      const out = [e.stdout || '', e.stderr || ''].filter(Boolean).join('\n');
      return `Exit ${e.status || 1}:\n${out || e.message}`;
    }

    return `Command failed (exit ${e.status || 1}):\n${e.stderr || e.message}`;
  }
}

/**
 * Read a file from the workspace with audit logging.
 *
 * Resolves relative paths against `ctx.workspaceDir`.
 */
export async function executeSharedReadFile(
  toolCtx: AgentToolContext,
  filePath: string,
  options?: ReadFileOptions,
): Promise<string> {
  const { ctx, agentRole } = toolCtx;
  const truncate = options?.truncate ?? false;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(ctx.workspaceDir, filePath);

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');

    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: agentRole as 'implementer',
      tool: 'read_file',
      allowed: true,
      files_touched: [absolutePath],
    });

    return truncate ? truncateToolResult(content) : content;
  } catch (error) {
    return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Write a file with policy scope check, audit logging, and directory creation.
 *
 * Resolves relative paths against `baseDir` (which may differ per agent —
 * e.g. implementer uses workspaceDir, tester uses runDir).
 */
export async function executeSharedWriteFile(
  toolCtx: AgentToolContext,
  filePath: string,
  content: string,
  baseDir: string,
): Promise<string> {
  const { ctx, agentRole } = toolCtx;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(baseDir, filePath);

  const policyCheck = ctx.policy.checkFileWriteScope(absolutePath, ctx.runid);

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: agentRole as 'implementer',
    tool: 'write_file',
    allowed: policyCheck.allowed,
    policy_event: policyCheck.reason,
    files_touched: [absolutePath],
  });

  if (!policyCheck.allowed) {
    return `BLOCKED: ${policyCheck.reason}`;
  }

  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf-8');
    return `File written successfully: ${filePath}`;
  } catch (error) {
    return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * List files in a directory, formatted as `DIR\tname` or `FILE\tname`.
 *
 * No audit logging (matches current agent behaviour).
 */
export async function executeSharedListFiles(
  toolCtx: AgentToolContext,
  dirPath?: string,
): Promise<string> {
  const { ctx } = toolCtx;

  const resolvedDir = dirPath
    ? path.isAbsolute(dirPath)
      ? dirPath
      : path.join(ctx.workspaceDir, dirPath)
    : ctx.workspaceDir;

  try {
    const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
    const formatted = entries
      .map((entry: { isDirectory: () => boolean; name: string }) => {
        const type = entry.isDirectory() ? 'DIR' : 'FILE';
        return `${type}\t${entry.name}`;
      })
      .join('\n');
    return formatted || '(empty directory)';
  } catch (error) {
    return `Error listing files: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * Return the four core Anthropic Tool definitions used by all agents.
 *
 * If `roleDescription` is provided, those strings override the default
 * descriptions for individual tools.
 */
export function coreToolDefinitions(roleDescription?: {
  bash?: string;
  readFile?: string;
  writeFile?: string;
  listFiles?: string;
}): Anthropic.Tool[] {
  return [
    {
      name: 'bash_exec',
      description:
        roleDescription?.bash ??
        'Execute a bash command in the workspace. Subject to policy allowlist/forbidden patterns.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: {
            type: 'string' as const,
            description: 'The bash command to execute',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'read_file',
      description:
        roleDescription?.readFile ?? 'Read the contents of a file.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'File path relative to workspace or absolute path',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description:
        roleDescription?.writeFile ??
        'Write content to a file. Subject to policy file scope validation.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'File path relative to workspace or absolute path',
          },
          content: {
            type: 'string' as const,
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_files',
      description:
        roleDescription?.listFiles ?? 'List files in a directory.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'Directory path to list (defaults to workspace root)',
          },
        },
      },
    },
  ];
}
