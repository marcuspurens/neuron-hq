"""
Apply prompt overlay changes to all 7 remaining agent files.
Each agent needs:
1. Import added after model-registry import
2. Overlay loading after loadPrompt() call
3. Return statement updated to use overlayedPrompt
"""
import re

# Configuration: (filename, role, variable_name, has_baseDir)
agents = [
    ('src/core/agents/researcher.ts', 'researcher', 'researcherPrompt', True),
    ('src/core/agents/tester.ts', 'tester', 'testerPrompt', False),
    ('src/core/agents/merger.ts', 'merger', 'mergerPrompt', False),
    ('src/core/agents/historian.ts', 'historian', 'historianPrompt', False),
    ('src/core/agents/librarian.ts', 'librarian', 'librarianPrompt', False),
    ('src/core/agents/consolidator.ts', 'consolidator', 'consolidatorPrompt', False),
]

IMPORT_LINE = "import { loadOverlay, mergePromptWithOverlay } from '../prompt-overlays.js';"

for filepath, role, varname, has_base_dir in agents:
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Add import after the model-registry import line
    registry_import = "import { resolveModelConfig } from '../model-registry.js';"
    if IMPORT_LINE not in content:
        content = content.replace(
            registry_import,
            registry_import + '\n' + IMPORT_LINE
        )

    # 2. For agents without baseDir field, add it
    if not has_base_dir:
        # Check if baseDir is already stored
        if 'private baseDir: string;' not in content and 'private baseDir:' not in content:
            # Add baseDir field - find the class field declarations
            # Look for the promptPath field and add baseDir after it
            content = content.replace(
                '  private promptPath: string;',
                '  private promptPath: string;\n  private baseDir: string;'
            )
        # Store baseDir in constructor - find where promptPath is set
        if 'this.baseDir = baseDir;' not in content:
            # Find the line that sets promptPath and add baseDir before it
            content = content.replace(
                "    this.promptPath = path.join(baseDir, 'prompts',",
                "    this.baseDir = baseDir;\n    this.promptPath = path.join(baseDir, 'prompts',",
            )

    # 3. Add overlay loading after the loadPrompt() call in buildSystemPrompt
    load_line = f'    const {varname} = await this.loadPrompt();'
    overlay_block = f"""{load_line}
    const overlay = await loadOverlay(this.baseDir, {{
      model: this.model,
      role: '{role}',
    }});
    const overlayedPrompt = mergePromptWithOverlay({varname}, overlay);"""

    if 'loadOverlay(this.baseDir' not in content:
        content = content.replace(load_line, overlay_block)

    # 4. Replace the return statement to use overlayedPrompt
    old_return = f'${{{varname}}}\\n\\n${{contextInfo}}'
    new_return = f'${{overlayedPrompt}}\\n\\n${{contextInfo}}'
    content = content.replace(old_return, new_return)

    with open(filepath, 'w') as f:
        f.write(content)

    print(f'Done: {filepath}')

print('\nAll standard agents updated.')
