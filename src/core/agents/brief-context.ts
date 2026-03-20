import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Build repository context string (file tree + git history).
 * Shared by BriefAgent (creation) and BriefReviewer (review).
 */
export function buildRepoContext(baseDir: string): string {
  const parts: string[] = [];

  try {
    const tree = execSync('find . -maxdepth 3 -type f | head -80', {
      cwd: baseDir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    parts.push('## File tree (top 80 files)\n```\n' + tree.trim() + '\n```');
  } catch {
    parts.push('## File tree\n(could not read)');
  }

  try {
    const log = execSync('git log --oneline -5', {
      cwd: baseDir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    parts.push('## Recent git history\n```\n' + log.trim() + '\n```');
  } catch {
    parts.push('## Recent git history\n(could not read)');
  }

  return parts.join('\n\n');
}

/**
 * Load the 2 most recent example briefs as markdown strings.
 * Shared by BriefAgent (creation) and BriefReviewer (review).
 */
export function loadExampleBriefs(baseDir: string): string {
  const briefsDir = join(baseDir, 'briefs');
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
