# TD-15: Batch UPDATE i autoEmbedNodes (knowledge-graph.ts)

## Bakgrund

`autoEmbedNodes()` i `src/core/knowledge-graph.ts` (rad 280–294) har exakt samma N+1-mönster som TD-14 fixade i `autoEmbedAuroraNodes()`. Embeddings hämtas i batch via `provider.embedBatch()`, men därefter körs en individuell `UPDATE kg_nodes SET embedding = $1 WHERE id = $2` per nod i en loop (rad 285–290).

Denna funktion körs vid varje Neuron-körning (högre prioritet än TD-14 som var Aurora-specifik).

## Nuvarande kod (problemet)

```typescript
const embeddings = await provider.embedBatch(batchTexts);
for (let j = 0; j < batchRows.length; j++) {
  await pool.query(
    'UPDATE kg_nodes SET embedding = $1 WHERE id = $2',
    [`[${embeddings[j].join(',')}]`, batchRows[j].id],
  );
}
```

## Önskad lösning

Samma `unnest`-mönster som TD-14:

```typescript
const embeddings = await provider.embedBatch(batchTexts);
const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);
const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);

await pool.query(
  `UPDATE kg_nodes AS n
   SET embedding = v.emb::vector
   FROM unnest($1::text[], $2::text[]) AS v(id, emb)
   WHERE n.id = v.id`,
  [ids, vectors],
);
```

## Uppgifter

### 1. Refaktorera `autoEmbedNodes()` i `src/core/knowledge-graph.ts`

- Ersätt per-nod UPDATE-loopen med en batch-UPDATE per batch
- Behåll batch-storleken på 20
- Behåll try/catch-strukturen per batch och den yttre try/catch

### 2. Tester

Lägg till eller uppdatera tester (i befintlig testfil eller ny `tests/core/kg-batch-embed.test.ts`):
- Batch med 1 nod → 1 UPDATE-query
- Batch med 20 noder → 1 UPDATE-query
- Batch med 25 noder → 2 UPDATE-queries (20 + 5)
- Tom lista → ingen query
- Embedding-fel i en batch → övriga batchar fortsätter
- Verifiera att `pool.query` anropas med `unnest`-syntax

## Avgränsningar

- Ändra INTE embedding-logiken (provider.embedBatch, batch-storlek 20)
- Ändra INTE SELECT-queryn som hämtar noder utan embedding
- Ändra INTE `autoEmbedAuroraNodes` (redan fixad i TD-14)
- Ändra INTE `embed-nodes.ts` eller `db-import.ts` (engångs-CLI, lägre prio)

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| Per-nod UPDATE-loop borta ur `autoEmbedNodes` | Grep: ingen per-nod loop |
| Batch-UPDATE med unnest | Grep: `unnest` i funktionen |
| Alla befintliga tester gröna | `pnpm test` |
| ≥4 nya/uppdaterade tester | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |

## Risk

**Låg.** Identisk fix som TD-14 (redan GREEN), bara annan tabell (`kg_nodes` istället för `aurora_nodes`).

**Rollback:** Revertera commiten.
