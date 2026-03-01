"""Patch manager.ts to add consolidation auto-trigger support."""
import re

filepath = 'src/core/agents/manager.ts'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add private consolidationAutoTrigger field after librarianAutoTrigger
old_field = '  private librarianAutoTrigger: boolean;'
new_field = '  private librarianAutoTrigger: boolean;\n  private consolidationAutoTrigger: boolean;'
assert old_field in content, 'Could not find librarianAutoTrigger field'
content = content.replace(old_field, new_field, 1)

# 2. Update constructor signature
old_ctor = 'constructor(private ctx: RunContext, baseDir: string, librarianAutoTrigger = false) {'
new_ctor = 'constructor(private ctx: RunContext, baseDir: string, librarianAutoTrigger = false, consolidationAutoTrigger = false) {'
assert old_ctor in content, 'Could not find constructor signature'
content = content.replace(old_ctor, new_ctor, 1)

# 3. Add this.consolidationAutoTrigger assignment after this.librarianAutoTrigger
old_assign = '    this.librarianAutoTrigger = librarianAutoTrigger;'
new_assign = '    this.librarianAutoTrigger = librarianAutoTrigger;\n    this.consolidationAutoTrigger = consolidationAutoTrigger;'
assert old_assign in content, 'Could not find librarianAutoTrigger assignment'
content = content.replace(old_assign, new_assign, 1)

# 4. Update the user message to include consolidation trigger
old_msg = "content: `Here is your brief:\\n\\n${brief}\\n\\nPlease proceed with planning and implementation.${this.librarianAutoTrigger ? '\\n\\n⚡ Auto-trigger: After Historian has completed, automatically delegate to Librarian for an arxiv knowledge update.' : ''}`,"
new_msg = "content: `Here is your brief:\\n\\n${brief}\\n\\nPlease proceed with planning and implementation.${this.librarianAutoTrigger ? '\\n\\n⚡ Auto-trigger: After Historian has completed, automatically delegate to Librarian for an arxiv knowledge update.' : ''}${this.consolidationAutoTrigger ? '\\n\\n⚡ Consolidation-trigger: After Historian completes, delegate to Consolidator for knowledge graph consolidation before Librarian.' : ''}`,"
assert old_msg in content, 'Could not find user message content line'
content = content.replace(old_msg, new_msg, 1)

with open(filepath, 'w') as f:
    f.write(content)

print('Patched manager.ts successfully')
