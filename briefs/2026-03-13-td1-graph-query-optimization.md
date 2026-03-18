# TD-1: Graf-query-optimering — eliminera N+1 och lägg till index

## Bakgrund

Neuron HQ har fixat batch-operationer i `saveAuroraGraphToDb` (TD-4), `autoEmbedAuroraNodes` (TD-14) och `autoEmbedNodes` (TD-15). Men tre produktionsfiler har kvar N+1-mönster som gör en query per iteration istället för en enda batch-query. Dessutom saknas composite-index för vanliga filtreringsmönster.

### Nuläge — N+1-problem

| Fil | Rad | Problem | Anrop per körning |
|-----|-----|---------|-------------------|
| `src/aurora/briefing.ts` | 125-142 | `SELECT last_verified` i for-loop per fact | ~10 |
| `src/aurora/cross-ref.ts` | 118-123 | `getCrossRefs(nodeId)` i for-loop | ~20 |
| `src/core/knowledge-graph.ts` | 214-222 | `DELETE FROM kg_edges` i for-loop | ~50 |
| `src/core/knowledge-graph.ts` | 225-233 | `INSERT INTO kg_edges` i for-loop | ~50 |
| `src/core/knowledge-graph.ts` | 237-241 | `DELETE FROM kg_nodes` i for-loop | ~100 |

### Nuläge — saknade index

Tabellerna `kg_edges`, `aurora_edges`, `confidence_audit` och `run_statistics` saknar composite-index för vanliga query-mönster.

## Uppgifter

### 1. Batch freshness-lookup i `briefing.ts` (hög prioritet)

Ersätt for-loopen (rad 125-142) med en enda batch-query:

```typescript
// FÖRE: N queries
for (const fact of facts) {
  const { rows } = await pool.query(
    'SELECT last_verified FROM aurora_nodes WHERE id = $1',
    [fact.nodeId],
  );
}

// EFTER: 1 query
const nodeIds = facts.map(f => f.nodeId);
const { rows } = await pool.query(
  'SELECT id, last_verified FROM aurora_nodes WHERE id = ANY($1::text[])',
  [nodeIds],
);
const freshnessMap = new Map(rows.map(r => [r.id, r.last_verified]));
for (const fact of facts) {
  const lastVerified = freshnessMap.get(fact.nodeId)
    ? new Date(freshnessMap.get(fact.nodeId))
    : null;
  fact.freshnessScore = calculateFreshnessScore(lastVerified);
  fact.freshnessStatus = freshnessStatus(fact.freshnessScore, lastVerified);
}
```

Behåll try/catch med samma fallback (defaults 0, 'unverified').

### 2. Batch cross-ref-lookup i `cross-ref.ts` (hög prioritet)

Lägg till en ny funktion `getCrossRefsBatch` och använd den i `unifiedSearch`:

```typescript
// Ny funktion
export async function getCrossRefsBatch(nodeIds: string[]): Promise<Map<string, CrossRef[]>> {
  if (nodeIds.length === 0) return new Map();
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM cross_refs WHERE neuron_node_id = ANY($1::text[]) OR aurora_node_id = ANY($1::text[])',
    [nodeIds],
  );
  const map = new Map<string, CrossRef[]>();
  for (const row of result.rows) {
    const ref = rowToCrossRef(row);
    for (const id of nodeIds) {
      if (row.neuron_node_id === id || row.aurora_node_id === id) {
        const existing = map.get(id) ?? [];
        existing.push(ref);
        map.set(id, existing);
      }
    }
  }
  return map;
}
```

Ersätt sedan for-loopen (rad 118-123) med:

```typescript
const crossRefsByNode = await getCrossRefsBatch(allNodeIds);
const allCrossRefs = [...new Set([...crossRefsByNode.values()].flat())];
```

### 3. Batch edge- och nod-operationer i `knowledge-graph.ts` (medel prioritet)

#### 3a. Batch DELETE edges (rad 214-222)

Ersätt for-loopen med samma UNNEST-mönster som redan används i `aurora-graph.ts`:

```typescript
// Samla edges att ta bort
const edgesToDelete = existingEdges.filter(
  row => !graphEdgeKeys.has(`${row.from_id}|${row.to_id}|${row.type}`)
);
if (edgesToDelete.length > 0) {
  const froms = edgesToDelete.map(r => r.from_id);
  const tos = edgesToDelete.map(r => r.to_id);
  const types = edgesToDelete.map(r => r.type);
  await client.query(
    `DELETE FROM kg_edges WHERE (from_id, to_id, type) IN (
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     )`,
    [froms, tos, types],
  );
}
```

#### 3b. Batch UPSERT edges (rad 225-233)

Ersätt for-loopen med multi-row INSERT:

```typescript
if (graph.edges.length > 0) {
  const froms = graph.edges.map(e => e.from);
  const tos = graph.edges.map(e => e.to);
  const types = graph.edges.map(e => e.type);
  const metas = graph.edges.map(e => JSON.stringify(e.metadata));
  await client.query(
    `INSERT INTO kg_edges (from_id, to_id, type, metadata)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::jsonb[])
     ON CONFLICT (from_id, to_id, type) DO UPDATE SET
       metadata = EXCLUDED.metadata`,
    [froms, tos, types, metas],
  );
}
```

#### 3c. Batch DELETE nodes (rad 237-241)

Ersätt for-loopen med:

```typescript
const nodesToDelete = existingNodes
  .filter(row => !graphNodeIds.has(row.id as string))
  .map(row => row.id);
if (nodesToDelete.length > 0) {
  await client.query(
    'DELETE FROM kg_nodes WHERE id = ANY($1::text[])',
    [nodesToDelete],
  );
}
```

### 4. Migration 010: Composite indexes (låg prioritet)

Skapa `src/db/migrations/010_composite_indexes.sql`:

```sql
-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_kg_edges_from_type ON kg_edges (from_id, type);
CREATE INDEX IF NOT EXISTS idx_kg_edges_to_type ON kg_edges (to_id, type);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_from_type ON aurora_edges (from_id, type);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_to_type ON aurora_edges (to_id, type);
CREATE INDEX IF NOT EXISTS idx_confidence_audit_created ON confidence_audit (created_at);
CREATE INDEX IF NOT EXISTS idx_run_statistics_dim_ts ON run_statistics (dimension, updated_at);
```

### 5. Tester

Uppdatera eller lägg till tester som verifierar batch-beteendet:

- **`tests/aurora/briefing.test.ts`** — verifiera att freshness-enrichment fungerar med batch (mocka pool.query, kontrollera att det bara anropas EN gång för freshness)
- **`tests/aurora/cross-ref.test.ts`** — testa `getCrossRefsBatch` med 0, 1, och flera node-IDs
- **`tests/core/knowledge-graph.test.ts`** — verifiera att saveGraph gör batch-delete/upsert (kontrollera antal query-anrop)

## Avgränsningar

- Ändra INTE `getCrossRefs` (singulär) — den används på andra ställen. Lägg till `getCrossRefsBatch` som ny funktion
- Ändra INTE Aurora-grafens save-logik — den är redan optimerad (TD-4)
- Ändra INTE embedding-logik — redan optimerad (TD-14, TD-15)
- Ändra INTE `search.ts` in-memory traversering — det är inte en DB-query

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `briefing.ts` gör 1 query istället för N för freshness | Tester + kodgranskning |
| `cross-ref.ts` gör 1 query istället för N för cross-refs | Tester + kodgranskning |
| `knowledge-graph.ts` edge delete är batch | Tester + kodgranskning |
| `knowledge-graph.ts` edge upsert är batch | Tester + kodgranskning |
| `knowledge-graph.ts` node delete är batch | Tester + kodgranskning |
| Migration 010 skapar 6 composite indexes | `pnpm run db-migrate` |
| Alla 1864 befintliga tester fortfarande gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥10 nya/uppdaterade tester | `pnpm test` |

## Risk

**Låg.** Alla ändringar är funktionellt ekvivalenta — samma resultat, färre queries. Batch-mönstret är beprövat i kodbasen (TD-4, TD-14, TD-15).

**Rollback:** `git revert <commit>` + ta bort migration 010 om den körts.
