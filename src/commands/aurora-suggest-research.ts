import chalk from 'chalk';
import { suggestResearch, suggestResearchBatch } from '../aurora/gap-brief.js';
import type { SuggestResearchOptions, ResearchSuggestion } from '../aurora/gap-brief.js';

/**
 * Display a single research suggestion to the console.
 */
function displaySuggestion(suggestion: ResearchSuggestion, index?: number): void {
  const prefix = index !== undefined ? `#${index + 1} ` : '';
  console.log(chalk.bold(`\n${prefix}🔬 Research Suggestion: "${suggestion.primaryGap.question}"`));
  console.log(chalk.bold('───────────────────────────────────────'));

  // Related gaps
  console.log(chalk.bold(`\n## Related gaps (${suggestion.relatedGaps.length})`));
  if (suggestion.relatedGaps.length === 0) {
    console.log(chalk.dim('  No related gaps found.'));
  } else {
    for (const gap of suggestion.relatedGaps) {
      console.log(`  ❓ "${gap.question}" (asked ${gap.frequency}x)`);
    }
  }

  // Known facts
  console.log(chalk.bold(`\n## Known facts (${suggestion.knownFacts.length})`));
  if (suggestion.knownFacts.length === 0) {
    console.log(chalk.dim('  No known facts found.'));
  } else {
    for (const fact of suggestion.knownFacts) {
      const status = fact.freshnessStatus === 'fresh' ? '✅' : fact.freshnessStatus === 'stale' ? '⚠️' : '❓';
      console.log(`  ${status} "${fact.title}" (confidence: ${fact.confidence}, ${fact.freshnessStatus})`);
    }
  }

  // Brief
  console.log(chalk.bold('\n## Research Brief'));
  console.log(`  Background: ${suggestion.brief.background}`);
  console.log(`  Gap: ${suggestion.brief.gap}`);
  console.log(`  Suggestions:`);
  for (const s of suggestion.brief.suggestions) {
    console.log(`    • ${s}`);
  }

  // Metadata footer
  const footer = `── Generated ${suggestion.metadata.generatedAt} | ${suggestion.metadata.totalRelatedGaps} related gaps | ${suggestion.metadata.totalKnownFacts} known facts`;
  console.log(`\n${chalk.dim(footer)}\n`);
}

/**
 * CLI command handler for aurora:suggest-research.
 */
export async function auroraSuggestResearchCommand(
  question: string | undefined,
  cmdOptions: {
    top?: string;
    maxFacts?: string;
    maxRelatedGaps?: string;
    minGapSimilarity?: string;
  },
): Promise<void> {
  try {
    const options: SuggestResearchOptions = {};
    if (cmdOptions.maxFacts) options.maxFacts = parseInt(cmdOptions.maxFacts, 10);
    if (cmdOptions.maxRelatedGaps) options.maxRelatedGaps = parseInt(cmdOptions.maxRelatedGaps, 10);
    if (cmdOptions.minGapSimilarity) options.minGapSimilarity = parseFloat(cmdOptions.minGapSimilarity);

    if (cmdOptions.top) {
      // Batch mode: suggest for top N gaps
      const topN = parseInt(cmdOptions.top, 10);
      const suggestions = await suggestResearchBatch({ ...options, topN });

      if (suggestions.length === 0) {
        console.log(chalk.yellow('\n  No knowledge gaps found. Ask some questions first!\n'));
        return;
      }

      console.log(chalk.bold(`\n📚 Top ${suggestions.length} Research Suggestions`));
      console.log(chalk.bold('═══════════════════════════════════════'));

      for (let i = 0; i < suggestions.length; i++) {
        displaySuggestion(suggestions[i], i);
      }
    } else if (question) {
      // Single question mode
      const suggestion = await suggestResearch(question, options);
      displaySuggestion(suggestion);
    } else {
      console.log(chalk.yellow('\n  Please provide a question or use --top to get batch suggestions.\n'));
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
