import chalk from 'chalk';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../core/logger.js';
import {
  parseObsidianFile,
  matchSegmentTime,
  type Highlight,
  type Comment,
} from '../aurora/obsidian-parser.js';
import {
  loadAuroraGraph,
  updateAuroraNode,
  saveAuroraGraph,
} from '../aurora/aurora-graph.js';
import { renameSpeaker } from '../aurora/voiceprint.js';

const logger = createLogger('obsidian:import');

const DEFAULT_VAULT = '/Users/mpmac/Documents/Neuron Lab';

interface SpeakerRename {
  voicePrintId: string;
  newName: string;
}

/**
 * Import tagged/annotated Obsidian markdown files back into the Aurora
 * knowledge graph. Processes highlights, comments, and speaker renames.
 */
export async function obsidianImportCommand(options: {
  vault?: string;
}): Promise<void> {
  const vaultPath =
    options.vault ||
    process.env.AURORA_OBSIDIAN_VAULT ||
    DEFAULT_VAULT;
  const auroraDir = join(vaultPath, 'Aurora');

  // 1. Check vault dir exists
  try {
    const dirStat = await stat(auroraDir);
    if (!dirStat.isDirectory()) {
      console.error(chalk.red(`Not a directory: ${auroraDir}`));
      return;
    }
  } catch {
    console.error(chalk.red(`Aurora directory not found: ${auroraDir}`));
    return;
  }

  console.log(chalk.bold('\n📥 Obsidian Import\n'));
  console.log(`  Vault: ${vaultPath}`);

  // 2. Read all .md files from Aurora/ directory
  let files: string[];
  try {
    const entries = await readdir(auroraDir);
    files = entries.filter((f) => f.endsWith('.md'));
  } catch (err) {
    console.error(chalk.red(`Failed to read directory: ${auroraDir}`));
    logger.warn('readdir failed', { error: String(err) });
    return;
  }

  if (files.length === 0) {
    console.log(chalk.yellow('  No .md files found in Aurora directory.'));
    return;
  }

  // 3. Load graph once
  let graph = await loadAuroraGraph();

  let filesProcessed = 0;
  let totalHighlights = 0;
  let totalComments = 0;
  const pendingRenames: SpeakerRename[] = [];

  // 4. Process each file
  for (const file of files) {
    const filePath = join(auroraDir, file);

    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (err) {
      logger.warn('Failed to read file, skipping', { file, error: String(err) });
      continue;
    }

    const parsed = parseObsidianFile(content);
    if (!parsed) continue;

    // Find transcript node by id
    const node = graph.nodes.find((n) => n.id === parsed.id);
    if (!node) {
      logger.warn('Node not found in graph, skipping', { id: parsed.id, file });
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
          file,
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
          file,
          timecode_ms: cm.segment_start_ms,
          text: cm.text,
        });
      }
    }

    // Update node — replace highlights and comments (idempotent)
    graph = updateAuroraNode(graph, node.id, {
      properties: {
        ...node.properties,
        highlights: matchedHighlights,
        comments: matchedComments,
      },
    });

    // Collect speaker renames
    for (const speaker of parsed.speakers) {
      if (!speaker.name) continue;

      // Find matching voice_print node
      const vpNode = graph.nodes.find(
        (n) =>
          n.type === 'voice_print' &&
          n.properties.videoNodeId === parsed.id &&
          n.properties.speakerLabel === speaker.label,
      );

      if (!vpNode) {
        logger.warn('Voice print not found for speaker rename', {
          file,
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
    }

    filesProcessed++;
    totalHighlights += matchedHighlights.length;
    totalComments += matchedComments.length;
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

  // 7. Print summary
  console.log(chalk.green(`\n  ✅ Import complete`));
  console.log(`     Files processed: ${filesProcessed}`);
  console.log(`     Highlights:      ${totalHighlights}`);
  console.log(`     Comments:        ${totalComments}`);
  console.log(`     Speakers renamed: ${speakersRenamed}`);
}
