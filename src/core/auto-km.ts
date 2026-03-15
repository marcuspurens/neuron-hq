import type { KMReport } from './agents/knowledge-manager.js';

/**
 * Configuration for automatic Knowledge Manager scheduling.
 */
export interface AutoKMConfig {
  enabled: boolean;
  minRunsBetween: number;
  maxActionsPerRun: number;
  skipOnRed: boolean;
  topicFromBrief: boolean;
  chainEnabled?: boolean;     // default false
  chainMaxCycles?: number;    // default 2 (conservative for auto mode)
}

/**
 * Default configuration for auto-KM — disabled by default.
 */
export const DEFAULT_AUTO_KM_CONFIG: AutoKMConfig = {
  enabled: false,
  minRunsBetween: 3,
  maxActionsPerRun: 3,
  skipOnRed: true,
  topicFromBrief: true,
  chainEnabled: false,
  chainMaxCycles: 2,
};

/**
 * Pure function to determine whether auto-KM should run.
 *
 * @param stoplight - Current stoplight color: 'GREEN' | 'YELLOW' | 'RED'
 * @param config - Auto-KM configuration
 * @param lastKMRunNumber - The run number of the last KM run, or null if never run
 * @param currentRunNumber - The current run number
 * @returns true if auto-KM should run
 */
export function shouldRunAutoKM(
  stoplight: string,
  config: AutoKMConfig,
  lastKMRunNumber: number | null,
  currentRunNumber: number,
): boolean {
  if (!config.enabled) return false;
  if (stoplight === 'RED' && config.skipOnRed) return false;
  if (
    lastKMRunNumber !== null &&
    currentRunNumber - lastKMRunNumber < config.minRunsBetween
  ) {
    return false;
  }
  return true;
}

/**
 * Extract a topic from a brief string.
 * Returns the first heading (line starting with `# `) or the first non-empty line.
 */
export function extractTopicFromBrief(brief: string): string {
  const lines = brief.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Run the Knowledge Manager automatically based on the brief and config.
 *
 * @param brief - The brief content to extract a topic from
 * @param config - Auto-KM configuration
 * @param audit - Audit logger
 * @returns KMReport from the knowledge manager agent
 */
export async function runAutoKM(
  brief: string,
  config: AutoKMConfig,
  audit: { log: (entry: unknown) => Promise<void> },
): Promise<KMReport> {
  const topic = config.topicFromBrief ? extractTopicFromBrief(brief) : undefined;

  const { KnowledgeManagerAgent } = await import('./agents/knowledge-manager.js');

  const agent = new KnowledgeManagerAgent(audit, {
    maxActions: config.maxActionsPerRun,
    focusTopic: topic,
    chain: config.chainEnabled,
    maxCycles: config.chainMaxCycles,
  });

  const report = await agent.run();

  // E4: Synthesize/refresh articles after research phase
  if (topic && report.factsLearned >= 3) {
    try {
      const { listArticles, synthesizeArticle, refreshArticle } = await import('../aurora/knowledge-library.js');

      // Check if article exists for this topic
      const existing = await listArticles({ domain: undefined, limit: 1 });
      const matchingArticle = existing.find(
        (a) => a.title.toLowerCase().includes(topic.toLowerCase()),
      );

      if (matchingArticle) {
        await refreshArticle(matchingArticle.id);
        report.articlesUpdated = (report.articlesUpdated ?? 0) + 1;
      } else {
        await synthesizeArticle(topic);
        report.articlesCreated = (report.articlesCreated ?? 0) + 1;
      }
    } catch (err) {
      // Article synthesis is optional — don't fail the KM run
      console.error('Article synthesis failed:', (err as Error).message);
    }
  }

  return report;
}
