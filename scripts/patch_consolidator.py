#!/usr/bin/env python3
"""Patch consolidator.ts:
1. Add streamWithEmptyRetry to import from agent-utils
2. Replace streaming block inside withRetry with streamWithEmptyRetry()
3. Remove inline 0-token check (iteration === 1 && response.usage.output_tokens === 0)
4. Move prefixPrinted before withRetry, add trailing newline after withRetry
"""

import re

path = "src/core/agents/consolidator.ts"

with open(path, "r") as f:
    content = f.read()

# 1. Fix import
old_import = "import { withRetry } from './agent-utils.js';"
new_import = "import { withRetry, streamWithEmptyRetry } from './agent-utils.js';"
assert old_import in content, f"Could not find import line:\n{old_import}"
content = content.replace(old_import, new_import, 1)
print("✓ Import updated")

# 2. Replace the streaming block inside withRetry.
# Old pattern (inside withRetry callback):
#   const stream = this.client.messages.stream({...});
#   let prefixPrinted = false;
#   stream.on('text', (text) => { ... });
#   const msg = await stream.finalMessage();
#   if (prefixPrinted) process.stdout.write('\n');
#   return msg;
# New pattern:
#   return streamWithEmptyRetry({ ... });

old_retry_block = """        const response = await withRetry(async () => {
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
              process.stdout.write('\\n[Consolidator] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\\n');
          return msg;
        });"""

new_retry_block = """        let prefixPrinted = false;
        const response = await withRetry(async () => {
          return streamWithEmptyRetry({
            client: this.client,
            model: this.model,
            maxTokens: this.modelMaxTokens,
            system: buildCachedSystemBlocks(systemPrompt),
            messages,
            tools: this.defineTools(),
            agent: 'consolidator',
            iteration,
            onText: (text) => {
              if (!prefixPrinted) {
                process.stdout.write('\\n[Consolidator] ');
                prefixPrinted = true;
              }
              process.stdout.write(text);
            },
          });
        });
        if (prefixPrinted) process.stdout.write('\\n');"""

assert old_retry_block in content, "Could not find the old streaming block. Checking content around withRetry..."
content = content.replace(old_retry_block, new_retry_block, 1)
print("✓ Streaming block replaced with streamWithEmptyRetry()")

# 3. Remove the inline 0-token check (iteration === 1 guard).
# Pattern to remove:
#         if (iteration === 1 && response.usage.output_tokens === 0) {
#           ...multiple lines...
#         }
# We'll find it by regex
old_zero_token_pattern = re.compile(
    r"\n[ \t]+if \(iteration === 1 && response\.usage\.output_tokens === 0\) \{[^}]*\}",
    re.DOTALL
)

match = old_zero_token_pattern.search(content)
if match:
    content = content[:match.start()] + content[match.end():]
    print("✓ Inline 0-token check removed")
else:
    # Try to find it manually
    print("WARNING: Could not find inline 0-token check with regex — checking manually...")
    if "iteration === 1 && response.usage.output_tokens === 0" in content:
        print("  Found the string but regex didn't match — may need manual review")
    else:
        print("  String not found in content — may already be removed or has different format")

with open(path, "w") as f:
    f.write(content)

print(f"\nDone. Written to {path}")
