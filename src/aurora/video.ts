/**
 * Video ingestion for Aurora.
 * Supports any URL that yt-dlp can handle (YouTube, SVT, Vimeo, TV4, TikTok, etc.).
 * Extracts audio, transcribes, optionally diarizes, and creates Aurora graph nodes.
 */

import { createHash } from 'crypto';
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
import { autoTagSpeakers } from './speaker-identity.js';
import { renameSpeaker } from './voiceprint.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Progress update emitted at the start and end of each pipeline step. */
export interface ProgressUpdate {
  step: 'downloading' | 'transcribing' | 'diarizing' | 'chunking' | 'embedding';
  progress: number; // 0.0 to 1.0
  stepElapsedMs: number;
  backend?: string;
}

export interface VideoIngestOptions {
  scope?: 'personal' | 'shared' | 'project';
  maxChunks?: number;
  diarize?: boolean;
  whisperModel?: string;
  /** Language code (e.g. "sv", "en") — skips auto-detection when set. */
  language?: string;
  /** Optional callback invoked at the start and end of each pipeline step. */
  onProgress?: (update: ProgressUpdate) => void;
}

export interface VideoIngestResult {
  transcriptNodeId: string;
  chunksCreated: number;
  voicePrintsCreated: number;
  title: string;
  duration: number;
  videoId: string | null;
  platform: string;
  /** Number of cross-references created to Neuron KG nodes. */
  crossRefsCreated: number;
  /** Details of Neuron KG matches used for cross-references. */
  crossRefMatches: Array<{
    neuronNodeId: string;
    neuronTitle: string;
    similarity: number;
    relationship: string;
  }>;
  /** The Whisper model that was actually used for transcription. */
  modelUsed?: string;
  /** Path to the temporary audio file (for cleanup). */
  audioPath?: string;
  /** Path to the temporary video file (for cleanup). */
  videoPath?: string;
}

/* ------------------------------------------------------------------ */
/*  URL utilities                                                      */
/* ------------------------------------------------------------------ */

const YT_URL_REGEX =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)[\w-]{11}/;

/** Known video domains where yt-dlp extraction should be attempted. */
const VIDEO_DOMAINS = new Set([
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'svtplay.se',
  'svt.se',
  'tv4play.se',
  'tv4.se',
  'tiktok.com',
  'dailymotion.com',
  'twitch.tv',
  'rumble.com',
]);

/**
 * Check whether a string is a recognised YouTube video URL.
 */
export function isYouTubeUrl(url: string): boolean {
  return YT_URL_REGEX.test(url);
}

/**
 * Check whether a URL belongs to a known video platform supported by yt-dlp.
 */
export function isVideoUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^(www\.|m\.)/, '');
    return VIDEO_DOMAINS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Extract the 11-character video ID from a YouTube URL.
 * Returns null for non-YouTube URLs.
 */
export function extractVideoId(url: string): string | null {
  if (!isYouTubeUrl(url)) return null;

  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1];

  const shortsMatch = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1];

  return null;
}

/**
 * Generate a deterministic node ID for a video URL.
 * YouTube: yt-{videoId} (backward compatible).
 * Others:  vid-{sha256(url).slice(0,12)}.
 */
export function videoNodeId(url: string): string {
  const ytId = extractVideoId(url);
  if (ytId) return `yt-${ytId}`;
  return `vid-${createHash('sha256').update(url).digest('hex').slice(0, 12)}`;
}

/* ------------------------------------------------------------------ */
/*  Ingest pipeline                                                    */
/* ------------------------------------------------------------------ */

/**
 * Full video ingestion pipeline:
 * 1. Generate node ID & check dedup
 * 2. Extract audio via yt-dlp worker
 * 3. Transcribe via Whisper worker
 * 4. Optionally diarize via pyannote worker
 * 5. Create transcript node, chunk nodes, voice_print nodes
 * 6. Save graph & auto-embed
 * 7. Auto cross-ref to Neuron KG
 */
export async function ingestVideo(
  url: string,
  options?: VideoIngestOptions,
): Promise<VideoIngestResult> {
  // 1. Generate node ID & dedup
  const transcriptNodeId = videoNodeId(url);
  const ytVideoId = extractVideoId(url);

  let graph = await loadAuroraGraph();
  const existing = graph.nodes.find((n) => n.id === transcriptNodeId);
  if (existing) {
    return {
      transcriptNodeId,
      chunksCreated: 0,
      voicePrintsCreated: 0,
      title: existing.title,
      duration: (existing.properties.duration as number) ?? 0,
      videoId: ytVideoId,
      platform: (existing.properties.platform as string) ?? 'unknown',
      crossRefsCreated: 0,
      crossRefMatches: [],
    };
  }

  // 2. Extract audio via yt-dlp
  let stepStart = Date.now();
  options?.onProgress?.({ step: 'downloading', progress: 0, stepElapsedMs: 0 });

  const extractResult = await runWorker(
    {
      action: 'extract_video',
      source: url,
    },
    { timeout: 600_000 },
  );
  if (!extractResult.ok) {
    throw new Error(extractResult.error);
  }
  const extractMeta = extractResult.metadata as Record<string, unknown>;
  const platform = (extractMeta.extractor as string) ?? 'unknown';

  options?.onProgress?.({ step: 'downloading', progress: 1.0, stepElapsedMs: Date.now() - stepStart });

  // 3. Transcribe audio (may take 20-30 min for long videos on CPU)
  stepStart = Date.now();
  options?.onProgress?.({ step: 'transcribing', progress: 0, stepElapsedMs: 0 });

  const transcribeOptions: Record<string, unknown> = {};
  if (options?.whisperModel) {
    transcribeOptions.whisper_model = options.whisperModel;
  }
  if (options?.language) {
    transcribeOptions.language = options.language;
  }

  const transcribeResult = await runWorker(
    {
      action: 'transcribe_audio',
      source: extractMeta.audioPath as string,
      ...(Object.keys(transcribeOptions).length > 0 ? { options: transcribeOptions } : {}),
    },
    { timeout: 1_800_000 },
  );
  if (!transcribeResult.ok) {
    throw new Error(transcribeResult.error);
  }
  const transcribeMeta = transcribeResult.metadata as Record<string, unknown>;
  const modelUsed = (transcribeMeta.model_used as string) ?? undefined;

  options?.onProgress?.({ step: 'transcribing', progress: 1.0, stepElapsedMs: Date.now() - stepStart, backend: modelUsed });

  // 4. Optional diarization
  let speakers: Array<{ speaker: string; start_ms: number; end_ms: number }> = [];
  if (options?.diarize) {
    stepStart = Date.now();
    options?.onProgress?.({ step: 'diarizing', progress: 0, stepElapsedMs: 0 });

    const diarizeResult = await runWorker(
      {
        action: 'diarize_audio',
        source: extractMeta.audioPath as string,
      },
      { timeout: 1_200_000 },
    );
    if (!diarizeResult.ok) {
      throw new Error(diarizeResult.error);
    }
    const diarizeMeta = diarizeResult.metadata as Record<string, unknown>;
    speakers = (diarizeMeta.speakers as typeof speakers) ?? [];

    options?.onProgress?.({ step: 'diarizing', progress: 1.0, stepElapsedMs: Date.now() - stepStart });
  }

  // 5. Create transcript node
  const now = new Date().toISOString();
  const transcriptNode: AuroraNode = {
    id: transcriptNodeId,
    type: 'transcript',
    title: extractResult.title,
    properties: {
      text: transcribeResult.text,
      videoId: ytVideoId,
      videoUrl: url,
      platform,
      duration: extractMeta.duration as number,
      language: transcribeMeta.language as string,
      segmentCount: transcribeMeta.segment_count as number,
      rawSegments: transcribeMeta.segments as Array<{ start_ms: number; end_ms: number; text: string }>,
      publishedDate: (extractMeta.publishedDate as string) ?? null,
    },
    confidence: 0.9,
    scope: options?.scope ?? 'personal',
    sourceUrl: url,
    created: now,
    updated: now,
  };
  graph = addAuroraNode(graph, transcriptNode);

  const allNodeIds: string[] = [transcriptNodeId];

  // 6. Chunk transcript text
  stepStart = Date.now();
  options?.onProgress?.({ step: 'chunking', progress: 0, stepElapsedMs: 0 });

  const allChunks = chunkText(transcribeResult.text, {
    maxWords: 200,
    overlap: 20,
  });
  const chunks = allChunks.slice(0, options?.maxChunks ?? 100);
  const duration = extractMeta.duration as number;
  const fullTextLength = (transcribeResult.text as string)?.length || 1;

  for (const chunk of chunks) {
    const chunkId = `${transcriptNodeId}_chunk_${chunk.index}`;
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
        'ebucore:start': duration ? Math.round((chunk.startOffset / fullTextLength) * duration * 1000) : null,
        'ebucore:end': duration ? Math.round((chunk.endOffset / fullTextLength) * duration * 1000) : null,
        'ebucore:partNumber': chunk.index,
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
      metadata: { createdBy: 'video-intake' },
    });
  }

  options?.onProgress?.({ step: 'chunking', progress: 1.0, stepElapsedMs: Date.now() - stepStart });

  // 7. Voice print nodes (if diarized)
  let voicePrintsCreated = 0;
  const newVoicePrintIds: string[] = [];
  if (options?.diarize && speakers.length > 0) {
    const uniqueSpeakers = [...new Set(speakers.map((s) => s.speaker))];
    for (const speakerLabel of uniqueSpeakers) {
      const speakerSegments = speakers.filter((s) => s.speaker === speakerLabel);
      const totalDurationMs = speakerSegments.reduce(
        (sum, s) => sum + (s.end_ms - s.start_ms),
        0,
      );
      const vpId = `vp-${transcriptNodeId}-${speakerLabel}`;
      const vpNode: AuroraNode = {
        id: vpId,
        type: 'voice_print',
        title: `Speaker: ${speakerLabel}`,
        properties: {
          speakerLabel,
          videoId: ytVideoId,
          videoNodeId: transcriptNodeId,
          segmentCount: speakerSegments.length,
          totalDurationMs,
          segments: speakerSegments.map(s => ({ start_ms: s.start_ms, end_ms: s.end_ms })),
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
        metadata: { createdBy: 'video-intake' },
      });
      voicePrintsCreated++;
      newVoicePrintIds.push(vpId);
    }
  }

  // 8. Save & embed
  stepStart = Date.now();
  options?.onProgress?.({ step: 'embedding', progress: 0, stepElapsedMs: 0 });

  await saveAuroraGraph(graph);
  await autoEmbedAuroraNodes(allNodeIds);

  options?.onProgress?.({ step: 'embedding', progress: 1.0, stepElapsedMs: Date.now() - stepStart });

  // 8b. Auto-tag speakers with known identities
  if (newVoicePrintIds.length > 0) {
    try {
      const autoTagResults = await autoTagSpeakers(newVoicePrintIds);
      for (const result of autoTagResults) {
        if (result.action === 'auto_tagged') {
          await renameSpeaker(result.voicePrintId, result.identityName);
          console.error(`  🏷️  Auto-tagged: ${result.identityName} (confidence: ${result.confidence.toFixed(2)})`);
        } else if (result.action === 'suggestion') {
          console.error(`  💡 Suggestion: ${result.identityName}? (confidence: ${result.confidence.toFixed(2)})`);
        }
      }
    } catch {
      // Auto-tag failure should not break ingest
    }
  }

  // 9. Auto cross-ref: find Neuron matches for the transcript
  let crossRefsCreated = 0;
  const crossRefMatches: VideoIngestResult['crossRefMatches'] = [];

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
          'auto-ingest-video',
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
    videoId: ytVideoId,
    platform,
    crossRefsCreated,
    crossRefMatches,
    modelUsed,
    audioPath: extractMeta.audioPath as string | undefined,
    videoPath: extractMeta.videoPath as string | undefined,
  };
}
