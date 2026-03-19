import chalk from 'chalk';
import { getPool } from '../core/db.js';
import { buildSpeakerTimeline, formatMs } from '../aurora/speaker-timeline.js';
import type { DiarizationSegment, WhisperSegment } from '../aurora/speaker-timeline.js';

/** Shape of a voice_print node row from the DB. */
interface VoicePrintRow {
  id: string;
  title: string;
  type: string;
  properties: {
    speakerLabel?: string;
    segments?: { start_ms: number; end_ms: number }[];
    [key: string]: unknown;
  };
}

/**
 * CLI command: aurora:show <nodeId>
 * Show full metadata, properties and edges for an Aurora node.
 */
export async function auroraShowCommand(nodeId: string): Promise<void> {
  const pool = getPool();

  const nodeRes = await pool.query(
    'SELECT id, title, type, scope, confidence, created, properties FROM aurora_nodes WHERE id = $1',
    [nodeId],
  );

  if (nodeRes.rows.length === 0) {
    console.log(chalk.red(`\n  Node "${nodeId}" not found.\n`));
    return;
  }

  const node = nodeRes.rows[0];
  const props = node.properties || {};

  console.log('');
  console.log(chalk.bold(`  ${node.title}`));
  console.log(chalk.dim(`  ID: ${node.id}`));
  console.log('');

  // Metadata table
  console.log(chalk.bold('  Metadata'));
  console.log(`  ├─ Type:       ${node.type}`);
  console.log(`  ├─ Scope:      ${node.scope}`);
  console.log(`  ├─ Confidence: ${node.confidence}`);
  console.log(`  ├─ Created:    ${new Date(node.created).toISOString().slice(0, 19)}`);
  if (props.platform) console.log(`  ├─ Platform:   ${props.platform}`);
  if (props.videoId) console.log(`  ├─ Video ID:   ${props.videoId}`);
  if (props.videoUrl) console.log(`  ├─ URL:        ${props.videoUrl}`);
  if (props.sourceUrl) console.log(`  ├─ URL:        ${props.sourceUrl}`);
  if (props.duration) console.log(`  ├─ Duration:   ${props.duration}s`);
  if (props.language) console.log(`  ├─ Language:   ${props.language}`);
  if (props.publishedDate) console.log(`  ├─ Published:  ${props.publishedDate}`);
  if (props.segmentCount) console.log(`  ├─ Segments:   ${props.segmentCount}`);
  if (props.wordCount) console.log(`  ├─ Words:      ${props.wordCount}`);
  console.log(`  └─ Has embed:  ${node.properties ? 'yes' : 'no'}`);

  // Edges
  const edgesRes = await pool.query(
    `SELECT from_id, to_id, type FROM aurora_edges WHERE from_id = $1 OR to_id = $1 ORDER BY type`,
    [nodeId],
  );

  if (edgesRes.rows.length > 0) {
    console.log('');
    console.log(chalk.bold(`  Edges (${edgesRes.rows.length})`));
    for (const edge of edgesRes.rows) {
      if (edge.from_id === nodeId) {
        console.log(`  → ${edge.type} → ${edge.to_id}`);
      } else {
        console.log(`  ← ${edge.type} ← ${edge.from_id}`);
      }
    }
  }

  // Chunks
  const chunksRes = await pool.query(
    `SELECT id FROM aurora_nodes WHERE id LIKE $1 ORDER BY id`,
    [`${nodeId}_chunk_%`],
  );
  if (chunksRes.rows.length > 0) {
    console.log('');
    console.log(chalk.bold(`  Chunks (${chunksRes.rows.length})`));
    for (const chunk of chunksRes.rows) {
      console.log(`  ├─ ${chunk.id}`);
    }
  }

  // Timeline (speaker summary)
  const rawSegments = props.rawSegments as WhisperSegment[] | undefined;
  if (node.type === 'transcript' && Array.isArray(rawSegments) && rawSegments.length > 0) {
    await renderTimelineSummary(pool, nodeId, rawSegments);
  }

  // Pipeline report
  const pipelineReport = props.pipeline_report as {
    steps_completed: number;
    steps_total: number;
    duration_seconds: number;
    details: Record<string, { status: string; message?: string; [key: string]: unknown }>;
  } | undefined;

  if (pipelineReport) {
    console.log('');
    console.log(chalk.bold(`  Pipeline-rapport (${pipelineReport.steps_completed}/${pipelineReport.steps_total} steg, ${pipelineReport.duration_seconds}s)`));
    const statusIcon = (s: string): string => s === 'ok' ? chalk.green('✓') : s === 'error' ? chalk.red('✗') : chalk.dim('–');
    const entries = Object.entries(pipelineReport.details);
    for (let i = 0; i < entries.length; i++) {
      const [stepName, detail] = entries[i];
      const isLast = i === entries.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const parts: string[] = [];
      if (detail.duration_s) parts.push(`${detail.duration_s}s`);
      if (detail.words) parts.push(`${detail.words} ord`);
      if (detail.speakers !== undefined) parts.push(`${detail.speakers} talare`);
      if (detail.chunks) parts.push(`${detail.chunks} chunks`);
      if (detail.vectors) parts.push(`${detail.vectors} vektorer`);
      if (detail.matches !== undefined) parts.push(`${detail.matches} kopplingar`);
      if (detail.model) parts.push(`modell: ${detail.model}`);
      if (detail.message) parts.push(detail.message);
      let info = '';
      if (parts.length > 0) info = ` (${parts.join(', ')})`;
      console.log(`  ${prefix} ${statusIcon(detail.status)} ${stepName}${info}`);
    }
  }

  // Transcript (text)
  const text = props.text as string | undefined;
  if (text) {
    console.log('');
    console.log(chalk.bold('  Transcript / Text'));
    console.log(chalk.dim('  ─'.repeat(40)));
    // Word-wrap at ~100 chars with 2-space indent
    const words = text.split(' ');
    let line = '  ';
    for (const word of words) {
      if (line.length + word.length > 100) {
        console.log(line);
        line = '  ' + word;
      } else {
        line += (line.length > 2 ? ' ' : '') + word;
      }
    }
    if (line.trim()) console.log(line);
  }

  console.log('');
}

/**
 * Query voice_print nodes, build speaker timeline, and display a summary.
 */
async function renderTimelineSummary(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: VoicePrintRow[] }> },
  nodeId: string,
  whisperSegments: WhisperSegment[],
): Promise<void> {
  const vpRes = await pool.query(
    `SELECT id, title, type, properties FROM aurora_nodes WHERE type = 'voice_print' AND properties->>'videoNodeId' = $1`,
    [nodeId],
  );

  // Build diarization segments from voice_print nodes
  const diarizationSegments: DiarizationSegment[] = [];
  for (const vp of vpRes.rows) {
    const vpProps = vp.properties || {};
    const speaker = (vpProps.speakerLabel as string) || 'UNKNOWN';
    const segments = vpProps.segments || [];
    for (const seg of segments) {
      diarizationSegments.push({
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
        speaker,
      });
    }
  }

  const blocks = buildSpeakerTimeline(whisperSegments, diarizationSegments);
  if (blocks.length === 0) return;

  // Count speaker changes
  let speakerChanges = 0;
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].speaker !== blocks[i - 1].speaker) {
      speakerChanges++;
    }
  }

  // Aggregate per-speaker stats
  const speakerStats = new Map<string, { earliest: number; blockCount: number; totalMs: number }>();
  for (const block of blocks) {
    const existing = speakerStats.get(block.speaker);
    if (existing) {
      existing.earliest = Math.min(existing.earliest, block.start_ms);
      existing.blockCount++;
      existing.totalMs += block.end_ms - block.start_ms;
    } else {
      speakerStats.set(block.speaker, {
        earliest: block.start_ms,
        blockCount: 1,
        totalMs: block.end_ms - block.start_ms,
      });
    }
  }

  // Sort speakers by earliest appearance
  const speakers = [...speakerStats.entries()].sort((a, b) => a[1].earliest - b[1].earliest);

  console.log('');
  console.log(chalk.bold(`  Tidslinje (${speakerChanges} talarbyten)`));
  for (let i = 0; i < speakers.length; i++) {
    const [speaker, stats] = speakers[i];
    const isLast = i === speakers.length - 1;
    const prefix = isLast ? '└─' : '├─';
    const startFormatted = formatMs(stats.earliest);
    const durationFormatted = formatMs(stats.totalMs);
    console.log(
      chalk.dim(`  ${prefix}`) +
        ` ${startFormatted} ${speaker} (${stats.blockCount} block, ${durationFormatted})`,
    );
  }
}
