/**
 * Centralized LLM defaults for the Aurora pipeline.
 *
 * All tunable model names, token limits, similarity thresholds,
 * confidence scores, and operational limits in one place.
 *
 * Call sites may override via function parameters — these are defaults,
 * not mandates. Pattern: `options?.maxTokens ?? AURORA_TOKENS.medium`
 *
 * For agent orchestration models, see src/core/model-registry.ts.
 * For runtime env config (URLs, keys), see src/core/config.ts.
 */

// ---------------------------------------------------------------------------
//  Model selection
// ---------------------------------------------------------------------------

/** Anthropic model IDs for Aurora tasks. */
export const AURORA_MODELS = {
  /** Fast/cheap: classification, extraction, short generation, Q&A */
  fast: 'claude-haiku-4-5-20251001',
} as const;

// ---------------------------------------------------------------------------
//  Token limits
// ---------------------------------------------------------------------------

/** max_tokens per task type. */
export const AURORA_TOKENS = {
  /** Short extraction/classification (memory contradiction, tldr) */
  short: 256,
  /** Standard generation (briefings, gap briefs, Q&A) */
  medium: 512,
  /** Longer generation (ask, speaker guess, knowledge gaps, library) */
  long: 1024,
  /** Long-form (transcript polish) */
  extended: 2048,
} as const;

// ---------------------------------------------------------------------------
//  Similarity thresholds (vector cosine / Jaccard)
// ---------------------------------------------------------------------------

/** Named thresholds for vector similarity operations. */
export const AURORA_SIMILARITY = {
  /** Exact duplicate gate (memory dedup) */
  exactDup: 0.95,
  /** Standard dedup (memory, ontology, historian) */
  dedup: 0.85,
  /** Cross-reference creation gate (intake, video) */
  crossref: 0.7,
  /** High-relevance search gate (conversation direct answers) */
  highRelevance: 0.8,
  /** Default search minimum (memory recall) */
  search: 0.5,
  /** Loose search (idea clustering, knowledge graph candidates) */
  searchLoose: 0.3,
  /** Jaccard default for graph merge/consolidation */
  jaccard: 0.6,
  /** Speaker auto-tag threshold */
  speakerAutoTag: 0.9,
  /** External ID disambiguation */
  disambiguation: 0.6,
} as const;

// ---------------------------------------------------------------------------
//  Confidence scores (knowledge graph node confidence)
// ---------------------------------------------------------------------------

/** Default confidence values for knowledge operations. */
export const AURORA_CONFIDENCE = {
  /** New unverified node (intake, intake-video low-quality) */
  initial: 0.5,
  /** Single-source verified (knowledge gaps, cross-ref, video mid-quality) */
  verified: 0.7,
  /** Multi-source confirmed (knowledge library, video high-quality) */
  confirmed: 0.8,
  /** High-quality source (video title/description) */
  high: 0.9,
  /** Best available (video canonical metadata) */
  highest: 0.95,
  /** Decayed / outdated data (freshness aging boundary) */
  decayed: 0.3,
  /** Stale max — below this, consolidator considers archiving */
  staleMax: 0.15,
  /** Confidence bump on dedup merge / confirmation */
  bump: 0.1,
} as const;

// ---------------------------------------------------------------------------
//  Freshness
// ---------------------------------------------------------------------------

/** Freshness score boundaries. */
export const AURORA_FRESHNESS = {
  /** Score >= this: "fresh" */
  fresh: 0.7,
  /** Score >= this: "aging" (below: "stale") */
  aging: 0.3,
} as const;

// ---------------------------------------------------------------------------
//  Operational limits (timeouts, batch sizes)
// ---------------------------------------------------------------------------

/** Timeouts in milliseconds and batch sizes. */
export const AURORA_LIMITS = {
  /** LLM call timeout (briefing, morning questions) */
  llmTimeoutMs: 30_000,
  /** Intake / moderate-length operations */
  intakeTimeoutMs: 45_000,
  /** Vision model timeout */
  visionTimeoutMs: 120_000,
  /** Embedding batch size (aurora-graph) */
  embeddingBatchSize: 20,
  /** Transcript polish Ollama batch size */
  polishBatchSize: 8,
  /** Max image size for vision input */
  maxImageBytes: 10 * 1024 * 1024,
  /** Ollama vision num_predict (max output tokens) */
  visionNumPredict: 1200,
  /** Ollama vision keep_alive */
  visionKeepAlive: '10m',
  /** MCP help tool timeout */
  helpTimeoutMs: 15_000,
  /** MCP help tool max tokens */
  helpMaxTokens: 512,
} as const;
