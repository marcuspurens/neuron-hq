#!/usr/bin/env python3
"""Patch historian.ts:
1. Add streamWithEmptyRetry to import
2. Replace inline streaming block in withRetry with streamWithEmptyRetry
3. Remove 0-token iteration===1 guard
"""

import re

filepath = 'src/core/agents/historian.ts'

with open(filepath, 'r') as f:
    content = f.read()

# --- 1. Add streamWithEmptyRetry to import ---
old_import = "import { searchMemoryFiles, withRetry } from './agent-utils.js';"
new_import = "import { searchMemoryFiles, streamWithEmptyRetry, withRetry } from './agent-utils.js';"
assert old_import in content, f"Import not found: {old_import}"
content = content.replace(old_import, new_import, 1)
print("✓ Updated import")

# --- 2. Replace the streaming block inside withRetry ---
old_block = """        const response = await withRetry(async () => {
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
              process.stdout.write('\\n[Historian] ');
              prefixPrinted = true;
            }
            process.stdout.write(text);
          });

          const msg = await stream.finalMessage();
          if (prefixPrinted) process.stdout.write('\\n');
          return msg;
        });"""

new_block = """        let prefixPrinted = false;
        const response = await withRetry(async () => {
          return streamWithEmptyRetry({
            client: this.client,
            model: this.model,
            maxTokens: this.modelMaxTokens,
            system: buildCachedSystemBlocks(systemPrompt),
            messages,
            tools: this.defineTools(),
            agent: 'historian',
            iteration,
            onText: (text) => {
              if (!prefixPrinted) {
                process.stdout.write('\\n[Historian] ');
                prefixPrinted = true;
              }
              process.stdout.write(text);
            },
          });
        });
        if (prefixPrinted) process.stdout.write('\\n');"""

assert old_block in content, "Old streaming block not found!"
content = content.replace(old_block, new_block, 1)
print("✓ Replaced streaming block")

# --- 3. Remove the 0-token iteration===1 guard ---
old_guard = """
        // Empty response on first iteration — likely API transient issue, retry once
        if (iteration === 1 && response.usage.output_tokens === 0) {
          logger.info('Historian: empty response on first iteration, retrying after 5s...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

"""
new_guard = "\n"

assert old_guard in content, "0-token guard not found!"
content = content.replace(old_guard, new_guard, 1)
print("✓ Removed 0-token guard")

with open(filepath, 'w') as f:
    f.write(content)

print("✓ All patches applied successfully")
