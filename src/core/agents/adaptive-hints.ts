import { type RunBelief, type BriefType, type Contradiction, detectContradictions } from '../run-statistics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdaptiveHints {
  /** Text block to inject in Manager's system prompt */
  promptSection: string;
  /** Dimensions with confidence < 0.5 (strictly less than) */
  warnings: Array<{ dimension: string; confidence: number; suggestion: string }>;
  /** Dimensions with confidence > 0.85 (strictly greater than) */
  strengths: string[];
  contradictions: Contradiction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a suggestion string for an agent-dimension warning.
 */
function agentSuggestion(name: string, confidence: number): string {
  switch (name) {
    case 'researcher':
      return `Consider whether research is truly needed. Researcher has low success rate (${confidence}). If you do delegate, provide very specific search queries.`;
    case 'consolidator':
      return `Consolidator has low success rate (${confidence}). Only delegate if knowledge graph truly needs consolidation.`;
    default:
      return `Agent ${name} has below-average confidence (${confidence}). Monitor output carefully.`;
  }
}

/**
 * Build a suggestion string for a brief-dimension warning.
 */
function briefSuggestion(type: string, confidence: number): string {
  switch (type) {
    case 'feature':
      return `Feature briefs have historically been challenging (${confidence}). Break into smaller tasks and verify each step.`;
    case 'test':
      return 'Test briefs sometimes fail. Ensure test framework is correctly detected before delegating.';
    default:
      return `Brief type '${type}' has low historical confidence (${confidence}). Proceed with extra caution.`;
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generate adaptive performance hints from historical run beliefs.
 *
 * Pure function — no side effects or I/O.
 */
export function generateAdaptiveHints(
  beliefs: RunBelief[],
  briefType: BriefType,
): AdaptiveHints {
  // Early return for empty beliefs
  if (beliefs.length === 0) {
    return { promptSection: '', warnings: [], strengths: [], contradictions: [] };
  }

  const warnings: AdaptiveHints['warnings'] = [];
  const strengths: string[] = [];

  for (const belief of beliefs) {
    const { dimension, confidence } = belief;

    // --- Warnings (confidence < 0.5, strictly) ---
    if (confidence < 0.5) {
      if (dimension.startsWith('agent:')) {
        const name = dimension.slice('agent:'.length);
        warnings.push({
          dimension,
          confidence,
          suggestion: agentSuggestion(name, confidence),
        });
      } else if (dimension.startsWith('brief:')) {
        const type = dimension.slice('brief:'.length);
        // Only warn if the brief dimension matches the current briefType
        if (type === briefType) {
          warnings.push({
            dimension,
            confidence,
            suggestion: briefSuggestion(type, confidence),
          });
        }
      }
    }

    // --- Strengths (confidence > 0.85, strictly) ---
    if (confidence > 0.85) {
      strengths.push(`${dimension} (${confidence})`);
    }
  }

  // --- General stats ---
  const totalRuns = beliefs.reduce((sum, b) => sum + b.total_runs, 0);
  const totalSuccesses = beliefs.reduce((sum, b) => sum + b.successes, 0);
  const statsLine = `Based on ${beliefs.length} tracked dimensions across ${totalRuns} observations: ${totalSuccesses} successes, ${totalRuns - totalSuccesses} non-successes.`;

  // --- Build prompt section ---
  let promptSection = '\n## Adaptive Performance Hints\n\n';
  promptSection += statsLine;

  if (warnings.length > 0) {
    promptSection += '\n\n### ⚠️ Warnings\n\n';
    for (const w of warnings) {
      promptSection += `- ${w.suggestion}\n`;
    }
  }

  if (strengths.length > 0) {
    promptSection += '\n\n### ✅ Strengths\n\n';
    for (const s of strengths) {
      promptSection += `- ${s}\n`;
    }
  }

  // Contradiction detection
  const contradictions = detectContradictions(beliefs);

  if (contradictions.length > 0) {
    promptSection += '\n\n### ⚡ Contradictions\n\n';
    for (const c of contradictions.slice(0, 3)) {
      promptSection += `- ${c.description}\n`;
    }
  }

  return { promptSection, warnings, strengths, contradictions };
}
