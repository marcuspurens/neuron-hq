import { readFile } from 'node:fs/promises';

export interface PromptHierarchy {
  /** Always-loaded core sections */
  core: string;
  /** Archive sections keyed by name, loaded on demand */
  archive: Map<string, string>;
}

/**
 * Regex matching ARCHIVE open/close markers on their own lines.
 *
 * Supports both closing formats:
 *   `<!-- /ARCHIVE -->` and `<!-- /ARCHIVE: name -->`
 *
 * Captures:
 *   group 1 — section name
 *   group 2 — content between markers
 */
const ARCHIVE_BLOCK_RE =
  /^[ \t]*<!-- ARCHIVE: (\S+) -->[ \t]*\n([\s\S]*?)^[ \t]*<!-- \/ARCHIVE(?:: \S+)? -->[ \t]*\n?/gm;

/**
 * Parses a prompt file into core and archive sections.
 *
 * Sections between `<!-- ARCHIVE: name -->` and `<!-- /ARCHIVE -->` markers
 * are extracted into the archive map. Everything else becomes core.
 *
 * Rules:
 * - Archive markers are on their own lines
 * - The content between markers goes into archive[name] (trimmed)
 * - Nested markers are NOT supported (inner markers are treated as literal text)
 * - If no markers found, everything is core and archive is empty Map
 * - Multiple consecutive newlines left by extraction should be collapsed to max 2
 */
export function parsePromptHierarchy(content: string): PromptHierarchy {
  const archive = new Map<string, string>();

  // Extract archive blocks and build core
  let core = content.replace(ARCHIVE_BLOCK_RE, (_match, name: string, body: string) => {
    archive.set(name, body.trim());
    return '\n';
  });

  // Collapse triple+ newlines to double
  core = core.replace(/\n{3,}/g, '\n\n');

  // Trim the final result
  core = core.trim();

  return { core, archive };
}

/**
 * Loads a prompt file and parses it into core + archive.
 */
export async function loadPromptHierarchy(promptPath: string): Promise<PromptHierarchy> {
  const content = await readFile(promptPath, 'utf-8');
  return parsePromptHierarchy(content);
}

/**
 * Builds a system prompt from core + optional overlay + selected archive sections.
 * The overlay is injected after core but before archive sections.
 * Archive sections are appended in order, each separated by \n\n.
 * Unknown section names are silently ignored.
 */
export function buildHierarchicalPrompt(
  hierarchy: PromptHierarchy,
  archiveSections?: string[],
  overlay?: string,
): string {
  const parts = [hierarchy.core];

  // Model overlay injected after core, before archive
  if (overlay) {
    parts.push(overlay);
  }

  if (archiveSections) {
    for (const name of archiveSections) {
      const section = hierarchy.archive.get(name);
      if (section !== undefined) {
        parts.push(section);
      }
    }
  }

  return parts.join('\n\n');
}
