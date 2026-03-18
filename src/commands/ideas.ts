import chalk from 'chalk';
import path from 'path';
import { loadGraph, rankIdeas, linkRelatedIdeas } from '../core/knowledge-graph.js';

const DEFAULT_GRAPH_PATH = path.resolve(process.cwd(), 'memory', 'graph.json');

export async function ideasCommand(options: {
  group?: string;
  status?: string;
  limit?: number;
  link?: boolean;
  backfill?: boolean;
}): Promise<void> {
  if (options.backfill) {
    console.log(chalk.dim('Starting idea backfill...'));
    const { backfillIdeas, saveGraph } = await import('../core/knowledge-graph.js');

    let graph = await loadGraph(DEFAULT_GRAPH_PATH);
    const runsDir = path.resolve(process.cwd(), 'runs');

    const beforeCount = graph.nodes.filter((n) => n.type === 'idea').length;
    graph = await backfillIdeas(graph, runsDir);
    const afterCount = graph.nodes.filter((n) => n.type === 'idea').length;

    await saveGraph(graph, DEFAULT_GRAPH_PATH);

    console.log(chalk.green('\n\u2705 Backfill complete.'));
    console.log(chalk.dim(`  Before: ${beforeCount} idea nodes`));
    console.log(chalk.dim(`  After: ${afterCount} idea nodes`));
    console.log(
      chalk.dim(
        `  Edges: ${graph.edges.filter((e) => e.type === 'related_to').length} related_to edges`,
      ),
    );
    return;
  }

  let graph = await loadGraph(DEFAULT_GRAPH_PATH);

  if (options.link) {
    console.log(chalk.dim('Linking related ideas...'));
    graph = linkRelatedIdeas(graph);
  }

  const statusFilter = options.status
    ? [options.status]
    : ['proposed', 'accepted'];

  const ranked = rankIdeas(graph, {
    status: statusFilter,
    group: options.group,
    limit: options.limit ?? 10,
  });

  if (ranked.length === 0) {
    console.log(chalk.yellow('No ideas found matching filters.'));
    return;
  }

  // Header
  console.log(chalk.bold('\n\ud83d\udccb Ranked Ideas\n'));
  console.log(
    chalk.dim(
      '#'.padEnd(4) +
      'Title'.padEnd(50) +
      'I'.padEnd(4) +
      'E'.padEnd(4) +
      'R'.padEnd(4) +
      'Pri'.padEnd(7) +
      'Status'.padEnd(14) +
      'Edges'
    )
  );
  console.log(chalk.dim('\u2500'.repeat(90)));

  ranked.forEach((node, i) => {
    const impact = (node.properties.impact as number) || 0;
    const effort = (node.properties.effort as number) || 0;
    const risk = (node.properties.risk as number) || 3;
    const priority = (node.properties.priority as number) || 0;
    const status = (node.properties.status as string) || 'proposed';
    const edgeCount = graph.edges.filter(
      e => e.from === node.id || e.to === node.id
    ).length;

    const title = node.title.length > 47
      ? node.title.slice(0, 44) + '...'
      : node.title;

    const priorityColor = priority >= 3
      ? chalk.green
      : priority >= 1.5
        ? chalk.yellow
        : chalk.red;

    console.log(
      chalk.white(String(i + 1).padEnd(4)) +
      chalk.cyan(title.padEnd(50)) +
      String(impact).padEnd(4) +
      String(effort).padEnd(4) +
      String(risk).padEnd(4) +
      priorityColor(priority.toFixed(2).padEnd(7)) +
      chalk.dim(status.padEnd(14)) +
      chalk.dim(String(edgeCount))
    );
  });

  console.log(chalk.dim('\n' + '\u2500'.repeat(90)));
  console.log(chalk.dim(`Showing ${ranked.length} ideas. Use --limit N for more.`));
}
