import { loadGraph } from '../core/knowledge-graph.js';
import { runHealthCheck, generateHealthReport } from '../core/graph-health.js';

export async function graphHealthCommand(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');

  try {
    const graph = await loadGraph();
    const result = runHealthCheck(graph);

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(generateHealthReport(result));
    }

    // Exit code: 0=GREEN, 1=YELLOW, 2=RED
    const exitCode = result.status === 'GREEN' ? 0 : result.status === 'YELLOW' ? 1 : 2;
    process.exit(exitCode);
  } catch (err) {
    console.error(`Error: Could not load graph. ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
