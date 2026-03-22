import { type RunContext } from '../run.js';
import { withRetry } from './agent-utils.js';
import fs from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient, buildCachedSystemBlocks } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';
import { prependPreamble } from '../preamble.js';
import { graphToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
import { loadGraph, saveGraph } from '../knowledge-graph.js';
import { mergeNodes, findDuplicateCandidates, findStaleNodes, findMissingEdges } from '../graph-merge.js';
import { isEmbeddingAvailable } from '../embeddings.js';
import { findSimilarNodes } from '../semantic-search.js';
import { createLogger } from '../logger.js';
const logger = createLogger('agent:consolidator');

/**
 * Consolidator Agent — analyzes the knowledge graph to find and merge
 * duplicate nodes, identify missing edges, find stale nodes, and
 * write a consolidation report summarizing all changes.
 */
export class ConsolidatorAgent {
  private promptPath: string;
  private baseDir: string;
  private client: Anthropic;
  private model: string;
  private modelMaxTokens: number;
  private maxIterations: number;
  private memoryDir: string;

  constructor(
    private ctx: RunContext,
    baseDir: string
  ) {
    this.baseDir = baseDir;
    this.promptPath = path.join(baseDir, 'prompts', 'consolidator.md');
    this.memoryDir = path.join(baseDir, 'memory');

    const config = resolveModelConfig('consolidator', this.ctx.agentModelMap, this.ctx.defaultModelOverride);
    const { client, model, maxTokens } = createAgentClient(config);
    this.client = client;
    this.model = model;
    this.modelMaxTokens = maxTokens;

    const limits = ctx.policy.getLimits();
    this.maxIterations = limits.max_iterations_consolidator ?? limits.max_iterations_per_run;
  }

  async loadPrompt(): Promise<string> {
    return await fs.readFile(this.promptPath, 'utf-8');
  }

  /**
   * Run the consolidator — analyzes and consolidates the knowledge graph.
   */
  async run(): Promise<void> {
    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'run',
      allowed: true,
      note: 'Consolidator agent started',
    });

    try {
      const systemPrompt = await this.buildSystemPrompt();
      await this.runAgentLoop(systemPrompt);
      logger.info('Consolidator agent completed.');
    } catch (error) {
      await this.ctx.audit.log({
        ts: new Date().toISOString(),
        role: 'consolidator',
        tool: 'run',
        allowed: false,
        note: `Consolidator agent failed: ${error}`,
      });
      throw error;
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const consolidatorPrompt = await this.loadPrompt();
    const overlay = await loadOverlay(this.baseDir, {
      model: this.model,
      role: 'consolidator',
    });
    const overlayedPrompt = mergePromptWithOverlay(consolidatorPrompt, overlay);

    const today = new Date().toISOString().slice(0, 10);
    const contextInfo = `
# Run Context
- **Run ID**: ${this.ctx.runid}
- **Date**: ${today}
- **Memory directory**: ${this.memoryDir}

# Your Task
Analyze the knowledge graph and perform consolidation:
1. Find and merge duplicate nodes
2. Identify and add missing edges
3. Find knowledge gaps
4. Archive stale nodes
5. Write a consolidation_report.md summarizing all changes
`;

    return prependPreamble(this.baseDir, `${overlayedPrompt}\n\n${contextInfo}`);
  }

  private async runAgentLoop(systemPrompt: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          'Analyze the knowledge graph and consolidate it. Start by finding duplicate candidates, ' +
          'then check for missing edges, then find stale nodes. Write a consolidation report at the end.',
      },
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (new Date() > this.ctx.endTime) {
        logger.info('Time limit reached. Stopping consolidator loop.');
        break;
      }

      logger.info('Consolidator iteration', { iteration: String(iteration), maxIterations: String(this.maxIterations) });

      try {
        const response = await withRetry(async () => {
          const stream = this.client.messages.stream({
            model: this.model,
            max_tokens: this.modelMaxTokens,
            system: buildCachedSystemBlocks(systemPrompt),
            messages,
            tools: this.defineTools(),
          });

          let prefixPrinted = false;
          stream.on('text', (text) => {
            if (!prefixPrinted) {
              process.stdout.write('\n[Consolidator] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\n');
          return msg;
        });

        this.ctx.usage.recordTokens(
          'consolidator',
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_creation_input_tokens ?? 0,
          response.usage.cache_read_input_tokens ?? 0,
        );

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          const hasToolUse = response.content.some(
            (b: Anthropic.ContentBlock) => b.type === 'tool_use'
          );
          if (!hasToolUse) {
            logger.info('Consolidator finished (no more tool calls).');
            break;
          }
        }

        const toolResults = await this.executeTools(response.content);
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          logger.info('Consolidator finished (no tool calls).');
          break;
        }
      } catch (error) {
        logger.error('Error in consolidator loop', { error: String(error) });
        throw error;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.info('Consolidator: max iterations reached.');
    }
    this.ctx.usage.recordIterations('consolidator', iteration, this.maxIterations);
  }

  private defineTools(): Anthropic.Tool[] {
    return [
      ...graphToolDefinitions(),
      {
        name: 'graph_merge_nodes',
        description:
          'Merge two duplicate nodes. The removeNode is merged into keepNode. ' +
          'All edges are redirected. Returns confirmation.',
        input_schema: {
          type: 'object' as const,
          properties: {
            keepNodeId: { type: 'string', description: 'ID of the node to keep' },
            removeNodeId: { type: 'string', description: 'ID of the node to merge into keepNode' },
            mergedTitle: { type: 'string', description: 'New title for the merged node' },
            reason: { type: 'string', description: 'Why these are duplicates' },
          },
          required: ['keepNodeId', 'removeNodeId', 'mergedTitle', 'reason'],
        },
      },
      {
        name: 'find_duplicate_candidates',
        description:
          'Find pairs of nodes with similar titles that may be duplicates. ' +
          'Only compares same-type nodes.',
        input_schema: {
          type: 'object' as const,
          properties: {
            similarity_threshold: {
              type: 'number',
              description: 'Minimum similarity (0-1, default 0.6)',
            },
          },
        },
      },
      {
        name: 'find_stale_nodes',
        description:
          'Find nodes with low confidence that have not been updated recently. ' +
          'Candidates for archival.',
        input_schema: {
          type: 'object' as const,
          properties: {
            max_confidence: {
              type: 'number',
              description: 'Maximum confidence threshold (default 0.15)',
            },
            stale_days: {
              type: 'number',
              description: 'Minimum days since last update (default 30)',
            },
          },
        },
      },
      {
        name: 'find_missing_edges',
        description:
          'Find pairs of nodes that share multiple common neighbors but have no direct edge. ' +
          'Suggests missing connections.',
        input_schema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'write_consolidation_report',
        description: 'Write the consolidation report to the run directory.',
        input_schema: {
          type: 'object' as const,
          properties: {
            content: {
              type: 'string',
              description: 'The full markdown report content',
            },
          },
          required: ['content'],
        },
      },
    ];
  }

  private async executeTools(
    content: Anthropic.ContentBlock[]
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        logger.info('Consolidator executing tool', { tool: block.name });
        this.ctx.usage.recordToolCall(block.name);

        try {
          let result: string;

          switch (block.name) {
            case 'graph_merge_nodes':
              result = await this.executeGraphMergeNodes(
                block.input as { keepNodeId: string; removeNodeId: string; mergedTitle: string; reason: string }
              );
              break;
            case 'find_duplicate_candidates':
              result = await this.executeFindDuplicateCandidates(
                block.input as { similarity_threshold?: number }
              );
              break;
            case 'find_stale_nodes':
              result = await this.executeFindStaleNodes(
                block.input as { max_confidence?: number; stale_days?: number }
              );
              break;
            case 'find_missing_edges':
              result = await this.executeFindMissingEdges();
              break;
            case 'write_consolidation_report':
              result = await this.executeWriteConsolidationReport(
                block.input as { content: string }
              );
              break;
            case 'graph_query':
            case 'graph_traverse':
            case 'graph_assert':
            case 'graph_update': {
              const graphCtx: GraphToolContext = {
                graphPath: path.join(this.memoryDir, 'graph.json'),
                runId: this.ctx.runid,
                agent: 'consolidator',
                model: this.model,
                audit: this.ctx.audit,
              };
              result = await executeGraphTool(block.name, block.input as Record<string, unknown>, graphCtx);
              break;
            }
            default:
              result = `Error: Unknown tool ${block.name}`;
          }

          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        } catch (error) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${error}`,
            is_error: true,
          });
        }
      }
    }

    return results;
  }

  /**
   * Merge two duplicate nodes in the knowledge graph.
   */
  private async executeGraphMergeNodes(input: {
    keepNodeId: string;
    removeNodeId: string;
    mergedTitle: string;
    reason: string;
  }): Promise<string> {
    const graphPath = path.join(this.memoryDir, 'graph.json');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'graph_merge_nodes',
      allowed: true,
      note: `Merging ${input.removeNodeId} into ${input.keepNodeId}: ${input.reason}`,
    });

    const graph = await loadGraph(graphPath);
    const merged = await mergeNodes(graph, {
      keepNodeId: input.keepNodeId,
      removeNodeId: input.removeNodeId,
      mergedTitle: input.mergedTitle,
      reason: input.reason,
    });
    await saveGraph(merged, graphPath);

    return `Merged node ${input.removeNodeId} into ${input.keepNodeId} (title: "${input.mergedTitle}")`;
  }

  /**
   * Find pairs of nodes with similar titles that may be duplicates.
   * Enhanced: also runs semantic search if embeddings are available.
   */
  private async executeFindDuplicateCandidates(
    input: { similarity_threshold?: number }
  ): Promise<string> {
    const graphPath = path.join(this.memoryDir, 'graph.json');
    const graph = await loadGraph(graphPath);
    const threshold = input.similarity_threshold ?? 0.6;

    // 1. Keyword/Jaccard-based candidates (existing logic)
    const jaccardCandidates = findDuplicateCandidates(graph, threshold);
    const jaccardPairs = new Set(
      jaccardCandidates.map(c => [c.nodeA, c.nodeB].sort().join('|'))
    );

    // 2. Semantic candidates (if embeddings available)
    let semanticOnlyCount = 0;
    let bothCount = 0;
    const allCandidates = [...jaccardCandidates];

    const embeddingAvailable = await isEmbeddingAvailable();
    if (embeddingAvailable) {
      const semanticPairsFound = new Set<string>();

      for (const node of graph.nodes) {
        try {
          const similar = await findSimilarNodes(node.id, {
            limit: 5,
            minSimilarity: threshold,
          });

          for (const match of similar) {
            // Only consider same-type pairs (like Jaccard does)
            if (match.type !== node.type) continue;

            const pairKey = [node.id, match.id].sort().join('|');
            if (semanticPairsFound.has(pairKey)) continue;
            semanticPairsFound.add(pairKey);

            if (jaccardPairs.has(pairKey)) {
              bothCount++;
            } else {
              semanticOnlyCount++;
              allCandidates.push({
                nodeA: node.id,
                nodeB: match.id,
                similarity: match.similarity,
              });
            }
          }
        } catch {  /* intentional: knowledge.md may not exist */
          // Skip nodes that fail semantic search
        }
      }
    }

    const report = {
      candidates: allCandidates.sort((a, b) => b.similarity - a.similarity),
      stats: {
        keyword_only: jaccardCandidates.length - bothCount,
        semantic_only: semanticOnlyCount,
        both: bothCount,
        total: allCandidates.length,
        embedding_available: embeddingAvailable,
      },
    };

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'find_duplicate_candidates',
      allowed: true,
      note: `Found ${report.stats.total} candidates (keyword: ${report.stats.keyword_only}, semantic: ${report.stats.semantic_only}, both: ${report.stats.both})`,
    });

    return JSON.stringify(report, null, 2);
  }

  /**
   * Find stale nodes with low confidence that haven't been updated recently.
   */
  private async executeFindStaleNodes(input: {
    max_confidence?: number;
    stale_days?: number;
  }): Promise<string> {
    const graphPath = path.join(this.memoryDir, 'graph.json');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'find_stale_nodes',
      allowed: true,
      note: `Finding stale nodes (maxConfidence: ${input.max_confidence ?? 0.15}, staleDays: ${input.stale_days ?? 30})`,
    });

    const graph = await loadGraph(graphPath);
    const stale = findStaleNodes(graph, {
      maxConfidence: input.max_confidence,
      staleDays: input.stale_days,
    });

    return JSON.stringify(stale, null, 2);
  }

  /**
   * Find pairs of nodes that share common neighbors but have no direct edge.
   */
  private async executeFindMissingEdges(): Promise<string> {
    const graphPath = path.join(this.memoryDir, 'graph.json');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'find_missing_edges',
      allowed: true,
      note: 'Finding missing edges',
    });

    const graph = await loadGraph(graphPath);
    const missing = findMissingEdges(graph);

    return JSON.stringify(missing, null, 2);
  }

  /**
   * Write the consolidation report to the run directory.
   */
  private async executeWriteConsolidationReport(input: { content: string }): Promise<string> {
    const reportPath = path.join(this.ctx.runDir, 'consolidation_report.md');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'consolidator',
      tool: 'write_consolidation_report',
      allowed: true,
      files_touched: [reportPath],
      note: 'Writing consolidation report',
    });

    await fs.writeFile(reportPath, input.content, 'utf-8');

    return `Consolidation report written to ${reportPath}`;
  }
}
