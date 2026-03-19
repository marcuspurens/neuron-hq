# CR-1b: Härdning — Graceful shutdown, centraliserad config, catch-block audit

## Bakgrund

CR-1a (körning 159) fixade alla 3 CRITICAL + 4 HIGH med effort S/M. Kvar i Fas 1 är 4 findings som kräver mer arbete. Dessa tas i prioritetsordning: shutdown först (dataförlust-risk), sedan config (grunden för loggning), sedan catch-blocks (stort men mekaniskt).

**OBS: Strukturerad loggning (ersätt 909 console.*) är medvetet exkluderad** — det är effort L och kräver att centraliserad config finns först. Tas i separat CR-1c.

## Mål

Fixa 3 av 4 kvarvarande Fas 1-findings. Alla tester ska passera.

## Uppgifter

### 1. Graceful shutdown (HIGH, Effort M)

- **Problem:** Ingen `process.on('SIGINT')` / `process.on('SIGTERM')` i kodbasen. Vid Ctrl+C: DB-pool läcker, child processes blir orphans, audit/manifest inte flushat.
- **Fix:** Skapa `src/core/shutdown.ts` med:

```typescript
// Registrera cleanup-handlers
const cleanupHandlers: Array<() => Promise<void>> = [];

export function onShutdown(handler: () => Promise<void>): void {
  cleanupHandlers.push(handler);
}

export function installShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    console.error(`\n[shutdown] ${signal} received — cleaning up...`);
    for (const handler of cleanupHandlers) {
      try { await handler(); } catch { /* best effort */ }
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
```

- **Integrera i `src/commands/run.ts`:** Kalla `installShutdownHandlers()` vid start. Registrera: `onShutdown(() => closePool())`.
- **Testa:** Skriv test som verifierar att handlers registreras och anropas.

### 2. Centraliserad config (MEDIUM, Effort M)

- **Problem:** 16 `process.env`-läsningar spridda i 8+ filer utan validering. Om en env-var saknas: tyst fallback eller runtime-krasch.
- **Fix:** Skapa `src/core/config.ts`:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  // Database
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().default(5),
  // Ollama
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL_EMBED: z.string().default('snowflake-arctic-embed'),
  OLLAMA_MODEL_VISION: z.string().default('qwen3-vl:8b'),
  OLLAMA_MODEL_POLISH: z.string().default('llama3.1:8b'),
  // Aurora
  AURORA_PYTHON_PATH: z.string().default('python3'),
  PYANNOTE_TOKEN: z.string().optional(),
  // Langfuse
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASEURL: z.string().optional(),
  // API
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = ConfigSchema.parse(process.env);
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
```

- **Migrera:** Ersätt alla `process.env.X`-läsningar med `getConfig().X`. Gör det fil för fil.
- **Skapa `.env.example`** med alla env vars och defaults.
- **Testa:** Verifiera att config parsas korrekt, att defaults fungerar, att saknade obligatoriska variabler kastar.

### 3. Catch-block audit (HIGH, Effort L)

- **Problem:** 211 `catch {}`-block (utan parameter) sväljer fel tyst.
- **Fix strategi:** Tre kategorier:
  1. **Logga felet** — de flesta catch-block ska logga `console.error('[module] operation failed:', err)` (eller senare den strukturerade loggern)
  2. **Motivera med kommentar** — om tyst catch är avsiktlig: `catch { /* intentional: fallback to default */ }`
  3. **Re-throw** — om felet inte ska döljas
- **Arbetssätt:** Gå igenom fil för fil i denna ordning:
  1. `src/core/` (exkl. agents/) — mest kritiskt
  2. `src/aurora/`
  3. `src/core/agents/`
  4. `src/mcp/`
  5. `src/commands/`
- **Mål:** 0 omotiverade tysta catch-block. Varje `catch` ska antingen logga, ha kommentar, eller re-throwa.
- **Testa:** Befintliga tester ska fortfarande passera.

## Avgränsningar

- Fixa BARA de 3 listade uppgifterna
- Byt INTE ut console.* mot strukturerad logger (det är CR-1c)
- Gör INTE refaktorering utöver vad som krävs
- Ändra INTE agent-logik

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `src/core/shutdown.ts` finns med SIGINT/SIGTERM | Manuell kontroll |
| `installShutdownHandlers()` anropas i run.ts | `grep installShutdown src/commands/run.ts` |
| `src/core/config.ts` finns med Zod-validering | Manuell kontroll |
| Alla `process.env`-läsningar ersatta med `getConfig()` | `grep -r 'process.env' src/` returnerar 0 (exkl. config.ts) |
| `.env.example` finns | `ls .env.example` |
| 0 omotiverade tysta catch-block | `grep -c 'catch {' src/` visar att alla har loggning/kommentar |
| Alla tester passerar | `pnpm test` |
| Typecheck passerar | `pnpm typecheck` |

## Risk

**Låg-Medium.** Catch-block-ändringarna är mekaniska men berör många filer. Shutdown och config är nya moduler som inte påverkar befintlig logik.

## Agentinställningar

- Manager: max 150 iterationer
- Implementer: max 120 iterationer (211 catch-blocks = mycket redigering)
- Researcher: max 40 iterationer
- Reviewer: max 40 iterationer
- Tester: max 30 iterationer
