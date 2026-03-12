# Brief: D3 — MCP-server

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-03-mcp-server.md --hours 1
```

## Bakgrund

D1 (session 60–61) lade till Postgres med 8 tabeller. D2 (session 61–62) lade till
pgvector embeddings med semantisk sökning. Kunskapsgrafen har 122 noder, 77 kanter,
106 körningar och 16 534 audit-entries — allt i Postgres.

Men all denna data nås bara via CLI (`npx tsx src/cli.ts costs`, `embed-nodes` etc.)
eller internt av agenterna. Det finns inget sätt för en Claude-session i Claude Desktop
eller Claude Code att fråga Neuron HQ: "Vilka mönster har körning 94 lärt sig?" eller
"Vad kostar en typisk körning?".

**Model Context Protocol (MCP)** är Anthropics standard för att koppla externa
datakällor till Claude. En MCP-server exponerar verktyg (tools) som Claude kan anropa
direkt från valfri chatt. Det officiella TypeScript SDK:t
(`@modelcontextprotocol/sdk`) stöder stdio-transport som funkar med Claude Desktop
och Claude Code utan extra konfiguration.

## Problem

1. **Inlåst data** — körhistorik, kunskapsgraf och kostnadsdata finns bara i CLI
   eller internt i Neuron HQ. Ingen extern klient kan nå det
2. **Manuell kontext** — användaren måste kopiera rapporter och klistra in i chatten
   för att ge Claude kontext om tidigare körningar
3. **Ingen live-koppling** — Claude kan inte fråga "har den pågående körningen fastnat?"
   eller "vilka liknande fel har inträffat förut?" utan manuell inmatning
4. **Outnyttjad semantisk sökning** — D2:s pgvector-sökning nås bara av interna agenter,
   inte av användaren via Claude

## Lösning

Exponera Neuron HQ som MCP-server med 4 verktyg:

| Verktyg | Typ | Vad det gör |
|---------|-----|-------------|
| `neuron_runs` | Read | Lista/filtrera körningar med status, kostnad, tester |
| `neuron_knowledge` | Read | Sök i kunskapsgrafen (keyword + semantisk) |
| `neuron_costs` | Read | Kostnadssammanfattning per körning, agent, modell |
| `neuron_start` | Write | Starta en ny körning (kräver bekräftelse) |

**Transport:** Stdio (standard för Claude Desktop / Claude Code).
Servern startas som subprocess av Claude-klienten.

**SDK:** `@modelcontextprotocol/sdk` (officiella MCP TypeScript SDK:t).

## Uppgifter

### 1. Installera MCP SDK

Lägg till beroende:

```bash
pnpm add @modelcontextprotocol/sdk
```

Notera: SDK:t exporterar `McpServer` och `StdioServerTransport`.

### 2. Skapa MCP-server (`src/mcp/server.ts`)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerRunsTool } from './tools/runs.js';
import { registerKnowledgeTool } from './tools/knowledge.js';
import { registerCostsTool } from './tools/costs.js';
import { registerStartTool } from './tools/start.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'neuron-hq',
    version: '0.1.0',
  });

  registerRunsTool(server);
  registerKnowledgeTool(server);
  registerCostsTool(server);
  registerStartTool(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### 3. Verktyg: `neuron_runs` (`src/mcp/tools/runs.ts`)

Frågar `runs`-tabellen med valfria filter.

```typescript
// Input schema:
// {
//   status?: 'green' | 'yellow' | 'red' | 'error' | 'stopped' | 'running'
//   target?: string         // filtrera på target_name
//   last?: number           // bara senaste N körningar (default 10)
//   runid?: string          // en specifik körning (med detaljerad info)
// }
//
// Returnerar:
// - Lista: runid, target, status, datum, tester, kostnad (kortfattat)
// - Enskild: full info inkl. brief-titel, metriker, agent-breakdown
//
// SQL-frågor mot: runs JOIN usage LEFT JOIN metrics
// Fallback: läs från runs/ directory om DB ej tillgänglig
```

Om `runid` anges: hämta även `brief.md` och `report.md` innehåll från
`runs/<runid>/` och inkludera i svaret.

### 4. Verktyg: `neuron_knowledge` (`src/mcp/tools/knowledge.ts`)

Sök i kunskapsgrafen — keyword OCH semantiskt.

```typescript
// Input schema:
// {
//   query: string           // söktext (obligatorisk)
//   type?: 'pattern' | 'error' | 'technique' | 'run' | 'agent'
//   scope?: 'universal' | 'project-specific'
//   semantic?: boolean      // använd pgvector (default true om tillgänglig)
//   limit?: number          // max resultat (default 10)
// }
//
// Returnerar:
// - Noder med: id, title, type, confidence, scope, similarity (om semantisk)
// - Kanter från/till varje nod (1 nivå)
// - properties (hela objektet)
//
// Logik:
// 1. Om semantic=true och pgvector tillgängligt: kör semanticSearch()
// 2. Annars: fallback till keyword via findNodes()
// 3. Hämta kanter för varje resultatnod via graph_traverse-logik
```

Importera `semanticSearch` från `src/core/semantic-search.ts` och
`findNodes` från `src/core/knowledge-graph.ts`.

### 5. Verktyg: `neuron_costs` (`src/mcp/tools/costs.ts`)

Kostnadsdata — sammanfattning eller per körning.

```typescript
// Input schema:
// {
//   last?: number           // senaste N körningar (default: alla)
//   by_agent?: boolean      // visa breakdown per agent (default false)
//   summary_only?: boolean  // bara totalsumma (default false)
// }
//
// Returnerar:
// - Totaler: total_cost, total_runs, avg_cost, green_count
// - Per körning: runid, date, status, cost, tokens
// - Om by_agent: per-agent breakdown (manager, implementer, etc.)
//
// Återanvänd prislogiken från src/commands/costs.ts
// (MODEL_PRICING, calcCost, getModelShortName)
```

Flytta eller exportera prisberäkningsfunktionerna från `src/commands/costs.ts`
till en delad modul `src/core/pricing.ts` som båda kan importera.

### 6. Verktyg: `neuron_start` (`src/mcp/tools/start.ts`)

Starta en ny körning. **Kräver bekräftelse** — returnera bekräftelsefråga
om inte `confirm: true` skickas.

```typescript
// Input schema:
// {
//   target: string          // target-namn (obligatorisk)
//   brief: string           // sökväg till brief-fil (obligatorisk)
//   hours?: number          // tidsgräns (default 1)
//   model?: string          // modell-override
//   confirm?: boolean       // måste vara true för att starta
// }
//
// Logik:
// 1. Om confirm !== true: returnera sammanfattning av vad som kommer hända
//    + "Kör igen med confirm: true för att starta"
// 2. Om confirm === true: starta run som child process
//    - Kör: npx tsx src/cli.ts run <target> --brief <brief> --hours <hours>
//    - Returnera: "Körning startad. Använd neuron_runs för att följa status."
//    - Spawna processen detached (kör i bakgrunden)
//
// SÄKERHET:
// - Validera target mot targets/repos.yaml
// - Validera brief-sökväg (måste vara under briefs/)
// - Max hours: 4
// - Ingen shell-interpolation (använd array-baserad spawn)
```

### 7. Extrahera prislogik (`src/core/pricing.ts`)

Flytta ut från `src/commands/costs.ts`:

```typescript
// Flytta:
// - MODEL_PRICING
// - getModelShortName()
// - getModelLabel()
// - calcCost()
//
// Exportera som named exports
// Uppdatera costs.ts att importera från pricing.ts istället
```

### 8. CLI-kommando: `mcp-server`

Registrera i `src/cli.ts`:

```typescript
program
  .command('mcp-server')
  .description('Start Neuron HQ as an MCP server (stdio transport)')
  .action(mcpServerCommand);
```

Implementera i `src/commands/mcp-server.ts`:

```typescript
export async function mcpServerCommand(): Promise<void> {
  // Stdout is used by MCP protocol — all logging goes to stderr
  const { startStdioServer } = await import('../mcp/server.js');
  await startStdioServer();
}
```

**Viktigt:** MCP stdio-transport använder stdout för protokollet. All
console.log måste undvikas i MCP-mode — använd console.error/stderr
för debug-meddelanden.

### 9. Claude Desktop-konfiguration

Skapa en exempelfil `mcp-config.example.json`:

```json
{
  "mcpServers": {
    "neuron-hq": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp-server"],
      "cwd": "/Users/mpmac/Documents/VS Code/neuron-hq",
      "env": {
        "PATH": "/opt/homebrew/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin",
        "DATABASE_URL": "postgresql://localhost:5432/neuron"
      }
    }
  }
}
```

### 10. Tester

**Nya testfiler:**

- `tests/mcp/server.test.ts`:
  - `createMcpServer` returnerar server med 4 verktyg registrerade
  - Servern kan lista verktyg (tools/list)

- `tests/mcp/tools/runs.test.ts`:
  - `neuron_runs` utan filter returnerar senaste 10 körningar
  - Filter på status fungerar
  - Filter på target fungerar
  - Enskild körning med runid returnerar detaljer
  - Fallback till filsystem om DB ej tillgänglig

- `tests/mcp/tools/knowledge.test.ts`:
  - `neuron_knowledge` med keyword returnerar matchande noder
  - Semantisk sökning anropas om `semantic: true` + pgvector tillgänglig
  - Inkluderar kanter (1 nivå)
  - Filter på type/scope

- `tests/mcp/tools/costs.test.ts`:
  - `neuron_costs` returnerar totaler
  - `by_agent: true` inkluderar agent-breakdown
  - `summary_only: true` returnerar bara sammanfattning
  - `last: 5` begränsar till 5 körningar

- `tests/mcp/tools/start.test.ts`:
  - Utan `confirm: true` returnerar bekräftelsefråga (inte startad)
  - Validerar target mot repos.yaml
  - Validerar brief-sökväg (under briefs/)
  - Avvisar hours > 4
  - Med confirm spawnar child process (mockad)

- `tests/core/pricing.test.ts`:
  - `calcCost` beräknar korrekt för sonnet/haiku/opus
  - `getModelShortName` mappar modellsträngar
  - `getModelLabel` returnerar human-readable namn

**Viktigt:**
- Mocka Postgres-frågor i enhetstester (ingen riktig DB)
- Mocka child_process.spawn i start-tester
- Alla 938 befintliga tester ska passera
- `test.skipIf(...)` för tester som kräver riktig MCP-anslutning

## Avgränsningar

- Ingen HTTP-transport (bara stdio — Claude Desktop/Code stöder detta)
- Ingen autentisering (lokalt verktyg, körs som subprocess)
- Ingen MCP resources eller prompts (bara tools)
- Inga audit-entry-sökningar (kan läggas till senare)
- Ingen streaming av körningsloggar (kan bli framtida förbättring)
- Ingen ändring av befintliga agent-prompts
- Inget web-gränssnitt

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering efter körning

```bash
# Testa att servern startar (Ctrl+C för att avsluta)
npx tsx src/cli.ts mcp-server

# Testa med MCP inspector (om installerad)
# npx @modelcontextprotocol/inspector npx tsx src/cli.ts mcp-server
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `@modelcontextprotocol/sdk` installerat | `pnpm list @modelcontextprotocol/sdk` |
| `src/mcp/server.ts` skapar server med 4 verktyg | Enhetstest |
| `neuron_runs` listar och filtrerar körningar | Enhetstest |
| `neuron_knowledge` söker keyword + semantiskt | Enhetstest |
| `neuron_costs` returnerar kostnadsdata | Enhetstest |
| `neuron_start` kräver confirm + validerar input | Enhetstest |
| `src/core/pricing.ts` exporterar prislogik | Enhetstest |
| `src/commands/costs.ts` använder pricing.ts | Import-check |
| CLI `mcp-server` kommando registrerat | `--help` visar det |
| `mcp-config.example.json` skapad | Fil existerar |
| Graceful fallback utan DB | Enhetstest |
| 938 befintliga tester passerar | `pnpm test` |

## Risk

**Medium.** Nytt extern gränssnitt, men risken mildras av:

1. **Read-only (3 av 4 verktyg)** — neuron_runs, neuron_knowledge, neuron_costs
   läser bara data. Ingen modifikation av grafen eller databasen
2. **Bekräftelsesteg** — neuron_start kräver explicit `confirm: true`
   och validerar alla inputs
3. **Lokal transport** — stdio körs som lokal subprocess, ingen nätverksexponering
4. **Befintlig kod orörd** — verktygen anropar existerande funktioner
   (semanticSearch, findNodes, calcCost). Ingen ny databaslogik
5. **Ingen stdout-kontaminering** — MCP-mode skriver inget till stdout
   utom protokollmeddelanden

**Rollback:** `pnpm remove @modelcontextprotocol/sdk` + `git revert <commit>`

## Förberedelse (manuellt innan körning)

```bash
# Installera MCP SDK
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm add @modelcontextprotocol/sdk

# Verifiera att Postgres körs (behövs för runs/knowledge/costs)
psql neuron -c "SELECT count(*) FROM runs;"
```
