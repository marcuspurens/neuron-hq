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

import { findSimilarNodes } from '../core/semantic-search.js';
import { resolveGap } from './knowledge-gaps.js';
import type { AuroraGraph } from './aurora-schema.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:intake');

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

interface LlmMetadata {
  tags: string[];
  language: string | null;
  author: string | null;
  contentType: string | null;
  summary: string | null;
}

function sampleText(text: string): string {
  if (text.length <= 3000) return text;
  const start = text.slice(0, 1000);
  const mid = text.slice(Math.floor(text.length / 2) - 500, Math.floor(text.length / 2) + 500);
  const end = text.slice(-1000);
  return `${start}\n[...]\n${mid}\n[...]\n${end}`;
}

async function generateMetadata(
  title: string,
  text: string,
  sourceUrl: string | null,
  crossRefTitles: string[],
  existingMetadata: Record<string, unknown>
): Promise<LlmMetadata> {
  const domainTag = sourceUrl
    ? (() => {
        try {
          return new URL(sourceUrl).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
      })()
    : null;

  const contextParts = [`Title: ${title}`, `Text:\n${sampleText(text)}`];
  if (sourceUrl) contextParts.push(`Source: ${sourceUrl}`);
  if (crossRefTitles.length > 0) contextParts.push(`Related topics: ${crossRefTitles.join(', ')}`);

  const prompt = `Analyze this document and return a JSON object with these fields:
- "tags": 5-10 keyword tags (lowercase, max 2 words each, in the content's language). Include the core subject matter, key concepts, named people/organizations, and activities described (e.g. if the text is about writing code, include "code" or "programming").
- "language": the language of the content (e.g. "english", "svenska", "deutsch"). Use the full language name.
- "author": the author's full name if identifiable from the text, byline, or source URL, otherwise null.
- "content_type": one of "webbartikel", "forskningsartikel", "bloggpost", "nyhetsartikel", "dokumentation", "transkript", "rapport", "annat".
- "summary": 1-2 sentences describing what this is about, written directly (NOT "this article discusses..." — just state the core idea), in the same language as the content.

${contextParts.join('\n')}

Respond with ONLY a JSON object, nothing else. Example:
{"tags": ["energi", "vätgas", "göteborg"], "language": "svenska", "author": "Anna Svensson", "content_type": "nyhetsartikel", "summary": "Artikeln handlar om Sveriges satsning på vätgas som energikälla."}`;

  try {
    const { ensureOllama, getOllamaUrl } = await import('../core/ollama.js');
    const { getConfig } = await import('../core/config.js');
    const model = getConfig().OLLAMA_MODEL_POLISH;
    await ensureOllama(model);

    const resp = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resp.ok) {
      logger.warn('[intake] Ollama metadata generation failed', { status: resp.status });
      return {
        tags: domainTag ? [domainTag] : [],
        language: null,
        author: null,
        contentType: null,
        summary: null,
      };
    }

    const data = (await resp.json()) as OllamaChatResponse;
    const content = data.message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
      const llmTags = rawTags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length >= 2 && t.length <= 40);
      const tags = [...new Set([...(domainTag ? [domainTag] : []), ...llmTags])].slice(0, 15);

      const language = typeof parsed.language === 'string' ? parsed.language.toLowerCase() : null;
      const author =
        typeof parsed.author === 'string' && parsed.author !== 'null' ? parsed.author : null;
      const contentType = typeof parsed.content_type === 'string' ? parsed.content_type : null;
      const summary = typeof parsed.summary === 'string' ? parsed.summary : null;

      return {
        tags,
        language:
          existingMetadata.language !== 'unknown' ? String(existingMetadata.language) : language,
        author: (existingMetadata.author as string | undefined) ?? author,
        contentType,
        summary,
      };
    }

    logger.warn('[intake] Could not parse LLM metadata', { content: content.slice(0, 200) });
  } catch (err) {
    logger.warn('[intake] Metadata generation error', { error: String(err) });
  }

  return {
    tags: domainTag ? [domainTag] : [],
    language: null,
    author: null,
    contentType: null,
    summary: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Memory Evolution                                                   */
/* ------------------------------------------------------------------ */

export interface EvolutionResult {
  nodesUpdated: number;
  gapsResolved: number;
}

export async function evolveRelatedNodes(
  graph: AuroraGraph,
  newNodeId: string,
  newTitle: string,
  summary: string | null
): Promise<{ graph: AuroraGraph; evolution: EvolutionResult }> {
  const evolution: EvolutionResult = { nodesUpdated: 0, gapsResolved: 0 };

  try {
    const similar = await findSimilarNodes(newNodeId, {
      table: 'aurora_nodes',
      limit: 5,
      minSimilarity: 0.6,
    });

    const contextEntry = summary
      ? `Ny relaterad källa: ${newTitle} — ${summary}`
      : `Ny relaterad källa: ${newTitle}`;

    for (const match of similar) {
      const node = graph.nodes.find((n) => n.id === match.id);
      if (!node) continue;
      if (node.id === newNodeId) continue;
      if (node.properties.chunkIndex !== undefined) continue;

      const existing = (node.properties.relatedContext as string[] | undefined) ?? [];
      const updated = [...existing, contextEntry].slice(-10);

      graph = updateAuroraNode(graph, node.id, {
        properties: { ...node.properties, relatedContext: updated },
      });
      evolution.nodesUpdated++;
    }

    // Check if new node resolves any open knowledge gaps
    const gapNodes = graph.nodes.filter(
      (n) => n.type === 'research' && n.properties.gapType === 'unanswered'
    );
    for (const gap of gapNodes) {
      const gapQuestion = gap.title.toLowerCase();
      const titleLower = newTitle.toLowerCase();
      const summaryLower = (summary ?? '').toLowerCase();

      const questionWords = gapQuestion.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = questionWords.filter(
        (w) => titleLower.includes(w) || summaryLower.includes(w)
      ).length;

      if (questionWords.length > 0 && matchCount / questionWords.length >= 0.5) {
        try {
          await resolveGap(gap.id, {
            researchedBy: 'memory-evolution',
            urlsIngested: [newNodeId],
            factsLearned: 1,
          });
          evolution.gapsResolved++;
        } catch {
          // Gap resolution failure is non-fatal
        }
      }
    }
  } catch (err) {
    logger.warn('[intake] Memory evolution failed, skipping', { error: String(err) });
  }

  return { graph, evolution };
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
  /** Memory evolution stats: how many related nodes were updated. */
  evolution?: EvolutionResult;
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
    steps_total: 8,
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
      tags: [] as string[],
      provenance: (metadata.provenance as Record<string, unknown>) ?? {
        agent: 'System',
        agentId: null,
        method: sourceUrl ? 'web_scrape' : 'manual',
        model: null,
        sourceId: null,
        timestamp: now,
      },
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

  // --- LLM metadata enrichment (after embeddings + cross-refs) ---
  const crossRefTitles = crossRefMatches.map((m) => m.neuronTitle);
  try {
    const llm = await generateMetadata(title, text, sourceUrl, crossRefTitles, metadata);
    if (llm.tags.length > 0) docNode.properties.tags = llm.tags;
    if (llm.language) docNode.properties.language = llm.language;
    if (llm.author) docNode.properties.author = llm.author;
    if (llm.contentType) docNode.properties.contentType = llm.contentType;
    if (llm.summary) docNode.properties.summary = llm.summary;
    graph = updateAuroraNode(graph, docId, { properties: docNode.properties });
    report.details.tags = { status: 'ok', count: llm.tags.length };
  } catch (err) {
    report.details.tags = { status: 'error', message: String(err) };
  }

  // --- Concept extraction + linking via local LLM ---
  try {
    const { ensureOllama, getOllamaUrl } = await import('../core/ollama.js');
    const { getConfig } = await import('../core/config.js');
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const ollamaModel = getConfig().OLLAMA_MODEL_POLISH;
    await ensureOllama(ollamaModel);

    const promptPath = resolve(import.meta.dirname ?? '.', '../../prompts/concept-extraction.md');
    let extractionPrompt = await readFile(promptPath, 'utf-8');
    extractionPrompt = extractionPrompt.replace('{{text}}', sampleText(text));

    const conceptResp = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [{ role: 'user', content: extractionPrompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (conceptResp.ok) {
      const conceptData = (await conceptResp.json()) as OllamaChatResponse;
      const conceptContent = conceptData.message.content.trim();
      const conceptJson = conceptContent.match(/\{[\s\S]*\}/);
      if (conceptJson) {
        const parsed = JSON.parse(conceptJson[0]) as Record<string, unknown>;
        const rawConcepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];
        const conceptsForOntology = rawConcepts
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .map((c) => ({
            name: (c.name as string) ?? String(c),
            facet: (c.facet as string) ?? 'topic',
            broaderConcept: (c.broaderConcept as string) ?? null,
            standardRefs: c.standardRefs as Record<string, string> | undefined,
          }));

        if (conceptsForOntology.length > 0) {
          const { linkArticleToConcepts } = await import('./ontology.js');
          const result = await linkArticleToConcepts(docId, conceptsForOntology);
          report.details.concepts = {
            status: 'ok',
            linked: result.conceptsLinked,
            created: result.conceptsCreated,
          };
        } else {
          report.details.concepts = { status: 'skipped', reason: 'no concepts extracted' };
        }
      } else {
        report.details.concepts = { status: 'skipped', reason: 'no JSON in LLM response' };
      }
    } else {
      report.details.concepts = { status: 'skipped', reason: `ollama ${conceptResp.status}` };
    }
  } catch (err) {
    report.details.concepts = { status: 'error', message: String(err) };
  }

  // --- Memory evolution: update related nodes + resolve gaps ---
  let evolution: EvolutionResult = { nodesUpdated: 0, gapsResolved: 0 };
  try {
    const summary = (docNode.properties.summary as string | undefined) ?? null;
    const evoResult = await evolveRelatedNodes(graph, docId, title, summary);
    graph = evoResult.graph;
    evolution = evoResult.evolution;
    report.details.evolution = {
      status: 'ok',
      nodesUpdated: evolution.nodesUpdated,
      gapsResolved: evolution.gapsResolved,
    };
    report.steps_completed++;
  } catch (err) {
    report.details.evolution = { status: 'error', message: String(err) };
  }

  // --- Save report ---
  report.details.save = { status: 'ok' };
  report.steps_completed++;
  report.duration_seconds = Math.round((Date.now() - pipelineStart) / 1000);

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
    evolution,
    pipeline_report: report,
  };
}
