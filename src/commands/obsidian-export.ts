import chalk from 'chalk';
import { writeFile, mkdir, rm, readFile, access, readdir } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../core/logger.js';
import { getPool } from '../core/db.js';
import { buildSpeakerTimeline, formatMs } from '../aurora/speaker-timeline.js';
import type { TimelineBlock } from '../aurora/speaker-timeline.js';

const DEFAULT_VAULT = '/Users/mpmac/Documents/Neuron Lab';

/** Determine the type-based subdirectory for an Aurora node. */
export function getNodeSubdir(node: { type: string; properties: Record<string, unknown> }): string {
  if (node.type === 'transcript' && Array.isArray(node.properties.rawSegments)) return 'Video';
  if (node.type === 'document') return 'Dokument';
  if (node.type === 'article') return 'Artikel';
  if (node.type === 'concept') return 'Koncept';
  return '';
}

interface AuroraNode {
  id: string;
  title: string;
  type: string;
  scope: string;
  confidence: number;
  created: string;
  source_url?: string | null;
  properties: Record<string, unknown>;
}

interface AuroraEdge {
  from_id: string;
  to_id: string;
  type: string;
}

interface SpeakerInfo {
  label: string;
  name: string;
  title: string;
  organization: string;
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

function extractHashtags(text: string | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#[a-zA-Z]\w*/g);
  if (!matches) return [];
  return [...new Set(matches.map((t) => t.slice(1)))];
}

function formatFrontmatter(node: AuroraNode): string {
  const props = node.properties || {};
  const lines = ['---'];

  lines.push(`id: ${node.id}`);

  const contentType = props.contentType as string | undefined;
  lines.push(`typ: ${contentType ?? node.type}`);

  if (props.author) lines.push(`författare: "${props.author}"`);

  if (props.publishedDate) lines.push(`publicerad: ${props.publishedDate}`);

  if (props.videoUrl) {
    lines.push(`videoUrl: "${props.videoUrl}"`);
  } else {
    const sourceUrl = props.sourceUrl ?? node.source_url;
    if (sourceUrl) lines.push(`källa: "${sourceUrl}"`);
  }

  const language = props.language as string | undefined;
  if (language && language !== 'unknown') lines.push(`språk: ${language}`);

  if (props.platform) lines.push(`plattform: ${props.platform}`);
  if (props.duration) lines.push(`längd: ${props.duration}`);

  const tags = Array.isArray(props.tags) ? (props.tags as string[]) : [];
  if (tags.length > 0) {
    const quoted = tags.map((t) => (t.includes(' ') ? `"${t}"` : t));
    lines.push(`tags: [${quoted.join(', ')}]`);
  }

  const provenance = props.provenance as
    | { agent?: string; method?: string; model?: string }
    | undefined;
  if (provenance) {
    if (provenance.method) lines.push(`källa_typ: ${provenance.method}`);
    if (provenance.agent) lines.push(`källa_agent: ${provenance.agent}`);
    if (provenance.model) lines.push(`källa_modell: ${provenance.model}`);
  }

  const summary = props.summary as string | undefined;
  if (summary) lines.push(`tldr: "${summary.replace(/"/g, '\\"')}"`);

  lines.push(`confidence: ${node.confidence}`);
  lines.push(`exported_at: "${new Date().toISOString()}"`);

  lines.push('---');
  return lines.join('\n');
}

/** Build frontmatter for video transcript with timeline speaker data. */
function formatVideoFrontmatter(node: AuroraNode, _speakers: Map<string, SpeakerInfo>): string {
  const props = node.properties || {};
  const durationMs = typeof props.duration === 'number' ? props.duration * 1000 : 0;
  const lines = ['---', `id: ${node.id}`, `type: transcript`];

  if (props.platform) lines.push(`platform: ${props.platform}`);
  lines.push(`duration: "${formatMs(durationMs)}"`);

  if (props.publishedDate) lines.push(`publicerad: ${props.publishedDate}`);

  const videoUrl = props.videoUrl ?? props.sourceUrl ?? node.source_url;
  if (videoUrl) lines.push(`videoUrl: "${videoUrl}"`);

  const channelName = props.channelName as string | undefined;
  if (channelName) lines.push(`kanal: "${channelName.replace(/"/g, '\\"')}"`);

  const channelHandle = props.channelHandle as string | undefined;
  if (channelHandle) lines.push(`kanalhandle: "${channelHandle}"`);

  const language = props.language as string | undefined;
  if (language && language !== 'unknown') lines.push(`språk: ${language}`);

  const viewCount = props.viewCount as number | undefined;
  if (viewCount != null) lines.push(`visningar: ${viewCount}`);

  const likeCount = props.likeCount as number | undefined;
  if (likeCount != null) lines.push(`likes: ${likeCount}`);

  const followerCount = props.channelFollowerCount as number | undefined;
  if (followerCount != null) lines.push(`prenumeranter: ${followerCount}`);

  const descriptionTags = extractHashtags(props.videoDescription as string | undefined);
  const ytTags = Array.isArray(props.ytTags) ? (props.ytTags as string[]) : [];
  const tags = descriptionTags.length > 0 ? descriptionTags : ytTags;
  if (tags.length > 0) {
    const quoted = tags.map((t) => (t.includes(' ') ? `"${t}"` : t));
    lines.push(`tags: [${quoted.join(', ')}]`);
  }

  const summary = props.summary as string | undefined;
  if (summary) lines.push(`tldr: "${summary.replace(/"/g, '\\"')}"`);

  const thumbnailUrl = props.thumbnailUrl as string | undefined;
  if (thumbnailUrl) lines.push(`thumbnail: "${thumbnailUrl}"`);

  lines.push(`confidence: ${node.confidence}`);
  lines.push(`exported_at: "${new Date().toISOString()}"`);
  lines.push('---');
  return lines.join('\n');
}

function buildSpeakerTable(speakers: Map<string, SpeakerInfo>): string[] {
  const lines: string[] = [
    '## Talare',
    '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
    '|-------|------|-------|--------------|------|----------------|',
  ];
  for (const [label, info] of speakers) {
    const name = info.name || '';
    const title = info.title || '';
    const org = info.organization || '';
    const role = info.role || '';
    const conf = String(info.confidence);
    lines.push(`| ${label} | ${name} | ${title} | ${org} | ${role} | ${conf} |`);
  }
  return lines;
}

interface Chapter {
  start_time: number;
  title: string;
  end_time?: number;
}

const REMERGE_SOFT_LIMIT = 4000;

function remergeSameSpeakerBlocks(
  blocks: TimelineBlock[],
  chapters?: Chapter[],
): TimelineBlock[] {
  const chapterTimesMs = (chapters ?? []).map((ch) => Math.round(ch.start_time * 1000));

  const merged: TimelineBlock[] = [];
  let forceNewGroup = false;
  for (const block of blocks) {
    const prev = merged[merged.length - 1];
    const sameSpeaker = prev && prev.speaker === block.speaker;
    const hitsChapter = chapterTimesMs.some((chMs) => Math.abs(chMs - block.start_ms) < 3000);

    if (!sameSpeaker || forceNewGroup || hitsChapter) {
      merged.push({ ...block, words: block.words ? [...block.words] : undefined });
      forceNewGroup = false;
      continue;
    }

    prev.end_ms = Math.max(prev.end_ms, block.end_ms);
    prev.text = prev.text + ' ' + block.text;
    if (block.words) {
      prev.words = [...(prev.words ?? []), ...block.words];
    }

    if (prev.text.length >= REMERGE_SOFT_LIMIT) {
      forceNewGroup = true;
    }
  }
  return merged;
}

function findChapterForBlock(block: TimelineBlock, chapters: Chapter[]): Chapter | undefined {
  const TOLERANCE_MS = 3000;
  const found = chapters.find((ch) => {
    const chMs = Math.round(ch.start_time * 1000);
    return Math.abs(chMs - block.start_ms) < TOLERANCE_MS
      || (chMs >= block.start_ms && chMs <= block.end_ms);
  });
  return found;
}

/** Render block text with optional word-level timecode spans. */
function renderBlockText(block: TimelineBlock): string {
  if (!block.words || block.words.length === 0) {
    return block.text;
  }
  return block.words
    .map((w) => `<span data-t="${w.start_ms}">${w.word}</span>`)
    .join('');
}

/** Build timeline section from TimelineBlock array. */
function buildTimelineSection(blocks: TimelineBlock[], chapters?: Chapter[]): string[] {
  const lines: string[] = ['## Tidslinje', ''];
  const usedChapters = new Set<string>();
  let lastSpeaker: string | undefined;

  for (const block of blocks) {
    const chapter = chapters ? findChapterForBlock(block, chapters) : undefined;
    const isNewChapter = chapter && !usedChapters.has(chapter.title);
    const speakerChanged = block.speaker !== lastSpeaker;

    if (isNewChapter) {
      usedChapters.add(chapter.title);
      lines.push(`### ${chapter.title}`);
      lines.push(`> ${formatMs(block.start_ms)} \u00b7 ${block.speaker}`);
      lastSpeaker = block.speaker;
    } else if (speakerChanged) {
      lines.push(`> ${formatMs(block.start_ms)} \u00b7 ${block.speaker}`);
      lastSpeaker = block.speaker;
    } else {
      lines.push(`> ${formatMs(block.start_ms)}`);
    }

    lines.push('');
    lines.push(renderBlockText(block));
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
  comments: CommentAnnotation[],
  chapters?: Chapter[],
): string[] {
  if (highlights.length === 0 && comments.length === 0) {
    return buildTimelineSection(blocks, chapters);
  }

  const lines: string[] = ['## Tidslinje', ''];
  const usedChapters = new Set<string>();
  let lastSpeaker: string | undefined;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLast = i === blocks.length - 1;

    const matchesBlock = (ms: number): boolean => {
      if (isLast) {
        return ms >= block.start_ms && ms <= block.end_ms;
      }
      return ms >= block.start_ms && ms < block.end_ms;
    };

    const blockHighlights = highlights.filter((h) => matchesBlock(h.segment_start_ms));
    const blockComments = comments.filter((c) => matchesBlock(c.segment_start_ms));

    const chapter = chapters ? findChapterForBlock(block, chapters) : undefined;
    const isNewChapter = chapter && !usedChapters.has(chapter.title);
    const speakerChanged = block.speaker !== lastSpeaker;

    if (isNewChapter) {
      usedChapters.add(chapter.title);
      lines.push(`### ${chapter.title}`);
    }

    const showSpeaker = isNewChapter || speakerChanged;
    const meta = showSpeaker
      ? `> ${formatMs(block.start_ms)} \u00b7 ${block.speaker}`
      : `> ${formatMs(block.start_ms)}`;
    lastSpeaker = block.speaker;

    const renderedText = renderBlockText(block);

    if (blockHighlights.length > 0) {
      const tag = blockHighlights[0].tag || 'highlight';
      lines.push(`> [!important] #${tag}`);
      lines.push(meta);
      const textLines = renderedText.split('\n');
      for (const tl of textLines) {
        lines.push(`> ${tl}`);
      }
      lines.push('');
    } else {
      lines.push(meta);
      lines.push('');
      lines.push(renderedText);
      lines.push('');
    }

    for (const c of blockComments) {
      lines.push(`<!-- kommentar: ${c.text} -->`);
      lines.push('');
    }
  }

  return lines;
}

interface PageDigestData {
  page: number;
  textExtraction: { method: string; charCount: number; garbled: boolean };
  ocrFallback: { triggered: boolean; charCount: number | null } | null;
  vision: { model: string; description: string; textOnly: boolean } | null;
  combinedCharCount: number;
}

function buildPageDigestSection(digests: PageDigestData[]): string[] {
  if (digests.length === 0) return [];
  const lines: string[] = [];
  lines.push('> [!info]- Pipeline-detaljer per sida');
  lines.push('> | Sida | Text-metod | Tecken | Garbled | OCR | Vision-modell | Vision |');
  lines.push('> |------|-----------|--------|---------|-----|--------------|--------|');
  for (const d of digests) {
    const ocr = d.ocrFallback?.triggered ? `${d.ocrFallback.charCount ?? '?'} tkn` : '—';
    const vModel = d.vision ? d.vision.model : '—';
    const vDesc = d.vision
      ? d.vision.textOnly
        ? 'TEXT_ONLY'
        : d.vision.description.slice(0, 60).replace(/\|/g, '∣') +
          (d.vision.description.length > 60 ? '…' : '')
      : '—';
    const garbled = d.textExtraction.garbled ? 'ja' : 'nej';
    lines.push(
      `> | ${d.page} | ${d.textExtraction.method} | ${d.textExtraction.charCount} | ${garbled} | ${ocr} | ${vModel} | ${vDesc} |`
    );
  }
  lines.push('');
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

function buildSpeakerMap(
  voicePrints: AuroraNode[],
  allNodes: AuroraNode[],
  edges: AuroraEdge[]
): Map<string, SpeakerInfo> {
  const map = new Map<string, SpeakerInfo>();
  for (const vp of voicePrints) {
    const label = (vp.properties.speakerLabel as string) || 'UNKNOWN';
    const segments = Array.isArray(vp.properties.segments)
      ? (vp.properties.segments as Array<{ start_ms: number; end_ms: number }>)
      : [];

    let title = '';
    let organization = '';
    let role = '';
    const identityEdge = edges.find(
      (e) =>
        e.to_id === vp.id &&
        allNodes.some((n) => n.id === e.from_id && n.type === 'speaker_identity')
    );
    if (identityEdge) {
      const identityNode = allNodes.find((n) => n.id === identityEdge.from_id);
      if (identityNode) {
        title = (identityNode.properties.title as string) || '';
        organization = (identityNode.properties.organization as string) || '';
        role = (identityNode.properties.role as string) || '';
      }
    }

    map.set(label, {
      label,
      name: label.startsWith('SPEAKER_') ? '' : label,
      title,
      organization,
      confidence: vp.confidence ?? 0,
      role,
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
  skipImport?: boolean;
}): Promise<{ exported: number }> {
  const vaultPath = cmdOptions.vault || DEFAULT_VAULT;
  const nodesDir = join(vaultPath, 'Aurora');
  const pool = getPool();

  try {
    if (!cmdOptions.skipImport) {
      const { obsidianImportCommand } = await import('./obsidian-import.js');
      await obsidianImportCommand({ vault: vaultPath, sync: true });
    }

    if (!cmdOptions.skipImport) {
      try {
        const { purgeExpiredDeleted } = await import('./obsidian-restore.js');
        const purged = await purgeExpiredDeleted();
        if (purged > 0) {
          console.log(chalk.gray(`  Rensade ${purged} utgångna raderade noder.`));
        }
      } catch {
        // Purge is best-effort — DB may not have the table yet
      }
    }

    console.log(chalk.bold('\n📓 Obsidian Export\n'));
    console.log(`  Vault: ${vaultPath}`);

    // Fetch all nodes
    const nodesResult = await pool.query<AuroraNode>(
      'SELECT id, title, type, scope, confidence, created, source_url, properties FROM aurora_nodes ORDER BY created'
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

    const subdirs = ['Video', 'Dokument', 'Artikel', 'Koncept'];
    for (const sub of subdirs) {
      await mkdir(join(nodesDir, sub), { recursive: true });
    }

    let written = 0;
    for (const node of nodes) {
      if (skipChunkIds.has(node.id)) continue;
      if (node.id.includes('_chunk_')) continue;
      if (node.type === 'voice_print' || node.type === 'speaker_identity') continue;

      const filename = filenameMap.get(node.id)!;
      const subdir = getNodeSubdir(node);
      const props = node.properties || {};
      const lines: string[] = [];

      if (isVideoTranscript(node)) {
        // --- Video transcript with timeline ---
        const voicePrints = findVoicePrints(nodes, node.id);
        const speakerMap = buildSpeakerMap(voicePrints, nodes, edges);

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
          words?: Array<{ start_ms: number; end_ms: number; word: string; probability?: number }>;
        }>;

        const chapters = props.chapters as Chapter[] | undefined;

        const chapterBreaksMs = Array.isArray(chapters)
          ? new Set(chapters.map((ch) => Math.round(ch.start_time * 1000)))
          : undefined;

        let timelineBlocks = buildSpeakerTimeline(
          rawSegments,
          allDiarizationSegments,
          chapterBreaksMs ? { chapterBreaksMs } : undefined,
        );

        timelineBlocks = remergeSameSpeakerBlocks(timelineBlocks, chapters ?? undefined);
        try {
          const { ensureOllama } = await import('../core/ollama.js');
          const ollamaReady = await ensureOllama();
          if (ollamaReady) {
            const { semanticSplitTimeline } = await import('../aurora/semantic-split.js');
            timelineBlocks = await semanticSplitTimeline(timelineBlocks);
          }
        } catch {
          // Ollama unavailable — use mechanical split from buildSpeakerTimeline
        }

        // Frontmatter
        lines.push(formatVideoFrontmatter(node, speakerMap));
        lines.push('');

        // Title
        lines.push(`# ${node.title || node.id}`);
        lines.push('');

        // Speaker table
        lines.push(...buildSpeakerTable(speakerMap));
        lines.push('');

        // Description (from YouTube)
        const videoDescription = props.videoDescription as string | undefined;
        if (videoDescription && videoDescription.trim().length > 0) {
          lines.push('## Beskrivning', '');
          lines.push(videoDescription.trim());
          lines.push('');
        }

        // Chapter table of contents (links to ### headings in timeline)
        if (Array.isArray(chapters) && chapters.length > 0) {
          lines.push('## Kapitel', '');
          for (const ch of chapters) {
            const startSec = Math.round(ch.start_time);
            const hh = String(Math.floor(startSec / 3600)).padStart(2, '0');
            const mm = String(Math.floor((startSec % 3600) / 60)).padStart(2, '0');
            const ss = String(startSec % 60).padStart(2, '0');
            lines.push(`- [[#${ch.title}|${hh}:${mm}:${ss} · ${ch.title}]]`);
          }
          lines.push('');
        }

        // Collect annotations from properties
        const highlights = Array.isArray(props.highlights)
          ? (props.highlights as Array<{ segment_start_ms: number; tag: string }>)
          : [];
        const comments = Array.isArray(props.comments)
          ? (props.comments as Array<{ segment_start_ms: number; text: string }>)
          : [];

        // Timeline (with annotations if present)
        lines.push(...buildTimelineSectionWithAnnotations(timelineBlocks, highlights, comments, chapters ?? undefined));
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

        const pageDigests = props.pageDigests as PageDigestData[] | undefined;
        if (Array.isArray(pageDigests) && pageDigests.length > 0) {
          lines.push(...buildPageDigestSection(pageDigests));
        }
      }

      const targetDir = subdir ? join(nodesDir, subdir) : nodesDir;
      const filePath = join(targetDir, `${filename}.md`);
      await writeFile(filePath, lines.join('\n'), 'utf-8');
      written++;
    }

    const exportedByDir = new Map<string, Set<string>>();
    for (const nd of nodes) {
      if (skipChunkIds.has(nd.id)) continue;
      if (nd.id.includes('_chunk_')) continue;
      if (nd.type === 'voice_print' || nd.type === 'speaker_identity') continue;
      const fn = filenameMap.get(nd.id);
      if (!fn) continue;
      const sub = getNodeSubdir(nd);
      const dir = sub ? join(nodesDir, sub) : nodesDir;
      if (!exportedByDir.has(dir)) exportedByDir.set(dir, new Set());
      exportedByDir.get(dir)!.add(fn + '.md');
    }
    const dirsToClean = [nodesDir, ...subdirs.map((s) => join(nodesDir, s))];
    for (const dir of dirsToClean) {
      const expected = exportedByDir.get(dir) || new Set();
      let existingFiles: string[];
      try {
        existingFiles = await readdir(dir);
      } catch {
        continue;
      }
      for (const file of existingFiles) {
        if (file.endsWith('.md') && !expected.has(file)) {
          logger.info('Removing stale export file', { file, dir });
          await rm(join(dir, file));
        }
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
      const runTags = ['korning', stoplight].map((t) => (t.includes(' ') ? `"${t}"` : t));
      content = frontmatter + `tags: [${runTags.join(', ')}]\n` + body;
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
