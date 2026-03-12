# Brief: A7 — Cross-referens mellan Neuron och Aurora

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a7-cross-reference.md --hours 2
```

## Bakgrund

Neuron HQ har nu två separata kunskapsgrafer:
- **Neuron KG** (`kg_nodes`/`kg_edges`) — mönster, fel, tekniker från kodkörningar
- **Aurora KG** (`aurora_nodes`/`aurora_edges`) — dokument, fakta, preferenser från användaren

Båda lever i samma Postgres-databas med pgvector-embeddings (1024 dim).
`semanticSearch()` i `semantic-search.ts` kan redan söka i båda via `table`-parametern.

Men det finns ingen koppling mellan dem. Om Aurora vet att "TypeScript strict mode
förhindrar typfel" och Neuron har ett mönster "strict-mode-enforcement" — vet ingen
att de hör ihop.

## Problem

1. **Ingen koppling** — de två graferna lever helt isolerade
2. **Historian ser bara Neuron** — efter en körning kollar Historian inte om Aurora har relaterad forskning
3. **Ingen unified search** — MCP-användare måste söka i varje graf separat
4. **Ingen cross-ref-lagring** — det finns ingen plats att spara kopplingar mellan graferna

## Lösning

Tre delar: en Postgres-tabell för korsreferenser, en sökfunktion som söker båda
graferna, och Historian-integration som automatiskt hittar kopplingar efter körningar.

## Uppgifter

### 1. Postgres-migration: `cross_refs`-tabell

**`src/core/migrations/004_cross_refs.sql`:**

```sql
-- Cross-references between Neuron KG and Aurora KG
CREATE TABLE IF NOT EXISTS cross_refs (
  id SERIAL PRIMARY KEY,
  neuron_node_id TEXT NOT NULL REFERENCES kg_nodes(id),
  aurora_node_id TEXT NOT NULL REFERENCES aurora_nodes(id),
  relationship TEXT NOT NULL CHECK (relationship IN (
    'supports',      -- Aurora-forskning stödjer Neuron-mönster
    'contradicts',   -- Aurora-fakta motsäger Neuron-teknik
    'enriches',      -- Aurora-dokument berikar Neuron-kontext
    'discovered_via' -- Neuron-körning ledde till Aurora-insikt
  )),
  similarity REAL,           -- cosine similarity vid upptäckt
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(neuron_node_id, aurora_node_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_cross_refs_neuron ON cross_refs(neuron_node_id);
CREATE INDEX IF NOT EXISTS idx_cross_refs_aurora ON cross_refs(aurora_node_id);
```

Lägg till i `src/core/migrate.ts` migrations-listan.

### 2. Cross-referens-modul (`src/aurora/cross-ref.ts`)

```typescript
export interface CrossRef {
  id: number;
  neuronNodeId: string;
  auroraNodeId: string;
  relationship: 'supports' | 'contradicts' | 'enriches' | 'discovered_via';
  similarity: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CrossRefMatch {
  /** Noden från den andra grafen. */
  node: { id: string; title: string; type: string; confidence: number };
  /** Vilken graf noden tillhör. */
  source: 'neuron' | 'aurora';
  /** Similarity score. */
  similarity: number;
  /** Befintlig cross-ref om den redan finns. */
  existingRef?: CrossRef;
}

export interface UnifiedSearchOptions {
  /** Max antal resultat totalt. Default: 10. */
  limit?: number;
  /** Minimum similarity. Default: 0.3. */
  minSimilarity?: number;
  /** Filtrera på nodtyp (typ från antingen Neuron eller Aurora). */
  type?: string;
}

export interface UnifiedSearchResult {
  /** Resultat från Neuron KG. */
  neuronResults: CrossRefMatch[];
  /** Resultat från Aurora KG. */
  auroraResults: CrossRefMatch[];
  /** Befintliga cross-refs för resultatnoderna. */
  crossRefs: CrossRef[];
}

/**
 * Sök i båda kunskapsgraferna samtidigt.
 * Returnerar resultat från båda graferna, sorterade efter similarity.
 */
export async function unifiedSearch(
  query: string,
  options?: UnifiedSearchOptions,
): Promise<UnifiedSearchResult>;

/**
 * Skapa en cross-referens mellan en Neuron-nod och en Aurora-nod.
 */
export async function createCrossRef(
  neuronNodeId: string,
  auroraNodeId: string,
  relationship: CrossRef['relationship'],
  similarity?: number,
  metadata?: Record<string, unknown>,
): Promise<CrossRef>;

/**
 * Hämta alla cross-refs för en specifik nod (oavsett vilken graf).
 */
export async function getCrossRefs(
  nodeId: string,
): Promise<CrossRef[]>;

/**
 * Hitta Aurora-noder som är relevanta för en Neuron-nod.
 * Söker semantiskt och returnerar kandidater.
 * Skapar INTE cross-refs — det gör anroparen.
 */
export async function findAuroraMatchesForNeuron(
  neuronNodeId: string,
  options?: { limit?: number; minSimilarity?: number },
): Promise<CrossRefMatch[]>;

/**
 * Hitta Neuron-noder som är relevanta för en Aurora-nod.
 */
export async function findNeuronMatchesForAurora(
  auroraNodeId: string,
  options?: { limit?: number; minSimilarity?: number },
): Promise<CrossRefMatch[]>;
```

**Implementering:**

- `unifiedSearch()`: Kör `semanticSearch(query, { table: 'kg_nodes' })` och
  `semanticSearch(query, { table: 'aurora_nodes' })` parallellt. Slå ihop resultaten.
  Hämta befintliga cross-refs för alla resultatnoder. Returnera.

- `createCrossRef()`: INSERT i `cross_refs`-tabellen. ON CONFLICT → uppdatera
  similarity + metadata.

- `getCrossRefs()`: SELECT från `cross_refs` WHERE neuron_node_id = $1 OR aurora_node_id = $1.

- `findAuroraMatchesForNeuron()`: Hämta Neuron-nodens embedding från `kg_nodes`.
  Kör cosine-similarity mot `aurora_nodes.embedding`. Returnera top-N.
  Kräver direkt SQL (inte `semanticSearch`) eftersom vi söker med en befintlig
  embedding, inte en textfråga.

  ```sql
  SELECT id, title, type, confidence,
         1 - (embedding <=> (SELECT embedding FROM kg_nodes WHERE id = $1)) AS similarity
  FROM aurora_nodes
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> (SELECT embedding FROM kg_nodes WHERE id = $1)
  LIMIT $2
  ```

- `findNeuronMatchesForAurora()`: Samma men omvänt — Aurora-embedding mot kg_nodes.

### 3. Historian-integration

Utöka Historian med ett nytt tool: `graph_cross_ref`.

**I `src/core/agents/graph-tools.ts`**, lägg till:

```typescript
// Tool: graph_cross_ref
// Input: { neuron_node_id: string, relationship?: string }
// Output: JSON array of aurora nodes that are semantically similar
// Side effect: Creates cross_refs for matches with similarity >= 0.7
```

**Implementering:**

1. I `executeGraphTool()`, lägg till case `'graph_cross_ref'`.
2. Anropa `findAuroraMatchesForNeuron(neuronNodeId, { limit: 5, minSimilarity: 0.5 })`.
3. För varje match med similarity >= 0.7:
   - Skapa cross-ref via `createCrossRef()` med relationship `'enriches'`
     (eller `relationship` om angivet).
4. Returnera JSON med matcherna (inkl. vilka som fick cross-refs).

**I Historian-prompten** (`prompts/historian.md`), lägg till instruktion:

```
## Cross-referens med Aurora

Efter att du har skapat eller uppdaterat noder i kunskapsgrafen, använd
`graph_cross_ref` för att kontrollera om Aurora-kunskapsbasen har relaterad
information. Detta kopplar ihop vad vi lär oss från körningar med vad
användaren har forskat om.

Använd `graph_cross_ref` för:
- Nya mönster (pattern) — finns det Aurora-forskning som stödjer mönstret?
- Nya tekniker (technique) — har Aurora dokument om samma teknik?
- Nya fel (error) — finns det Aurora-fakta som förklarar felet?
```

**OBS:** `graph_cross_ref` ska läggas till i Historians `tools`-lista i
`historian.ts`. Det ska INTE läggas till för andra agenter.

### 4. MCP-tool: `neuron_cross_ref`

**`src/mcp/tools/cross-ref.ts`:**

```typescript
export function registerCrossRefTool(server: McpServer): void {
  server.tool(
    'neuron_cross_ref',
    'Search across both Neuron (code patterns) and Aurora (research/documents) knowledge graphs simultaneously. Shows connections between what was built and what was researched.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().min(1).max(50).optional().default(10)
        .describe('Max results per graph'),
      min_similarity: z.number().min(0).max(1).optional().default(0.3)
        .describe('Minimum cosine similarity'),
      type: z.string().optional()
        .describe('Filter by node type (pattern/error/technique/document/fact/etc)'),
    },
    async (args) => {
      const result = await unifiedSearch(args.query, {
        limit: args.limit,
        minSimilarity: args.min_similarity,
        type: args.type,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            neuron: result.neuronResults.map(r => ({
              id: r.node.id,
              title: r.node.title,
              type: r.node.type,
              similarity: r.similarity,
              crossRefs: r.existingRef ? [r.existingRef] : [],
            })),
            aurora: result.auroraResults.map(r => ({
              id: r.node.id,
              title: r.node.title,
              type: r.node.type,
              similarity: r.similarity,
              crossRefs: r.existingRef ? [r.existingRef] : [],
            })),
            totalCrossRefs: result.crossRefs.length,
          }, null, 2),
        }],
      };
    },
  );
}
```

Registrera i `src/mcp/server.ts`.

### 5. CLI-kommando: `aurora:cross-ref`

**`src/commands/aurora-cross-ref.ts`:**

```bash
# npx tsx src/cli.ts aurora:cross-ref "TypeScript patterns"
#
# Output:
# 🔗 Cross-Reference Search: "TypeScript patterns"
#
# Neuron KG (code patterns):
#   [0.89] pattern-042: "strict-mode-enforcement" (confidence: 0.9)
#          🔗 enriched by Aurora fact-017
#   [0.71] technique-015: "type-guard-validation" (confidence: 0.85)
#
# Aurora KG (research/documents):
#   [0.92] document-003: "TypeScript 5.0 Best Practices" (confidence: 1.0)
#          🔗 enriches Neuron pattern-042
#   [0.78] fact-017: "TypeScript strict mode prevents type errors" (confidence: 0.8)
#
# Cross-references found: 2
```

Implementering:
- Argument: `query` (required)
- Options: `--limit`, `--min-similarity`, `--type`
- Anropa `unifiedSearch()` och formatera output.
- Registrera i `src/cli.ts`.

### 6. Exportera från `src/aurora/index.ts`

Lägg till exports:
- `unifiedSearch`, `createCrossRef`, `getCrossRefs`, `findAuroraMatchesForNeuron`,
  `findNeuronMatchesForAurora` från `./cross-ref.js`
- `CrossRef`, `CrossRefMatch`, `UnifiedSearchResult`, `UnifiedSearchOptions`

### 7. Tester

**Nya testfiler:**

- `tests/aurora/cross-ref.test.ts`:
  - `unifiedSearch()` returnerar resultat från båda graferna
  - `unifiedSearch()` med `type`-filter
  - `unifiedSearch()` hanterar tom graf (ena eller båda)
  - `createCrossRef()` skapar rad i cross_refs
  - `createCrossRef()` med duplicate → uppdaterar (ON CONFLICT)
  - `getCrossRefs()` hämtar refs för Neuron-nod
  - `getCrossRefs()` hämtar refs för Aurora-nod
  - `getCrossRefs()` returnerar tom array om inga refs
  - `findAuroraMatchesForNeuron()` hittar relaterade Aurora-noder
  - `findNeuronMatchesForAurora()` hittar relaterade Neuron-noder
  - **Mock:** Mocka `semanticSearch`, Postgres-pool (pg queries)

- `tests/aurora/cross-ref-historian.test.ts`:
  - `graph_cross_ref` tool returnerar Aurora-matcher
  - `graph_cross_ref` skapar cross-refs för similarity >= 0.7
  - `graph_cross_ref` utan matcher → tom array, inga cross-refs
  - `graph_cross_ref` med custom relationship
  - **Mock:** Mocka `findAuroraMatchesForNeuron`, `createCrossRef`

- `tests/commands/aurora-cross-ref.test.ts`:
  - CLI visar resultat från båda graferna
  - `--type` filtrerar
  - Tomt resultat → tydligt meddelande

- `tests/mcp/tools/cross-ref.test.ts`:
  - MCP-tool returnerar UnifiedSearchResult-format
  - Parametrar fungerar
  - Hanterar tomt resultat

- `tests/core/migrations/cross-refs-migration.test.ts`:
  - Migration 004 skapar cross_refs-tabellen
  - Index skapas
  - UNIQUE constraint fungerar

**Alla befintliga 1318 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen automatisk cross-ref vid intake** — cross-refs skapas av Historian
  efter körningar, eller manuellt via CLI/MCP. Inte automatiskt vid `aurora:ingest`.
- **Ingen confidence-koppling** — om en Neuron-nod tappar confidence, påverkas
  inte kopplade Aurora-noder (det kan bli en framtida förbättring).
- **Historian kör cross-ref manuellt** — Historian väljer själv när den använder
  `graph_cross_ref`. Det finns inget auto-trigger.
- **Inga cross-graf-kanter i befintliga kant-tabeller** — cross-refs lever i
  egen tabell (`cross_refs`), inte i `kg_edges` eller `aurora_edges`.
  Detta undviker FK-konflikter.
- **Max 5 matcher per cross-ref-sökning** — begränsar Postgres-last.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Kör migration
npx tsx src/cli.ts db-migrate

# Unified search
npx tsx src/cli.ts aurora:cross-ref "TypeScript"
# Förväntat: resultat från båda graferna (om noder finns)

# Efter en körning med Historian
# Förväntat: Historian använder graph_cross_ref och loggar kopplingar
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| Migration 004 skapar `cross_refs`-tabell | Enhetstest |
| `unifiedSearch()` söker i båda graferna parallellt | Enhetstest (mock) |
| `unifiedSearch()` filtrerar på typ | Enhetstest |
| `createCrossRef()` skapar/uppdaterar cross-ref | Enhetstest (mock) |
| `getCrossRefs()` hämtar refs för en nod | Enhetstest |
| `findAuroraMatchesForNeuron()` hittar relaterade noder | Enhetstest (mock) |
| `findNeuronMatchesForAurora()` hittar relaterade noder | Enhetstest (mock) |
| `graph_cross_ref` tool fungerar i Historian | Enhetstest (mock) |
| `graph_cross_ref` skapar cross-refs vid similarity >= 0.7 | Enhetstest |
| CLI `aurora:cross-ref` visar resultat | Enhetstest |
| MCP `neuron_cross_ref` returnerar korrekt format | Enhetstest |
| 1318 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Helt additivt:

1. **Ny tabell** — `cross_refs` — påverkar inte befintliga tabeller
2. **Ny modul** — `cross-ref.ts` — inga ändringar i befintlig Aurora- eller Neuron-kod
3. **Historian-tillägg** — nytt tool `graph_cross_ref` — befintliga tools oförändrade
4. **Historian-prompt** — tillägg, inte omskrivning
5. **Postgres-beroende** — cross-ref-funktioner kräver Postgres (som redan krävs för embeddings)

**Rollback:** `git revert <commit>` + `DROP TABLE IF EXISTS cross_refs;`
