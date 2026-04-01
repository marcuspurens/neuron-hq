import chalk from 'chalk';
import { writeFile, mkdir, rm, readFile, access, readdir } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../core/logger.js';
import { getPool } from '../core/db.js';
import { buildSpeakerTimeline, formatMs } from '../aurora/speaker-timeline.js';
import type { TimelineBlock } from '../aurora/speaker-timeline.js';

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

/** Info gathered from voice_print nodes for a given transcript. */
interface SpeakerInfo {
  label: string;
  name: string;
  confidence: number;
  role: string;
  segments: Array<{ start_ms: number; end_ms: number }>;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s*\[chunk \d+\/\d+\]\s*$/, '') // strip DB chunk suffix
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 200);
}

const logger = createLogger('obsidian:export');

/** Check if a node is a video transcript with raw segments. */
export function isVideoTranscript(node: AuroraNode): boolean {
  const props = node.properties || {};
  return node.type === 'transcript' && Array.isArray(props.rawSegments);
}

function formatFrontmatter(node: AuroraNode): string {
  const props = node.properties || {};
  const lines = ['---'];

  const contentType = props.contentType as string | undefined;
  lines.push(`typ: ${contentType ?? node.type}`);

  if (props.author) lines.push(`författare: "${props.author}"`);

  if (props.publishedDate) lines.push(`publicerad: ${props.publishedDate}`);

  const sourceUrl = props.videoUrl ?? props.sourceUrl;
  if (sourceUrl) lines.push(`källa: "${sourceUrl}"`);

  const language = props.language as string | undefined;
  if (language && language !== 'unknown') lines.push(`språk: ${language}`);

  if (props.platform) lines.push(`plattform: ${props.platform}`);
  if (props.duration) lines.push(`längd: ${props.duration}`);

  const tags = Array.isArray(props.tags) ? (props.tags as string[]) : [];
  if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);

  const summary = props.summary as string | undefined;
  if (summary) lines.push(`tldr: "${summary.replace(/"/g, '\\"')}"`);

  lines.push('---');
  return lines.join('\n');
}

/** Build frontmatter for video transcript with timeline speaker data. */
function formatVideoFrontmatter(node: AuroraNode, speakers: Map<string, SpeakerInfo>): string {
  const props = node.properties || {};
  const durationMs = typeof props.duration === 'number' ? props.duration * 1000 : 0;
  const lines = ['---', `id: ${node.id}`, `type: transcript`];

  if (props.platform) lines.push(`platform: ${props.platform}`);
  lines.push(`duration: "${formatMs(durationMs)}"`);

  lines.push('speakers:');
  for (const [label, info] of speakers) {
    lines.push(`  ${label}:`);
    lines.push(`    name: "${info.name}"`);
    lines.push(`    confidence: ${info.confidence}`);
    lines.push(`    role: "${info.role}"`);
  }

  lines.push(`exported_at: "${new Date().toISOString()}"`);
  lines.push('---');
  return lines.join('\n');
}

/** Build speaker table markdown. */
function buildSpeakerTable(speakers: Map<string, SpeakerInfo>): string[] {
  const lines: string[] = [
    '## Talare',
    '| ID | Namn | Konfidenspoäng | Roll |',
    '|----|------|-----------|------|',
  ];
  for (const [label, info] of speakers) {
    const displayName = label.startsWith('SPEAKER_')
      ? '_ej identifierad_'
      : info.name || '_ej identifierad_';
    const conf = info.confidence > 0 ? String(info.confidence) : '\u2014';
    const role = info.role || '\u2014';
    lines.push(`| ${label} | ${displayName} | ${conf} | ${role} |`);
  }
  return lines;
}

/** Build timeline section from TimelineBlock array. */
function buildTimelineSection(blocks: TimelineBlock[]): string[] {
  const lines: string[] = ['## Tidslinje', ''];
  for (const block of blocks) {
    lines.push(`### ${formatMs(block.start_ms)} \u2014 ${block.speaker}`);
    lines.push(block.text);
    lines.push('');
  }
  return lines;
}
/** Highlight annotation on a timeline segment. */
interface HighlightAnnotation {
  segment_start_ms: number;
  tag: string;
}

/** Comment annotation on a timeline segment. */
interface CommentAnnotation {
  segment_start_ms: number;
  text: string;
}

/** Build timeline section with highlight callouts and comment annotations. */
function buildTimelineSectionWithAnnotations(
  blocks: TimelineBlock[],
  highlights: HighlightAnnotation[],
  comments: CommentAnnotation[]
): string[] {
  // If no annotations, delegate to original
  if (highlights.length === 0 && comments.length === 0) {
    return buildTimelineSection(blocks);
  }

  const lines: string[] = ['## Tidslinje', ''];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLast = i === blocks.length - 1;

    // Match annotations: start_ms >= block.start_ms && < block.end_ms
    // For last block: use <= for end_ms
    const matchesBlock = (ms: number): boolean => {
      if (isLast) {
        return ms >= block.start_ms && ms <= block.end_ms;
      }
      return ms >= block.start_ms && ms < block.end_ms;
    };

    const blockHighlights = highlights.filter((h) => matchesBlock(h.segment_start_ms));
    const blockComments = comments.filter((c) => matchesBlock(c.segment_start_ms));

    const heading = `### ${formatMs(block.start_ms)} \u2014 ${block.speaker}`;

    if (blockHighlights.length > 0) {
      // Render as Obsidian callout
      const tag = blockHighlights[0].tag || 'highlight';
      lines.push(`> [!important] #${tag}`);
      lines.push(`> ${heading}`);
      // Wrap text lines in callout
      const textLines = block.text.split('\n');
      for (const tl of textLines) {
        lines.push(`> ${tl}`);
      }
      lines.push('');
    } else {
      lines.push(heading);
      lines.push(block.text);
      lines.push('');
    }

    // Append comments after the block
    for (const c of blockComments) {
      lines.push(`<!-- kommentar: ${c.text} -->`);
      lines.push('');
    }
  }

  return lines;
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

/** Collect voice_print nodes whose videoNodeId matches the transcript id. */
function findVoicePrints(nodes: AuroraNode[], transcriptId: string): AuroraNode[] {
  return nodes.filter((n) => n.type === 'voice_print' && n.properties.videoNodeId === transcriptId);
}

/** Build speaker info map from voice_print nodes. */
function buildSpeakerMap(voicePrints: AuroraNode[]): Map<string, SpeakerInfo> {
  const map = new Map<string, SpeakerInfo>();
  for (const vp of voicePrints) {
    const label = (vp.properties.speakerLabel as string) || 'UNKNOWN';
    const segments = Array.isArray(vp.properties.segments)
      ? (vp.properties.segments as Array<{ start_ms: number; end_ms: number }>)
      : [];
    map.set(label, {
      label,
      name: label.startsWith('SPEAKER_') ? '' : label,
      confidence: vp.confidence ?? 0,
      role: '',
      segments,
    });
  }
  return map;
}

/** Build IDs of chunk nodes that belong to a video transcript. */
function buildVideoChunkIds(nodes: AuroraNode[], videoTranscriptIds: Set<string>): Set<string> {
  const skipIds = new Set<string>();
  for (const node of nodes) {
    const chunkMatch = node.id.match(/^(.+)_chunk_\d+$/);
    if (chunkMatch && videoTranscriptIds.has(chunkMatch[1])) {
      skipIds.add(node.id);
    }
  }
  return skipIds;
}

export async function obsidianExportCommand(cmdOptions: {
  vault?: string;
  clean?: boolean;
}): Promise<{ exported: number }> {
  const vaultPath = cmdOptions.vault || DEFAULT_VAULT;
  const nodesDir = join(vaultPath, 'Aurora');
  const pool = getPool();

  try {
    console.log(chalk.bold('\n📓 Obsidian Export\n'));
    console.log(`  Vault: ${vaultPath}`);

    // Fetch all nodes
    const nodesResult = await pool.query<AuroraNode>(
      'SELECT id, title, type, scope, confidence, created, properties FROM aurora_nodes ORDER BY created'
    );
    const nodes = nodesResult.rows;

    if (nodes.length === 0) {
      console.log(chalk.yellow('  No nodes to export.'));
      return { exported: 0 };
    }

    // Fetch all edges
    const edgesResult = await pool.query<AuroraEdge>(
      'SELECT from_id, to_id, type FROM aurora_edges'
    );
    const edges = edgesResult.rows;

    // Identify video transcripts (transcript nodes with rawSegments)
    const videoTranscriptIds = new Set<string>();
    for (const node of nodes) {
      if (isVideoTranscript(node)) {
        videoTranscriptIds.add(node.id);
      }
    }

    // Build set of chunk IDs to skip for video transcripts
    const skipChunkIds = buildVideoChunkIds(nodes, videoTranscriptIds);

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

    // Ensure output directory exists (preserve manually created files)
    await mkdir(nodesDir, { recursive: true });

    let written = 0;
    for (const node of nodes) {
      if (skipChunkIds.has(node.id)) continue;
      if (node.id.includes('_chunk_')) continue;

      const filename = filenameMap.get(node.id)!;
      const props = node.properties || {};
      const lines: string[] = [];

      if (isVideoTranscript(node)) {
        // --- Video transcript with timeline ---
        const voicePrints = findVoicePrints(nodes, node.id);
        const speakerMap = buildSpeakerMap(voicePrints);

        // Collect all diarization segments from voice_prints
        const allDiarizationSegments: Array<{
          start_ms: number;
          end_ms: number;
          speaker: string;
        }> = [];
        for (const [label, info] of speakerMap) {
          for (const seg of info.segments) {
            allDiarizationSegments.push({
              start_ms: seg.start_ms,
              end_ms: seg.end_ms,
              speaker: label,
            });
          }
        }

        const rawSegments = props.rawSegments as Array<{
          start_ms: number;
          end_ms: number;
          text: string;
        }>;

        const timelineBlocks = buildSpeakerTimeline(rawSegments, allDiarizationSegments);

        // Frontmatter
        lines.push(formatVideoFrontmatter(node, speakerMap));
        lines.push('');

        // Title
        lines.push(`# ${node.title || node.id}`);
        lines.push('');

        // Speaker table
        lines.push(...buildSpeakerTable(speakerMap));
        lines.push('');

        // Collect annotations from properties
        const highlights = Array.isArray(props.highlights)
          ? (props.highlights as Array<{ segment_start_ms: number; tag: string }>)
          : [];
        const comments = Array.isArray(props.comments)
          ? (props.comments as Array<{ segment_start_ms: number; text: string }>)
          : [];

        // Timeline (with annotations if present)
        lines.push(...buildTimelineSectionWithAnnotations(timelineBlocks, highlights, comments));
      } else {
        // --- Standard non-video export (unchanged) ---
        lines.push(formatFrontmatter(node));
        lines.push('');

        lines.push(`# ${node.title || node.id}`);
        lines.push('');

        const out = outgoingEdges.get(node.id) || [];
        const inc = incomingEdges.get(node.id) || [];
        const visibleOut = out.filter((e) => !e.to_id.includes('_chunk_'));
        const visibleInc = inc.filter((e) => !e.from_id.includes('_chunk_'));

        if (visibleOut.length > 0 || visibleInc.length > 0) {
          lines.push('## Kopplingar');
          lines.push('');
          for (const edge of visibleOut) {
            const targetName = filenameMap.get(edge.to_id);
            if (targetName) lines.push(`- → \`${edge.type}\` [[${targetName}]]`);
          }
          for (const edge of visibleInc) {
            const sourceName = filenameMap.get(edge.from_id);
            if (sourceName) lines.push(`- ← \`${edge.type}\` [[${sourceName}]]`);
          }
          lines.push('');
        }

        // Text content — assemble full text from chunks for parent nodes
        const chunkPrefix = `${node.id}_chunk_`;
        const chunkNodes = nodes
          .filter((n) => n.id.startsWith(chunkPrefix))
          .sort((a, b) => {
            const aIdx = (a.properties.chunkIndex as number) ?? 0;
            const bIdx = (b.properties.chunkIndex as number) ?? 0;
            return aIdx - bIdx;
          });

        if (chunkNodes.length > 0) {
          for (const chunk of chunkNodes) {
            const chunkText = chunk.properties.text as string | undefined;
            if (chunkText) lines.push(chunkText);
          }
          lines.push('');
        } else {
          const text = props.text as string | undefined;
          if (text) {
            lines.push(text);
            lines.push('');
          }
        }
      }

      const filePath = join(nodesDir, `${filename}.md`);
      await writeFile(filePath, lines.join('\n'), 'utf-8');
      written++;
    }

    // Remove stale export files (files for nodes no longer in Aurora)
    const exportedFilenames = new Set();
    for (const nd of nodes) {
      if (skipChunkIds.has(nd.id)) continue;
      if (nd.id.includes('_chunk_')) continue;
      const fn = filenameMap.get(nd.id);
      if (fn) exportedFilenames.add(fn + '.md');
    }
    const existingFiles = await readdir(nodesDir);
    for (const file of existingFiles) {
      if (file.endsWith('.md') && !exportedFilenames.has(file)) {
        logger.info('Removing stale export file', { file });
        await rm(join(nodesDir, file));
      }
    }

    console.log(chalk.green(`  ✅ ${written} noder exporterade till ${nodesDir}/`));
    console.log(`  📊 ${edges.length} kopplingar som [[wiki-links]]`);
    console.log(`\n  Öppna Obsidian → "${vaultPath}" för att se grafvyn.\n`);
    return { exported: written };
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
    return { exported: 0 };
  }
}

/**
 * Export a run narrative to the Obsidian vault's Korningar/ folder.
 * If run-narrative.md doesn't exist in runDir, silently returns null.
 */
export async function exportRunNarrative(options: {
  runDir: string;
  runId: string;
  vault?: string;
}): Promise<string | null> {
  const vaultPath = options.vault || DEFAULT_VAULT;
  const korningarDir = join(vaultPath, 'Korningar');
  const narrativePath = join(options.runDir, 'run-narrative.md');

  // Check if narrative exists
  try {
    await access(narrativePath);
  } catch {
    // run-narrative.md doesn't exist - skip silently
    return null;
  }

  // Read the narrative
  let content = await readFile(narrativePath, 'utf-8');

  // Add Obsidian tags to frontmatter
  // Extract stoplight from existing frontmatter
  const stoplightMatch = content.match(/^stoplight:\s*(\w+)/m);
  const stoplight = (stoplightMatch?.[1] ?? 'unknown').toLowerCase();

  // Insert tags after the frontmatter opening
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      const frontmatter = content.slice(0, endIdx);
      const body = content.slice(endIdx);
      // Add tags line before closing ---
      content = frontmatter + `tags: [korning, ${stoplight}]\n` + body;
    }
  }

  // Ensure Korningar directory exists
  await mkdir(korningarDir, { recursive: true });

  // Write file
  const filename = `korning-${options.runId}.md`;
  const filePath = join(korningarDir, filename);
  await writeFile(filePath, content, 'utf-8');

  return filePath;
}
