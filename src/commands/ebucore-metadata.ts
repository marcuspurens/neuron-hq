import chalk from 'chalk';
import { loadAuroraGraph, findAuroraNodes } from '../aurora/aurora-graph.js';
import {
  getEbucoreMetadata,
  validateEbucoreCompleteness,
  getAppliedStandards,
  metadataCoverageReport,
} from '../aurora/ebucore-metadata.js';

/**
 * Display EBUCore metadata for a specific Aurora node.
 */
export async function libraryMetadataCommand(nodeId: string): Promise<void> {
  console.log(chalk.bold('\n📋 EBUCore Metadata'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const graph = await loadAuroraGraph();
    const node = graph.nodes.find((n) => n.id === nodeId);

    if (!node) {
      console.log(chalk.red(`\n  ❌ Node not found: ${nodeId}\n`));
      return;
    }

    const metadata = getEbucoreMetadata(node);
    const validation = validateEbucoreCompleteness(node);
    const standards = getAppliedStandards(node.type);

    console.log(`\n  Node: ${chalk.cyan(node.title)} (${node.type})`);
    console.log(`  ID:   ${chalk.dim(node.id)}`);

    if (standards.length > 0) {
      console.log(`  Standards: ${standards.join(', ')}`);
    }

    const metaEntries = Object.entries(metadata);
    if (metaEntries.length > 0) {
      console.log(chalk.bold('\n  Metadata:'));
      for (const [key, value] of metaEntries) {
        console.log(`    ${chalk.green(key)}: ${value}`);
      }
    } else {
      console.log(chalk.dim('\n  No EBUCore metadata applicable for this node type.'));
    }

    if (validation.complete) {
      console.log(chalk.green('\n  ✅ All EBUCore fields complete'));
    } else {
      console.log(chalk.yellow(`\n  ⚠️  Missing fields: ${validation.missing.join(', ')}`));
    }

    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}

/**
 * Display a metadata coverage report for all Aurora nodes.
 */
export async function libraryMetadataCoverageCommand(): Promise<void> {
  console.log(chalk.bold('\n📊 Metadata Coverage Report'));
  console.log(chalk.bold('═══════════════════════════════════════'));

  try {
    const graph = await loadAuroraGraph();
    const nodes = findAuroraNodes(graph, {});
    const report = metadataCoverageReport(nodes);

    console.log(`\n  Total nodes:    ${report.totalNodes}`);
    console.log(`  Covered nodes:  ${report.coveredNodes}`);
    console.log(`  Coverage:       ${report.coveragePercent}%`);

    const typeEntries = Object.entries(report.byType);
    if (typeEntries.length > 0) {
      console.log(chalk.bold('\n  By Type:'));
      for (const [type, stats] of typeEntries) {
        console.log(`    ${chalk.cyan(type)}: ${stats.complete} complete, ${stats.partial} partial, ${stats.none} none (${stats.total} total)`);
      }
    }

    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
