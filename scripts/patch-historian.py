"""Patch historian.ts to separate graph_assert and add graph_semantic_search."""
import re

with open('src/core/agents/historian.ts', 'r') as f:
    content = f.read()

old_block = """            case 'graph_query':
            case 'graph_traverse':
            case 'graph_assert':
            case 'graph_update': {
              const graphCtx: GraphToolContext = {
                graphPath: path.join(this.memoryDir, 'graph.json'),
                runId: this.ctx.runid,
                agent: 'historian',
                model: this.model,
                audit: this.ctx.audit,
              };
              result = await executeGraphTool(block.name, block.input as Record<string, unknown>, graphCtx);
              break;
            }"""

new_block = """            case 'graph_query':
            case 'graph_traverse':
            case 'graph_update':
            case 'graph_semantic_search': {
              const graphCtx: GraphToolContext = {
                graphPath: path.join(this.memoryDir, 'graph.json'),
                runId: this.ctx.runid,
                agent: 'historian',
                model: this.model,
                audit: this.ctx.audit,
              };
              result = await executeGraphTool(block.name, block.input as Record<string, unknown>, graphCtx);
              break;
            }
            case 'graph_assert': {
              const graphCtx: GraphToolContext = {
                graphPath: path.join(this.memoryDir, 'graph.json'),
                runId: this.ctx.runid,
                agent: 'historian',
                model: this.model,
                audit: this.ctx.audit,
              };
              // Dedup check before asserting
              const dedupWarning = await this.checkSemanticDuplicates(block.input as Record<string, unknown>);
              const assertResult = await executeGraphTool('graph_assert', block.input as Record<string, unknown>, graphCtx);
              result = dedupWarning ? `${dedupWarning}\\n\\n${assertResult}` : assertResult;
              break;
            }"""

if old_block not in content:
    print("ERROR: old block not found!")
    exit(1)

content = content.replace(old_block, new_block)

with open('src/core/agents/historian.ts', 'w') as f:
    f.write(content)

print("Patched case statement successfully")
