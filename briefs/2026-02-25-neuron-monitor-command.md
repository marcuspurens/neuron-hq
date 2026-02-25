# Neuron HQ — Monitor-kommando (`npx tsx src/cli.ts monitor`)

## Kör-kommando

```bash
# Kör från: /Users/mpmac/Documents/VS Code/neuron-hq
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-25-neuron-monitor-command.md --hours 1
```

## Mål

Lägg till ett `monitor`-kommando i CLI:t som kör Auroras health check och visar
resultatet i terminalen. Neuron HQ kan då kontrollera Auroras hälsa direkt.

## Önskat beteende

```bash
npx tsx src/cli.ts monitor aurora-swarm-lab
```

Utdata (exempel):
```
Aurora Health — 2026-02-25 12:36 UTC
─────────────────────────────────────
Status:  ✅ ok
Tests:   204/204 passed

Components:
  ✅ sqlite3
  ✅ ollama (snowflake-arctic-embed:latest)
  ✅ faster_whisper
  ❌ paddleocr — not installed
  ✅ yt_dlp
  ✅ playwright

Data:    1 manifests · 65 embeddings
```

## Uppgifter

### 1. Skapa `src/commands/monitor.ts`

Kommandot ska:
1. Slå upp targetens path i `targets/repos.yaml` (samma logik som `run`-kommandot)
2. Köra `python scripts/health_check.py` i target-repots rotkatalog (subprocess/exec)
3. Läsa `data/health.json` från target-repots rotkatalog
4. Skriva ut en formaterad rapport i terminalen (se önskat beteende ovan)
5. Avsluta med exit code 0 om status=ok, exit code 1 om status=degraded/error

### 2. Registrera kommandot i `src/commands/index.ts`

```typescript
export { monitorCommand } from './monitor.js';
```

### 3. Registrera i `src/cli.ts`

```typescript
program
  .command('monitor <target>')
  .description('Run health check on a target and display status')
  .action(monitorCommand);
```

### 4. Tester i `tests/commands/monitor.test.ts`

- Kommandot läser korrekt från `data/health.json`
- Formaterar status korrekt (ok → ✅, annars ❌)
- Returnerar rätt exit code baserat på status
- Hanterar saknad `data/health.json` med tydligt felmeddelande

## Verifiering

```bash
pnpm typecheck
pnpm test
```

Manuellt test (efter merge):
```bash
npx tsx src/cli.ts monitor aurora-swarm-lab
```

## Avgränsningar

- Kör INTE om health check tar mer än 60 sekunder (timeout)
- Om `data/health.json` saknas — skriv ut ett tydligt fel och avsluta med exit code 1
- Ändra INTE befintliga kommandon
- Håll formateringen enkel — vanlig text, inga externa UI-bibliotek utöver chalk (redan installerat)
