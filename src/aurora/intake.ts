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
} from './aurora-graph.js';
import type { AuroraNodeType, AuroraScope, AuroraNode } from './aurora-schema.js';
import { isVideoUrl, ingestVideo } from './video.js';
import { findNeuronMatchesForAurora, createCrossRef } from './cross-ref.js';

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
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Ingest a URL: extract content, chunk, embed, and store as Aurora nodes.
 */
export async function ingestUrl(
  url: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  // Video URL detection — route to specialized video pipeline
  if (isVideoUrl(url)) {
    const result = await ingestVideo(url, {
      scope: options?.scope,
      maxChunks: options?.maxChunks,
    });
    return {
      documentNodeId: result.transcriptNodeId,
      chunkNodeIds: [],  // YouTube pipeline doesn't return chunk IDs in same format
      title: result.title,
      wordCount: 0,
      chunkCount: result.chunksCreated,
      crossRefsCreated: result.crossRefsCreated,
      crossRefMatches: result.crossRefMatches,
    };
  }

  const result = await runWorker({ action: 'extract_url', source: url });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return processExtractedText(
    result.title,
    result.text,
    url,
    result.metadata as Record<string, unknown>,
    options ?? {},
  );
}

/**
 * Ingest a local file: detect type, extract content, chunk, embed,
 * and store as Aurora nodes.
 */
export async function ingestDocument(
  filePath: string,
  options?: IngestOptions,
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
  return processExtractedText(
    result.title,
    result.text,
    null,
    result.metadata as Record<string, unknown>,
    options ?? {},
  );
}

/* ------------------------------------------------------------------ */
/*  Internal                                                           */
/* ------------------------------------------------------------------ */

/**
 * Core pipeline: hash → dedup check → create doc node → chunk → create
 * chunk nodes + edges → save → embed → auto cross-ref → return result.
 */
async function processExtractedText(
  title: string,
  text: string,
  sourceUrl: string | null,
  metadata: Record<string, unknown>,
  options: IngestOptions,
): Promise<IngestResult> {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  const docId = `doc_${hash}`;

  let graph = await loadAuroraGraph();

  // --- Dedup: if document node already exists, return existing info ---
  const existingDoc = graph.nodes.find((n) => n.id === docId);
  if (existingDoc) {
    const prefix = `${docId}_chunk_`;
    const existingChunkIds = graph.nodes
      .filter((n) => n.id.startsWith(prefix))
      .map((n) => n.id);
    const wordCount =
      (metadata.word_count as number | undefined) ??
      text.split(/\s+/).length;
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

  // --- Persist and embed ---
  await saveAuroraGraph(graph);
  await autoEmbedAuroraNodes([docId, ...chunkNodeIds]);

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
          'auto-ingest',
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
    // Postgres might not be available, or kg_nodes might be empty
  }

  // --- Return result ---
  const wordCount =
    (metadata.word_count as number | undefined) ??
    text.split(/\s+/).length;
  return {
    documentNodeId: docId,
    chunkNodeIds,
    title,
    wordCount,
    chunkCount: chunkNodeIds.length,
    crossRefsCreated,
    crossRefMatches,
  };
}
