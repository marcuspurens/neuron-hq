import {
  loadAuroraGraph,
  saveAuroraGraph,
  updateAuroraNode,
  removeAuroraNode,
  findAuroraNodes,
} from './aurora-graph.js';
import { AURORA_SIMILARITY } from './llm-defaults.js';

/**
 * Rename a speaker's voice print label and title.
 * @param voicePrintId - The node ID of the voice_print to rename
 * @param newName - The new speaker label
 * @returns Object with oldName, newName, and voicePrintId
 */
export async function renameSpeaker(
  voicePrintId: string,
  newName: string,
): Promise<{ oldName: string; newName: string; voicePrintId: string }> {
  const graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === voicePrintId);
  if (!node || node.type !== 'voice_print') {
    throw new Error(`Voice print not found: ${voicePrintId}`);
  }
  const oldName = (node.properties.speakerLabel as string) || node.title;
  const updated = updateAuroraNode(graph, voicePrintId, {
    properties: { ...node.properties, speakerLabel: newName },
    title: `Speaker: ${newName}`,
  });
  await saveAuroraGraph(updated);
  return { oldName, newName, voicePrintId };
}

/**
 * Merge two speaker voice prints, transferring segments and edges from source to target.
 * @param sourceId - The voice_print node to merge away (will be removed)
 * @param targetId - The voice_print node to merge into (will be kept)
 * @returns Merge result with segment counts
 */
export async function mergeSpeakers(
  sourceId: string,
  targetId: string,
): Promise<{
  merged: boolean;
  targetId: string;
  targetName: string;
  sourceSegments: number;
  totalSegments: number;
}> {
  if (sourceId === targetId) {
    throw new Error('Cannot merge a speaker with itself');
  }
  const graph = await loadAuroraGraph();
  const source = graph.nodes.find((n) => n.id === sourceId);
  const target = graph.nodes.find((n) => n.id === targetId);
  if (!source || source.type !== 'voice_print') {
    throw new Error(`Source voice print not found: ${sourceId}`);
  }
  if (!target || target.type !== 'voice_print') {
    throw new Error(`Target voice print not found: ${targetId}`);
  }

  const sourceSegments = (source.properties.segmentCount as number) || 0;
  const targetSegments = (target.properties.segmentCount as number) || 0;
  const sourceDuration = (source.properties.totalDurationMs as number) || 0;
  const targetDuration = (target.properties.totalDurationMs as number) || 0;

  let updated = updateAuroraNode(graph, targetId, {
    properties: {
      ...target.properties,
      segmentCount: targetSegments + sourceSegments,
      totalDurationMs: targetDuration + sourceDuration,
    },
  });

  // Transfer edges: use edge.type (NOT edge.relation — the schema uses 'type')
  const sourceEdges = updated.edges.filter(
    (e) => e.from === sourceId || e.to === sourceId,
  );
  const newEdges = [...updated.edges];
  for (const edge of sourceEdges) {
    const newFrom = edge.from === sourceId ? targetId : edge.from;
    const newTo = edge.to === sourceId ? targetId : edge.to;
    if (newFrom === newTo) continue;
    if (
      !newEdges.find(
        (e) => e.from === newFrom && e.to === newTo && e.type === edge.type,
      )
    ) {
      newEdges.push({ ...edge, from: newFrom, to: newTo });
    }
  }
  updated = { ...updated, edges: newEdges };

  updated = removeAuroraNode(updated, sourceId);
  await saveAuroraGraph(updated);

  return {
    merged: true,
    targetId,
    targetName: (target.properties.speakerLabel as string) || target.title,
    sourceSegments,
    totalSegments: targetSegments + sourceSegments,
  };
}

/**
 * Suggest potential speaker matches across different videos based on label similarity.
 * @param options - Optional filter by voicePrintId and similarity threshold
 * @returns Array of match suggestions sorted by similarity descending
 */
export async function suggestSpeakerMatches(
  options?: {
    voicePrintId?: string;
    threshold?: number;
  },
): Promise<
  Array<{
    sourceId: string;
    sourceName: string;
    matchId: string;
    matchName: string;
    sourceVideo: string;
    matchVideo: string;
    similarity: number;
    reason: string;
  }>
> {
  const threshold = options?.threshold ?? AURORA_SIMILARITY.crossref;
  const graph = await loadAuroraGraph();
  const voicePrints = findAuroraNodes(graph, { type: 'voice_print' });

  if (voicePrints.length < 2) return [];

  const sources = options?.voicePrintId
    ? voicePrints.filter((n) => n.id === options.voicePrintId)
    : voicePrints;

  const matches: Array<{
    sourceId: string;
    sourceName: string;
    matchId: string;
    matchName: string;
    sourceVideo: string;
    matchVideo: string;
    similarity: number;
    reason: string;
  }> = [];

  for (const source of sources) {
    for (const candidate of voicePrints) {
      if (source.id === candidate.id) continue;
      if (source.properties.videoNodeId === candidate.properties.videoNodeId)
        continue;
      if (
        matches.find(
          (m) => m.sourceId === candidate.id && m.matchId === source.id,
        )
      )
        continue;

      let similarity = 0;
      let reason = '';

      const sourceLabel = (source.properties.speakerLabel as string) || '';
      const candidateLabel =
        (candidate.properties.speakerLabel as string) || '';
      if (sourceLabel && candidateLabel && sourceLabel === candidateLabel) {
        if (sourceLabel.startsWith('SPEAKER_')) {
          similarity = 0.5;
          reason = `Same auto-label: ${sourceLabel}`;
        } else {
          similarity = 0.95;
          reason = `Same name: ${sourceLabel}`;
        }
      }

      if (similarity >= threshold) {
        matches.push({
          sourceId: source.id,
          sourceName: source.title,
          matchId: candidate.id,
          matchName: candidate.title,
          sourceVideo:
            (source.properties.videoNodeId as string) || 'unknown',
          matchVideo:
            (candidate.properties.videoNodeId as string) || 'unknown',
          similarity,
          reason,
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
