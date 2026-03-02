import re

path = 'src/core/agents/implementer.ts'
with open(path, 'r') as f:
    content = f.read()

# Replace the return statement that uses implementerPrompt with overlayedPrompt
old = 'return `${implementerPrompt}\\n\\n${contextInfo}`'
new = 'return `${overlayedPrompt}\\n\\n${contextInfo}`'
content = content.replace(old, new)

with open(path, 'w') as f:
    f.write(content)

print('Done: implementer.ts return statement updated')
