import { getGaps, type KnowledgeGap } from '../../aurora/knowledge-gaps.js';
import { getFreshnessReport, verifySource, type FreshnessInfo } from '../../aurora/freshness.js';
import { suggestResearch } from '../../aurora/gap-brief.js';
import { remember } from '../../aurora/memory.js';

// --- Public interfaces ---

export interface KMOptions {
  maxActions?: number;      // default 5
  focusTopic?: string;      // optional — filter to topic
  includeStale?: boolean;   // default true
}

export interface KMReport {
  gapsFound: number;
  gapsResearched: number;
  sourcesRefreshed: number;
  newNodesCreated: number;
  summary: string;
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
   * Phase 1 — Scan for knowledge gaps and stale sources.
   * Returns a prioritized list of candidates to act on, plus the total
   * number of gaps found before maxActions filtering.
   */
  private async scan(): Promise<{ candidates: KMCandidate[]; totalGapsFound: number }> {
    const candidates: KMCandidate[] = [];

    // 1. Fetch knowledge gaps
    const { gaps } = await getGaps();

    // 2. Filter by focusTopic if set
    const filteredGaps = this.options.focusTopic
      ? gaps.filter((g) =>
          g.question.toLowerCase().includes(this.options.focusTopic!.toLowerCase()),
        )
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
   * Phase 2 — Research gaps and refresh stale sources.
   * Processes each candidate independently; failures are logged and skipped.
   */
  private async research(candidates: KMCandidate[]): Promise<{
    gapsResearched: number;
    sourcesRefreshed: number;
    newNodesCreated: number;
    actions: string[];
  }> {
    let gapsResearched = 0;
    let sourcesRefreshed = 0;
    let newNodesCreated = 0;
    const actions: string[] = [];

    for (const candidate of candidates) {
      if (candidate.type === 'gap' && candidate.gap) {
        try {
          const suggestion = await suggestResearch(candidate.gap.question);

          const briefSummary = suggestion.brief.suggestions.join('; ');
          const memoryText = `${candidate.gap.question} — ${briefSummary}`;

          await remember(memoryText, {
            source: 'km-agent',
            tags: ['km-research'],
          });

          gapsResearched++;
          newNodesCreated++;

          const actionDesc = `Researched gap: "${candidate.gap.question}"`;
          actions.push(actionDesc);

          await this.audit.log({
            ts: new Date().toISOString(),
            role: 'knowledge-manager',
            phase: 'research',
            action: 'gap-researched',
            question: candidate.gap.question,
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

    return { gapsResearched, sourcesRefreshed, newNodesCreated, actions };
  }

  /**
   * Phase 3 — Build a human-readable report from scan and research results.
   */
  private buildReport(
    scanResult: { gapsFound: number },
    researchResult: {
      gapsResearched: number;
      sourcesRefreshed: number;
      newNodesCreated: number;
      actions: string[];
    },
  ): KMReport {
    const actionsSummary = researchResult.actions.length > 0
      ? researchResult.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : 'No actions taken.';

    const summary = [
      `Knowledge maintenance complete.`,
      `Found ${scanResult.gapsFound} gap(s).`,
      `Researched ${researchResult.gapsResearched} gap(s), refreshed ${researchResult.sourcesRefreshed} source(s), created ${researchResult.newNodesCreated} new node(s).`,
      ``,
      `Actions:`,
      actionsSummary,
    ].join('\n');

    return {
      gapsFound: scanResult.gapsFound,
      gapsResearched: researchResult.gapsResearched,
      sourcesRefreshed: researchResult.sourcesRefreshed,
      newNodesCreated: researchResult.newNodesCreated,
      summary,
    };
  }
}
