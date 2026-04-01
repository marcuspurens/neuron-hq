/**
 * Intake orchestrator: coordinates extract → chunk → embed → create aurora nodes.
 * Provides high-level ingestUrl() and ingestDocument() functions that turn
 * raw content into fully indexed Aurora graph nodes.
 */

import { createHash } from 'crypto';
import { extname, resolve } from 'path';
import { runWorker } from './worker-bridge.js';
import { chunkText } from './chunker.js';
import {
  addAuroraNode,
  addAuroraEdge,
  loadAuroraGraph,
  saveAuroraGraph,
  autoEmbedAuroraNodes,
  updateAuroraNode,
} from './aurora-graph.js';
import type { AuroraNodeType, AuroraScope, AuroraNode } from './aurora-schema.js';
import { isVideoUrl, ingestVideo } from './video.js';
import { findNeuronMatchesForAurora, createCrossRef } from './cross-ref.js';
import { updateConfidence, classifySource } from './bayesian-confidence.js';
import { PipelineError, wrapPipelineStep } from './pipeline-errors.js';
import type { PipelineReport } from './pipeline-errors.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:intake');

function extractTags(title: string, metadata: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  const sourceUrl = metadata.sourceUrl as string | undefined;
  if (sourceUrl) {
    try {
      const domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
      tags.add(domain);
    } catch (_) {}
  }
  if (metadata.language && metadata.language !== 'unknown') tags.add(String(metadata.language));
  if (metadata.platform) tags.add(String(metadata.platform));
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'and',
    'or',
    'with',
    'that',
    'this',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'has',
    'have',
    'had',
    'den',
    'det',
    'de',
    'en',
    'ett',
    'på',
    'för',
    'och',
    'som',
    'är',
    'med',
    'av',
    'till',
    'om',
    'från',
    'vid',
    'men',
    'kan',
    'har',
    'när',
  ]);
  for (const word of title.toLowerCase().split(/\s+/)) {
    const clean = word.replace(/[^a-zA-ZåäöÅÄÖ0-9]/g, '');
    if (clean.length >= 4 && !stopwords.has(clean)) tags.add(clean);
  }
  return Array.from(tags).slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IngestOptions {
  /** Node type for the document and chunks. Default: 'document'. */
  type?: AuroraNodeType;
  /** Scope for all created nodes. Default: 'personal'. */
  scope?: AuroraScope;
  /** Maximum number of chunks to create. Default: 100. */
  maxChunks?: number;
  /** Max words per chunk. Default: 200. */
  chunkMaxWords?: number;
  /** Word overlap between chunks. Default: 20. */
  chunkOverlap?: number;
}

export interface IngestResult {
  /** Main document node ID. */
  documentNodeId: string;
  /** All chunk node IDs. */
  chunkNodeIds: string[];
  /** Document title. */
  title: string;
  /** Total word count. */
  wordCount: number;
  /** Number of chunks created. */
  chunkCount: number;
  /** Number of cross-references created to Neuron KG nodes. */
  crossRefsCreated: number;
  /** Details of Neuron KG matches used for cross-references. */
  crossRefMatches: Array<{
    neuronNodeId: string;
    neuronTitle: string;
    similarity: number;
    relationship: string;
  }>;
  /** Pipeline execution report with per-step status and metadata. */
  pipeline_report?: PipelineReport;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Ingest a URL: extract content, chunk, embed, and store as Aurora nodes.
 */
export async function ingestUrl(url: string, options?: IngestOptions): Promise<IngestResult> {
  // Video URL detection — route to specialized video pipeline
  if (isVideoUrl(url)) {
    const result = await ingestVideo(url, {
      scope: options?.scope,
      maxChunks: options?.maxChunks,
    });
    return {
      documentNodeId: result.transcriptNodeId,
      chunkNodeIds: [], // YouTube pipeline doesn't return chunk IDs in same format
      title: result.title,
      wordCount: 0,
      chunkCount: result.chunksCreated,
      crossRefsCreated: result.crossRefsCreated,
      crossRefMatches: result.crossRefMatches,
    };
  }

  const result = await wrapPipelineStep('extract_url', async () => {
    const r = await runWorker({ action: 'extract_url', source: url });
    if (!r.ok) throw new Error(r.error);
    return r;
  });

  return processExtractedText(
    result.title,
    result.text,
    url,
    result.metadata as Record<string, unknown>,
    options ?? {}
  );
}

/**
 * Ingest a local file: detect type, extract content, chunk, embed,
 * and store as Aurora nodes.
 */
export async function ingestDocument(
  filePath: string,
  options?: IngestOptions
): Promise<IngestResult> {
  const ext = extname(filePath).toLowerCase();
  let action: 'extract_text' | 'extract_pdf';

  if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
    action = 'extract_text';
  } else if (ext === '.pdf') {
    action = 'extract_pdf';
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const absolutePath = resolve(filePath);
  const result = await runWorker({ action, source: absolutePath });
  if (!result.ok) {
    throw new Error(result.error);
  }

  // For PDFs, check if text looks garbled and fall back to OCR
  if (ext === '.pdf') {
    const { isTextGarbled, ocrPdf: ocrPdfFallback } = await import('./ocr.js');
    if (isTextGarbled(result.text)) {
      logger.info('  ⚠️  Text looks garbled — falling back to OCR...');
      return ocrPdfFallback(absolutePath, options);
    }
  }

  return processExtractedText(
    result.title,
    result.text,
    null,
    result.metadata as Record<string, unknown>,
    options ?? {}
  );
}

/* ------------------------------------------------------------------ */
/*  Shared pipeline                                                    */
/* ------------------------------------------------------------------ */

/**
 * Core pipeline: hash → dedup check → create doc node → chunk → create
 * chunk nodes + edges → save → embed → auto cross-ref → return result.
 */
export async function processExtractedText(
  title: string,
  text: string,
  sourceUrl: string | null,
  metadata: Record<string, unknown>,
  options: IngestOptions
): Promise<IngestResult> {
  const pipelineStart = Date.now();
  const report: PipelineReport = {
    steps_completed: 0,
    steps_total: 5,
    duration_seconds: 0,
    details: {},
  };

  // Extract step already succeeded (caller handled it)
  report.details.extract = { status: 'ok' };
  report.steps_completed++;

  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  const docId = `doc_${hash}`;

  let graph = await loadAuroraGraph();

  // --- Dedup: if document node already exists, return existing info ---
  const existingDoc = graph.nodes.find((n) => n.id === docId);
  if (existingDoc) {
    const prefix = `${docId}_chunk_`;
    const existingChunkIds = graph.nodes.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
    const wordCount = (metadata.word_count as number | undefined) ?? text.split(/\s+/).length;
    return {
      documentNodeId: docId,
      chunkNodeIds: existingChunkIds,
      title: existingDoc.title,
      wordCount,
      chunkCount: existingChunkIds.length,
      crossRefsCreated: 0,
      crossRefMatches: [],
    };
  }

  // --- Create main document node ---
  const now = new Date().toISOString();
  const docNode: AuroraNode = {
    id: docId,
    type: options.type ?? 'document',
    title,
    properties: {
      text: text.slice(0, 500),
      ...metadata,
      tags: extractTags(title, metadata),
    },
    confidence: 0.5,
    scope: options.scope ?? 'personal',
    sourceUrl: sourceUrl ?? undefined,
    created: now,
    updated: now,
  };
  graph = addAuroraNode(graph, docNode);

  // --- Chunk the text ---
  const allChunks = chunkText(text, {
    maxWords: options.chunkMaxWords ?? 200,
    overlap: options.chunkOverlap ?? 20,
  });
  const chunks = allChunks.slice(0, options.maxChunks ?? 100);
  const totalChunks = chunks.length;
  const chunkNodeIds: string[] = [];

  // --- Create chunk nodes + edges ---
  for (const chunk of chunks) {
    const chunkId = `${docId}_chunk_${chunk.index}`;
    const chunkNode: AuroraNode = {
      id: chunkId,
      type: options.type ?? 'document',
      title: `${title} [chunk ${chunk.index + 1}/${totalChunks}]`,
      properties: {
        text: chunk.text,
        chunkIndex: chunk.index,
        totalChunks,
        wordCount: chunk.wordCount,
        parentId: docId,
      },
      confidence: 0.5,
      scope: options.scope ?? 'personal',
      sourceUrl: sourceUrl ?? undefined,
      created: now,
      updated: now,
    };
    graph = addAuroraNode(graph, chunkNode);
    chunkNodeIds.push(chunkId);

    graph = addAuroraEdge(graph, {
      from: chunkId,
      to: docId,
      type: 'derived_from',
      metadata: { createdBy: 'intake-pipeline' },
    });
  }

  // Chunk report
  report.details.chunk = {
    status: 'ok',
    chunks: totalChunks,
    avg_words:
      totalChunks > 0 ? Math.round(chunks.reduce((s, c) => s + c.wordCount, 0) / totalChunks) : 0,
  };
  report.steps_completed++;

  // --- Persist and embed ---
  await saveAuroraGraph(graph);

  try {
    await autoEmbedAuroraNodes([docId, ...chunkNodeIds]);
    report.details.embed = { status: 'ok', vectors: 1 + chunkNodeIds.length };
    report.steps_completed++;
  } catch (err) {
    report.details.embed = {
      status: 'error',
      message: err instanceof PipelineError ? err.userMessage : String(err),
    };
    // Don't re-throw — embedding failure is non-fatal for intake
  }

  // --- Auto cross-ref: find Neuron matches for the new document ---
  let crossRefsCreated = 0;
  const crossRefMatches: IngestResult['crossRefMatches'] = [];

  try {
    const matches = await findNeuronMatchesForAurora(docId, {
      limit: 5,
      minSimilarity: 0.5,
    });

    for (const match of matches) {
      if (match.similarity >= 0.7) {
        await createCrossRef(
          match.node.id,
          docId,
          'enriches',
          match.similarity,
          { createdBy: 'auto-ingest', source: sourceUrl ?? 'file' },
          'auto-ingest'
        );
        crossRefsCreated++;
        crossRefMatches.push({
          neuronNodeId: match.node.id,
          neuronTitle: match.node.title,
          similarity: match.similarity,
          relationship: 'enriches',
        });

        // Bayesian confidence update
        try {
          await updateConfidence(docId, {
            direction: 'supports',
            sourceType: classifySource(sourceUrl),
            reason: `Cross-ref with Neuron node "${match.node.title}" (similarity: ${match.similarity.toFixed(2)})`,
            metadata: {
              neuronNodeId: match.node.id,
              similarity: match.similarity,
              sourceUrl,
            },
          });
        } catch {
          /* intentional: JSON parse may fail */
          // confidence update failure should not break ingest
        }
      }
    }
    report.details.crossref = { status: 'ok', matches: crossRefMatches.length };
    report.steps_completed++;
  } catch (err) {
    logger.error('[intake] intake processing failed', { error: String(err) });
    report.details.crossref = {
      status: 'error',
      message: err instanceof PipelineError ? err.userMessage : String(err),
    };
    // Postgres might not be available, or kg_nodes might be empty
  }

  // --- Save report ---
  report.details.save = { status: 'ok' };
  report.steps_completed++;
  report.duration_seconds = Math.round((Date.now() - pipelineStart) / 1000);

  // Update doc node with pipeline report
  graph = updateAuroraNode(graph, docId, {
    properties: { ...docNode.properties, pipeline_report: report },
  });
  await saveAuroraGraph(graph);

  // --- Return result ---
  const wordCount = (metadata.word_count as number | undefined) ?? text.split(/\s+/).length;
  return {
    documentNodeId: docId,
    chunkNodeIds,
    title,
    wordCount,
    chunkCount: chunkNodeIds.length,
    crossRefsCreated,
    crossRefMatches,
    pipeline_report: report,
  };
}
