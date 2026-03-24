#!/usr/bin/env python3
"""Patch observer.ts to add checkZeroTokenAgents method and call it in analyzeRun()."""

import re

filepath = 'src/core/agents/observer.ts'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add the call in analyzeRun() after checkEarlyStopping()
old_call = '      this.checkEarlyStopping();\n    } catch (err) {'
new_call = '      this.checkEarlyStopping();\n      this.checkZeroTokenAgents();  // NEW\n    } catch (err) {'

assert old_call in content, f"Could not find call site:\n{old_call}"
content = content.replace(old_call, new_call, 1)

# 2. Insert new method after checkEarlyStopping() closes
new_method = '''
  private checkZeroTokenAgents(): void {
    for (const [agent, usage] of this.tokenUsage) {
      if (usage.outputTokens === 0 && this.agentDelegations.has(agent)) {
        this.observations.push({
          timestamp: new Date().toISOString(),
          agent,
          type: 'absence',
          severity: 'WARNING',
          promptClaim: 'Agent should produce output tokens',
          actualBehavior: `${agent} produced 0 output tokens (${usage.inputTokens} input tokens consumed)`,
          evidence: `Model: ${usage.model}, total cost: $${usage.cost.toFixed(2)}`,
        });
      }
    }
  }

'''

# Find the end of checkEarlyStopping — the closing brace followed by the Tool-alignment comment
insert_marker = '  }\n\n  // ── Tool-alignment results (for report) ─────────────────────'
new_content_at_marker = '  }\n' + new_method + '  // ── Tool-alignment results (for report) ─────────────────────'

assert insert_marker in content, f"Could not find insertion marker"
content = content.replace(insert_marker, new_content_at_marker, 1)

with open(filepath, 'w') as f:
    f.write(content)

print("Patch applied successfully.")
