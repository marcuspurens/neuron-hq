# Model-Specific Prompt Overlays

This directory contains model-specific instructions that are automatically
merged with agent base prompts based on the active model.

## Directory Structure

```
overlays/
├── claude-opus/
│   └── default.md        # Default overlay for all Opus agents
├── claude-haiku/
│   ├── default.md        # Default overlay for all Haiku agents
│   ├── manager.md        # Haiku-specific Manager instructions
│   └── implementer.md    # Haiku-specific Implementer instructions
└── README.md
```

## Resolution Order

1. `<family>/<role>.md` — Most specific (e.g. `claude-haiku/manager.md`)
2. `<family>/default.md` — Family fallback (e.g. `claude-haiku/default.md`)
3. No overlay — Base prompt used unchanged

## Family Mapping

- `claude-opus-*` → `claude-opus`
- `claude-sonnet-*` → `claude-sonnet`
- `claude-haiku-*` → `claude-haiku`
- `gpt-4*` → `gpt-4`

## Guidelines

- Overlays should **complement**, not contradict, base prompts
- Keep overlays concise (<1 KB)
- Do NOT use ARCHIVE markers in overlay files
