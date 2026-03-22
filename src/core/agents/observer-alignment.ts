/**
 * ObserverAlignment — deep prompt-code alignment analysis.
 *
 * Loads agent TypeScript source files, extracts function bodies, and
 * analyzes whether implementations are 'DEEP' (substantive) or
 * 'SHALLOW' (placeholder/stub).
 */
import fs from 'fs/promises';
import { createLogger } from '../logger.js';

const logger = createLogger('observer:alignment');

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DeepAlignmentCheck {
  agent: string;
  promptClaim: string;       // e.g. 'verify source content'
  functionName: string;      // e.g. 'verifySource'
  sourceFile: string;        // e.g. 'src/core/agents/knowledge-manager.ts'
  analysis: 'DEEP' | 'SHALLOW' | 'NOT_FOUND';
  details: string;           // explanation
}

// ── Configuration ─────────────────────────────────────────────────────────────

export const DEEP_ALIGNMENT_CHECKS: Array<{
  agentRole: string;
  promptKeyword: string;
  expectedFunction: string;
  sourceFile: string;
}> = [
  {
    agentRole: 'knowledge-manager',
    promptKeyword: 'verify',
    expectedFunction: 'verifySource',
    sourceFile: 'src/core/agents/knowledge-manager.ts',
  },
  {
    agentRole: 'merger',
    promptKeyword: 'post-merge verif',
    expectedFunction: 'postMergeVerify',
    sourceFile: 'src/core/agents/merger.ts',
  },
];

// ── Helper: skipStringLiteral ─────────────────────────────────────────────────

/**
 * Given a position at a quote character, return the index AFTER the closing quote.
 */
function skipStringLiteral(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;

  if (quote === '`') {
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '`') return i + 1;
      i++;
    }
    return i;
  }

  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === quote) return i + 1;
    i++;
  }
  return i;
}

// ── Helper: skipToEndOfLine ───────────────────────────────────────────────────

function skipToEndOfLine(source: string, start: number): number {
  let i = start;
  while (i < source.length && source[i] !== '\n') i++;
  return i + 1;
}

// ── Helper: skipBlockComment ──────────────────────────────────────────────────

function skipBlockComment(source: string, start: number): number {
  let i = start + 2;
  while (i < source.length - 1) {
    if (source[i] === '*' && source[i + 1] === '/') return i + 2;
    i++;
  }
  return source.length;
}

// ── Helper: looksLikeFunctionBody ─────────────────────────────────────────────

/**
 * Given the content right after a `{`, determine whether this `{` opens a
 * function body (vs an object type literal in a return type annotation).
 *
 * Heuristics for a function body:
 *   - Starts with a statement keyword: const, let, var, return, if, for, etc.
 *   - Starts with a comment (`//` or `/ *`)
 *   - Starts with `}` (empty body — always a body, not a type)
 *   - Starts with `this.`, `super.`, or `throw`
 *   - Has an assignment with `=` before any `:` (statements use `=`)
 *
 * Heuristics for an object TYPE literal:
 *   - Contains `identifier:` patterns (type property definitions)
 *   - Contains semicolons (type property separators)
 *   - Starts with an identifier followed immediately by `:`
 */
function looksLikeFunctionBody(source: string, contentStart: number): boolean {
  let i = contentStart;

  // Skip whitespace
  while (i < source.length && /\s/.test(source[i])) i++;
  if (i >= source.length) return true; // empty — treat as function body

  const remaining = source.slice(i, i + 30);

  // Comments inside → function body
  if (remaining.startsWith('//') || remaining.startsWith('/*')) return true;

  // Closing brace immediately → empty function body
  if (remaining.startsWith('}')) return true;

  // Statement keywords → function body
  if (/^(const|let|var|return|if|for|while|switch|throw|await|try|do|super|this)\b/.test(remaining)) {
    return true;
  }

  // `identifier(` → function call as first statement → function body
  if (/^\w+\s*\(/.test(remaining)) return true;

  // `identifier:` followed by type keyword → object type literal
  // e.g. `result: number` or `ok: boolean`
  if (/^\w+\s*:\s*(number|string|boolean|void|null|undefined|any|never|unknown)\b/.test(remaining)) {
    return false;
  }

  // `identifier:` pattern → likely an object type literal
  if (/^\w+\s*:/.test(remaining)) return false;

  // Default: assume function body
  return true;
}

// ── Helper: findBodyOpenAfterColon ────────────────────────────────────────────

/**
 * Starting immediately after the `:` of a return type annotation,
 * scan past the type and return the index of the body-opening `{`.
 *
 * Tracks angle-bracket depth (generics), brace depth (object type literals),
 * and paren depth (parenthesized types). When a `{` is encountered at depth 0,
 * use `looksLikeFunctionBody` to decide if it's a body or a type literal.
 *
 * Returns -1 if not found.
 */
function findBodyOpenAfterColon(source: string, start: number): number {
  let i = start;
  let angleBracketDepth = 0;
  let braceDepth = 0;
  let parenDepth = 0;

  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }

    const ch = source[i];

    // Comments
    if (ch === '/' && i + 1 < source.length) {
      if (source[i + 1] === '/') { i = skipToEndOfLine(source, i); continue; }
      if (source[i + 1] === '*') { i = skipBlockComment(source, i); continue; }
    }

    // String literals in type position (edge case)
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipStringLiteral(source, i);
      continue;
    }

    if (ch === '<') { angleBracketDepth++; i++; continue; }
    if (ch === '>') {
      if (angleBracketDepth > 0) angleBracketDepth--;
      i++; continue;
    }
    if (ch === '(') { parenDepth++; i++; continue; }
    if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
      i++; continue;
    }

    if (ch === '{') {
      if (angleBracketDepth === 0 && braceDepth === 0 && parenDepth === 0) {
        // Determine if this is the function body or an object type literal
        if (looksLikeFunctionBody(source, i + 1)) {
          return i;
        }
        // It's an object type in the annotation — track its depth
      }
      braceDepth++;
      i++;
      continue;
    }

    if (ch === '}') {
      if (braceDepth > 0) {
        braceDepth--;
        i++;
        // After closing a type-level brace, check if the next token is `{` body
        if (braceDepth === 0 && angleBracketDepth === 0 && parenDepth === 0) {
          const saved = i;
          while (i < source.length && /\s/.test(source[i])) i++;
          if (i < source.length && source[i] === '{') {
            if (looksLikeFunctionBody(source, i + 1)) return i;
          }
          i = saved;
        }
        continue;
      }
      return -1; // unmatched `}`
    }

    if (ch === ';' && angleBracketDepth === 0 && braceDepth === 0 && parenDepth === 0) {
      return -1; // function declaration (no body)
    }

    i++;
  }

  return -1;
}

// ── Helper: findBodyOpen ──────────────────────────────────────────────────────

/**
 * After the closing `)` of a function's parameter list (position `afterParen`),
 * find the index of the `{` that opens the function body.
 * Returns -1 if not found.
 */
function findBodyOpen(source: string, afterParen: number): number {
  let i = afterParen;

  while (i < source.length && /\s/.test(source[i])) i++;
  if (i >= source.length) return -1;

  if (source[i] === ':') {
    i++;
    return findBodyOpenAfterColon(source, i);
  }

  if (source[i] === '=' && i + 1 < source.length && source[i + 1] === '>') {
    i += 2;
    while (i < source.length && /\s/.test(source[i])) i++;
    return (i < source.length && source[i] === '{') ? i : -1;
  }

  if (source[i] === '{') return i;

  return -1;
}

// ── extractFunctionBody ───────────────────────────────────────────────────────

/**
 * Extract the body of a named function from TypeScript source.
 *
 * Matches:
 *   - `async functionName(`
 *   - `functionName(`
 *   - `functionName = (`        (arrow)
 *   - `functionName = async (`  (async arrow)
 *   - Class method: `async? functionName(`
 *
 * Returns the content between the outermost `{` and its matching `}`,
 * exclusive. Returns null if the function is not found.
 */
export function extractFunctionBody(source: string, functionName: string): string | null {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:async\\s+)?\\b${escapedName}\\s*(?:=\\s*(?:async\\s+)?)?\\(`,
  );

  const match = pattern.exec(source);
  if (!match) return null;

  let i = match.index + match[0].length;

  // Scan through the argument list
  let parenDepth = 1;
  while (i < source.length && parenDepth > 0) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth++;
    } else if (ch === ')') {
      parenDepth--;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      i = skipStringLiteral(source, i);
      continue;
    } else if (ch === '/' && i + 1 < source.length) {
      if (source[i + 1] === '/') { i = skipToEndOfLine(source, i); continue; }
      if (source[i + 1] === '*') { i = skipBlockComment(source, i); continue; }
    }
    i++;
  }

  const bodyOpenIdx = findBodyOpen(source, i);
  if (bodyOpenIdx < 0) return null;

  const bodyStart = bodyOpenIdx + 1;
  let depth = 1;
  i = bodyStart;

  while (i < source.length && depth > 0) {
    const ch = source[i];

    if (ch === '/' && i + 1 < source.length) {
      if (source[i + 1] === '/') { i = skipToEndOfLine(source, i); continue; }
      if (source[i + 1] === '*') { i = skipBlockComment(source, i); continue; }
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipStringLiteral(source, i);
      continue;
    }

    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(bodyStart, i);
    }

    i++;
  }

  return null;
}

// ── analyzeBody ───────────────────────────────────────────────────────────────

/**
 * Determine if a function body is DEEP (substantive) or SHALLOW (placeholder).
 *
 * SHALLOW if ANY of:
 *   1. Only sets a property/flag with no await or function calls
 *   2. Returns a hardcoded literal value early in the body
 *   3. Empty body, or only contains logger/console calls
 *
 * DEEP if ANY of:
 *   1. Contains `await`
 *   2. Contains `fetch(` or other API patterns
 *   3. Contains conditional logic (`if`/`switch`) with function calls
 *   4. Has multiple function calls (substantial logic)
 *
 * Defaults to DEEP if unclear.
 */
export function analyzeBody(body: string): 'DEEP' | 'SHALLOW' {
  const trimmed = body.trim();

  if (trimmed === '') return 'SHALLOW';

  const strippedLogging = trimmed
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t !== '' && !t.startsWith('logger.') && !t.startsWith('console.');
    })
    .join('\n')
    .trim();

  if (strippedLogging === '') return 'SHALLOW';

  if (/\bawait\b/.test(body)) return 'DEEP';
  if (/\bfetch\s*\(/.test(body)) return 'DEEP';

  if (/\b(if|switch)\b/.test(body) && /\w+\s*\(/.test(body)) return 'DEEP';

  const fnCallMatches = body.match(/\b\w+\s*\(/g) ?? [];
  if (fnCallMatches.length >= 2) return 'DEEP';

  if (/\.\w+\s*=\s/.test(body) && !/\bawait\b/.test(body) && !/\w+\s*\(/.test(body)) {
    return 'SHALLOW';
  }

  if (
    /return\s+(true|false|null|undefined|\d+|'[^']*'|"[^"]*"|\{[^}]*\}|\[[^\]]*\])\s*;/.test(body)
  ) {
    return 'SHALLOW';
  }

  return 'DEEP';
}

// ── Main function: checkDeepAlignment ────────────────────────────────────────

/**
 * Check whether an agent's source code implements what its prompt claims.
 *
 * For each matching entry in DEEP_ALIGNMENT_CHECKS:
 *   1. Check if promptKeyword exists in promptText
 *   2. Search for expectedFunction in the source
 *   3. Extract and analyze the function body
 *
 * Returns an array of DeepAlignmentCheck results.
 */
export async function checkDeepAlignment(
  agentRole: string,
  promptText: string,
  agentSourcePath: string,
): Promise<DeepAlignmentCheck[]> {
  const relevantChecks = DEEP_ALIGNMENT_CHECKS.filter(
    (c) => c.agentRole === agentRole,
  );

  if (relevantChecks.length === 0) {
    logger.debug('No alignment checks configured for agent', { agentRole });
    return [];
  }

  let sourceCode: string;
  try {
    sourceCode = await fs.readFile(agentSourcePath, 'utf-8');
  } catch (err) {
    logger.warn('Could not read agent source file', {
      agentSourcePath,
      error: String(err),
    });
    return relevantChecks.map((check) => ({
      agent: agentRole,
      promptClaim: check.promptKeyword,
      functionName: check.expectedFunction,
      sourceFile: check.sourceFile,
      analysis: 'NOT_FOUND' as const,
      details: `Could not read source file: ${agentSourcePath}`,
    }));
  }

  const results: DeepAlignmentCheck[] = [];

  for (const check of relevantChecks) {
    const promptHasClaim = promptText
      .toLowerCase()
      .includes(check.promptKeyword.toLowerCase());

    if (!promptHasClaim) {
      logger.debug('Prompt keyword not found — skipping check', {
        agentRole,
        keyword: check.promptKeyword,
      });
      results.push({
        agent: agentRole,
        promptClaim: check.promptKeyword,
        functionName: check.expectedFunction,
        sourceFile: check.sourceFile,
        analysis: 'NOT_FOUND',
        details: `Prompt does not contain keyword '${check.promptKeyword}' — check not applicable`,
      });
      continue;
    }

    const body = extractFunctionBody(sourceCode, check.expectedFunction);

    if (body === null) {
      results.push({
        agent: agentRole,
        promptClaim: check.promptKeyword,
        functionName: check.expectedFunction,
        sourceFile: check.sourceFile,
        analysis: 'NOT_FOUND',
        details: `Function '${check.expectedFunction}' not found in ${check.sourceFile}`,
      });
      continue;
    }

    const depth = analyzeBody(body);

    results.push({
      agent: agentRole,
      promptClaim: check.promptKeyword,
      functionName: check.expectedFunction,
      sourceFile: check.sourceFile,
      analysis: depth,
      details:
        depth === 'DEEP'
          ? `Function '${check.expectedFunction}' has substantive implementation (body length: ${body.trim().length} chars)`
          : `Function '${check.expectedFunction}' appears to be a shallow/placeholder implementation`,
    });
  }

  return results;
}
