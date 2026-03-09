import chalk from 'chalk';
import { briefing } from '../aurora/briefing.js';
import type { BriefingOptions } from '../aurora/briefing.js';

export async function auroraBriefingCommand(
  topic: string,
  cmdOptions: {
    maxFacts?: string;
    maxTimeline?: string;
    maxGaps?: string;
    maxCrossRefs?: string;
  },
): Promise<void> {
  console.log(chalk.bold(`\n📋 Briefing: "${topic}"`));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const options: BriefingOptions = {};
    if (cmdOptions.maxFacts) options.maxFacts = parseInt(cmdOptions.maxFacts, 10);
    if (cmdOptions.maxTimeline) options.maxTimeline = parseInt(cmdOptions.maxTimeline, 10);
    if (cmdOptions.maxGaps) options.maxGaps = parseInt(cmdOptions.maxGaps, 10);
    if (cmdOptions.maxCrossRefs) options.maxCrossRefs = parseInt(cmdOptions.maxCrossRefs, 10);

    const result = await briefing(topic, options);

    // Summary
    console.log(chalk.bold('\n## Sammanfattning'));
    console.log(`  ${result.summary}\n`);

    // Facts
    console.log(chalk.bold(`## Fakta (${result.facts.length})`));
    if (result.facts.length === 0) {
      console.log(chalk.dim('  Inga fakta hittades.'));
    } else {
      for (const fact of result.facts) {
        const sim = `[${fact.similarity.toFixed(2)}]`;
        console.log(`  ${chalk.cyan(sim)} "${fact.title}" (${fact.type}, confidence: ${fact.confidence})`);
        // Freshness warning
        if (fact.freshnessStatus === 'unverified') {
          console.log(chalk.gray(`    [!] Overifierad källa`));
        } else if (fact.freshnessStatus === 'stale') {
          console.log(chalk.red(`    [!] Föråldrad källa (freshness: ${fact.freshnessScore.toFixed(2)})`));
        } else if (fact.freshnessStatus === 'aging') {
          console.log(chalk.yellow(`    [i] Åldrande källa (freshness: ${fact.freshnessScore.toFixed(2)})`));
        }
      }
    }
    console.log('');

    // Timeline
    console.log(chalk.bold(`## Tidslinje (${result.timeline.length})`));
    if (result.timeline.length === 0) {
      console.log(chalk.dim('  Inga tidslinjeträffar.'));
    } else {
      for (const entry of result.timeline) {
        const date = entry.createdAt ? entry.createdAt.split('T')[0] : '???';
        console.log(`  ${date}  ${entry.type}  "${entry.title}"`);
      }
    }
    console.log('');

    // Knowledge gaps
    console.log(chalk.bold(`## Kunskapsluckor (${result.gaps.length})`));
    if (result.gaps.length === 0) {
      console.log(chalk.dim('  Inga kunskapsluckor.'));
    } else {
      for (const gap of result.gaps) {
        console.log(`  ❓ "${gap.question}" (asked ${gap.frequency}x)`);
      }
    }
    console.log('');

    // Cross-refs
    console.log(chalk.bold('## Kopplingar (Neuron ↔ Aurora)'));
    if (result.crossRefs.neuron.length === 0 && result.crossRefs.aurora.length === 0) {
      console.log(chalk.dim('  Inga kopplingar.'));
    } else {
      for (const ref of result.crossRefs.neuron) {
        console.log(`  Neuron: [${ref.similarity.toFixed(2)}] ${ref.type} "${ref.title}"`);
      }
      for (const ref of result.crossRefs.aurora) {
        console.log(`  Aurora: [${ref.similarity.toFixed(2)}] ${ref.type} "${ref.title}"`);
      }
    }

    // Integrity issues
    if (result.integrityIssues && result.integrityIssues.length > 0) {
      console.log(chalk.bold(`\n⚠️ Integritetsproblem (${result.integrityIssues.length}):`));
      for (const issue of result.integrityIssues) {
        console.log(
          `  → Neuron "${issue.neuronTitle}" (confidence ${issue.neuronConfidence.toFixed(2)}) kopplad till "${issue.auroraTitle}"`,
        );
      }
    }

    // Footer
    const footer = `── Rapport genererad ${result.metadata.generatedAt} | ${result.metadata.totalSources} källor | ${result.metadata.totalGaps} luckor | ${result.metadata.totalCrossRefs} kopplingar`;
    console.log(`\n${chalk.dim(footer)}\n`);
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
