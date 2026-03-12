# Brief: B3 — Source Freshness Scoring

## Bakgrund

Aurora har confidence decay som sänker tillit på noder som inte uppdaterats på
20+ dagar (via `decay_confidence()` i Postgres). Men det finns inget sätt att
markera att en källa har *verifierats* som fortfarande korrekt. En nod som
verifierades igår och en som aldrig verifierats behandlas lika.

`briefing()` visar fakta med confidence-poäng, men säger inget om hur *färska*
källorna faktiskt är.

## Problem

1. **Ingen verifierings-spårning** — det går inte att markera att en källa
   granskats och fortfarande stämmer
2. **Decay straffar alla lika** — en verifierad källa tappar confidence lika
   fort som en ogranskad
3. **Briefing saknar freshness-varning** — rapporten visar inte om fakta bygger
   på gamla, overifierade källor

## Lösning

Lägg till `last_verified` på `aurora_nodes` + en `verifySource()`-funktion +
uppdatera confidence decay att ta hänsyn till verifiering + flagga gamla
källor i briefing.

## Uppgifter

### 1. Migration 006: last_verified-kolumn

Skapa `src/core/migrations/006_freshness.sql`:

```sql
-- Migration 006: Source freshness scoring
-- Add last_verified column to aurora_nodes for tracking source verification

ALTER TABLE aurora_nodes
  ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;

-- Index for freshness queries (finding unverified or stale nodes)
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_last_verified
  ON aurora_nodes (last_verified)
  WHERE last_verified IS NOT NULL;
```

`last_verified` börjar som `NULL` (aldrig verifierad). Separerat från `updated`
som ändras varje gång noden modifieras.

### 2. Freshness-modul

Skapa `src/aurora/freshness.ts`:

```typescript
import { getPool } from '../core/db.js';

export interface FreshnessInfo {
  nodeId: string;
  title: string;
  type: string;
  confidence: number;
  lastVerified: string | null;  // ISO timestamp or null
  daysSinceVerified: number | null;  // null = aldrig verifierad
  freshnessScore: number;  // 0.0-1.0
  status: 'fresh' | 'aging' | 'stale' | 'unverified';
}

/**
 * Beräknar freshness score för en nod baserat på last_verified.
 *
 * - Aldrig verifierad → 0.0
 * - Verifierad idag → 1.0
 * - Linjär nedgång: 1.0 → 0.0 över maxAgeDays (default 90)
 */
export function calculateFreshnessScore(
  lastVerified: Date | null,
  maxAgeDays: number = 90,
): number {
  if (!lastVerified) return 0;
  const daysSince = (Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1;
  if (daysSince >= maxAgeDays) return 0;
  return Math.round((1 - daysSince / maxAgeDays) * 100) / 100;
}

/**
 * Bestämmer status baserat på freshness score.
 */
export function freshnessStatus(
  score: number,
  lastVerified: Date | null,
): 'fresh' | 'aging' | 'stale' | 'unverified' {
  if (!lastVerified) return 'unverified';
  if (score >= 0.7) return 'fresh';
  if (score >= 0.3) return 'aging';
  return 'stale';
}

/**
 * Markerar en nod som verifierad (nu).
 * Returnerar true om noden hittades och uppdaterades.
 */
export async function verifySource(nodeId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    'UPDATE aurora_nodes SET last_verified = NOW() WHERE id = $1',
    [nodeId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Hämtar freshness-info för noder som matchar ett topic (via sökning)
 * eller alla noder om topic saknas.
 */
export async function getFreshnessReport(options?: {
  topic?: string;
  limit?: number;
  onlyStale?: boolean;
}): Promise<FreshnessInfo[]> {
  const pool = getPool();
  const limit = options?.limit ?? 20;

  let query: string;
  const params: unknown[] = [];

  if (options?.onlyStale) {
    // Noder som aldrig verifierats, eller verifierades för > 30 dagar sedan
    query = `
      SELECT id, title, type, confidence, last_verified,
             EXTRACT(DAY FROM NOW() - last_verified) AS days_since
      FROM aurora_nodes
      WHERE last_verified IS NULL
         OR last_verified < NOW() - INTERVAL '30 days'
      ORDER BY last_verified ASC NULLS FIRST
      LIMIT $1
    `;
    params.push(limit);
  } else {
    query = `
      SELECT id, title, type, confidence, last_verified,
             EXTRACT(DAY FROM NOW() - last_verified) AS days_since
      FROM aurora_nodes
      ORDER BY last_verified ASC NULLS FIRST
      LIMIT $1
    `;
    params.push(limit);
  }

  const { rows } = await pool.query(query, params);

  return rows.map((row: Record<string, unknown>) => {
    const lastVerified = row.last_verified
      ? new Date(row.last_verified as string)
      : null;
    const daysSince = row.days_since != null
      ? Math.floor(row.days_since as number)
      : null;
    const score = calculateFreshnessScore(lastVerified);
    const status = freshnessStatus(score, lastVerified);

    return {
      nodeId: row.id as string,
      title: row.title as string,
      type: row.type as string,
      confidence: row.confidence as number,
      lastVerified: lastVerified?.toISOString() ?? null,
      daysSinceVerified: daysSince,
      freshnessScore: score,
      status,
    };
  });
}
```

### 3. Uppdatera briefing med freshness-flaggor

I `src/aurora/briefing.ts`, uppdatera `BriefingResult.facts` med freshness:

Lägg till fält i `facts`-arrayen:

```typescript
facts: Array<{
  title: string;
  type: string;
  confidence: number;
  similarity: number;
  text?: string;
  // NYA fält:
  freshnessScore: number;
  freshnessStatus: 'fresh' | 'aging' | 'stale' | 'unverified';
}>;
```

I `briefing()`-funktionen, efter att fakta hämtats (runt rad 96-110), berika
varje fakt med freshness-info via en enkel Postgres-query:

```typescript
// Berika fakta med freshness
const pool = getPool();
for (const fact of facts) {
  try {
    const { rows } = await pool.query(
      'SELECT last_verified FROM aurora_nodes WHERE id = $1',
      [fact.nodeId],
    );
    const lastVerified = rows[0]?.last_verified
      ? new Date(rows[0].last_verified)
      : null;
    fact.freshnessScore = calculateFreshnessScore(lastVerified);
    fact.freshnessStatus = freshnessStatus(fact.freshnessScore, lastVerified);
  } catch {
    fact.freshnessScore = 0;
    fact.freshnessStatus = 'unverified';
  }
}
```

Uppdatera CLI-outputen i `aurora-briefing.ts` att visa freshness-varningar:
- Om en fakta har status `stale` eller `unverified`, lägg till en varning:
  `[!] Overifierad källa` eller `[!] Föråldrad källa (43 dagar sedan verifiering)`

### 4. CLI-kommando: aurora:verify

Skapa `src/commands/aurora-verify.ts`:

```typescript
import chalk from 'chalk';
import { verifySource } from '../aurora/freshness.js';
import { closePool, isDbAvailable } from '../core/db.js';

export async function auroraVerifyCommand(nodeId: string): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const updated = await verifySource(nodeId);

  if (updated) {
    console.log(chalk.green(`Source ${nodeId} marked as verified (now)`));
  } else {
    console.log(chalk.red(`Node ${nodeId} not found in aurora_nodes`));
  }

  await closePool();
}
```

Skapa `src/commands/aurora-freshness.ts` — rapport över freshness:

```typescript
import chalk from 'chalk';
import { getFreshnessReport } from '../aurora/freshness.js';
import { closePool, isDbAvailable } from '../core/db.js';

export async function auroraFreshnessCommand(options: {
  stale?: boolean;
  limit?: string;
}): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const limit = parseInt(options.limit ?? '20', 10);
  const report = await getFreshnessReport({
    onlyStale: options.stale ?? false,
    limit,
  });

  console.log(chalk.bold(`\nAurora Source Freshness Report`));
  console.log(`${'—'.repeat(50)}\n`);

  if (report.length === 0) {
    console.log(chalk.green('All sources are fresh!'));
  } else {
    for (const item of report) {
      const statusIcon = {
        fresh: chalk.green('FRESH'),
        aging: chalk.yellow('AGING'),
        stale: chalk.red('STALE'),
        unverified: chalk.gray('UNVERIFIED'),
      }[item.status];

      const days = item.daysSinceVerified != null
        ? `${item.daysSinceVerified}d ago`
        : 'never';

      console.log(
        `  ${statusIcon} [${item.freshnessScore.toFixed(2)}] ` +
        `${item.title} (${item.type}, verified: ${days})`,
      );
    }
  }

  console.log(`\n  Total: ${report.length} sources\n`);
  await closePool();
}
```

Registrera i `src/cli.ts`:

```typescript
// aurora:verify <node-id>
program
  .command('aurora:verify <nodeId>')
  .description('Mark an Aurora source as verified')
  .action(async (nodeId: string) => {
    const { auroraVerifyCommand } = await import('./commands/aurora-verify.js');
    await auroraVerifyCommand(nodeId);
  });

// aurora:freshness
program
  .command('aurora:freshness')
  .description('Show freshness report for Aurora sources')
  .option('--stale', 'Only show stale/unverified sources')
  .option('--limit <n>', 'Max sources to show', '20')
  .action(async (options) => {
    const { auroraFreshnessCommand } = await import('./commands/aurora-freshness.js');
    await auroraFreshnessCommand(options);
  });
```

### 5. MCP-tool: aurora_verify_source

I `src/core/mcp/server.ts`, lägg till ett nytt tool:

```typescript
{
  name: 'aurora_verify_source',
  description: 'Mark an Aurora source node as verified (updates last_verified timestamp)',
  input_schema: {
    type: 'object',
    properties: {
      node_id: { type: 'string', description: 'The Aurora node ID to verify' },
    },
    required: ['node_id'],
  },
}
```

Handler:

```typescript
case 'aurora_verify_source': {
  const { verifySource } = await import('../../aurora/freshness.js');
  const nodeId = input.node_id as string;
  const updated = await verifySource(nodeId);
  return {
    content: [{
      type: 'text',
      text: updated
        ? `Source ${nodeId} marked as verified`
        : `Node ${nodeId} not found`,
    }],
  };
}
```

Lägg även till `aurora_freshness_report`:

```typescript
{
  name: 'aurora_freshness_report',
  description: 'Get freshness report for Aurora sources — shows which need re-verification',
  input_schema: {
    type: 'object',
    properties: {
      only_stale: { type: 'boolean', description: 'Only show stale/unverified' },
      limit: { type: 'number', description: 'Max sources (default 20)' },
    },
  },
}
```

Handler:

```typescript
case 'aurora_freshness_report': {
  const { getFreshnessReport } = await import('../../aurora/freshness.js');
  const report = await getFreshnessReport({
    onlyStale: (input.only_stale as boolean) ?? false,
    limit: (input.limit as number) ?? 20,
  });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(report, null, 2),
    }],
  };
}
```

### 6. Tester

**`tests/aurora/freshness.test.ts`** — ny testfil:

- `calculateFreshnessScore()` — aldrig verifierad → 0
- `calculateFreshnessScore()` — verifierad idag → 1.0
- `calculateFreshnessScore()` — verifierad för 45 dagar sedan → ~0.5
- `calculateFreshnessScore()` — verifierad för 90+ dagar sedan → 0
- `freshnessStatus()` — korrekt status för varje intervall
- `freshnessStatus()` — null → 'unverified'
- `verifySource()` — uppdaterar last_verified i Postgres (mock)
- `verifySource()` — returnerar false för okänt nodeId (mock)
- `getFreshnessReport()` — returnerar sorterad lista (mock)
- `getFreshnessReport({ onlyStale: true })` — filtrerar bort fresh (mock)

**`tests/commands/aurora-freshness.test.ts`** — CLI-tester:
- `aurora:verify` visar bekräftelse
- `aurora:verify` visar fel vid okänt id
- `aurora:freshness` visar rapport
- `aurora:freshness --stale` filtrerar

**`tests/aurora/briefing-freshness.test.ts`** — briefing med freshness:
- `briefing()` inkluderar freshnessScore och freshnessStatus i fakta
- Fakta med status 'stale' flaggas korrekt

**Alla befintliga 1391 tester ska passera oförändrade.**

## Avgränsningar

- **Freshness score är tidbaserad** — vi kontrollerar inte om en URL fortfarande
  är online (det kan läggas till senare som "URL health check")
- **Manuell verifiering** — användaren/MCP markerar sources som verifierade,
  ingen automatisk re-verifiering
- **Max age 90 dagar** — linjär nedgång från 1.0 till 0.0 över 90 dagar.
  Konfigurerbart via parameter, inte hårdkodat
- **Briefing-uppdatering är additivt** — nya fält, befintliga tester ska
  inte brytas (default-värden om DB saknas)

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Verifiera en källa
npx tsx src/cli.ts aurora:verify <node-id>
# Förväntat: "Source <id> marked as verified (now)"

# Freshness-rapport
npx tsx src/cli.ts aurora:freshness
# Förväntat: lista med alla noder, sorterade efter freshness

# Bara stale
npx tsx src/cli.ts aurora:freshness --stale
# Förväntat: bara unverified/stale noder

# Briefing med freshness
npx tsx src/cli.ts aurora:briefing "TypeScript"
# Förväntat: fakta med freshness-varning för overifierade källor
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| Migration 006 skapar last_verified-kolumn | `db-migrate` + kolla schema |
| `verifySource()` uppdaterar last_verified | Enhetstest |
| `verifySource()` returnerar false för okänt id | Enhetstest |
| `calculateFreshnessScore()` korrekt beräkning | Enhetstest |
| `freshnessStatus()` korrekt kategorisering | Enhetstest |
| `getFreshnessReport()` sorterar och filtrerar | Enhetstest |
| CLI `aurora:verify` visar bekräftelse | Enhetstest |
| CLI `aurora:freshness` visar rapport | Enhetstest |
| `briefing()` inkluderar freshness-info | Enhetstest |
| MCP `aurora_verify_source` fungerar | Enhetstest |
| MCP `aurora_freshness_report` fungerar | Enhetstest |
| Befintliga 1391 tester passerar | `pnpm test` |

## Risk

**Låg.** Additivt — nya fält och ny kolumn utan att ändra befintlig logik:

1. **Migration är additivt** — `ADD COLUMN IF NOT EXISTS`, ingen dataförlust
2. **Briefing-uppdatering additivt** — nya fält med default-värden
3. **Try/catch runt DB-anrop** — freshness-info är en bonus, inte ett krav
4. **Inga ändringar i befintlig confidence decay** — freshness score är separat
5. **Nya CLI-kommandon och MCP-tools** — inget som ändrar befintligt beteende

**Rollback:** `git revert <commit>` + `ALTER TABLE aurora_nodes DROP COLUMN last_verified`
