export {
  AuroraNodeTypeSchema,
  AuroraScopeSchema,
  AuroraEdgeTypeSchema,
  AuroraNodeSchema,
  AuroraEdgeSchema,
  AuroraGraphSchema,
  type AuroraNodeType,
  type AuroraScope,
  type AuroraEdgeType,
  type AuroraNode,
  type AuroraEdge,
  type AuroraGraph,
} from './aurora-schema.js';

export {
  createEmptyAuroraGraph,
  addAuroraNode,
  addAuroraEdge,
  findAuroraNodes,
  updateAuroraNode,
  removeAuroraNode,
  applyAuroraConfidenceDecay,
  traverseAurora,
  loadAuroraGraph,
  saveAuroraGraph,
  loadAuroraGraphFromDb,
  saveAuroraGraphToDb,
  autoEmbedAuroraNodes,
} from './aurora-graph.js';

export {
  chunkText,
  type ChunkOptions,
  type Chunk,
} from './chunker.js';

export {
  runWorker,
  isWorkerAvailable,
  type WorkerRequest,
  type WorkerResult,
  type WorkerError,
  type WorkerResponse,
  type WorkerOptions,
} from './worker-bridge.js';

export {
  ingestUrl,
  ingestDocument,
  type IngestOptions,
  type IngestResult,
} from './intake.js';

export {
  searchAurora,
  type SearchOptions,
  type SearchResult,
} from './search.js';

export {
  ask,
  formatContext,
  type AskOptions,
  type AskResult,
  type Citation,
} from './ask.js';

export {
  remember,
  recall,
  memoryStats,
  type RememberOptions,
  type RememberResult,
  type RecallOptions,
  type RecallResult,
  type Memory,
  type MemoryStats,
} from './memory.js';

export {
  isYouTubeUrl,
  extractVideoId,
  ingestYouTube,
  type YouTubeIngestOptions,
  type YouTubeIngestResult,
} from './youtube.js';

export {
  timeline,
  type TimelineEntry,
  type TimelineOptions,
} from './timeline.js';

export {
  recordGap,
  getGaps,
  type KnowledgeGap,
  type GapsResult,
} from './knowledge-gaps.js';

export {
  unifiedSearch,
  createCrossRef,
  getCrossRefs,
  findAuroraMatchesForNeuron,
  findNeuronMatchesForAurora,
  transferCrossRefs,
  checkCrossRefIntegrity,
  type CrossRef,
  type CrossRefMatch,
  type UnifiedSearchResult,
  type UnifiedSearchOptions,
  type IntegrityIssue,
} from './cross-ref.js';

export {
  briefing,
  type BriefingOptions,
  type BriefingResult,
} from './briefing.js';
