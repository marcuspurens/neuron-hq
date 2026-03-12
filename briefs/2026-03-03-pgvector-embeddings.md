# Brief: D2 — pgvector Embeddings

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-03-pgvector-embeddings.md --hours 1
```

## Bakgrund

D1 (session 60–61) lade till Postgres med 8 tabeller. Knowledge graph, audit, runs och
kostnader finns nu i riktiga tabeller med index. Men all sökning är fortfarande
keyword-baserad:

- `findNodes()` matchar exakt substring i titel + properties
- `graph_query` kräver att agenten vet rätt sökord
- Consolidator jämför Jaccard-likhet på ordmängder (missar synonymer)
- Historian hittar inte att "context overflow" och "token limit exceeded" är samma problem

Neuron HQ har 122 kunskapsnoder, 77 kanter och 16 534 audit-entries i Postgres.
Med pgvector kan vi söka *semantiskt* — hitta relaterade koncept utan exakta sökord.

## Problem

1. **Keyword-barriären** — agenter måste gissa rätt sökord. "Minneshantering" hittar
   inte "context window management" trots att de handlar om samma sak
2. **Consolidator missar dubbletter** — Jaccard-likhet baseras på ordöverlapp, inte
   betydelse. "retry-logik vid API-fel" och "automatisk omsändning vid nätverksfel"
   har låg ordöverlapp men hög semantisk likhet
3. **Cross-type-kopplingar** — en teknik från forskning (technique) kan lösa ett
   fel (error), men keyword-sökning hittar inte kopplingen
4. **Historian skriver dubbletter** — utan semantisk sökning skapas nya noder
   för koncept som redan finns under annat namn

## Lösning

Lägg till pgvector-extension i Postgres. Generera embeddings för alla
kunskapsnoder med Ollama `snowflake-arctic-embed` (768 dimensioner, kör lokalt,
ingen extra API-kostnad). Exponera som `graph_semantic_search`-verktyg för agenter.

**Varför Ollama?** Redan installerat för Aurora. snowflake-arctic-embed är
snabb (< 50ms per embedding) och gratis. Ingen ny API-nyckel behövs.

## Uppgifter

### 1. Aktivera pgvector i Postgres

Skapa migrering `src/core/migrations/002_pgvector.sql`:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to knowledge graph nodes
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_kg_nodes_embedding
  ON kg_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

768 dimensioner matchar snowflake-arctic-embed output.
HNSW-index ger snabb approximate nearest neighbor (vs brute-force).

### 2. Skapa embedding-klient (`src/core/embeddings.ts`)

```typescript
import { isDbAvailable } from './db.js';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimension: number;
}

/**
 * Ollama-baserad embedding via HTTP API.
 * Kräver: ollama pull snowflake-arctic-embed
 */
export class OllamaEmbedding implements EmbeddingProvider {
  readonly dimension = 768;
  private baseUrl: string;
  private model: string;

  constructor(
    baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434',
    model = process.env.OLLAMA_MODEL_EMBED || 'snowflake-arctic-embed'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`);
    const data = await resp.json();
    return data.embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!resp.ok) throw new Error(`Ollama embed batch failed: ${resp.status}`);
    const data = await resp.json();
    return data.embeddings;
  }
}

/**
 * Check if embedding provider is available.
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  if (!(await isDbAvailable())) return false;
  try {
    const provider = getEmbeddingProvider();
    const result = await provider.embed('test');
    return result.length === provider.dimension;
  } catch {
    return false;
  }
}

let cachedProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) {
    cachedProvider = new OllamaEmbedding();
  }
  return cachedProvider;
}
```

### 3. Skapa semantisk sökning (`src/core/semantic-search.ts`)

```typescript
import { getPool } from './db.js';
import { getEmbeddingProvider } from './embeddings.js';

export interface SemanticResult {
  id: string;
  title: string;
  type: string;
  similarity: number;
  confidence: number;
  scope: string;
}

/**
 * Find nodes semantically similar to query text.
 * Uses pgvector cosine distance on pre-computed embeddings.
 */
export async function semanticSearch(
  query: string,
  options?: {
    type?: string;
    limit?: number;
    minSimilarity?: number;
    scope?: string;
  }
): Promise<SemanticResult[]> {
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const pool = getPool();

  const limit = options?.limit ?? 10;
  const minSim = options?.minSimilarity ?? 0.7;

  let sql = `
    SELECT id, title, type, confidence, scope,
           1 - (embedding <=> $1::vector) AS similarity
    FROM kg_nodes
    WHERE embedding IS NOT NULL
  `;
  const params: unknown[] = [`[${queryEmbedding.join(',')}]`];
  let paramIdx = 2;

  if (options?.type) {
    sql += ` AND type = $${paramIdx}`;
    params.push(options.type);
    paramIdx++;
  }
  if (options?.scope) {
    sql += ` AND scope = $${paramIdx}`;
    params.push(options.scope);
    paramIdx++;
  }

  sql += ` AND 1 - (embedding <=> $1::vector) >= $${paramIdx}`;
  params.push(minSim);

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIdx + 1}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Find the N most similar nodes to a given node.
 * Useful for Consolidator dedup and cross-type discovery.
 */
export async function findSimilarNodes(
  nodeId: string,
  options?: { limit?: number; minSimilarity?: number }
): Promise<SemanticResult[]> {
  const pool = getPool();
  const limit = options?.limit ?? 5;
  const minSim = options?.minSimilarity ?? 0.8;

  const result = await pool.query(
    `
    SELECT b.id, b.title, b.type, b.confidence, b.scope,
           1 - (a.embedding <=> b.embedding) AS similarity
    FROM kg_nodes a, kg_nodes b
    WHERE a.id = $1
      AND b.id != $1
      AND a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND 1 - (a.embedding <=> b.embedding) >= $2
    ORDER BY a.embedding <=> b.embedding
    LIMIT $3
    `,
    [nodeId, minSim, limit]
  );
  return result.rows;
}
```

### 4. Generera embeddings för befintliga noder

Skapa CLI-kommando `embed-nodes` i `src/commands/embed-nodes.ts`:

```typescript
// npx tsx src/cli.ts embed-nodes
// Läser alla kg_nodes utan embedding, genererar och sparar
// Batch-processar 10 noder åt gången
// Visar progress: "Embedded 50/122 nodes..."
// Idempotent: skippar noder som redan har embedding
```

Text som embeddas per nod: `"${node.type}: ${node.title}. ${JSON.stringify(node.properties)}"`

### 5. Auto-embed vid skrivning

Uppdatera `knowledge-graph.ts`:

```typescript
// I addNode(): efter dual-write till DB, generera embedding
// if (await isEmbeddingAvailable()) {
//   const provider = getEmbeddingProvider();
//   const text = `${node.type}: ${node.title}. ${JSON.stringify(node.properties)}`;
//   const embedding = await provider.embed(text);
//   await pool.query('UPDATE kg_nodes SET embedding = $1 WHERE id = $2',
//     [`[${embedding.join(',')}]`, node.id]);
// }

// I updateNode(): regenerera embedding om title eller properties ändras
```

Graceful: om Ollama inte svarar, logga varning och fortsätt utan embedding.

### 6. Nytt agent-verktyg: `graph_semantic_search`

Lägg till i `src/core/graph-tools.ts`:

```typescript
// Tool: graph_semantic_search
// Input: { query: string, type?: string, limit?: number }
// Output: Lista av liknande noder med similarity score
//
// Tillgänglig för: Historian, Librarian, Consolidator, Manager
// Kräver: pgvector + Ollama
// Fallback: om inte tillgänglig, returnera tom lista med meddelande
```

Registrera i alla agenter som redan har `graph_query`:
historian, librarian, consolidator, manager, researcher, reviewer.

### 7. Förbättra Consolidator med semantisk dedup

Uppdatera `src/core/agents/consolidator.ts`:

```typescript
// I find_duplicate_candidates():
// 1. Befintlig Jaccard-logik (behåll som baseline)
// 2. NY: om embedding tillgänglig, kör findSimilarNodes() per nod
// 3. Kombinera: union av Jaccard-kandidater + vektor-kandidater
// 4. Rapportera: "Found via keyword: X, via semantic: Y, both: Z"
```

### 8. Uppdatera Historian med dedup-check

Uppdatera historian-verktygslogik:

```typescript
// Innan add_node, kör semanticSearch med nodens titel
// Om similarity > 0.9: varna "Very similar node exists: <title> (similarity: 0.95)"
// Om similarity > 0.8: informera "Related nodes found: ..."
// Historian kan välja att uppdatera befintlig nod istället
```

### 9. Registrera CLI-kommando

I `src/cli.ts`, lägg till:

```typescript
// embed-nodes — generera embeddings för alla noder utan embedding
```

### 10. Tester

**Nya tester:**

- `tests/core/embeddings.test.ts`:
  - `OllamaEmbedding.embed` returnerar array med rätt dimension (mock)
  - `embedBatch` returnerar rätt antal arrays
  - `isEmbeddingAvailable` returnerar false utan Ollama (graceful)
  - Korrekt URL-konstruktion

- `tests/core/semantic-search.test.ts`:
  - `semanticSearch` returnerar sorterade resultat
  - Filter på type fungerar
  - Filter på scope fungerar
  - `minSimilarity` filtrerar bort låg likhet
  - `findSimilarNodes` exkluderar sig själv
  - Tomt resultat om inga embeddings finns

- `tests/core/graph-tools-semantic.test.ts`:
  - `graph_semantic_search` verktyg returnerar resultat
  - Fallback: returnerar meddelande om embedding ej tillgänglig
  - Integration med befintliga graph-tools

- `tests/core/consolidator-semantic.test.ts`:
  - Semantisk dedup hittar kandidater som Jaccard missar
  - Kombination av Jaccard + vektor
  - Graceful utan embeddings (bara Jaccard)

- `tests/commands/embed-nodes.test.ts`:
  - Idempotent: skippar noder med befintlig embedding
  - Progress-rapportering
  - Batch-processing

**Viktigt:** Alla tester som kräver Ollama/pgvector ska använda
`test.skipIf(...)` guard — inte misslyckas. Mocka Ollama-svar i enhetstester.

Befintliga 886 tester ska passera oavsett om Ollama/pgvector kör.

## Avgränsningar

- Inga embeddings för audit_entries (för många, 16k+ — kan läggas till senare)
- Ingen RAG-pipeline med chunking (noderna är redan korta texter)
- Ingen embedding-cache i minnet (pgvector är tillräckligt snabbt)
- Ingen ändring av befintliga agent-prompts (verktygen läggs till automatiskt)
- Ingen embedding av markdown-filerna (runs.md, patterns.md etc.)
- Ingen re-ranking (cosine similarity räcker för 122 noder)

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering efter körning

```bash
# Kör migrering (lägger till embedding-kolumn)
npx tsx src/cli.ts db-migrate

# Generera embeddings för alla noder
npx tsx src/cli.ts embed-nodes

# Verifiera
psql neuron -c "SELECT count(*) FROM kg_nodes WHERE embedding IS NOT NULL;"
# Förväntat: 122 (alla noder)
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `002_pgvector.sql` skapar extension + kolumn + index | SQL-test |
| `embeddings.ts` med OllamaEmbedding-klass | Fil existerar + enhetstest |
| `semantic-search.ts` med semanticSearch + findSimilarNodes | Enhetstest |
| `graph_semantic_search` verktyg tillgängligt för agenter | Enhetstest |
| `embed-nodes` CLI-kommando fungerar | Enhetstest |
| Auto-embed vid addNode | Enhetstest |
| Consolidator använder vektor-dedup | Enhetstest |
| Historian kollar semantisk likhet innan ny nod | Enhetstest |
| Graceful fallback utan Ollama/pgvector | Enhetstest |
| 886 befintliga tester passerar | `pnpm test` |

## Risk

**Medium.** Lägger till pgvector + Ollama-beroende, men risken mildras av:

1. **Graceful fallback** — `isEmbeddingAvailable()` gör att allt funkar utan
   Ollama/pgvector. Keyword-sökning fungerar som förut.
2. **Ingen ändring av befintlig logik** — additivt (ny kolumn, nya funktioner,
   nytt verktyg). Befintlig keyword-sökning behålls.
3. **Testad idempotens** — embed-nodes kan köras flera gånger
4. **Lokal modell** — ingen extern API, ingen extra kostnad, ingen latens

**Rollback:** `git revert <commit>` + `psql neuron -c "DROP EXTENSION vector CASCADE;"`

## Förberedelse (manuellt innan körning)

pgvector-extension och Ollama embedding-modell måste vara installerade:

```bash
# pgvector (macOS)
brew install pgvector

# Ladda extension i Postgres
psql neuron -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Ollama embedding-modell (om ej redan installerad)
ollama pull snowflake-arctic-embed
```
