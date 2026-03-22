import chalk from 'chalk';
import path from 'path';
import { loadGraph, saveGraph, addNode, addEdge, updateNode } from '../core/knowledge-graph.js';
import { clusterIdeas, createMetaIdeas, generateConsolidationReport } from '../core/idea-clusters.js';

const DEFAULT_GRAPH_PATH = path.resolve(process.cwd(), 'memory', 'graph.json');

export async function consolidateIdeasCommand(options: {
  threshold?: string;
  minSize?: string;
  dryRun?: boolean;
}): Promise<void> {
  let graph = await loadGraph(DEFAULT_GRAPH_PATH);

  const threshold = options.threshold ? parseFloat(options.threshold) : 0.3;
  const minSize = options.minSize ? parseInt(options.minSize, 10) : 3;
  const dryRun = options.dryRun ?? false;

  console.log(chalk.bold('\n🔮 Idékonsolidering\n'));
  console.log(chalk.dim(`Threshold: ${threshold}, Min cluster size: ${minSize}, Dry run: ${dryRun}`));

  const result = clusterIdeas(graph, { similarityThreshold: threshold, minClusterSize: minSize });

  if (!dryRun) {
    // Create meta ideas
    const { newNodes, newEdges } = createMetaIdeas(graph, result.clusters);
    for (const node of newNodes) {
      graph = addNode(graph, node);
    }
    for (const edge of newEdges) {
      graph = addEdge(graph, edge);
    }

    // Archive candidates
    for (const id of result.archived) {
      const node = graph.nodes.find(n => n.id === id);
      if (node) {
        graph = updateNode(graph, id, {
          confidence: 0.05,
          properties: {
            ...node.properties,
            archived: true,
            status: 'rejected',
          },
        });
      }
    }

    await saveGraph(graph, DEFAULT_GRAPH_PATH);
    console.log(chalk.green('\n✅ Konsolidering genomförd — graf sparad.'));
  } else {
    console.log(chalk.yellow('\n⚠️  Dry run — ingen mutation av grafen.'));
  }

  // Generate and output report
  const report = generateConsolidationReport(result, result.clusters, graph);
  console.log('\n' + report);
}
