"""Patch code-anchor.ts with two changes inside runAgentLoop()."""
import re

path = 'src/core/agents/code-anchor.ts'
with open(path, 'r') as f:
    content = f.read()

# Change 1a: Replace `let lastTextResponse = '';` with `const allTextResponses: string[] = [];`
content = content.replace(
    "    let lastTextResponse = '';",
    "    const allTextResponses: string[] = [];",
    1
)

# Change 1b: Replace assignment inside loop
content = content.replace(
    "        lastTextResponse = textBlocks.map((b) => b.text).join('\\n');",
    "        allTextResponses.push(textBlocks.map((b) => b.text).join('\\n'));",
    1
)

# Change 1c: Replace return statement
content = content.replace(
    "    return lastTextResponse;",
    "    return allTextResponses.join('\\n\\n---\\n\\n');",
    1
)

# Change 2: Replace sequential for...of loop + preceding declaration with Promise.all
old_tool_block = """      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        logger.info('Executing tool', { tool: block.name });
        try {
          const result = await this.executeTool(
            block.name,
            block.input as Record<string, unknown>,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${error}`,
            is_error: true,
          });
        }
      }"""

new_tool_block = """      // Execute tools
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          logger.info('Executing tool', { tool: block.name });
          try {
            const result = await this.executeTool(block.name, block.input as Record<string, unknown>);
            return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
          } catch (error) {
            return { type: 'tool_result' as const, tool_use_id: block.id, content: `Error: ${error}`, is_error: true };
          }
        })
      );"""

if old_tool_block in content:
    content = content.replace(old_tool_block, new_tool_block, 1)
    print("SUCCESS: Replaced tool execution block")
else:
    print("ERROR: Could not find the tool execution block to replace")
    # Print context around the area to debug
    idx = content.find('const toolResults')
    if idx >= 0:
        print(f"Found toolResults at index {idx}:")
        print(repr(content[idx-50:idx+200]))

# Verify all expected strings are present
checks = [
    'allTextResponses',
    "allTextResponses.push(textBlocks",
    "allTextResponses.join('\\n\\n---\\n\\n')",
    'Promise.all',
]
for check in checks:
    if check in content:
        print(f"VERIFIED: '{check}' found")
    else:
        print(f"MISSING: '{check}' NOT found")

with open(path, 'w') as f:
    f.write(content)

print("Done.")
