# Brief: STT-beroendekontroll — aurora:check-deps

## Bakgrund

Aurora har flera Python-beroenden som måste vara installerade för att
multimedia-pipelinen ska fungera: `faster-whisper`, `pyannote.audio`, `yt-dlp`,
`pypdfium2`, `trafilatura`. Idag finns ingen enkel kontroll som visar vad
som är installerat och vad som saknas.

Med STT-förbättringarna (körning 110) tillkommer `KBLab/kb-whisper-large` —
en ~3 GB modell som laddas ner automatiskt vid första användning, men som
gärna förladdas så att ingest-kommandon inte fastnar på nedladdning.

## Uppgifter

### 1. Python check-deps worker

Skapa `aurora-workers/check_deps.py`:

```python
"""Check which Python dependencies are available for Aurora workers."""
import importlib
import os
import sys


def check_deps(source: str, options: dict | None = None) -> dict:
    """Check availability of Python dependencies.

    Args:
        source: Ignored (required by dispatcher interface).
        options: Optional dict with:
            - preload_models: bool — if True, also try loading Whisper models.

    Returns:
        Dict with dependency status information.
    """
    deps = {
        "faster_whisper": _check_import("faster_whisper"),
        "pyannote_audio": _check_import("pyannote.audio"),
        "yt_dlp": _check_import("yt_dlp"),
        "pypdfium2": _check_import("pypdfium2"),
        "trafilatura": _check_import("trafilatura"),
    }

    models = {}
    opts = options or {}
    if opts.get("preload_models") and deps["faster_whisper"]["available"]:
        from faster_whisper import WhisperModel
        for model_name in ["tiny", "small", os.environ.get("WHISPER_MODEL_SV", "KBLab/kb-whisper-large")]:
            try:
                WhisperModel(model_name)
                models[model_name] = {"available": True, "error": None}
            except Exception as e:
                models[model_name] = {"available": False, "error": str(e)}

    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

    return {
        "title": "Aurora dependency check",
        "text": f"Python {python_version}: {sum(1 for d in deps.values() if d['available'])}/{len(deps)} deps available",
        "metadata": {
            "python_version": python_version,
            "python_path": sys.executable,
            "dependencies": deps,
            "models": models,
            "source_type": "dependency_check",
        },
    }


def _check_import(module_name: str) -> dict:
    """Try importing a module and return status."""
    try:
        mod = importlib.import_module(module_name)
        version = getattr(mod, "__version__", getattr(mod, "VERSION", "unknown"))
        return {"available": True, "version": str(version), "error": None}
    except ImportError as e:
        return {"available": False, "version": None, "error": str(e)}
```

Registrera i `aurora-workers/__main__.py` HANDLERS:

```python
from check_deps import check_deps

HANDLERS["check_deps"] = check_deps
```

Lägg till `'check_deps'` i `WorkerRequest.action` union-typen i
`src/aurora/worker-bridge.ts`.

### 2. CLI: aurora:check-deps

Skapa `src/commands/aurora-check-deps.ts`:

```typescript
/**
 * CLI command: aurora:check-deps
 * Check which Python dependencies are available for Aurora workers.
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:check-deps
 *   npx tsx src/cli.ts aurora:check-deps --preload-models
 */
```

Output-format:

```
Aurora Dependency Check
═══════════════════════

Python: 3.12.8 (/opt/anaconda3/bin/python3)

Dependencies:
  ✅ faster-whisper  1.1.1
  ✅ yt-dlp          2025.1.15
  ✅ trafilatura     1.12.0
  ✅ pypdfium2       4.30.0
  ⚠️  pyannote.audio  not installed
     Install: pip install pyannote.audio

Models (--preload-models):
  ✅ tiny             loaded
  ✅ small            loaded
  ⬇️  KBLab/kb-whisper-large  downloading... (first run only, ~3 GB)
```

Registrera i `src/cli.ts`:

```typescript
program
  .command('aurora:check-deps')
  .description('Check which Python dependencies are available for Aurora')
  .option('--preload-models', 'Also try loading Whisper models')
  .action(async (options) => {
    const { auroraCheckDepsCommand } = await import('./commands/aurora-check-deps.js');
    await auroraCheckDepsCommand(options);
  });
```

### 3. MCP-tool: aurora_check_deps

Skapa `src/mcp/tools/aurora-check-deps.ts`:

```typescript
server.tool(
  'aurora_check_deps',
  'Check which Python dependencies and Whisper models are available',
  {
    preload_models: z.boolean().optional().default(false)
      .describe('Also try loading Whisper models (slow on first run)'),
  },
  async (args) => {
    // ...call runWorker({ action: 'check_deps', source: '', options: { preload_models: args.preload_models } })
  },
);
```

Registrera i `src/mcp/server.ts`.

### 4. Tester

**`tests/aurora/check-deps.test.ts`** — ny testfil:

- `check_deps worker returns dependency status` — mocka runWorker, verifiera JSON-format
- `check_deps includes python_version in metadata`
- `check_deps with preload_models includes models object`
- `check_deps without preload_models has empty models`

**`tests/commands/aurora-check-deps.test.ts`** — CLI-tester:

- `shows dependency status with checkmarks`
- `shows install suggestion for missing deps`
- `--preload-models shows model status`

**Befintliga ~1510 tester ska passera oförändrade.**

## Avgränsningar

- **Kontrollerar bara** — installerar inget. Ger tydliga instruktioner.
- **preload-models kan ta lång tid** — nedladdning av KBLab-modellen (~3 GB)
  sker bara vid `--preload-models`, inte vid vanlig check.
- **Inga Python-tester** — testas indirekt via mockad runWorker.

## Verifiering

```bash
pnpm test
pnpm typecheck
# Manuellt:
npx tsx src/cli.ts aurora:check-deps
npx tsx src/cli.ts aurora:check-deps --preload-models
```

## Risk

**Låg.** Helt nytt kommando, inga ändringar i befintlig kod utom:
1. `__main__.py` HANDLERS — additivt (en ny rad)
2. `WorkerRequest.action` — union utökas med `'check_deps'`

**Rollback:** `git revert <commit>`
