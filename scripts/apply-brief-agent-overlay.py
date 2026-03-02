"""
Apply prompt overlay changes to brief-agent.ts.
Different pattern: model is resolved in run(), not constructor.
"""

path = 'src/core/agents/brief-agent.ts'
with open(path, 'r') as f:
    content = f.read()

# 1. Add import after model-registry import
import_line = "import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';"
registry_import = "import { resolveModelConfig } from '../model-registry.js';"
if import_line not in content:
    content = content.replace(
        registry_import,
        registry_import + '\n' + import_line
    )

# 2. After `const systemPrompt = this.loadSystemPrompt();`, add overlay
old_line = '      const systemPrompt = this.loadSystemPrompt();'
new_block = """      const systemPrompt = this.loadSystemPrompt();
      const overlay = await loadOverlay(this.baseDir, {
        model: this.briefModel,
        role: 'brief-agent',
      });
      const overlayedSystemPrompt = mergePromptWithOverlay(systemPrompt, overlay);"""

if 'overlayedSystemPrompt' not in content:
    content = content.replace(old_line, new_block)

# 3. Replace systemPrompt with overlayedSystemPrompt in the fullSystemPrompt array
# The array starts with `systemPrompt,` — replace just that first occurrence in the array
old_array_line = '        systemPrompt,'
new_array_line = '        overlayedSystemPrompt,'
# Only replace the first occurrence (in the fullSystemPrompt array)
content = content.replace(old_array_line, new_array_line, 1)

with open(path, 'w') as f:
    f.write(content)

print(f'Done: {path}')
