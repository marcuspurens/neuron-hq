# Brief: A1.1 — Aurora-härdning (search, batch, decay)

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a1-hardening.md --hours 2
```

## Bakgrund

A1-skelettet (körning 96, `e1552d8`) levererade Aurora-infrastrukturen: tabeller,
Zod-scheman, CRUD, dual-write, CLI och MCP. Tre förbättringar identifierades som
höjer robusthet och avblockerar A2/A3:

1. **Aurora search MCP-tool** — utan den kan Claude Desktop inte söka i Aurora-minnet
2. **Batch embeddings** — `embedBatch()` finns i interfacet men används inte, auto-embed loopar en och en
3. **Transaction-safe decay** — confidence decay i Postgres utan atomicitetsgaranti

## Problem

1. **Ingen sök-tool i MCP** — `aurora_status` visar statistik, men det finns inget
   `aurora_search`-tool som låter Claude söka semantiskt i Aurora-noder
2. **Långsam embedding** — `autoEmbedAuroraNodes` och `autoEmbedNodes` (i `knowledge-graph.ts`)
   anropar `embed()` en nod i taget. Vid 100 noder = 100 roundtrips till Ollama
3. **Decay utan transaktion** — `applyAuroraConfidenceDecay` är en ren funktion, men
   vid DB-skrivning kan en crash lämna noder i inkonsistent tillstånd

## Uppgifter

### 1. MCP-tool: `aurora_search` (`src/mcp/tools/aurora-search.ts`)

Skapa en MCP-tool som speglar `knowledge.ts`-mönstret men söker i `aurora_nodes`.

```typescript
// Tool: aurora_search
// Input:
//   query: string (required) — söktext
//   type: enum (optional) — document | transcript | fact | preference | research | voice_print
//   scope: enum (optional) — personal | shared | project
//   limit: number (optional, default 10, max 50)
// Output: JSON-array med { id, title, type, similarity, confidence, scope, properties }

export function registerAuroraSearchTool(server: McpServer): void {
  server.tool(
    'aurora_search',
    'Semantic search over Aurora knowledge graph (documents, facts, preferences, research). Returns nodes ranked by similarity.',
    {
      query: z.string().min(1).describe('Search text — will be embedded and matched against Aurora nodes'),
      type: z.enum(['document', 'transcript', 'fact', 'preference', 'research', 'voice_print'])
        .optional().describe('Filter by node type'),
      scope: z.enum(['personal', 'shared', 'project'])
        .optional().describe('Filter by scope'),
      limit: z.number().min(1).max(50).optional().default(10)
        .describe('Max results to return'),
    },
    async (args) => {
      // Anropa semanticSearch(args.query, { table: 'aurora_nodes', type: args.type, scope: args.scope, limit: args.limit })
      // Fallback: om Postgres/embeddings inte finns, använd findAuroraNodes med keyword-matchning
      // Returnera { content: [{ type: 'text', text: JSON.stringify(results) }] }
    },
  );
}
```

Registrera i `src/mcp/server.ts` via `registerAuroraSearchTool(server)`.

**Fallback-beteende:** Om `semanticSearch` kastar (ingen Postgres/Ollama), falla tillbaka
till `findAuroraNodes(graph, { type, query, scope })` med keyword-matchning — samma
mönster som `knowledge.ts` använder.

### 2. Batch embeddings i auto-embed (`src/aurora/aurora-graph.ts` + `src/core/knowledge-graph.ts`)

Uppdatera `autoEmbedAuroraNodes` och `autoEmbedNodes` att använda `embedBatch()`
istället för att loopa `embed()`.

**I `src/aurora/aurora-graph.ts`:**

```typescript
export async function autoEmbedAuroraNodes(nodeIds: string[]): Promise<void> {
  // Nuvarande: for-loop med embed(text) en i taget
  // Nytt: samla alla texter, anropa embedBatch(texts), uppdatera DB i en batch
  //
  // Steg:
  // 1. Hämta noder utan embedding från DB (WHERE id = ANY($1) AND embedding IS NULL)
  // 2. Bygg texter: `${node.title} ${JSON.stringify(node.properties)}`
  // 3. Anropa provider.embedBatch(texts) — en enda roundtrip
  // 4. UPDATE aurora_nodes SET embedding = $2 WHERE id = $1 (loop, men DB-operationer är snabba)
  //
  // Batchstorlek: max 20 per anrop (för att inte överbelasta Ollama)
  // Hanterar: tomt array → return tidigt
  // Non-fatal: try/catch, logga warning vid fel
}
```

**I `src/core/knowledge-graph.ts`:**

Samma refaktor för `autoEmbedNodes()` — byt från `embed()` loop till `embedBatch()`.
Batchstorlek 20. Bevara non-fatal beteende.

**OBS:** `embedBatch()` finns redan i `EmbeddingProvider`-interfacet och `OllamaEmbedding`.
Ingen ändring behövs i `embeddings.ts`.

### 3. Transaction-safe decay (`src/core/migrations/004_decay_function.sql`)

Skapa en PL/pgSQL-funktion som utför confidence decay atomiskt:

```sql
-- Migration 004: Atomic confidence decay function
CREATE OR REPLACE FUNCTION decay_confidence(
  target_table TEXT,
  inactive_days INTEGER DEFAULT 20,
  decay_factor REAL DEFAULT 0.9
) RETURNS TABLE(updated_count INTEGER, avg_before REAL, avg_after REAL) AS $$
DECLARE
  v_updated INTEGER;
  v_avg_before REAL;
  v_avg_after REAL;
BEGIN
  -- Validera tabellnamn (SQL-injection-skydd)
  IF target_table NOT IN ('kg_nodes', 'aurora_nodes') THEN
    RAISE EXCEPTION 'Invalid table name: %', target_table;
  END IF;

  -- Beräkna genomsnitt före
  EXECUTE format('SELECT COALESCE(AVG(confidence), 0) FROM %I WHERE updated < NOW() - make_interval(days => $1)', target_table)
    INTO v_avg_before USING inactive_days;

  -- Uppdatera confidence atomiskt
  EXECUTE format('
    UPDATE %I
    SET confidence = confidence * $1,
        updated = NOW()
    WHERE updated < NOW() - make_interval(days => $2)
      AND confidence > 0.01
    ', target_table)
    USING decay_factor, inactive_days;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Beräkna genomsnitt efter
  EXECUTE format('SELECT COALESCE(AVG(confidence), 0) FROM %I WHERE updated >= NOW() - interval ''1 minute''', target_table)
    INTO v_avg_after;

  RETURN QUERY SELECT v_updated, v_avg_before, v_avg_after;
END;
$$ LANGUAGE plpgsql;
```

**Användning från TypeScript:**

```typescript
// I aurora-graph.ts eller knowledge-graph.ts:
const result = await db.query(
  'SELECT * FROM decay_confidence($1, $2, $3)',
  [tableName, inactiveDays, decayFactor]
);
// result.rows[0] = { updated_count: 5, avg_before: 0.7, avg_after: 0.63 }
```

Registrera migrerningen i `src/core/db.ts` (eller `migrate.ts`, var den nu hanteras).

### 4. CLI-kommando: `aurora:decay` (`src/commands/aurora-decay.ts`)

```typescript
// npx tsx src/cli.ts aurora:decay
// npx tsx src/cli.ts aurora:decay --dry-run
// npx tsx src/cli.ts aurora:decay --days 30 --factor 0.85
//
// Output:
// Aurora Confidence Decay
// ─────────────────────────
// Nodes affected: 5
// Avg confidence before: 0.70
// Avg confidence after:  0.63
// Decay factor: 0.90
// Inactive threshold: 20 days
//
// --dry-run visar vad SOM SKULLE hända utan att ändra data:
// SELECT count(*) FROM aurora_nodes WHERE updated < NOW() - interval '20 days' AND confidence > 0.01
```

Registrera i `src/cli.ts` som `program.command('aurora:decay')`.

### 5. Tester

**Nya testfiler:**

- `tests/mcp/tools/aurora-search.test.ts`:
  - Returnerar semantiska resultat
  - Filtrerar på type och scope
  - Fallback till keyword-matchning vid DB-fel
  - Hanterar tom databas
  - Begränsar limit till max 50

- `tests/aurora/aurora-batch-embed.test.ts`:
  - `autoEmbedAuroraNodes` anropar `embedBatch` istället för `embed`
  - Batchstorlek max 20
  - Tomt array → ingen anrop
  - Non-fatal vid Ollama-fel
  - Alla noder får korrekt embedding

- `tests/core/knowledge-graph-batch-embed.test.ts`:
  - `autoEmbedNodes` använder `embedBatch`
  - Samma batchstorlek och felhantering

- `tests/core/decay-function.test.ts`:
  - PL/pgSQL-funktionen validerar tabellnamn
  - Returnerar korrekt statistik
  - Decay appliceras bara på inaktiva noder
  - Noder med confidence < 0.01 ignoreras

- `tests/commands/aurora-decay.test.ts`:
  - CLI-output innehåller rätt sektioner
  - `--dry-run` ändrar ingen data
  - `--days` och `--factor` parametrar fungerar

**Alla befintliga 1050 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen ny Aurora-funktionalitet** — bara härdning av A1-skelettet
- **Inga ändringar i befintliga MCP-tools** — `neuron_knowledge` och `aurora_status` oförändrade
- **Ingen ändring av scheman** — `aurora-schema.ts` oförändrad
- **Ingen ändring av CRUD-funktioner** — bara auto-embed och decay uppdateras
- **Ingen soft-delete** — övervägs men skjuts till A4

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Kör migrering (skapar decay-funktion)
npx tsx src/cli.ts db-migrate

# Testa decay-funktion i SQL
psql neuron -c "SELECT * FROM decay_confidence('aurora_nodes', 20, 0.9);"
# Förväntat: updated_count=0 (inga noder ännu)

# Testa aurora:decay CLI
npx tsx src/cli.ts aurora:decay --dry-run
# Förväntat: "Nodes affected: 0"

# Testa MCP aurora_search (via Claude Desktop)
# Sökning utan noder ska returnera tom array
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `aurora_search` MCP-tool finns och returnerar resultat | Enhetstest |
| `aurora_search` faller tillbaka till keyword vid DB-fel | Enhetstest |
| `autoEmbedAuroraNodes` använder `embedBatch` | Enhetstest |
| `autoEmbedNodes` (KG) använder `embedBatch` | Enhetstest |
| Batchstorlek max 20 per anrop | Enhetstest |
| `004_decay_function.sql` skapar PL/pgSQL-funktion | SQL-test |
| `decay_confidence()` validerar tabellnamn | Enhetstest |
| `decay_confidence()` returnerar statistik | Enhetstest |
| `aurora:decay` CLI fungerar med `--dry-run` | Enhetstest |
| 1050 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Mest additivt:

1. **Ny MCP-tool** — `aurora_search` påverkar inte befintliga tools
2. **Batch-refaktor** — ändrar `autoEmbedAuroraNodes` och `autoEmbedNodes`, men beteendet
   är identiskt (bara snabbare). Non-fatal felhantering bevaras.
3. **Ny migration** — skapar en funktion, ändrar inga tabeller
4. **Graceful fallback** — allt fungerar utan Postgres/Ollama

**Rollback:** `git revert <commit>` + `psql neuron -c "DROP FUNCTION IF EXISTS decay_confidence;"`
