import chalk from 'chalk';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../core/logger.js';
import {
  parseObsidianFile,
  matchSegmentTime,
  extractBriefingAnswers,
  type Highlight,
  type Comment,
} from '../aurora/obsidian-parser.js';
import { loadAuroraGraph, updateAuroraNode, saveAuroraGraph } from '../aurora/aurora-graph.js';
import { renameSpeaker } from '../aurora/voiceprint.js';
import { createSpeakerIdentity, updateSpeakerMetadata } from '../aurora/speaker-identity.js';
import { getPool } from '../core/db.js';
import { isVideoTranscript } from './obsidian-export.js';
import { cascadeDeleteAuroraNode } from '../aurora/cascade-delete.js';

const logger = createLogger('obsidian:import');

const DEFAULT_VAULT = '/Users/mpmac/Documents/Neuron Lab';

interface SpeakerRename {
  voicePrintId: string;
  newName: string;
}

interface SpeakerMetadataUpdate {
  speakerName: string;
  voicePrintId: string;
  title: string;
  organization: string;
  role: string;
}

export interface ObsidianImportResult {
  filesProcessed: number;
  highlights: number;
  comments: number;
  speakersRenamed: number;
  feedbackNodes: number;
  contentUpdates: number;
  conflictWarnings: number;
  tagsUpdated: number;
  segmentReassignments: number;
  nodesDeleted: number;
}

/**
 * Extract simple key-value frontmatter from a markdown string.
 * Returns null if no frontmatter block is found.
 */
function extractFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMarkdownFiles(fullPath);
      result.push(...nested);
    } else if (entry.name.endsWith('.md')) {
      result.push(fullPath);
    }
  }
  return result;
}

/**
 * Import tagged/annotated Obsidian markdown files back into the Aurora
 * knowledge graph. Processes highlights, comments, speaker renames,
 * and morning-briefing feedback.
 */
export async function obsidianImportCommand(options: {
  vault?: string;
  sync?: boolean;
}): Promise<ObsidianImportResult> {
  const vaultPath = options.vault || process.env.AURORA_OBSIDIAN_VAULT || DEFAULT_VAULT;
  const auroraDir = join(vaultPath, 'Aurora');

  // 1. Check vault dir exists
  try {
    const dirStat = await stat(auroraDir);
    if (!dirStat.isDirectory()) {
      console.error(chalk.red(`Not a directory: ${auroraDir}`));
      return {
        filesProcessed: 0,
        highlights: 0,
        comments: 0,
        speakersRenamed: 0,
        feedbackNodes: 0,
        contentUpdates: 0,
        conflictWarnings: 0,
        tagsUpdated: 0,
        segmentReassignments: 0,
        nodesDeleted: 0,
      };
    }
  } catch {
    console.error(chalk.red(`Aurora directory not found: ${auroraDir}`));
    return {
      filesProcessed: 0,
      highlights: 0,
      comments: 0,
      speakersRenamed: 0,
      feedbackNodes: 0,
      contentUpdates: 0,
      conflictWarnings: 0,
      tagsUpdated: 0,
      segmentReassignments: 0,
        nodesDeleted: 0,
    };
  }

  console.log(chalk.bold('\n📥 Obsidian Import\n'));
  console.log(`  Vault: ${vaultPath}`);

  let filePaths: string[];
  try {
    filePaths = await collectMarkdownFiles(auroraDir);
  } catch (err) {
    console.error(chalk.red(`Failed to read directory: ${auroraDir}`));
    logger.warn('readdir failed', { error: String(err) });
    return {
      filesProcessed: 0,
      highlights: 0,
      comments: 0,
      speakersRenamed: 0,
      feedbackNodes: 0,
      contentUpdates: 0,
      conflictWarnings: 0,
      tagsUpdated: 0,
      segmentReassignments: 0,
        nodesDeleted: 0,
    };
  }

  if (filePaths.length === 0) {
    console.log(chalk.yellow('  No .md files found in Aurora directory.'));
    return {
      filesProcessed: 0,
      highlights: 0,
      comments: 0,
      speakersRenamed: 0,
      feedbackNodes: 0,
      contentUpdates: 0,
      conflictWarnings: 0,
      tagsUpdated: 0,
      segmentReassignments: 0,
        nodesDeleted: 0,
    };
  }

  // 3. Load graph once
  let graph = await loadAuroraGraph();

  let filesProcessed = 0;
  let totalHighlights = 0;
  let totalComments = 0;
  let totalContentUpdates = 0;
  let totalConflictWarnings = 0;
  let totalTagsUpdated = 0;
  let totalSegmentReassignments = 0;
  const pendingRenames: SpeakerRename[] = [];
  const pendingMetadataUpdates: SpeakerMetadataUpdate[] = [];

  // 4. Process each file
  for (const filePath of filePaths) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (err) {
      logger.warn('Failed to read file, skipping', { file: filePath, error: String(err) });
      continue;
    }

    const parsed = parseObsidianFile(content);
    if (!parsed) continue;

    // Find transcript node by id
    const node = graph.nodes.find((n) => n.id === parsed.id);
    if (!node) {
      logger.warn('Node not found in graph, skipping', { id: parsed.id, file: filePath });
      continue;
    }

    const rawSegments = Array.isArray(node.properties.rawSegments)
      ? (node.properties.rawSegments as Array<{ start_ms: number }>)
      : [];

    // Process highlights — match each to a segment time
    const matchedHighlights: Highlight[] = [];
    for (const hl of parsed.highlights) {
      const segMs = matchSegmentTime(hl.segment_start_ms, rawSegments);
      if (segMs !== null) {
        matchedHighlights.push({ segment_start_ms: segMs, tag: hl.tag });
      } else {
        logger.warn('No matching segment for highlight', {
          file: filePath,
          timecode_ms: hl.segment_start_ms,
          tag: hl.tag,
        });
      }
    }

    // Process comments — match each to a segment time
    const matchedComments: Comment[] = [];
    for (const cm of parsed.comments) {
      const segMs = matchSegmentTime(cm.segment_start_ms, rawSegments);
      if (segMs !== null) {
        matchedComments.push({ segment_start_ms: segMs, text: cm.text });
      } else {
        logger.warn('No matching segment for comment', {
          file: filePath,
          timecode_ms: cm.segment_start_ms,
          text: cm.text,
        });
      }
    }

    // Build base updated properties (highlights + comments + tags — all nodes)
    const updatedProperties: Record<string, unknown> = {
      ...node.properties,
      highlights: matchedHighlights,
      comments: matchedComments,
    };

    if (parsed.tags !== null) {
      const existingTags = Array.isArray(node.properties.tags)
        ? (node.properties.tags as string[])
        : [];
      const tagsChanged = JSON.stringify(parsed.tags) !== JSON.stringify(existingTags);
      if (tagsChanged) {
        updatedProperties.tags = parsed.tags;
        totalTagsUpdated++;
      }
    }

    // Conflict warning: if node was updated in Aurora after last export
    if (parsed.exportedAt && node.updated > parsed.exportedAt) {
      logger.warn(
        'Node updated in Aurora since last export — Obsidian changes may overwrite newer data',
        {
          nodeId: node.id,
          nodeUpdated: node.updated,
          exportedAt: parsed.exportedAt,
        }
      );
      totalConflictWarnings++;
    }

    // Build the single update object
    const nodeUpdates: {
      properties: Record<string, unknown>;
      title?: string;
      confidence?: number;
    } = {
      properties: updatedProperties,
    };

    // Non-video nodes: also update text content, title, confidence
    const isVideo = isVideoTranscript(node);
    if (!isVideo) {
      if (
        parsed.textContent !== null &&
        parsed.textContent !== undefined &&
        parsed.textContent !== node.properties.text
      ) {
        nodeUpdates.properties = { ...nodeUpdates.properties, text: parsed.textContent };
        totalContentUpdates++;
      }
      if (parsed.title !== null && parsed.title !== undefined && parsed.title !== node.title) {
        nodeUpdates.title = parsed.title;
      }
      if (
        parsed.confidence !== null &&
        parsed.confidence !== undefined &&
        parsed.confidence !== node.confidence
      ) {
        nodeUpdates.confidence = parsed.confidence;
      }
    }

    // ONE single updateAuroraNode call — never call it twice for the same node
    graph = updateAuroraNode(graph, node.id, nodeUpdates);

    // Collect speaker renames
    for (const speaker of parsed.speakers) {
      if (!speaker.name) continue;

      // Find matching voice_print node
      const vpNode = graph.nodes.find(
        (n) =>
          n.type === 'voice_print' &&
          n.properties.videoNodeId === parsed.id &&
          n.properties.speakerLabel === speaker.label
      );

      if (!vpNode) {
        logger.warn('Voice print not found for speaker rename', {
          file: filePath,
          label: speaker.label,
          transcriptId: parsed.id,
        });
        continue;
      }

      // Only rename if the name differs from the current label
      const currentLabel = vpNode.properties.speakerLabel as string;
      if (currentLabel !== speaker.name) {
        pendingRenames.push({
          voicePrintId: vpNode.id,
          newName: speaker.name,
        });
      }

      if (speaker.title || speaker.organization) {
        pendingMetadataUpdates.push({
          speakerName: speaker.name,
          voicePrintId: vpNode.id,
          title: speaker.title,
          organization: speaker.organization,
          role: speaker.role,
        });
      }
    }

    if (isVideo && parsed.timelineBlocks && parsed.timelineBlocks.length > 0) {
      const voicePrints = graph.nodes.filter(
        (n) => n.type === 'voice_print' && n.properties.videoNodeId === parsed.id
      );

      for (const block of parsed.timelineBlocks) {
        const vpForTime = voicePrints.find((vp) => {
          const segments = vp.properties.segments as
            | Array<{ start_ms: number; end_ms: number }>
            | undefined;
          if (!segments) return false;
          return segments.some((s) => Math.abs(s.start_ms - block.timecode_ms) <= 5000);
        });

        if (!vpForTime) continue;

        const currentSpeaker = vpForTime.properties.speakerLabel as string;
        if (currentSpeaker === block.speaker) continue;

        const targetVp = voicePrints.find(
          (vp) => (vp.properties.speakerLabel as string) === block.speaker
        );
        if (!targetVp) continue;

        const sourceSegments =
          (vpForTime.properties.segments as Array<{ start_ms: number; end_ms: number }>) || [];
        const segIdx = sourceSegments.findIndex(
          (s) => Math.abs(s.start_ms - block.timecode_ms) <= 5000
        );
        if (segIdx === -1) continue;

        const [movedSegment] = sourceSegments.splice(segIdx, 1);
        const targetSegments = [
          ...((targetVp.properties.segments as Array<{ start_ms: number; end_ms: number }>) || []),
          movedSegment,
        ];
        targetSegments.sort((a, b) => a.start_ms - b.start_ms);

        graph = updateAuroraNode(graph, vpForTime.id, {
          properties: { ...vpForTime.properties, segments: sourceSegments },
        });
        graph = updateAuroraNode(graph, targetVp.id, {
          properties: { ...targetVp.properties, segments: targetSegments },
        });

        totalSegmentReassignments++;
      }
    }

    filesProcessed++;
    totalHighlights += matchedHighlights.length;
    totalComments += matchedComments.length;
  }

  // 4b. Process briefing files from Briefings/ subdirectory
  let totalFeedback = 0;
  const briefingsDir = join(vaultPath, 'Briefings');
  try {
    const briefingsDirStat = await stat(briefingsDir);
    if (briefingsDirStat.isDirectory()) {
      const briefingFiles = (await readdir(briefingsDir)).filter((f) => f.endsWith('.md'));

      for (const file of briefingFiles) {
        const filePath = join(briefingsDir, file);
        let content: string;
        try {
          content = await readFile(filePath, 'utf-8');
        } catch (err) {
          logger.warn('Failed to read briefing file, skipping', { file, error: String(err) });
          continue;
        }

        // Check if this is a morning-briefing file
        const fm = extractFrontmatter(content);
        if (!fm || fm.type !== 'morning-briefing') continue;

        const briefingDate = fm.id?.replace('briefing-', '') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(briefingDate)) {
          logger.warn('Invalid briefing date format, skipping file', { id: fm.id, briefingDate });
          continue;
        }

        // Extract the body (after frontmatter)
        const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const body = bodyMatch ? bodyMatch[1] : content;

        const answers = extractBriefingAnswers(body);

        const pool = getPool();

        for (const answer of answers) {
          if (!answer.answer.trim()) continue;

          try {
            // Truncate question for title (max 80 chars)
            const shortQuestion =
              answer.questionText.length > 60
                ? answer.questionText.slice(0, 57) + '...'
                : answer.questionText;
            const title = `Feedback: ${shortQuestion}`.slice(0, 80);

            const feedbackContent = `${answer.questionText}\n\nSvar: ${answer.answer}`;

            // Idempotency: check if feedback node already exists
            const existing = await pool.query(
              `SELECT id FROM aurora_nodes
               WHERE type = 'fact'
               AND properties->>'source' = 'morning-briefing'
               AND properties->>'briefing_date' = $1
               AND properties->>'question_node_id' = $2
               LIMIT 1`,
              [briefingDate, answer.questionNodeId || '']
            );

            if (existing.rows.length > 0) {
              // Update existing node
              await pool.query(
                `UPDATE aurora_nodes SET
                  properties = properties || $1::jsonb,
                  updated = NOW()
                 WHERE id = $2`,
                [
                  JSON.stringify({
                    sentiment: answer.sentiment,
                    feedback_text: feedbackContent,
                  }),
                  existing.rows[0].id,
                ]
              );
              logger.info('Updated existing feedback node', {
                id: existing.rows[0].id,
                briefingDate,
              });
            } else {
              // Create new feedback node
              const nodeId = `feedback-${briefingDate}-${answer.questionIndex}`;
              await pool.query(
                `INSERT INTO aurora_nodes (id, title, type, properties, scope, confidence)
                 VALUES ($1, $2, 'fact', $3, 'personal', 1.0)
                 ON CONFLICT (id) DO UPDATE SET
                   properties = EXCLUDED.properties,
                   updated = NOW()`,
                [
                  nodeId,
                  title,
                  JSON.stringify({
                    subtype: 'feedback',
                    source: 'morning-briefing',
                    briefing_date: briefingDate,
                    sentiment: answer.sentiment,
                    question_category: answer.questionCategory || 'unknown',
                    question_node_id: answer.questionNodeId || '',
                    feedback_text: feedbackContent,
                  }),
                ]
              );

              // Create edge if question_node_id exists in DB
              if (answer.questionNodeId) {
                const targetExists = await pool.query(
                  'SELECT id FROM aurora_nodes WHERE id = $1 LIMIT 1',
                  [answer.questionNodeId]
                );

                if (targetExists.rows.length > 0) {
                  await pool.query(
                    `INSERT INTO aurora_edges (from_id, to_id, type, metadata)
                     VALUES ($1, $2, 'related_to', $3)
                     ON CONFLICT (from_id, to_id, type) DO NOTHING`,
                    [
                      nodeId,
                      answer.questionNodeId,
                      JSON.stringify({ source: 'morning-briefing-feedback' }),
                    ]
                  );
                } else {
                  logger.warn('question_node_id not found in DB, skipping edge', {
                    nodeId: answer.questionNodeId,
                    briefingDate,
                  });
                }
              }

              totalFeedback++;
            }
          } catch (err) {
            logger.warn('Failed to process briefing answer, skipping', {
              file,
              questionIndex: answer.questionIndex,
              error: String(err),
            });
          }
        }

        filesProcessed++;
      }
    }
  } catch (err) {
    // Briefings/ dir doesn't exist — that's OK, skip silently
    logger.debug('No Briefings/ directory found, skipping briefing import', { error: String(err) });
  }

  // 5. Save graph once
  await saveAuroraGraph(graph);

  // 6. Process speaker renames (each does its own load/save)
  let speakersRenamed = 0;
  for (const rename of pendingRenames) {
    try {
      await renameSpeaker(rename.voicePrintId, rename.newName);
      speakersRenamed++;
    } catch (err) {
      logger.warn('Failed to rename speaker', {
        voicePrintId: rename.voicePrintId,
        newName: rename.newName,
        error: String(err),
      });
    }
  }

  // 7. Process speaker metadata updates (title, organization, role)
  for (const update of pendingMetadataUpdates) {
    try {
      const identityId = `speaker-${update.speakerName.toLowerCase().replace(/\s+/g, '-')}`;
      const identityExists = graph.nodes.some(
        (n) => n.id === identityId && n.type === 'speaker_identity'
      );

      if (identityExists) {
        await updateSpeakerMetadata(identityId, {
          title: update.title,
          organization: update.organization,
          role: update.role,
        });
      } else if (update.speakerName) {
        const identity = await createSpeakerIdentity(update.speakerName, update.voicePrintId);
        await updateSpeakerMetadata(identity.id, {
          title: update.title,
          organization: update.organization,
          role: update.role,
        });
      }
    } catch (err) {
      logger.warn('Failed to update speaker metadata', {
        speakerName: update.speakerName,
        error: String(err),
      });
    }
  }

  // 8. Sync: delete nodes whose files were removed from Obsidian
  let totalNodesDeleted = 0;
  if (options.sync) {
    const fileNodeIds = new Set<string>();
    for (const fp of filePaths) {
      try {
        const raw = await readFile(fp, 'utf-8');
        const parsed = parseObsidianFile(raw);
        if (parsed?.id) fileNodeIds.add(parsed.id);
      } catch {
        // skip — file already handled in main loop
      }
    }

    const EXPORTABLE_TYPES = new Set(['document', 'transcript', 'article', 'concept']);
    const exportableNodes = graph.nodes.filter(
      (n) => EXPORTABLE_TYPES.has(n.type) && !n.id.includes('_chunk_'),
    );

    const exportedAtTimestamps: string[] = [];
    for (const fp of filePaths) {
      try {
        const raw = await readFile(fp, 'utf-8');
        const p = parseObsidianFile(raw);
        if (p?.exportedAt) exportedAtTimestamps.push(p.exportedAt);
      } catch {
        // skip
      }
    }
    const latestExportedAt = exportedAtTimestamps.sort().pop() ?? '';

    for (const node of exportableNodes) {
      const neverExported = !latestExportedAt || node.created > latestExportedAt;
      if (!fileNodeIds.has(node.id) && !neverExported) {
        try {
          const deleteResult = await cascadeDeleteAuroraNode(node.id);
          if (deleteResult.deleted) {
            totalNodesDeleted++;
            console.log(chalk.red(`  🗑️  Raderad: "${node.title}" (${node.id})`));
            graph = await loadAuroraGraph();
          }
        } catch (err) {
          logger.warn('Failed to cascade delete node', { nodeId: node.id, error: String(err) });
        }
      }
    }
  }

  // 9. Print summary
  console.log(chalk.green(`\n✅ Import complete`));
  console.log(`  Files processed : ${filesProcessed}`);
  console.log(`  Highlights      : ${totalHighlights}`);
  console.log(`  Comments        : ${totalComments}`);
  console.log(`  Content updates : ${totalContentUpdates}`);
  console.log(`  Conflict warnings: ${totalConflictWarnings}`);
  console.log(`  Tags updated    : ${totalTagsUpdated}`);
  console.log(`  Segment reassign: ${totalSegmentReassignments}`);
  console.log(`  Speakers renamed: ${speakersRenamed}`);
  console.log(`  Feedback nodes  : ${totalFeedback}`);
  if (totalNodesDeleted > 0) {
    console.log(chalk.red(`  Nodes deleted   : ${totalNodesDeleted}`));
  }

  return {
    filesProcessed,
    highlights: totalHighlights,
    comments: totalComments,
    speakersRenamed,
    feedbackNodes: totalFeedback,
    contentUpdates: totalContentUpdates,
    conflictWarnings: totalConflictWarnings,
    tagsUpdated: totalTagsUpdated,
    segmentReassignments: totalSegmentReassignments,
    nodesDeleted: totalNodesDeleted,
  };
}
