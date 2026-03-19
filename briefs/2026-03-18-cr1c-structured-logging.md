# CR-1c: Strukturerad loggning — logger-modul + migrering av core/aurora/mcp

## Bakgrund

CR-1b (körning 161) levererade centraliserad config (`config.ts` + Zod) och auditerade alla 145 catch-blocks. Grunden för strukturerad loggning är lagd.

Kodbasen har 977 `console.*`-anrop totalt, men **771 sitter i `src/commands/`** och är avsiktlig CLI-utskrift (chalk-formaterade tabeller, rapporter, användargränssnitt). Dessa ska **inte** migreras.

Det verkliga scopet är ~200 anrop i `src/core/`, `src/core/agents/`, `src/aurora/` och `src/mcp/`.

## Mål

Skapa en strukturerad logger-modul och migrera alla icke-CLI `console.*`-anrop till den. CLI-utskrifter i `src/commands/` lämnas orörda.

## Uppgifter

### 1. Skapa `src/core/logger.ts` (Effort M)

Skapa en lättviktig strukturerad logger. **Använd INTE pino/winston** — bygg en enkel modul som skriver JSON till stderr och som kan bytas ut senare. Minimalt externt beroende.

```typescript
import { getConfig } from './config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;       // ISO timestamp
  level: LogLevel;
  module: string;   // t.ex. 'manager', 'ollama', 'aurora:intake'
  msg: string;
  [key: string]: unknown; // extra context
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function createLogger(module: string) {
  const log = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...extra,
    };
    // Skriv JSON till stderr (stdout reserverat för CLI-output)
    process.stderr.write(JSON.stringify(entry) + '\n');
  };

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
    info:  (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn:  (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
  };
}
```

Designbeslut:
- **Ingen extern dependency** — enkel JSON till stderr
- **stderr** — så CLI-output på stdout inte blandas med loggmeddelanden
- **Module-tagg** — varje loggare vet vilken modul den tillhör
- **Utbytbar** — kan senare byta implementation till pino om behov uppstår
- **Redaction** — lägg till i `log()`: om `extra` innehåller nycklar som matchar `/key|token|secret|password/i`, ersätt värdet med `[REDACTED]`

Tester:
- Verifiera att JSON-format skrivs korrekt
- Verifiera level-filtrering (debug syns inte vid info-nivå)
- Verifiera redaction av känsliga fält
- Verifiera att `createLogger('module')` sätter module-fältet

### 2. Migrera `src/core/` (exkl. agents/) — ~27 anrop (Effort S)

Migrera console.*-anrop i dessa filer (filerna med flest anrop):

| Fil | Antal | Migrera till |
|-----|-------|-------------|
| `ollama.ts` | 6 | `createLogger('ollama')` |
| `dashboard-server.ts` | 5 | `createLogger('dashboard')` |
| `knowledge-graph.ts` | 4 | `createLogger('graph')` |
| `event-bus.ts` | 3 | `createLogger('event-bus')` |
| `run.ts` | 2 | `createLogger('run')` |
| `dashboard-ui.ts` | 2 | `createLogger('dashboard-ui')` |
| Övriga (6 filer à 1) | 6 | Respektive modul |

Regel:
- `console.log` → `logger.info`
- `console.error` → `logger.error`
- `console.warn` → `logger.warn`
- Bevara befintligt meddelande och kontext

### 3. Migrera `src/core/agents/` — ~102 anrop (Effort M)

Agentfilerna har mest loggning. Migrera dessa:

| Fil | Antal |
|-----|-------|
| `manager.ts` | 21 |
| `historian.ts` | 16 |
| `reviewer.ts` | 9 |
| `merger.ts` | 9 |
| `librarian.ts` | 9 |
| `tester.ts` | 8 |
| `researcher.ts` | 8 |
| `implementer.ts` | 8 |
| `consolidator.ts` | 8 |
| Övriga | 6 |

Alla agenter ska använda `createLogger('agent:<name>')`, t.ex. `createLogger('agent:manager')`.

### 4. Migrera `src/aurora/` — ~65 anrop (Effort S)

| Fil (topp 5) | Antal |
|-----|-------|
| `job-runner.ts` | 8 |
| `knowledge-library.ts` | 7 |
| `worker-bridge.ts` | 6 |
| `video.ts` | 5 |
| `intake.ts` | 4 |

Aurora-moduler ska använda `createLogger('aurora:<name>')`, t.ex. `createLogger('aurora:intake')`.

### 5. Migrera `src/mcp/` — ~7 anrop (Effort S)

Minimal — bara `server.ts` och ett par tools-filer.

## Avgränsningar

- **Rör INTE `src/commands/`** — 771 console.*-anrop där är avsiktlig CLI-output
- **Ingen extern logger-dependency** (pino, winston) — bygg enkelt, byt ut om det behövs
- **Ingen refaktorering** utöver att byta console.* → logger.*
- **Ändra INTE agent-logik**
- **Ändra INTE befintliga tester** (förutom att lägga till tester för logger-modulen)

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `src/core/logger.ts` finns med JSON-output till stderr | Manuell kontroll |
| `createLogger(module)` returnerar objekt med debug/info/warn/error | Tester |
| Redaction av känsliga fält fungerar | Tester |
| Level-filtrering fungerar | Tester |
| 0 `console.*` i `src/core/` (exkl. dashboard-ui.ts chalk-output om det finns) | `grep -rc 'console\.' src/core/ --include='*.ts'` ≈ 0 |
| 0 `console.*` i `src/aurora/` | `grep -rc 'console\.' src/aurora/ --include='*.ts'` = 0 |
| 0 `console.*` i `src/mcp/` | `grep -rc 'console\.' src/mcp/ --include='*.ts'` = 0 |
| `src/commands/` oförändrad | `git diff --stat src/commands/` visar inga ändringar |
| Alla tester passerar | `pnpm test` |
| Typecheck passerar | `pnpm typecheck` |

## Risk

**Låg.** Mekaniskt byte av console.* → logger.* med samma meddelanden. Logger-modulen är ny och icke-invasiv. CLI-output påverkas inte.

## Agentinställningar

- Manager: max 100 iterationer
- Implementer: max 100 iterationer (~200 console-byten = mekaniskt men utspritt)
- Researcher: max 30 iterationer
- Reviewer: max 40 iterationer
- Tester: max 30 iterationer
