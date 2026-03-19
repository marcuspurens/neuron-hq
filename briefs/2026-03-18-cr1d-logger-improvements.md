# CR-1d: Logger-förbättringar — LOG_LEVEL, error-serialisering, trace ID, LogWriter

## Bakgrund

CR-1c (körning 162) levererade `src/core/logger.ts` och migrerade ~200 `console.*`-anrop i core/aurora/mcp till strukturerad JSON-loggning. Loggern fungerar men saknar fyra saker som gör den produktionsklar.

Nuvarande logger:
- Hårdkodad `minLevel = 'info'` — ingen env-var-styrning
- Error-objekt loggas som `{}` (JSON.stringify tappar name/message/stack)
- Ingen korrelering mellan loggrader i samma körning
- Skriver direkt till `process.stderr` — svårt att testa och omöjligt att skicka till externa mål

## Mål

Förbättra `src/core/logger.ts` med fyra avgränsade ändringar. Effort S — alla ändringar ryms i en fil plus config och tester.

## Uppgifter

### 1. LOG_LEVEL env var via config.ts (Effort XS)

Lägg till `LOG_LEVEL` i `ConfigSchema` i `src/core/config.ts`:

```typescript
LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
```

I `src/core/logger.ts`, initiera `minLevel` från config:

```typescript
import { getConfig } from './config.js';

// Anropa vid första loggning eller exportera en initLogger()
let initialized = false;
function ensureInit() {
  if (!initialized) {
    const cfg = getConfig();
    minLevel = cfg.LOG_LEVEL;
    initialized = true;
  }
}
```

`setLogLevel()` ska fortfarande fungera som override (tester behöver det).

Tester:
- Verifiera att `LOG_LEVEL=debug` i env ger debug-loggar
- Verifiera att `setLogLevel()` överskuggar env-värdet
- Verifiera att ogiltigt LOG_LEVEL-värde ger Zod-felmeddelande

### 2. Strukturerad Error-serialisering (Effort XS)

Errors som skickas som extra-fält (t.ex. `logger.error('fail', { error: err })`) försvinner vid `JSON.stringify` eftersom Error-properties inte är enumerable.

Lägg till en `serializeExtra()`-funktion som körs före `redact()`:

```typescript
function serializeExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v instanceof Error) {
      result[k] = {
        name: v.name,
        message: v.message,
        stack: v.stack,
        // Behåll eventuella custom properties (t.ex. code, statusCode)
        ...Object.getOwnPropertyNames(v).reduce((acc, prop) => {
          if (!['name', 'message', 'stack'].includes(prop)) {
            acc[prop] = (v as Record<string, unknown>)[prop];
          }
          return acc;
        }, {} as Record<string, unknown>),
      };
    } else {
      result[k] = v;
    }
  }
  return result;
}
```

Anropa i `log()`: `...(extra ? redact(serializeExtra(extra)) : {})`

Tester:
- Verifiera att Error-objekt serialiseras med name, message, stack
- Verifiera att custom Error-properties (t.ex. `code`) bevaras
- Verifiera att icke-Error-värden passerar igenom oförändrade

### 3. Trace ID per körning (Effort XS)

Lägg till en global `traceId` som sätts en gång per run och inkluderas i varje loggpost:

```typescript
let traceId: string | undefined;

export function setTraceId(id: string): void {
  traceId = id;
}

export function getTraceId(): string | undefined {
  return traceId;
}
```

I `log()`, inkludera `traceId` om det är satt:

```typescript
const entry: LogEntry = {
  ts: new Date().toISOString(),
  level,
  module,
  msg,
  ...(traceId ? { traceId } : {}),
  ...(extra ? redact(serializeExtra(extra)) : {}),
};
```

`traceId` sätts från `src/core/run.ts` vid körningsstart (typiskt `runId`). Denna ändring kräver en rad i run.ts: `setTraceId(runId)`.

Tester:
- Verifiera att `traceId` inkluderas i loggposter efter `setTraceId()`
- Verifiera att `traceId` utelämnas om inte satt
- Verifiera att `getTraceId()` returnerar korrekt värde

### 4. LogWriter-abstraktion (Effort S)

Ersätt hårdkodad `process.stderr.write` med ett utbytbart `LogWriter`-interface:

```typescript
export interface LogWriter {
  write(entry: LogEntry): void;
}

class StderrWriter implements LogWriter {
  write(entry: LogEntry): void {
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

let writer: LogWriter = new StderrWriter();

export function setLogWriter(w: LogWriter): void {
  writer = w;
}
```

I `log()`, byt `process.stderr.write(...)` till `writer.write(entry)`.

Detta möjliggör:
- **Testbarhet** — injicera en mock-writer istället för att spionera på stderr
- **Framtida mål** — file writer, Langfuse-integration, batched network writer
- **Komposition** — en `MultiWriter` som skickar till flera mål

Tester:
- Verifiera att custom LogWriter tar emot LogEntry-objekt
- Verifiera att default StderrWriter skriver JSON till stderr
- Verifiera att `setLogWriter()` byter destination

## Avgränsningar

- **Rör INTE `src/commands/`**
- **Rör INTE befintliga logger-anrop** (bara logger.ts, config.ts, och en rad i run.ts)
- **Ingen extern dependency**
- **Ändra INTE befintliga tester** — lägg bara till nya
- **Ingen MultiWriter eller Langfuse-writer** — bara interfacet. Implementationer kommer i Fas 2

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `LOG_LEVEL` env var fungerar via config.ts | Test |
| `setLogLevel()` fungerar som override | Befintliga tester passerar |
| Error-objekt serialiseras med name/message/stack | Test |
| Custom Error-properties bevaras | Test |
| `traceId` inkluderas i loggar efter `setTraceId()` | Test |
| `traceId` utelämnas om inte satt | Test |
| `LogWriter`-interface finns och är exporterat | Test |
| `setLogWriter()` byter destination | Test |
| Default = StderrWriter (bakåtkompatibelt) | Test |
| Alla befintliga logger-tester passerar oförändrade | `pnpm test` |
| Typecheck passerar | `pnpm typecheck` |

## Risk

**Mycket låg.** Fyra isolerade tillägg till en modul som redan har bra testtäckning. Bakåtkompatibelt — befintligt beteende ändras inte om man inte anropar de nya funktionerna.

## Agentinställningar

- Manager: max 30 iterationer
- Implementer: max 40 iterationer
- Researcher: max 10 iterationer
- Reviewer: max 20 iterationer
- Tester: max 20 iterationer
