# Brief: B4 — Cross-ref-integritet

## Bakgrund

Cross-refs kopplar Neuron KG (`kg_nodes`) med Aurora KG (`aurora_nodes`) via
tabellen `cross_refs` (migration 005). B2 skapade auto cross-ref vid ingest.
Men kopplingarna har tre problem:

1. Consolidator mergar noder utan att uppdatera cross-refs i Postgres
2. När en Neuron-nods confidence sjunker under 0.5 vet Aurora inget om det
3. Cross-refs saknar kontext (varför kopplingen finns)

## Uppgifter

### 1. Migration 007: context + strength på cross_refs

Skapa `src/core/migrations/007_cross_ref_integrity.sql`:

```sql
-- Migration 007: Cross-ref integrity — context and strength columns

ALTER TABLE cross_refs
  ADD COLUMN IF NOT EXISTS context TEXT,
  ADD COLUMN IF NOT EXISTS strength REAL;

-- Populate strength from existing similarity for existing rows
UPDATE cross_refs SET strength = similarity WHERE strength IS NULL AND similarity IS NOT NULL;

COMMENT ON COLUMN cross_refs.context IS 'Why this cross-ref exists (auto-generated or manual)';
COMMENT ON COLUMN cross_refs.strength IS 'Connection strength 0-1 (may differ from initial similarity)';
```

- `context` — kort text som förklarar kopplingen (t.ex. "auto-ingest match",
  "historian discovery", "manual cross-ref")
- `strength` — kopplingsstryka 0-1 som kan uppdateras separat från
  `similarity` (som är den initiala söksimilariteten)

### 2. Cross-ref-överföring vid node-merge

I `src/core/graph-merge.ts`, efter att noder mergats i JSON-grafen, uppdatera
cross-refs i Postgres.

Skapa en funktion `transferCrossRefs()` i `src/aurora/cross-ref.ts`:

```typescript
/**
 * Överför cross-refs från en borttagen nod till en överlevande nod.
 * Hanterar dubbletter via ON CONFLICT — uppdaterar strength till max av de två.
 * Anropas av Consolidator efter node-merge.
 *
 * @param removedNodeId - noden som tas bort
 * @param keptNodeId - noden som behålls
 * @param side - 'neuron' om det är Neuron-noder som mergas, 'aurora' om Aurora
 * @returns antal överförda cross-refs
 */
export async function transferCrossRefs(
  removedNodeId: string,
  keptNodeId: string,
  side: 'neuron' | 'aurora',
): Promise<number> {
  const pool = getPool();
  const column = side === 'neuron' ? 'neuron_node_id' : 'aurora_node_id';

  // Flytta cross-refs: removed → kept
  // ON CONFLICT: behåll den starkare kopplingen
  const result = await pool.query(`
    UPDATE cross_refs
    SET ${column} = $1,
        context = COALESCE(context, '') || ' [transferred from merge]'
    WHERE ${column} = $2
    AND NOT EXISTS (
      SELECT 1 FROM cross_refs cr2
      WHERE cr2.${column} = $1
        AND cr2.${side === 'neuron' ? 'aurora_node_id' : 'neuron_node_id'} =
            cross_refs.${side === 'neuron' ? 'aurora_node_id' : 'neuron_node_id'}
        AND cr2.relationship = cross_refs.relationship
    )
  `, [keptNodeId, removedNodeId]);

  // Ta bort eventuella kvarvarande dubbletter (som hade ON CONFLICT)
  await pool.query(`
    DELETE FROM cross_refs WHERE ${column} = $1
  `, [removedNodeId]);

  return result.rowCount ?? 0;
}
```

Integrera i `graph-merge.ts` — i `mergeNodes()`, efter att JSON-grafen
uppdaterats (runt rad 135), anropa:

```typescript
try {
  const { transferCrossRefs } = await import('../aurora/cross-ref.js');
  const { isDbAvailable } = await import('./db.js');
  if (await isDbAvailable()) {
    await transferCrossRefs(validated.removeNodeId, validated.keepNodeId, 'neuron');
  }
} catch {
  // DB might not be available — merge still succeeds
}
```

**Wrap i try/catch** — cross-ref-överföring ska aldrig blockera en merge.

### 3. Confidence-koppling: flagga Aurora-noder

Skapa en funktion `checkCrossRefIntegrity()` i `src/aurora/cross-ref.ts`:

```typescript
export interface IntegrityIssue {
  crossRefId: number;
  neuronNodeId: string;
  neuronTitle: string;
  neuronConfidence: number;
  auroraNodeId: string;
  auroraTitle: string;
  issue: 'low_confidence' | 'stale_neuron' | 'orphaned';
}

/**
 * Hittar cross-refs som pekar på Neuron-noder med confidence < threshold.
 * Används av briefing och freshness-rapport för att varna.
 */
export async function checkCrossRefIntegrity(options?: {
  confidenceThreshold?: number;
  limit?: number;
}): Promise<IntegrityIssue[]> {
  const pool = getPool();
  const threshold = options?.confidenceThreshold ?? 0.5;
  const limit = options?.limit ?? 20;

  const { rows } = await pool.query(`
    SELECT cr.id, cr.neuron_node_id, cr.aurora_node_id, cr.relationship,
           kn.title AS neuron_title, kn.confidence AS neuron_confidence,
           an.title AS aurora_title
    FROM cross_refs cr
    JOIN kg_nodes kn ON kn.id = cr.neuron_node_id
    JOIN aurora_nodes an ON an.id = cr.aurora_node_id
    WHERE kn.confidence < $1
    ORDER BY kn.confidence ASC
    LIMIT $2
  `, [threshold, limit]);

  return rows.map((row: Record<string, unknown>) => ({
    crossRefId: row.id as number,
    neuronNodeId: row.neuron_node_id as string,
    neuronTitle: row.neuron_title as string,
    neuronConfidence: row.neuron_confidence as number,
    auroraNodeId: row.aurora_node_id as string,
    auroraTitle: row.aurora_title as string,
    issue: 'low_confidence' as const,
  }));
}
```

### 4. Uppdatera createCrossRef med context

Uppdatera `createCrossRef()` i `src/aurora/cross-ref.ts` att acceptera
`context` och `strength`:

```typescript
export async function createCrossRef(
  neuronNodeId: string,
  auroraNodeId: string,
  relationship: string,
  similarity: number,
  metadata?: Record<string, unknown>,
  context?: string,        // NY parameter
  strength?: number,       // NY parameter
): Promise<void> {
  const pool = getPool();
  await pool.query(`
    INSERT INTO cross_refs (neuron_node_id, aurora_node_id, relationship, similarity, metadata, context, strength)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (neuron_node_id, aurora_node_id, relationship)
    DO UPDATE SET similarity = $4, metadata = $5, context = COALESCE($6, cross_refs.context),
                  strength = COALESCE($7, cross_refs.strength)
  `, [neuronNodeId, auroraNodeId, relationship, similarity,
      JSON.stringify(metadata ?? {}), context ?? null, strength ?? similarity]);
}
```

Uppdatera alla anropare att skicka med context:
- `intake.ts` auto cross-ref → `context: 'auto-ingest'`
- `youtube.ts` auto cross-ref → `context: 'auto-ingest-youtube'`
- Historian `graph_cross_ref` → `context: 'historian-discovery'`
- MCP `neuron_cross_ref` → `context: 'manual-mcp'`

### 5. Integrera integritetskoll i briefing

I `src/aurora/briefing.ts`, efter befintlig cross-ref-hämtning, lägg till
integritetskoll:

```typescript
// Kolla integriteten på cross-refs
let integrityIssues: IntegrityIssue[] = [];
try {
  integrityIssues = await checkCrossRefIntegrity({ limit: 5 });
} catch {
  // DB might not be available
}
```

Lägg till i `BriefingResult`:

```typescript
integrityIssues: Array<{
  neuronTitle: string;
  neuronConfidence: number;
  auroraTitle: string;
  issue: string;
}>;
```

I CLI-outputen (`aurora-briefing.ts`), visa integritetsproblem som varning:

```
⚠️ Integritetsproblem (2):
  → Neuron "strict-mode" (confidence 0.3) kopplad till "TS Best Practices"
  → Neuron "old-pattern" (confidence 0.1) kopplad till "Code Review Notes"
```

### 6. CLI-kommando: aurora:integrity

Skapa `src/commands/aurora-integrity.ts`:

```typescript
import chalk from 'chalk';
import { checkCrossRefIntegrity } from '../aurora/cross-ref.js';
import { closePool, isDbAvailable } from '../core/db.js';

export async function auroraIntegrityCommand(options: {
  threshold?: string;
  limit?: string;
}): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const threshold = parseFloat(options.threshold ?? '0.5');
  const limit = parseInt(options.limit ?? '20', 10);

  const issues = await checkCrossRefIntegrity({
    confidenceThreshold: threshold,
    limit,
  });

  console.log(chalk.bold('\nCross-ref Integrity Report'));
  console.log(`${'—'.repeat(50)}\n`);

  if (issues.length === 0) {
    console.log(chalk.green('All cross-refs are healthy!'));
  } else {
    for (const issue of issues) {
      console.log(
        `  ${chalk.red('⚠')} Neuron "${issue.neuronTitle}" ` +
        `(confidence ${issue.neuronConfidence.toFixed(2)}) → ` +
        `Aurora "${issue.auroraTitle}"`
      );
    }
    console.log(`\n  ${chalk.yellow(`${issues.length} issue(s) found`)}`);
    console.log(`  Threshold: confidence < ${threshold}\n`);
  }

  await closePool();
}
```

Registrera i `src/cli.ts`:

```typescript
program
  .command('aurora:integrity')
  .description('Check cross-ref integrity — find weak Neuron connections')
  .option('--threshold <n>', 'Confidence threshold (default 0.5)')
  .option('--limit <n>', 'Max issues to show (default 20)')
  .action(async (options) => {
    const { auroraIntegrityCommand } = await import('./commands/aurora-integrity.js');
    await auroraIntegrityCommand(options);
  });
```

### 7. MCP-tool: aurora_cross_ref_integrity

I MCP-servern, lägg till nytt tool:

```typescript
{
  name: 'aurora_cross_ref_integrity',
  description: 'Check integrity of cross-references — finds Neuron nodes with low confidence linked to Aurora docs',
  input_schema: {
    type: 'object',
    properties: {
      confidence_threshold: { type: 'number', description: 'Flag below this (default 0.5)' },
      limit: { type: 'number', description: 'Max issues (default 20)' },
    },
  },
}
```

Handler anropar `checkCrossRefIntegrity()` och returnerar JSON.

### 8. Tester

**`tests/aurora/cross-ref-integrity.test.ts`** — ny testfil:

- `transferCrossRefs()` — överför cross-refs från borttagen nod (mock DB)
- `transferCrossRefs()` — hanterar dubbletter korrekt
- `transferCrossRefs()` — returnerar 0 om inga cross-refs finns
- `checkCrossRefIntegrity()` — hittar cross-refs med låg Neuron-confidence
- `checkCrossRefIntegrity()` — returnerar tom lista om alla > threshold
- `checkCrossRefIntegrity()` — respekterar limit-parameter
- `createCrossRef()` — sparar context och strength
- `createCrossRef()` — uppdaterar context vid ON CONFLICT

**`tests/commands/aurora-integrity.test.ts`** — CLI-tester:
- Visar integritetsproblem
- Visar "All healthy" vid inga problem
- Respekterar --threshold parameter

**`tests/aurora/briefing-integrity.test.ts`** — briefing med integritet:
- `briefing()` inkluderar integrityIssues
- CLI visar varningar för integrity issues

**Alla befintliga 1416 tester ska passera oförändrade.**

## Avgränsningar

- **Bara Neuron → Aurora-riktning** — kollar bara om Neuron-noder har låg
  confidence. Aurora → Neuron-riktning (om Aurora-nod försvinner) hanteras
  inte i denna brief.
- **Manuell integritetskoll** — ingen automatisk trigger. Briefing och CLI
  kollar vid anrop, inte som background-jobb.
- **Transfer vid merge bara för Neuron-sidan** — Consolidator mergar bara
  `kg_nodes`, inte `aurora_nodes`. Anrop med `side: 'neuron'`.
- **Context är fritext** — ingen Zod-validering, bara en beskrivande sträng.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| Migration 007 lägger till context + strength | `db-migrate` + kolla schema |
| `transferCrossRefs()` överför vid merge | Enhetstest |
| `transferCrossRefs()` hanterar dubbletter | Enhetstest |
| `checkCrossRefIntegrity()` hittar låg confidence | Enhetstest |
| `createCrossRef()` sparar context + strength | Enhetstest |
| Intake auto cross-ref skickar context | Enhetstest eller greppa koden |
| CLI `aurora:integrity` visar rapport | Enhetstest |
| MCP `aurora_cross_ref_integrity` fungerar | Enhetstest |
| `briefing()` inkluderar integrityIssues | Enhetstest |
| Befintliga 1416 tester passerar | `pnpm test` |

## Risk

**Låg-Medium.** Bredare än tidigare briefs — modifierar `createCrossRef()` och
`graph-merge.ts` som har befintliga anropare:

1. **createCrossRef() ändras** — nya parametrar är optionella, befintliga
   anropare påverkas inte
2. **graph-merge.ts ändras** — transfer i try/catch, merge funkar utan DB
3. **Migration är additivt** — nya kolumner, ingen dataförlust
4. **Briefing-uppdatering additivt** — nytt fält, default tom lista

**Rollback:** `git revert <commit>` + `ALTER TABLE cross_refs DROP COLUMN context, DROP COLUMN strength`
