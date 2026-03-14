import { getGaps, resolveGap, type KnowledgeGap } from '../../aurora/knowledge-gaps.js';
import { webSearch } from '../../aurora/web-search.js';
import { ingestUrl } from '../../aurora/intake.js';
import { getEmbeddingProvider } from '../../core/embeddings.js';
import { getFreshnessReport, verifySource, type FreshnessInfo } from '../../aurora/freshness.js';
import { suggestResearch } from '../../aurora/gap-brief.js';
import { remember } from '../../aurora/memory.js';

// --- Cosine similarity helper ---

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// --- Public interfaces ---

export interface KMOptions {
  maxActions?: number;      // default 5
  focusTopic?: string;      // optional — filter to topic
  includeStale?: boolean;   // default true
}

export interface ResearchResult {
  gapId: string;
  question: string;
  urlsIngested: number;
  factsLearned: number;
  resolved: boolean;
}

export interface KMReport {
  gapsFound: number;
  gapsResearched: number;
  gapsResolved: number;
  urlsIngested: number;
  sourcesRefreshed: number;
  newNodesCreated: number;
  factsLearned: number;
  articlesCreated: number;
  articlesUpdated: number;
  summary: string;
  details: ResearchResult[];
}

// --- Internal types ---

interface KMCandidate {
  type: 'gap' | 'stale';
  score: number;
  gap?: KnowledgeGap;
  staleNode?: FreshnessInfo;
}

/**
 * KnowledgeManagerAgent — a programmatic orchestrator that maintains
 * knowledge quality by scanning for gaps and stale sources, then
 * researching gaps and refreshing stale nodes.
 *
 * Unlike other agents, this does NOT use a Claude API loop. It directly
 * calls existing Aurora functions, making it simpler and more testable.
 */
export class KnowledgeManagerAgent {
  private options: Required<Omit<KMOptions, 'focusTopic'>> & Pick<KMOptions, 'focusTopic'>;

  constructor(
    private audit: { log: (entry: unknown) => Promise<void> },
    options: KMOptions = {},
  ) {
    this.options = {
      maxActions: options.maxActions ?? 5,
      focusTopic: options.focusTopic,
      includeStale: options.includeStale ?? true,
    };
  }

  /** Run the full knowledge maintenance pipeline: scan → research → report. */
  async run(): Promise<KMReport> {
    await this.audit.log({
      ts: new Date().toISOString(),
      role: 'knowledge-manager',
      phase: 'start',
      options: this.options,
    });

    const { candidates, totalGapsFound } = await this.scan();
    const researchResult = await this.research(candidates);

    const report = this.buildReport(
      { gapsFound: totalGapsFound },
      researchResult,
    );

    await this.audit.log({
      ts: new Date().toISOString(),
      role: 'knowledge-manager',
      phase: 'complete',
      report,
    });

    return report;
  }

  /**
   * Semantic topic filter: uses embeddings when available, falls back to string match.
   */
  private async filterByTopic(gaps: KnowledgeGap[], topic: string): Promise<KnowledgeGap[]> {
    try {
      const provider = getEmbeddingProvider();
      const topicEmbedding = await provider.embed(topic);

      const scored = await Promise.all(
        gaps.map(async (gap) => {
          const gapEmbedding = await provider.embed(gap.question);
          const similarity = cosineSimilarity(topicEmbedding, gapEmbedding);
          return { gap, similarity };
        }),
      );

      // Filter gaps with similarity >= 0.5
      return scored
        .filter((s) => s.similarity >= 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .map((s) => s.gap);
    } catch {
      // Fallback to string matching
      return gaps.filter((g) =>
        g.question.toLowerCase().includes(topic.toLowerCase()),
      );
    }
  }

  /**
   * Phase 1 — Scan for knowledge gaps and stale sources.
   * Returns a prioritized list of candidates to act on, plus the total
   * number of gaps found before maxActions filtering.
   */
  private async scan(): Promise<{ candidates: KMCandidate[]; totalGapsFound: number }> {
    const candidates: KMCandidate[] = [];

    // 1. Fetch knowledge gaps
    const { gaps } = await getGaps();

    // 2. Filter by focusTopic if set (semantic with string-match fallback)
    const filteredGaps = this.options.focusTopic
      ? await this.filterByTopic(gaps, this.options.focusTopic)
      : gaps;

    // 3. Count total gaps after topic filter but BEFORE maxActions
    const totalGapsFound = filteredGaps.length;

    // 4. Score and add gap candidates
    for (const gap of filteredGaps) {
      candidates.push({
        type: 'gap',
        score: gap.frequency * 2,
        gap,
      });
    }

    // 5. Fetch stale sources if enabled
    if (this.options.includeStale) {
      const staleNodes = await getFreshnessReport({ onlyStale: true });

      const filteredStale = this.options.focusTopic
        ? staleNodes.filter((n) =>
            n.title.toLowerCase().includes(this.options.focusTopic!.toLowerCase()),
          )
        : staleNodes;

      for (const node of filteredStale) {
        candidates.push({
          type: 'stale',
          score: (1 - node.freshnessScore) * node.confidence,
          staleNode: node,
        });
      }
    }

    // 6. Sort by score descending, take top maxActions
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, this.options.maxActions);

    await this.audit.log({
      ts: new Date().toISOString(),
      role: 'knowledge-manager',
      phase: 'scan',
      totalCandidates: candidates.length,
      selected: topCandidates.length,
      candidates: topCandidates.map((c) => ({
        type: c.type,
        score: c.score,
        label: c.type === 'gap' ? c.gap?.question : c.staleNode?.title,
      })),
    });

    return { candidates: topCandidates, totalGapsFound };
  }

  /**
   * Research a single knowledge gap: web search, ingest URLs, remember, resolve.
   */
  private async researchGap(gap: KnowledgeGap): Promise<ResearchResult> {
    // 1. Get research context via suggestResearch
    const suggestion = await suggestResearch(gap.question);

    // 2. Search the web
    const urls = await webSearch(gap.question, 3);

    // 3. Ingest top URLs (max 3)
    let urlsIngestedCount = 0;
    const ingestedUrls: string[] = [];
    for (const url of urls.slice(0, 3)) {
      try {
        await ingestUrl(url);
        urlsIngestedCount++;
        ingestedUrls.push(url);
      } catch {
        // Skip failed URLs, continue with next
      }
    }

    // 4. Remember the research summary
    const briefSummary = suggestion.brief.suggestions.join('; ');
    const memoryText = `${gap.question} — ${briefSummary}`;
    await remember(memoryText, {
      source: 'km-agent',
      tags: ['km-research'],
    });
    const factsLearnedCount = 1 + urlsIngestedCount; // 1 for the remember call + ingested docs

    // 5. Resolve the gap if we ingested at least 1 URL
    const resolved = urlsIngestedCount > 0;
    if (resolved && gap.id) {
      try {
        await resolveGap(gap.id, {
          researchedBy: 'knowledge-manager',
          urlsIngested: ingestedUrls,
          factsLearned: factsLearnedCount,
        });
      } catch {
        // Gap resolution failure shouldn't break the flow
      }
    }

    return {
      gapId: gap.id,
      question: gap.question,
      urlsIngested: urlsIngestedCount,
      factsLearned: factsLearnedCount,
      resolved,
    };
  }

  /**
   * Phase 2 — Research gaps and refresh stale sources.
   * Processes each candidate independently; failures are logged and skipped.
   */
  private async research(candidates: KMCandidate[]): Promise<{
    gapsResearched: number;
    gapsResolved: number;
    sourcesRefreshed: number;
    newNodesCreated: number;
    urlsIngested: number;
    factsLearned: number;
    actions: string[];
    details: ResearchResult[];
  }> {
    let gapsResearched = 0;
    let gapsResolved = 0;
    let sourcesRefreshed = 0;
    let newNodesCreated = 0;
    let urlsIngested = 0;
    let factsLearned = 0;
    const actions: string[] = [];
    const details: ResearchResult[] = [];

    for (const candidate of candidates) {
      if (candidate.type === 'gap' && candidate.gap) {
        try {
          const result = await this.researchGap(candidate.gap);
          gapsResearched++;
          urlsIngested += result.urlsIngested;
          factsLearned += result.factsLearned;
          newNodesCreated += result.factsLearned;
          if (result.resolved) gapsResolved++;
          details.push(result);

          const actionDesc = `Researched gap: "${candidate.gap.question}" (${result.urlsIngested} URLs, ${result.factsLearned} facts${result.resolved ? ', resolved' : ''})`;
          actions.push(actionDesc);

          await this.audit.log({
            ts: new Date().toISOString(),
            role: 'knowledge-manager',
            phase: 'research',
            action: 'gap-researched',
            question: candidate.gap.question,
            result,
          });
        } catch (error) {
          await this.audit.log({
            ts: new Date().toISOString(),
            role: 'knowledge-manager',
            phase: 'research',
            action: 'gap-failed',
            question: candidate.gap.question,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (candidate.type === 'stale' && candidate.staleNode) {
        try {
          await verifySource(candidate.staleNode.nodeId);
          sourcesRefreshed++;

          const actionDesc = `Refreshed stale source: "${candidate.staleNode.title}"`;
          actions.push(actionDesc);

          await this.audit.log({
            ts: new Date().toISOString(),
            role: 'knowledge-manager',
            phase: 'research',
            action: 'source-refreshed',
            nodeId: candidate.staleNode.nodeId,
            title: candidate.staleNode.title,
          });
        } catch (error) {
          await this.audit.log({
            ts: new Date().toISOString(),
            role: 'knowledge-manager',
            phase: 'research',
            action: 'refresh-failed',
            nodeId: candidate.staleNode.nodeId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { gapsResearched, gapsResolved, sourcesRefreshed, newNodesCreated, urlsIngested, factsLearned, actions, details };
  }

  /**
   * Phase 3 — Build a human-readable report from scan and research results.
   */
  private buildReport(
    scanResult: { gapsFound: number },
    researchResult: {
      gapsResearched: number;
      gapsResolved: number;
      sourcesRefreshed: number;
      newNodesCreated: number;
      urlsIngested: number;
      factsLearned: number;
      actions: string[];
      details: ResearchResult[];
    },
  ): KMReport {
    const actionsSummary = researchResult.actions.length > 0
      ? researchResult.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : 'No actions taken.';

    const summary = [
      `Knowledge maintenance complete.`,
      `Found ${scanResult.gapsFound} gap(s).`,
      `Researched ${researchResult.gapsResearched} gap(s), resolved ${researchResult.gapsResolved}, refreshed ${researchResult.sourcesRefreshed} source(s).`,
      `Ingested ${researchResult.urlsIngested} URL(s), learned ${researchResult.factsLearned} fact(s), created ${researchResult.newNodesCreated} new node(s).`,
      ``,
      `Actions:`,
      actionsSummary,
    ].join('\n');

    return {
      gapsFound: scanResult.gapsFound,
      gapsResearched: researchResult.gapsResearched,
      gapsResolved: researchResult.gapsResolved,
      urlsIngested: researchResult.urlsIngested,
      sourcesRefreshed: researchResult.sourcesRefreshed,
      newNodesCreated: researchResult.newNodesCreated,
      factsLearned: researchResult.factsLearned,
      articlesCreated: 0,
      articlesUpdated: 0,
      summary,
      details: researchResult.details,
    };
  }
}
