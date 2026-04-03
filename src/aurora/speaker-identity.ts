import {
  loadAuroraGraph,
  saveAuroraGraph,
  addAuroraNode,
  addAuroraEdge,
  findAuroraNodes,
  updateAuroraNode,
} from './aurora-graph.js';
import type { AuroraNode } from './aurora-schema.js';

/** Represents a confirmed or candidate speaker identity. */
export interface SpeakerIdentity {
  id: string;
  name: string;
  confirmations: number;
  confidence: number;
  autoTagThreshold: number;
  confirmedVoicePrints: string[];
  metadata: Record<string, unknown>;
  created: string;
  updated: string;
}

/** Convert an AuroraNode to a SpeakerIdentity. */
function nodeToIdentity(node: AuroraNode): SpeakerIdentity {
  return {
    id: node.id,
    name: (node.properties.name as string) || node.title,
    confirmations: (node.properties.confirmations as number) || 0,
    confidence: node.confidence,
    autoTagThreshold: (node.properties.autoTagThreshold as number) || 0.9,
    confirmedVoicePrints: (node.properties.confirmedVoicePrints as string[]) || [],
    metadata: (node.properties.metadata as Record<string, unknown>) || {},
    created: node.created,
    updated: node.updated,
  };
}

/**
 * Create a new speaker identity linked to a voice print.
 * @param name - Human-readable speaker name
 * @param voicePrintId - ID of the initial voice print to confirm
 * @returns The newly created SpeakerIdentity
 */
export async function createSpeakerIdentity(
  name: string,
  voicePrintId: string
): Promise<SpeakerIdentity> {
  const id = `speaker-${name.toLowerCase().replace(/\s+/g, '-')}`;
  const now = new Date().toISOString();

  const node: AuroraNode = {
    id,
    type: 'speaker_identity',
    title: name,
    properties: {
      name,
      role: 'unknown',
      confirmations: 1,
      confirmedVoicePrints: [voicePrintId],
      autoTagThreshold: 0.9,
      metadata: {},
    },
    confidence: 0.5,
    scope: 'personal',
    sourceUrl: null,
    created: now,
    updated: now,
  };

  let graph = await loadAuroraGraph();
  graph = addAuroraNode(graph, node);
  graph = addAuroraEdge(graph, {
    from: id,
    to: voicePrintId,
    type: 'related_to',
    metadata: { createdBy: 'speaker-identity', relationship: 'confirmed' },
  });
  await saveAuroraGraph(graph);

  return nodeToIdentity(node);
}

/**
 * Confirm that a voice print belongs to a speaker identity.
 * If the voice print was already confirmed, returns current state without changes.
 * @param identityId - The speaker identity node ID
 * @param voicePrintId - The voice print to confirm
 * @returns The updated identity and new confidence value
 */
export async function confirmSpeaker(
  identityId: string,
  voicePrintId: string
): Promise<{ identity: SpeakerIdentity; newConfidence: number }> {
  let graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === identityId);
  if (!node || node.type !== 'speaker_identity') {
    throw new Error(`Speaker identity not found: ${identityId}`);
  }

  const prints = (node.properties.confirmedVoicePrints as string[]) || [];

  if (prints.includes(voicePrintId)) {
    const identity = nodeToIdentity(node);
    return { identity, newConfidence: identity.confidence };
  }

  const newPrints = [...prints, voicePrintId];
  const newConfirmations = ((node.properties.confirmations as number) || 0) + 1;
  const newConfidence = Math.min(0.95, 0.5 + (newConfirmations - 1) * 0.1);

  graph = updateAuroraNode(graph, identityId, {
    properties: {
      ...node.properties,
      confirmedVoicePrints: newPrints,
      confirmations: newConfirmations,
    },
    confidence: newConfidence,
  });

  graph = addAuroraEdge(graph, {
    from: identityId,
    to: voicePrintId,
    type: 'related_to',
    metadata: { createdBy: 'speaker-identity', relationship: 'confirmed' },
  });

  await saveAuroraGraph(graph);

  const updated = graph.nodes.find((n) => n.id === identityId)!;
  const identity = nodeToIdentity(updated);
  return { identity, newConfidence };
}

/**
 * Reject a voice print as NOT belonging to a speaker identity.
 * Prevents future suggestions of this pairing.
 * @param identityId - The speaker identity node ID
 * @param voicePrintId - The voice print to reject
 */
export async function rejectSpeakerSuggestion(
  identityId: string,
  voicePrintId: string
): Promise<void> {
  let graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === identityId);
  if (!node || node.type !== 'speaker_identity') {
    throw new Error(`Speaker identity not found: ${identityId}`);
  }

  const rejected = (node.properties.rejectedVoicePrints as string[]) || [];
  if (!rejected.includes(voicePrintId)) {
    graph = updateAuroraNode(graph, identityId, {
      properties: {
        ...node.properties,
        rejectedVoicePrints: [...rejected, voicePrintId],
      },
    });
  }

  await saveAuroraGraph(graph);
}

/**
 * List all speaker identities, sorted by confidence descending.
 * @returns Array of SpeakerIdentity objects
 */
export async function listSpeakerIdentities(): Promise<SpeakerIdentity[]> {
  const graph = await loadAuroraGraph();
  const nodes = findAuroraNodes(graph, { type: 'speaker_identity' });
  return nodes.map(nodeToIdentity).sort((a, b) => b.confidence - a.confidence);
}

/** Suggestion result from suggestIdentity. */
export interface IdentitySuggestion {
  identity: SpeakerIdentity;
  confidence: number;
  reason: string;
  autoTagEligible: boolean;
}

/**
 * Suggest possible speaker identities for a given voice print.
 * Matches by name similarity and video context.
 * @param voicePrintId - The voice print to find identity suggestions for
 * @returns Array of suggestions sorted by confidence descending
 */
export async function suggestIdentity(voicePrintId: string): Promise<IdentitySuggestion[]> {
  const graph = await loadAuroraGraph();
  const vpNode = graph.nodes.find((n) => n.id === voicePrintId);
  if (!vpNode || vpNode.type !== 'voice_print') {
    throw new Error(`Voice print not found: ${voicePrintId}`);
  }

  const speakerLabel = (vpNode.properties.speakerLabel as string) || '';
  const identityNodes = findAuroraNodes(graph, { type: 'speaker_identity' });
  const suggestions: IdentitySuggestion[] = [];

  for (const idNode of identityNodes) {
    const rejected = (idNode.properties.rejectedVoicePrints as string[]) || [];
    if (rejected.includes(voicePrintId)) continue;

    const identity = nodeToIdentity(idNode);

    // Name match: case-insensitive, but skip auto-labels starting with SPEAKER_
    if (
      speakerLabel &&
      !speakerLabel.startsWith('SPEAKER_') &&
      speakerLabel.toLowerCase() === identity.name.toLowerCase()
    ) {
      suggestions.push({
        identity,
        confidence: identity.confidence,
        reason: `Name match: ${identity.name}`,
        autoTagEligible: identity.confidence >= identity.autoTagThreshold,
      });
      continue;
    }

    // Video context: check if any confirmed voice prints share the same videoNodeId
    const vpVideoNodeId = vpNode.properties.videoNodeId as string | undefined;
    if (vpVideoNodeId && identity.confirmedVoicePrints.length > 0) {
      const hasSharedVideo = identity.confirmedVoicePrints.some((cpId) => {
        const cpNode = graph.nodes.find((n) => n.id === cpId);
        return cpNode && cpNode.properties.videoNodeId === vpVideoNodeId;
      });

      if (hasSharedVideo) {
        const conf = identity.confidence * 0.8;
        suggestions.push({
          identity,
          confidence: conf,
          reason: 'Same video source',
          autoTagEligible: identity.confidence >= identity.autoTagThreshold,
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/** Result from autoTagSpeakers for a single voice print. */
export interface AutoTagResult {
  voicePrintId: string;
  identityId: string;
  identityName: string;
  confidence: number;
  action: 'auto_tagged' | 'suggestion' | 'no_match';
}

/**
 * Automatically tag voice prints with speaker identities where confidence is high enough.
 * @param voicePrintIds - Array of voice print IDs to process
 * @returns Array of results indicating what action was taken for each voice print
 */
export async function updateSpeakerMetadata(
  identityId: string,
  metadata: { title?: string; organization?: string; role?: string }
): Promise<void> {
  let graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === identityId);
  if (!node || node.type !== 'speaker_identity') {
    throw new Error(`Speaker identity not found: ${identityId}`);
  }

  const updates: Record<string, unknown> = { ...node.properties };
  if (metadata.title !== undefined) updates.title = metadata.title;
  if (metadata.organization !== undefined) updates.organization = metadata.organization;
  if (metadata.role !== undefined) updates.role = metadata.role;

  graph = updateAuroraNode(graph, identityId, { properties: updates });
  await saveAuroraGraph(graph);
}

export async function autoTagSpeakers(voicePrintIds: string[]): Promise<AutoTagResult[]> {
  const results: AutoTagResult[] = [];

  for (const vpId of voicePrintIds) {
    const suggestions = await suggestIdentity(vpId);

    if (suggestions.length === 0) {
      results.push({
        voicePrintId: vpId,
        identityId: '',
        identityName: '',
        confidence: 0,
        action: 'no_match',
      });
      continue;
    }

    const best = suggestions[0];
    results.push({
      voicePrintId: vpId,
      identityId: best.identity.id,
      identityName: best.identity.name,
      confidence: best.confidence,
      action: best.autoTagEligible ? 'auto_tagged' : 'suggestion',
    });
  }

  return results;
}
