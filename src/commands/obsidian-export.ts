import chalk from 'chalk';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { getPool } from '../core/db.js';

const DEFAULT_VAULT = '/Users/mpmac/Documents/Neuron Lab';

interface AuroraNode {
  id: string;
  title: string;
  type: string;
  scope: string;
  confidence: number;
  created: string;
  properties: Record<string, unknown>;
}

interface AuroraEdge {
  from_id: string;
  to_id: string;
  type: string;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s*\[chunk \d+\/\d+\]\s*$/, '') // strip DB chunk suffix
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 200);
}

function formatFrontmatter(node: AuroraNode): string {
  const props = node.properties || {};
  const lines = [
    '---',
    `id: "${node.id}"`,
    `type: ${node.type}`,
    `scope: ${node.scope}`,
    `confidence: ${node.confidence}`,
    `created: ${node.created}`,
  ];

  if (props.platform) lines.push(`platform: ${props.platform}`);
  if (props.videoUrl) lines.push(`url: "${props.videoUrl}"`);
  if (props.videoId) lines.push(`videoId: ${props.videoId}`);
  if (props.duration) lines.push(`duration: ${props.duration}`);
  if (props.language) lines.push(`language: ${props.language}`);
  if (props.publishedDate) lines.push(`published: ${props.publishedDate}`);
  if (props.segmentCount) lines.push(`segments: ${props.segmentCount}`);
  if (props.sourceUrl) lines.push(`url: "${props.sourceUrl}"`);
  if (props.wordCount) lines.push(`words: ${props.wordCount}`);

  lines.push('---');
  return lines.join('\n');
}

function buildNodeFilenameMap(nodes: AuroraNode[]): Map<string, string> {
  const map = new Map<string, string>();
  // Count chunks per parent node ID (not title, since different videos can share titles)
  const chunkCounts = new Map<string, number>();
  for (const node of nodes) {
    const chunkMatch = node.id.match(/^(.+)_chunk_(\d+)$/);
    if (chunkMatch) {
      const parentId = chunkMatch[1];
      chunkCounts.set(parentId, (chunkCounts.get(parentId) || 0) + 1);
    }
  }

  for (const node of nodes) {
    const chunkMatch = node.id.match(/^(.+)_chunk_(\d+)$/);
    if (chunkMatch) {
      const parentId = chunkMatch[1];
      const chunkNum = parseInt(chunkMatch[2], 10) + 1; // 0-indexed → 1-indexed
      const total = chunkCounts.get(parentId) || 1;
      const base = sanitizeFilename(node.title || node.id);
      map.set(node.id, `${base} [chunk ${chunkNum}_${total}]`);
    } else {
      map.set(node.id, sanitizeFilename(node.title || node.id));
    }
  }

  // Handle remaining duplicates (non-chunk nodes with same title)
  const seen = new Map<string, number>();
  for (const [id, name] of map) {
    if (id.includes('_chunk_')) continue; // chunks already unique via [chunk N_total]
    const count = seen.get(name) || 0;
    if (count > 0) {
      map.set(id, `${name} (${id})`);
    }
    seen.set(name, count + 1);
  }
  return map;
}

export async function obsidianExportCommand(cmdOptions: {
  vault?: string;
  clean?: boolean;
}): Promise<void> {
  const vaultPath = cmdOptions.vault || DEFAULT_VAULT;
  const nodesDir = join(vaultPath, 'Aurora');
  const pool = getPool();

  try {
    console.log(chalk.bold('\n📓 Obsidian Export\n'));
    console.log(`  Vault: ${vaultPath}`);

    // Fetch all nodes
    const nodesResult = await pool.query<AuroraNode>(
      'SELECT id, title, type, scope, confidence, created, properties FROM aurora_nodes ORDER BY created',
    );
    const nodes = nodesResult.rows;

    if (nodes.length === 0) {
      console.log(chalk.yellow('  No nodes to export.'));
      return;
    }

    // Fetch all edges
    const edgesResult = await pool.query<AuroraEdge>(
      'SELECT from_id, to_id, type FROM aurora_edges',
    );
    const edges = edgesResult.rows;

    // Build filename map and edge lookup
    const filenameMap = buildNodeFilenameMap(nodes);
    const outgoingEdges = new Map<string, AuroraEdge[]>();
    const incomingEdges = new Map<string, AuroraEdge[]>();
    for (const edge of edges) {
      if (!outgoingEdges.has(edge.from_id)) outgoingEdges.set(edge.from_id, []);
      outgoingEdges.get(edge.from_id)!.push(edge);
      if (!incomingEdges.has(edge.to_id)) incomingEdges.set(edge.to_id, []);
      incomingEdges.get(edge.to_id)!.push(edge);
    }

    // Clean and recreate output directory
    await rm(nodesDir, { recursive: true, force: true });
    await mkdir(nodesDir, { recursive: true });

    let written = 0;
    for (const node of nodes) {
      const filename = filenameMap.get(node.id)!;
      const props = node.properties || {};
      const lines: string[] = [];

      // Frontmatter
      lines.push(formatFrontmatter(node));
      lines.push('');

      // Title
      lines.push(`# ${node.title || node.id}`);
      lines.push('');

      // Type badge
      const badges: string[] = [`\`${node.type}\``];
      if (props.platform) badges.push(`\`${props.platform}\``);
      if (props.language) badges.push(`\`${props.language}\``);
      badges.push(`confidence: ${node.confidence}`);
      lines.push(badges.join(' · '));
      lines.push('');

      // Links section — outgoing
      const out = outgoingEdges.get(node.id) || [];
      const inc = incomingEdges.get(node.id) || [];

      if (out.length > 0 || inc.length > 0) {
        lines.push('## Kopplingar');
        lines.push('');
        for (const edge of out) {
          const targetName = filenameMap.get(edge.to_id);
          if (targetName) {
            lines.push(`- → \`${edge.type}\` [[${targetName}]]`);
          }
        }
        for (const edge of inc) {
          const sourceName = filenameMap.get(edge.from_id);
          if (sourceName) {
            lines.push(`- ← \`${edge.type}\` [[${sourceName}]]`);
          }
        }
        lines.push('');
      }

      // Source URL
      if (props.videoUrl) {
        lines.push(`## Källa`);
        lines.push('');
        lines.push(`[${props.videoUrl}](${props.videoUrl})`);
        lines.push('');
      } else if (props.sourceUrl) {
        lines.push(`## Källa`);
        lines.push('');
        lines.push(`[${props.sourceUrl}](${props.sourceUrl})`);
        lines.push('');
      }

      // Text content (truncated for chunks — full for main nodes)
      const text = props.text as string | undefined;
      if (text) {
        const isChunk = node.id.includes('_chunk_');
        if (isChunk) {
          lines.push('## Utdrag');
          lines.push('');
          // Show first 500 chars for chunks
          const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
          lines.push(preview);
        } else {
          lines.push('## Innehåll');
          lines.push('');
          lines.push(text);
        }
        lines.push('');
      }

      const filePath = join(nodesDir, `${filename}.md`);
      await writeFile(filePath, lines.join('\n'), 'utf-8');
      written++;
    }

    console.log(chalk.green(`  ✅ ${written} noder exporterade till ${nodesDir}/`));
    console.log(`  📊 ${edges.length} kopplingar som [[wiki-links]]`);
    console.log(
      `\n  Öppna Obsidian → "${vaultPath}" för att se grafvyn.\n`,
    );
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
