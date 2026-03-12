# TD-14: Batch UPDATE i autoEmbedAuroraNodes

## Bakgrund

`autoEmbedAuroraNodes()` i `src/aurora/aurora-graph.ts` (rad 318–357) har samma N+1-mönster som TD-4 fixade i `saveAuroraGraphToDb()`. Embeddings hämtas korrekt i batch via `provider.embedBatch()`, men därefter körs en individuell `UPDATE aurora_nodes SET embedding = $1 WHERE id = $2` per nod i en loop (rad 344–349).

Vid 100 noder = 100 separata UPDATE-queries. Bör vara 1 query med en VALUES-approach.

## Nuvarande kod (problemet)

```typescript
const embeddings = await provider.embedBatch(batchTexts);
for (let j = 0; j < batchRows.length; j++) {
  await pool.query(
    'UPDATE aurora_nodes SET embedding = $1 WHERE id = $2',
    [`[${embeddings[j].join(',')}]`, batchRows[j].id],
  );
}
```

## Önskad lösning

Ersätt loopen med en enda batch-UPDATE via `unnest` (samma mönster som TD-4):

```typescript
const embeddings = await provider.embedBatch(batchTexts);
const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);
const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);

await pool.query(
  `UPDATE aurora_nodes AS n
   SET embedding = v.emb::vector
   FROM unnest($1::text[], $2::text[]) AS v(id, emb)
   WHERE n.id = v.id`,
  [ids, vectors],
);
```

## Uppgifter

### 1. Refaktorera `autoEmbedAuroraNodes()` i `src/aurora/aurora-graph.ts`

- Ersätt per-nod UPDATE-loopen med en batch-UPDATE per batch (max 20 noder per batch behålls)
- Behåll batch-storleken på 20 (begränsning från embedding-providern)
- Behåll try/catch-strukturen per batch
- Behåll den yttre try/catch som fångar övergripande fel

### 2. Tester

**Enhetstester (i befintlig `tests/aurora/aurora-batch-embed.test.ts` eller ny fil):**
- Batch med 1 nod → 1 UPDATE-query (inte loop)
- Batch med 20 noder → 1 UPDATE-query
- Batch med 25 noder → 2 UPDATE-queries (20 + 5)
- Tom lista → ingen query
- Embedding-fel i en batch → övriga batchar fortsätter
- Verifiera att `pool.query` anropas med `unnest`-syntax (inte per-nod)

## Avgränsningar

- Ändra INTE embedding-logiken (provider.embedBatch, batch-storlek 20)
- Ändra INTE SELECT-queryn som hämtar noder utan embedding
- Ändra INTE andra funktioner i aurora-graph.ts

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| Loopen `for (let j = 0; ...)` borta ur `autoEmbedAuroraNodes` | Grep: ingen per-nod UPDATE-loop |
| Batch-UPDATE med unnest eller VALUES-syntax | Grep: `unnest` eller `VALUES` i funktionen |
| Alla befintliga tester gröna | `pnpm test` |
| ≥4 nya/uppdaterade tester | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |

## Risk

**Låg.** Samma mönster som TD-4 (bevisat fungerande). Embedding-data skrivs bara till `aurora_nodes.embedding` — ingen annan funktionalitet påverkas.

**Rollback:** Revertera commiten.
