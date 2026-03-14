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
  });

  return agent.run();
}
