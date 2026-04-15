/**
 * Video ingestion for Aurora.
 * Supports any URL that yt-dlp can handle (YouTube, SVT, Vimeo, TV4, TikTok, etc.).
 * Extracts audio, transcribes, optionally diarizes, and creates Aurora graph nodes.
 */

import { createHash } from 'crypto';
import { runWorker } from './worker-bridge.js';
import { PipelineError, wrapPipelineStep } from './pipeline-errors.js';
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
import { polishTranscript } from './transcript-polish.js';
import { guessSpeakers } from './speaker-guesser.js';
import { generateTldr } from './transcript-tldr.js';
import type { SpeakerGuess } from './speaker-guesser.js';
import { ensureOllama } from '../core/ollama.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:video');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Progress update emitted at the start and end of each pipeline step. */
export interface ProgressUpdate {
  step:
    | 'downloading'
    | 'denoising'
    | 'transcribing'
    | 'diarizing'
    | 'chunking'
    | 'embedding'
    | 'crossreferencing'
    | 'saving'
    | 'polishing'
    | 'identifying';
  progress: number; // 0.0 to 1.0
  stepElapsedMs: number;
  backend?: string;
  /** Step number in the pipeline (1-based) */
  stepNumber?: number;
  /** Total number of steps in the pipeline */
  totalSteps?: number;
  /** Step-specific metadata summary */
  metadata?: Record<string, unknown>;
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
  /** Denoise audio before transcription using DeepFilterNet (default: false). */
  denoise?: boolean;
  /** Polish transcript via LLM (default: true if Ollama is available). */
  polish?: boolean;
  /** Identify speakers via LLM (default: true if Ollama is available). */
  identifySpeakers?: boolean;
  /** Model for polish/identify: 'ollama' (default) or 'claude'. */
  polishModel?: 'ollama' | 'claude';
}

export interface PipelineStepReport {
  status: 'ok' | 'error' | 'skipped';
  duration_s?: number;
  message?: string;
  [key: string]: unknown;
}

export interface PipelineReport {
  steps_completed: number;
  steps_total: number;
  duration_seconds: number;
  details: Record<string, PipelineStepReport>;
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
  /** How the transcript was obtained: 'whisper', 'subtitles:manual', or 'subtitles:auto'. */
  transcriptionSource?: string;
  /** Path to the temporary audio file (for cleanup). */
  audioPath?: string;
  /** Path to the temporary video file (for cleanup). */
  videoPath?: string;
  /** Whether audio was denoised before transcription. */
  denoised: boolean;
  /** Whether the transcript was LLM-polished. */
  polished: boolean;
  /** AI-guessed speaker identities (null if not performed). */
  speakerGuesses: SpeakerGuess[] | null;
  /** Pipeline execution report with per-step details. */
  pipeline_report?: PipelineReport;
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
  } catch (err) {
    logger.error('[video] video processing failed', { error: String(err) });
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
/*  Pipeline report helpers                                            */
/* ------------------------------------------------------------------ */

const STEP_NAMES = ['download', 'denoise', 'transcribe', 'diarize', 'chunk', 'embed', 'crossref', 'save'];

/** Mark all steps after `fromStep` as skipped in the report. */
function markRemainingSkipped(report: PipelineReport, fromStep: string): void {
  const idx = STEP_NAMES.indexOf(fromStep);
  for (let i = idx + 1; i < STEP_NAMES.length; i++) {
    if (!report.details[STEP_NAMES[i]]) {
      report.details[STEP_NAMES[i]] = { status: 'skipped' };
    }
  }
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
  options?: VideoIngestOptions
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
      denoised: false,
      polished: false,
      speakerGuesses: null,
    };
  }

  // Initialize pipeline report
  const pipelineStart = Date.now();
  const report: PipelineReport = {
    steps_completed: 0,
    steps_total: 7,
    duration_seconds: 0,
    details: {},
  };

  try {
    // 2. Extract audio via yt-dlp
    let stepStart = Date.now();
    options?.onProgress?.({ step: 'downloading', progress: 0, stepElapsedMs: 0 });

    const extractResult = await wrapPipelineStep('extract_video', async () => {
      const result = await runWorker(
        {
          action: 'extract_video',
          source: url,
        },
        { timeout: 600_000 }
      );
      if (!result.ok) throw new Error(result.error);
      return result;
    });
    const extractMeta = extractResult.metadata as Record<string, unknown>;
    const platform = (extractMeta.extractor as string) ?? 'unknown';

    report.details.download = {
      status: 'ok',
      duration_s: Math.round((Date.now() - stepStart) / 1000),
      size_mb: extractMeta.fileSize
        ? Math.round((extractMeta.fileSize as number) / (1024 * 1024))
        : undefined,
    };
    report.steps_completed++;

    options?.onProgress?.({
      step: 'downloading',
      progress: 1.0,
      stepElapsedMs: Date.now() - stepStart,
      stepNumber: 1,
      totalSteps: 7,
      metadata: { size_mb: report.details.download?.size_mb },
    });

    // 2b. Optional denoising (before transcription/diarization)
    let audioPath = extractMeta.audioPath as string;
    let denoiseApplied = false;

    if (options?.denoise) {
      stepStart = Date.now();
      options?.onProgress?.({ step: 'denoising', progress: 0, stepElapsedMs: 0 });

      const denoiseResult = await wrapPipelineStep('denoise_audio', async () => {
        const result = await runWorker(
          {
            action: 'denoise_audio',
            source: audioPath,
          },
          { timeout: 600_000 }
        );
        if (!result.ok) throw new Error(result.error);
        return result;
      });
      const denoiseMeta = denoiseResult.metadata as Record<string, unknown>;
      denoiseApplied = (denoiseMeta.applied as boolean) ?? false;
      audioPath = (denoiseMeta.denoised_path as string) ?? audioPath;

      report.details.denoise = {
        status: 'ok',
        duration_s: Math.round((Date.now() - stepStart) / 1000),
        applied: denoiseApplied,
        fallback_reason: denoiseMeta.fallback_reason as string | null,
      };
      report.steps_completed++;

      options?.onProgress?.({
        step: 'denoising',
        progress: 1.0,
        stepElapsedMs: Date.now() - stepStart,
        metadata: { applied: denoiseApplied },
      });

      if (denoiseApplied) {
        logger.info('Audio denoised successfully', { audioPath });
      } else {
        logger.info('Denoise skipped (fallback)', {
          reason: denoiseMeta.fallback_reason,
        });
      }
    } else {
      report.details.denoise = { status: 'skipped' };
      report.steps_completed++;
    }

    // 3. Transcribe
    //    Manual subs → use directly (human-edited, high quality)
    //    Auto subs   → run Whisper anyway (often better), save auto-subs as reference
    //    No subs     → Whisper only
    stepStart = Date.now();
    options?.onProgress?.({ step: 'transcribing', progress: 0, stepElapsedMs: 0 });

    const subtitlesData = extractMeta.subtitles as
      | { text: string; segments: Array<{ start_ms: number; end_ms: number; text: string }>; segment_count: number }
      | undefined;
    const subtitleSource = extractMeta.subtitleSource as string | undefined;
    const hasManualSubs = subtitlesData && subtitlesData.segment_count > 0 && subtitleSource === 'manual';
    const hasAutoSubs = subtitlesData && subtitlesData.segment_count > 0 && subtitleSource === 'auto';

    let transcribeText: string;
    let transcribeSegments: Array<{ start_ms: number; end_ms: number; text: string; words?: Array<{ start_ms: number; end_ms: number; word: string; probability?: number }> }>;
    let modelUsed: string | undefined;
    let transcribeLanguage: string;
    let referenceSubtitles: typeof subtitlesData | undefined;

    if (hasManualSubs) {
      transcribeText = subtitlesData.text;
      transcribeSegments = subtitlesData.segments;
      modelUsed = undefined;
      transcribeLanguage = 'unknown';
      logger.info('Using manual subtitles (human-edited)', {
        segments: subtitlesData.segment_count,
      });
    } else {
      // Auto subs or no subs → run Whisper
      if (hasAutoSubs) {
        referenceSubtitles = subtitlesData;
        logger.info('Auto-subs found — running Whisper anyway, saving subs as reference', {
          segments: subtitlesData.segment_count,
        });
      }

      const transcribeOptions: Record<string, unknown> = {};
      if (options?.whisperModel) {
        transcribeOptions.whisper_model = options.whisperModel;
      }
      if (options?.language) {
        transcribeOptions.language = options.language;
      }

      const transcribeResult = await wrapPipelineStep('transcribe_audio', async () => {
        const result = await runWorker(
          {
            action: 'transcribe_audio',
            source: audioPath,
            ...(Object.keys(transcribeOptions).length > 0 ? { options: transcribeOptions } : {}),
          },
          { timeout: 1_800_000 }
        );
        if (!result.ok) throw new Error(result.error);
        return result;
      });
      const transcribeMeta = transcribeResult.metadata as Record<string, unknown>;
      transcribeText = transcribeResult.text as string;
      transcribeSegments = (transcribeMeta.segments as typeof transcribeSegments) ?? [];
      modelUsed = (transcribeMeta.model_used as string) ?? undefined;
      transcribeLanguage = (transcribeMeta.language as string) ?? 'unknown';
    }

    const wordCount = transcribeText?.split(/\s+/).length ?? 0;
    const transcriptionModel = hasManualSubs
      ? 'subtitles:manual'
      : (modelUsed ?? 'unknown');

    report.details.transcribe = {
      status: 'ok',
      duration_s: Math.round((Date.now() - stepStart) / 1000),
      words: wordCount,
      model: transcriptionModel,
      language: transcribeLanguage,
    };
    report.steps_completed++;

    options?.onProgress?.({
      step: 'transcribing',
      progress: 1.0,
      stepElapsedMs: Date.now() - stepStart,
      backend: transcriptionModel,
      stepNumber: 2,
      totalSteps: 7,
      metadata: { words: wordCount, language: transcribeLanguage },
    });

    // 4. Optional diarization
    let speakers: Array<{ speaker: string; start_ms: number; end_ms: number }> = [];
    let uniqueSpeakers: string[] = [];
    if (options?.diarize) {
      stepStart = Date.now();
      options?.onProgress?.({ step: 'diarizing', progress: 0, stepElapsedMs: 0 });

      const diarizeResult = await wrapPipelineStep('diarize_audio', async () => {
        const result = await runWorker(
          {
            action: 'diarize_audio',
            source: audioPath,
          },
          { timeout: 1_200_000 }
        );
        if (!result.ok) throw new Error(result.error);
        return result;
      });
      const diarizeMeta = diarizeResult.metadata as Record<string, unknown>;
      speakers = (diarizeMeta.speakers as typeof speakers) ?? [];
      uniqueSpeakers = [...new Set(speakers.map((s) => s.speaker))];

      report.details.diarize = {
        status: 'ok',
        duration_s: Math.round((Date.now() - stepStart) / 1000),
        speakers: uniqueSpeakers.length,
      };
      report.steps_completed++;

      options?.onProgress?.({
        step: 'diarizing',
        progress: 1.0,
        stepElapsedMs: Date.now() - stepStart,
        stepNumber: 3,
        totalSteps: 7,
        metadata: { speakers: uniqueSpeakers.length },
      });
    } else {
      report.details.diarize = { status: 'skipped' };
      report.steps_completed++;
    }

    // 5. Create transcript node
    const now = new Date().toISOString();
    const transcriptionMethod = hasManualSubs ? 'subtitles:manual' : 'transcription';
    const provenanceModel = hasManualSubs ? 'subtitles:manual' : (modelUsed ?? 'whisper');
    const transcriptNode: AuroraNode = {
      id: transcriptNodeId,
      type: 'transcript',
      title: extractResult.title,
      properties: {
        text: transcribeText,
        videoId: ytVideoId,
        videoUrl: url,
        platform,
        duration: extractMeta.duration as number,
        language: transcribeLanguage,
        segmentCount: transcribeSegments.length,
        rawSegments: transcribeSegments,
        publishedDate: (extractMeta.publishedDate as string) ?? null,
        channelName: (extractMeta.channel as string) ?? null,
        channelHandle: (extractMeta.channelHandle as string) ?? null,
        videoDescription: ((extractMeta.videoDescription as string) ?? '').slice(0, 2000),
        ytTags: (extractMeta.ytTags as string[]) ?? [],
        categories: (extractMeta.categories as string[]) ?? [],
        creators: (extractMeta.creators as string[] | null) ?? null,
        chapters: extractMeta.chapters ?? null,
        viewCount: (extractMeta.viewCount as number | null) ?? null,
        likeCount: (extractMeta.likeCount as number | null) ?? null,
        channelFollowerCount: (extractMeta.channelFollowerCount as number | null) ?? null,
        thumbnailUrl: (extractMeta.thumbnailUrl as string | null) ?? null,
        ...(referenceSubtitles ? { referenceSubtitles: referenceSubtitles.text } : {}),
        provenance: {
          agent: 'System',
          agentId: null,
          method: transcriptionMethod,
          model: provenanceModel,
          sourceId: null,
          timestamp: now,
        },
      },
      confidence: hasManualSubs ? 0.95 : 0.9,
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

    const allChunks = chunkText(transcribeText, {
      maxWords: 200,
      overlap: 20,
    });
    const chunks = allChunks.slice(0, options?.maxChunks ?? 100);
    const duration = extractMeta.duration as number;
    const fullTextLength = transcribeText?.length || 1;

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
          'ebucore:start': duration
            ? Math.round((chunk.startOffset / fullTextLength) * duration * 1000)
            : null,
          'ebucore:end': duration
            ? Math.round((chunk.endOffset / fullTextLength) * duration * 1000)
            : null,
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

    report.details.chunk = {
      status: 'ok',
      duration_s: Math.round((Date.now() - stepStart) / 1000),
      chunks: chunks.length,
      avg_words:
        chunks.length > 0
          ? Math.round(chunks.reduce((s, c) => s + c.wordCount, 0) / chunks.length)
          : 0,
    };
    report.steps_completed++;

    options?.onProgress?.({
      step: 'chunking',
      progress: 1.0,
      stepElapsedMs: Date.now() - stepStart,
      stepNumber: 4,
      totalSteps: 7,
      metadata: { chunks: chunks.length },
    });

    // 7. Voice print nodes (if diarized)
    let voicePrintsCreated = 0;
    const newVoicePrintIds: string[] = [];
    if (options?.diarize && speakers.length > 0) {
      for (const speakerLabel of uniqueSpeakers) {
        const speakerSegments = speakers.filter((s) => s.speaker === speakerLabel);
        const totalDurationMs = speakerSegments.reduce(
          (sum, s) => sum + (s.end_ms - s.start_ms),
          0
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
            segments: speakerSegments.map((s) => ({ start_ms: s.start_ms, end_ms: s.end_ms })),
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

    // 7b. Fallback: create a single Speaker_01 when no diarization
    if (voicePrintsCreated === 0) {
      const durationMs = typeof extractMeta.duration === 'number' ? extractMeta.duration * 1000 : 0;
      const fallbackLabel = 'SPEAKER_01';
      const vpId = `vp-${transcriptNodeId}-${fallbackLabel}`;
      const vpNode: AuroraNode = {
        id: vpId,
        type: 'voice_print',
        title: `Speaker: ${fallbackLabel}`,
        properties: {
          speakerLabel: fallbackLabel,
          videoId: ytVideoId,
          videoNodeId: transcriptNodeId,
          segmentCount: transcribeSegments.length,
          totalDurationMs: durationMs,
          segments: [{ start_ms: 0, end_ms: durationMs }],
        },
        confidence: 0.5,
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
        metadata: { createdBy: 'video-intake-fallback' },
      });
      voicePrintsCreated = 1;
      newVoicePrintIds.push(vpId);
    }

    // 8. Save & embed
    stepStart = Date.now();
    options?.onProgress?.({ step: 'embedding', progress: 0, stepElapsedMs: 0 });

    await saveAuroraGraph(graph);
    await wrapPipelineStep('autoEmbedAuroraNodes', async () => {
      await autoEmbedAuroraNodes(allNodeIds);
    });

    report.details.embed = {
      status: 'ok',
      vectors: allNodeIds.length,
      retries: 0,
    };
    report.steps_completed++;

    options?.onProgress?.({
      step: 'embedding',
      progress: 1.0,
      stepElapsedMs: Date.now() - stepStart,
      stepNumber: 5,
      totalSteps: 7,
      metadata: { vectors: allNodeIds.length },
    });

    // 8b. Auto-tag speakers with known identities
    if (newVoicePrintIds.length > 0) {
      try {
        const autoTagResults = await autoTagSpeakers(newVoicePrintIds);
        for (const result of autoTagResults) {
          if (result.action === 'auto_tagged') {
            await renameSpeaker(result.voicePrintId, result.identityName);
            logger.error('Auto-tagged speaker', {
              name: result.identityName,
              confidence: result.confidence.toFixed(2),
            });
          } else if (result.action === 'suggestion') {
            logger.error('Speaker suggestion', {
              name: result.identityName,
              confidence: result.confidence.toFixed(2),
            });
          }
        }
      } catch (err) {
        logger.error('[video] video thumbnail extraction failed', { error: String(err) });
      }
    }

    // 9. Auto cross-ref: find Neuron matches for the transcript
    let crossRefsCreated = 0;
    const crossRefMatches: VideoIngestResult['crossRefMatches'] = [];

    try {
      const matches = await wrapPipelineStep('findNeuronMatchesForAurora', async () => {
        return findNeuronMatchesForAurora(transcriptNodeId, {
          limit: 5,
          minSimilarity: 0.5,
        });
      });

      for (const match of matches) {
        if (match.similarity >= 0.7) {
          await createCrossRef(
            match.node.id,
            transcriptNodeId,
            'enriches',
            match.similarity,
            { createdBy: 'auto-ingest', source: url },
            'auto-ingest-video'
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
    } catch (err) {
      logger.error('[video] video metadata read failed', { error: String(err) });
    }

    report.details.crossref = {
      status: 'ok',
      matches: crossRefsCreated,
    };
    report.steps_completed++;

    // 10. Save report step
    report.details.save = { status: 'ok' };
    report.steps_completed++;
    report.duration_seconds = Math.round((Date.now() - pipelineStart) / 1000);

    // Store pipeline_report on the transcript node
    transcriptNode.properties.pipeline_report = report;

    // 11. Optional: Polish transcript via LLM
    let polished = false;
    if (options?.polish !== false) {
      stepStart = Date.now();
      options?.onProgress?.({ step: 'polishing', progress: 0, stepElapsedMs: 0 });
      try {
        const ollamaReady = await ensureOllama();
        if (ollamaReady || options?.polishModel === 'claude') {
          await polishTranscript(transcriptNodeId, {
            polishModel: options?.polishModel,
          });
          polished = true;
        }
      } catch (err) {
        logger.error('[polish] Skipping', {
          error: String(err instanceof Error ? err.message : err),
        });
      }
      options?.onProgress?.({
        step: 'polishing',
        progress: 1.0,
        stepElapsedMs: Date.now() - stepStart,
      });
    }

    // 11b. Generate tags and summary from YouTube metadata
    {
      const ytTags = (extractMeta.ytTags as string[]) ?? [];
      const categories = (extractMeta.categories as string[]) ?? [];
      const videoDesc = (extractMeta.videoDescription as string) ?? '';

      const domainTag = (() => {
        try {
          return new URL(url).hostname.replace(/^(www\.|m\.)/, '');
        } catch {
          return null;
        }
      })();

      const allTags = [
        ...(domainTag ? [domainTag] : []),
        ...categories.map((c) => c.toLowerCase()),
        ...ytTags.map((t) => t.toLowerCase()),
      ];
      const uniqueTags = [...new Set(allTags)].filter((t) => t.length >= 2 && t.length <= 40);

      const graphNode = graph.nodes.find((n) => n.id === transcriptNodeId);
      if (graphNode) {
        graphNode.properties.tags = uniqueTags.slice(0, 20);
        await saveAuroraGraph(graph);
      }
    }

    // 11c. Generate LLM tldr summary
    if (options?.polish !== false) {
      try {
        const ollamaReady = await ensureOllama();
        if (ollamaReady || options?.polishModel === 'claude') {
          const tldrResult = await generateTldr(
            transcribeText,
            {
              title: extractResult.title,
              channelName: (extractMeta.channel as string) ?? undefined,
            },
            { model: options?.polishModel },
          );
          const gNode = graph.nodes.find((n) => n.id === transcriptNodeId);
          if (gNode && tldrResult.tldr) {
            gNode.properties.summary = tldrResult.tldr;
            await saveAuroraGraph(graph);
            logger.info('Generated LLM tldr', { length: tldrResult.tldr.length });
          }
        }
      } catch (err) {
        logger.error('[tldr] Skipping', {
          error: String(err instanceof Error ? err.message : err),
        });
      }
    }

    // 12. Optional: Identify speakers via LLM
    let speakerGuesses: SpeakerGuess[] | null = null;
    if (options?.identifySpeakers !== false && options?.diarize) {
      stepStart = Date.now();
      options?.onProgress?.({ step: 'identifying', progress: 0, stepElapsedMs: 0 });
      try {
        const ollamaReady = await ensureOllama();
        if (ollamaReady || options?.polishModel === 'claude') {
          const guessResult = await guessSpeakers(transcriptNodeId, {
            model: options?.polishModel,
          });
          speakerGuesses = guessResult.guesses;
        }
      } catch (err) {
        logger.error('[identify-speakers] Skipping', {
          error: String(err instanceof Error ? err.message : err),
        });
      }
      options?.onProgress?.({
        step: 'identifying',
        progress: 1.0,
        stepElapsedMs: Date.now() - stepStart,
      });
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
      transcriptionSource: hasManualSubs ? 'subtitles:manual' : (hasAutoSubs ? 'whisper+reference' : 'whisper'),
      audioPath: extractMeta.audioPath as string | undefined,
      videoPath: extractMeta.videoPath as string | undefined,
      denoised: denoiseApplied,
      polished,
      speakerGuesses,
      pipeline_report: report,
    };
  } catch (err) {
    // On pipeline failure: fill report with error + mark remaining steps as skipped
    const failedStep = findFailedStep(report);
    if (failedStep) {
      report.details[failedStep] = {
        status: 'error',
        message: err instanceof PipelineError ? err.userMessage : String(err),
      };
      markRemainingSkipped(report, failedStep);
    }
    report.duration_seconds = Math.round((Date.now() - pipelineStart) / 1000);
    throw err;
  }
}

/**
 * Determine which step failed by finding the first step in STEP_NAMES
 * that does not yet have a report entry.
 */
function findFailedStep(report: PipelineReport): string | null {
  for (const step of STEP_NAMES) {
    if (!report.details[step]) return step;
  }
  return null;
}
