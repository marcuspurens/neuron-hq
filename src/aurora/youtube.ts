/**
 * YouTube video ingestion for Aurora.
 * Extracts audio, transcribes, optionally diarizes, and creates Aurora graph nodes.
 */

import { runWorker } from './worker-bridge.js';
import { chunkText } from './chunker.js';
import {
  addAuroraNode,
  addAuroraEdge,
  loadAuroraGraph,
  saveAuroraGraph,
  autoEmbedAuroraNodes,
} from './aurora-graph.js';
import type { AuroraNode } from './aurora-schema.js';
import { findNeuronMatchesForAurora, createCrossRef } from './cross-ref.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface YouTubeIngestOptions {
  scope?: 'personal' | 'shared' | 'project';
  maxChunks?: number;
  diarize?: boolean;
  whisperModel?: string;
}

export interface YouTubeIngestResult {
  transcriptNodeId: string;
  chunksCreated: number;
  voicePrintsCreated: number;
  title: string;
  duration: number;
  videoId: string;
  /** Number of cross-references created to Neuron KG nodes. */
  crossRefsCreated: number;
  /** Details of Neuron KG matches used for cross-references. */
  crossRefMatches: Array<{
    neuronNodeId: string;
    neuronTitle: string;
    similarity: number;
    relationship: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  URL utilities                                                      */
/* ------------------------------------------------------------------ */

const YT_URL_REGEX =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)[\w-]{11}/;

/**
 * Check whether a string is a recognised YouTube video URL.
 */
export function isYouTubeUrl(url: string): boolean {
  return YT_URL_REGEX.test(url);
}

/**
 * Extract the 11-character video ID from a YouTube URL.
 * Returns null for non-YouTube URLs.
 */
export function extractVideoId(url: string): string | null {
  if (!isYouTubeUrl(url)) return null;

  // youtu.be/<id>
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/shorts/<id>
  const shortsMatch = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // youtube.com/watch?v=<id>
  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1];

  return null;
}

/* ------------------------------------------------------------------ */
/*  Ingest pipeline                                                    */
/* ------------------------------------------------------------------ */

/**
 * Full YouTube ingestion pipeline:
 * 1. Validate URL & extract video ID
 * 2. Load graph, check dedup
 * 3. Extract audio via worker
 * 4. Transcribe via worker
 * 5. Optionally diarize via worker
 * 6. Create transcript node, chunk nodes, voice_print nodes
 * 7. Save graph & auto-embed
 * 8. Auto cross-ref to Neuron KG
 */
export async function ingestYouTube(
  url: string,
  options?: YouTubeIngestOptions,
): Promise<YouTubeIngestResult> {
  // 1. Validate
  if (!isYouTubeUrl(url)) {
    throw new Error(`Not a YouTube URL: ${url}`);
  }
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error(`Could not extract video ID from: ${url}`);
  }

  // 2. Load graph & dedup
  let graph = await loadAuroraGraph();
  const transcriptNodeId = `yt-${videoId}`;
  const existing = graph.nodes.find((n) => n.id === transcriptNodeId);
  if (existing) {
    return {
      transcriptNodeId,
      chunksCreated: 0,
      voicePrintsCreated: 0,
      title: existing.title,
      duration: (existing.properties.duration as number) ?? 0,
      videoId,
      crossRefsCreated: 0,
      crossRefMatches: [],
    };
  }

  // 3. Extract YouTube audio
  const extractResult = await runWorker({
    action: 'extract_youtube',
    source: url,
  });
  if (!extractResult.ok) {
    throw new Error(extractResult.error);
  }
  const extractMeta = extractResult.metadata as Record<string, unknown>;

  // 4. Transcribe audio
  const transcribeResult = await runWorker({
    action: 'transcribe_audio',
    source: extractMeta.audioPath as string,
  });
  if (!transcribeResult.ok) {
    throw new Error(transcribeResult.error);
  }
  const transcribeMeta = transcribeResult.metadata as Record<string, unknown>;

  // 5. Optional diarization
  let speakers: Array<{ speaker: string; start_ms: number; end_ms: number }> = [];
  if (options?.diarize) {
    const diarizeResult = await runWorker({
      action: 'diarize_audio',
      source: extractMeta.audioPath as string,
    });
    if (!diarizeResult.ok) {
      throw new Error(diarizeResult.error);
    }
    const diarizeMeta = diarizeResult.metadata as Record<string, unknown>;
    speakers = (diarizeMeta.speakers as typeof speakers) ?? [];
  }

  // 6. Create transcript node
  const now = new Date().toISOString();
  const transcriptNode: AuroraNode = {
    id: transcriptNodeId,
    type: 'transcript',
    title: extractResult.title,
    properties: {
      text: transcribeResult.text,
      videoId,
      videoUrl: url,
      duration: extractMeta.duration as number,
      language: transcribeMeta.language as string,
      segmentCount: transcribeMeta.segment_count as number,
    },
    confidence: 0.9,
    scope: options?.scope ?? 'personal',
    sourceUrl: url,
    created: now,
    updated: now,
  };
  graph = addAuroraNode(graph, transcriptNode);

  const allNodeIds: string[] = [transcriptNodeId];

  // 7. Chunk transcript text
  const allChunks = chunkText(transcribeResult.text, {
    maxWords: 200,
    overlap: 20,
  });
  const chunks = allChunks.slice(0, options?.maxChunks ?? 100);

  for (const chunk of chunks) {
    const chunkId = `yt-${videoId}_chunk_${chunk.index}`;
    const chunkNode: AuroraNode = {
      id: chunkId,
      type: 'transcript',
      title: `${extractResult.title} [chunk ${chunk.index + 1}/${chunks.length}]`,
      properties: {
        text: chunk.text,
        chunkIndex: chunk.index,
        totalChunks: chunks.length,
        wordCount: chunk.wordCount,
        parentId: transcriptNodeId,
      },
      confidence: 0.9,
      scope: options?.scope ?? 'personal',
      sourceUrl: url,
      created: now,
      updated: now,
    };
    graph = addAuroraNode(graph, chunkNode);
    allNodeIds.push(chunkId);

    graph = addAuroraEdge(graph, {
      from: chunkId,
      to: transcriptNodeId,
      type: 'derived_from',
      metadata: { createdBy: 'youtube-intake' },
    });
  }

  // 8. Voice print nodes (if diarized)
  let voicePrintsCreated = 0;
  if (options?.diarize && speakers.length > 0) {
    const uniqueSpeakers = [...new Set(speakers.map((s) => s.speaker))];
    for (const speakerLabel of uniqueSpeakers) {
      const speakerSegments = speakers.filter((s) => s.speaker === speakerLabel);
      const totalDurationMs = speakerSegments.reduce(
        (sum, s) => sum + (s.end_ms - s.start_ms),
        0,
      );
      const vpId = `vp-${videoId}-${speakerLabel}`;
      const vpNode: AuroraNode = {
        id: vpId,
        type: 'voice_print',
        title: `Speaker: ${speakerLabel}`,
        properties: {
          speakerLabel,
          videoId,
          segmentCount: speakerSegments.length,
          totalDurationMs,
        },
        confidence: 0.7,
        scope: 'personal',
        sourceUrl: url,
        created: now,
        updated: now,
      };
      graph = addAuroraNode(graph, vpNode);
      allNodeIds.push(vpId);

      graph = addAuroraEdge(graph, {
        from: vpId,
        to: transcriptNodeId,
        type: 'derived_from',
        metadata: { createdBy: 'youtube-intake' },
      });
      voicePrintsCreated++;
    }
  }

  // 9. Save & embed
  await saveAuroraGraph(graph);
  await autoEmbedAuroraNodes(allNodeIds);

  // 10. Auto cross-ref: find Neuron matches for the transcript
  let crossRefsCreated = 0;
  const crossRefMatches: YouTubeIngestResult['crossRefMatches'] = [];

  try {
    const matches = await findNeuronMatchesForAurora(transcriptNodeId, {
      limit: 5,
      minSimilarity: 0.5,
    });

    for (const match of matches) {
      if (match.similarity >= 0.7) {
        await createCrossRef(
          match.node.id,
          transcriptNodeId,
          'enriches',
          match.similarity,
          { createdBy: 'auto-ingest', source: url },
          'auto-ingest-youtube',
        );
        crossRefsCreated++;
        crossRefMatches.push({
          neuronNodeId: match.node.id,
          neuronTitle: match.node.title,
          similarity: match.similarity,
          relationship: 'enriches',
        });
      }
    }
  } catch {
    // Cross-ref failure should not break ingest
  }

  return {
    transcriptNodeId,
    chunksCreated: chunks.length,
    voicePrintsCreated,
    title: extractResult.title,
    duration: extractMeta.duration as number,
    videoId,
    crossRefsCreated,
    crossRefMatches,
  };
}
