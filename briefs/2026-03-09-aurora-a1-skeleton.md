# Brief: A1 — Aurora-skelett och delad infrastruktur

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a1-skeleton.md --hours 2
```

## Bakgrund

Neuron HQ v2 blir en unified platform med två separata kunskapsminnen:

- **Neuron-minne** (`kg_nodes`/`kg_edges`) — agentmönster, fel, tekniker, körningshistorik.
  Skrivs av Historian, Librarian, Consolidator.
- **Aurora-minne** (`aurora_nodes`/`aurora_edges`) — dokument, transkriptioner, fakta,
  preferenser, research, röstprofiler. Skrivs av IntakeAgent, ResearchAgent och användaren via MCP.

Båda minnena ska dela samma infrastruktur: PostgreSQL med pgvector, Ollama
snowflake-arctic-embed (1024 dimensioner), confidence decay, semantisk sökning.

Denna brief skapar grundskelettet — databas-tabeller, Zod-scheman, CRUD-funktioner
och CLI-kommando. Inga agenter eller intake-pipelines ännu — bara infrastrukturen.

## Problem

1. **Aurora är en separat Python-kodbas** — duplicerad infrastruktur, annat språk,
   annat minnessystem. Underhållsbörda.
2. **Auroras minne raderas efter 30 dagar** — TTL-baserad expiry istället för
   Neurons confidence decay. Minnen försvinner.
3. **Auroras sökning är SQL LIKE** — keyword-matchning istället för semantisk sökning.
4. **Ingen gemensam plattform** — två MCP-servrar, två databaser, två kodbasrar.

## Lösning

Skapa `src/aurora/` som en modul i Neuron HQ med Aurora-specifika tabeller i
samma Postgres-databas. Generalisera befintliga funktioner (`semanticSearch`,
`applyConfidenceDecay`) så de fungerar mot båda tabellerna.

## Uppgifter

### 1. Databasmigrering (`src/core/migrations/003_aurora.sql`)

```sql
-- Aurora knowledge graph nodes
CREATE TABLE IF NOT EXISTS aurora_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'document', 'transcript', 'fact', 'preference', 'research', 'voice_print'
  )),
  title TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  scope TEXT DEFAULT 'personal',
  source_url TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedding vector(1024)
);

CREATE INDEX IF NOT EXISTS idx_aurora_nodes_type ON aurora_nodes(type);
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_scope ON aurora_nodes(scope);
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_confidence ON aurora_nodes(confidence);
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_embedding
  ON aurora_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Aurora knowledge graph edges
CREATE TABLE IF NOT EXISTS aurora_edges (
  id SERIAL PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES aurora_nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES aurora_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'related_to', 'derived_from', 'references', 'contradicts', 'supports'
  )),
  metadata JSONB DEFAULT '{}',
  UNIQUE(from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS idx_aurora_edges_from ON aurora_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_to ON aurora_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_type ON aurora_edges(type);
```

**Notera:** `aurora_nodes` har `source_url TEXT` (Neurons `kg_nodes` har inte det)
och `scope` defaultar till `'personal'` istället för `'unknown'`.

### 2. Aurora Zod-scheman (`src/aurora/aurora-schema.ts`)

```typescript
import { z } from 'zod';

export const AuroraNodeTypeSchema = z.enum([
  'document',
  'transcript',
  'fact',
  'preference',
  'research',
  'voice_print',
]);
export type AuroraNodeType = z.infer<typeof AuroraNodeTypeSchema>;

export const AuroraScopeSchema = z.enum(['personal', 'shared', 'project']);
export type AuroraScope = z.infer<typeof AuroraScopeSchema>;

export const AuroraEdgeTypeSchema = z.enum([
  'related_to',
  'derived_from',
  'references',
  'contradicts',
  'supports',
]);
export type AuroraEdgeType = z.infer<typeof AuroraEdgeTypeSchema>;

export const AuroraNodeSchema = z.object({
  id: z.string().min(1),
  type: AuroraNodeTypeSchema,
  title: z.string().min(1),
  properties: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  scope: AuroraScopeSchema.default('personal'),
  sourceUrl: z.string().nullish(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
});
export type AuroraNode = z.infer<typeof AuroraNodeSchema>;

export const AuroraEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: AuroraEdgeTypeSchema,
  metadata: z.object({
    createdBy: z.string().optional(),
    timestamp: z.string().optional(),
  }).passthrough().default({}),
});
export type AuroraEdge = z.infer<typeof AuroraEdgeSchema>;

export const AuroraGraphSchema = z.object({
  nodes: z.array(AuroraNodeSchema),
  edges: z.array(AuroraEdgeSchema),
  lastUpdated: z.string().datetime(),
});
export type AuroraGraph = z.infer<typeof AuroraGraphSchema>;
```

### 3. Aurora CRUD-funktioner (`src/aurora/aurora-graph.ts`)

Skapa CRUD-funktioner som speglar `knowledge-graph.ts` men arbetar mot
`aurora_nodes`/`aurora_edges`:

```typescript
// Core CRUD — speglar knowledge-graph.ts men med aurora-tabeller
export function addAuroraNode(graph: AuroraGraph, node: AuroraNode): AuroraGraph;
export function addAuroraEdge(graph: AuroraGraph, edge: AuroraEdge): AuroraGraph;
export function findAuroraNodes(graph: AuroraGraph, filter: {
  type?: AuroraNodeType;
  query?: string;
  scope?: AuroraScope;
}): AuroraNode[];
export function updateAuroraNode(graph: AuroraGraph, id: string, updates: Partial<Pick<AuroraNode, 'confidence' | 'properties' | 'title'>>): AuroraGraph;
export function removeAuroraNode(graph: AuroraGraph, id: string): AuroraGraph;

// Confidence decay — samma logik som Neurons applyConfidenceDecay
export function applyAuroraConfidenceDecay(graph: AuroraGraph, options?: {
  inactiveDays?: number;  // default 20
  decayFactor?: number;   // default 0.9
}): AuroraGraph;

// Traverse — BFS genom aurora_edges
export function traverseAurora(graph: AuroraGraph, startId: string, edgeType?: AuroraEdgeType, depth?: number): AuroraNode[];

// Load/Save — dual-write (JSON + Postgres)
export async function loadAuroraGraph(filePath?: string): Promise<AuroraGraph>;
export async function saveAuroraGraph(graph: AuroraGraph, filePath?: string): Promise<void>;

// DB-specifika funktioner
export async function loadAuroraGraphFromDb(): Promise<AuroraGraph | null>;
export async function saveAuroraGraphToDb(graph: AuroraGraph): Promise<void>;
export async function autoEmbedAuroraNodes(nodeIds: string[]): Promise<void>;
```

**Viktigt:** `saveAuroraGraph` ska dual-write till `aurora/graph.json` + Postgres,
precis som `saveGraph` gör för `memory/graph.json` + kg_nodes. Auto-embed via
Ollama efter sparning (non-fatal om Ollama inte svarar).

### 4. Generalisera semantisk sökning (`src/core/semantic-search.ts`)

Uppdatera `semanticSearch()` och `findSimilarNodes()` att ta en `table`-parameter:

```typescript
export async function semanticSearch(
  query: string,
  options?: {
    type?: string;
    limit?: number;
    minSimilarity?: number;
    scope?: string;
    table?: 'kg_nodes' | 'aurora_nodes';  // ny parameter, default 'kg_nodes'
  }
): Promise<SemanticResult[]>;

export async function findSimilarNodes(
  nodeId: string,
  options?: {
    limit?: number;
    minSimilarity?: number;
    table?: 'kg_nodes' | 'aurora_nodes';  // ny parameter, default 'kg_nodes'
  }
): Promise<SemanticResult[]>;
```

SQL-frågan byter bara tabellnamn. **OBS:** Använd ALDRIG string interpolation för
tabellnamn i SQL — validera att `table` är exakt `'kg_nodes'` eller `'aurora_nodes'`
via en allowlist/whitelist innan SQL-konstruktion.

### 5. Aurora-katalogstruktur

```
src/aurora/
  aurora-schema.ts     — Zod-scheman (nod, kant, graf)
  aurora-graph.ts      — CRUD + load/save + dual-write + auto-embed + decay
  index.ts             — re-export av publika funktioner
aurora/
  graph.json           — JSON-backup av Aurora-grafen (skapas vid första save)
```

### 6. CLI-kommando: `aurora:status`

Lägg till i `src/commands/aurora-status.ts`:

```typescript
// npx tsx src/cli.ts aurora:status
// Visar:
// - Antal aurora_nodes per typ (document: X, fact: Y, ...)
// - Antal aurora_edges per typ
// - Embedding-täckning (X/Y noder har embedding)
// - Senaste noden (titel + created)
// - Confidence-distribution (stale < 0.1: X, aktiva > 0.5: Y)
```

Registrera i `src/cli.ts` som `program.command('aurora:status')`.

### 7. MCP-tool: `aurora_status`

Lägg till i `src/mcp/tools/aurora-status.ts`:

```typescript
// Tool: aurora_status
// Input: inga parametrar
// Output: JSON med samma info som CLI aurora:status
// Registreras i src/mcp/server.ts
```

### 8. Tester

**Nya testfiler:**

- `tests/aurora/aurora-schema.test.ts`:
  - AuroraNodeSchema validerar korrekt
  - AuroraEdgeSchema validerar korrekt
  - Avvisar ogiltiga typer
  - Default-värden fungerar (scope='personal', confidence=0.5)

- `tests/aurora/aurora-graph.test.ts`:
  - `addAuroraNode` — lägger till nod, kastar vid duplikat
  - `addAuroraEdge` — lägger till kant, kastar om nod saknas
  - `findAuroraNodes` — filtrerar på type, query, scope
  - `updateAuroraNode` — uppdaterar confidence/properties/title
  - `removeAuroraNode` — tar bort nod + kanter
  - `applyAuroraConfidenceDecay` — minskar confidence, markerar stale
  - `traverseAurora` — BFS-traversering med djupbegränsning
  - `loadAuroraGraph`/`saveAuroraGraph` — JSON round-trip
  - `saveAuroraGraphToDb` — Postgres upsert (mock DB)
  - `autoEmbedAuroraNodes` — genererar embeddings (mock Ollama)

- `tests/core/semantic-search.test.ts` (uppdatera befintlig):
  - Testa `table: 'aurora_nodes'` parameter
  - Verifiera SQL-injection-skydd (bara allowlistade tabellnamn)

- `tests/commands/aurora-status.test.ts`:
  - CLI-output innehåller rätt sektioner
  - Hanterar tom databas gracefully

**Alla befintliga 984 tester ska passera oförändrade.**

## Avgränsningar

- **Inga agenter** — IntakeAgent, ResearchAgent, ReportAgent skapas i A6
- **Ingen intake-pipeline** — URL/YouTube/dokument-intake skapas i A2
- **Ingen ask-pipeline** — sökning + svar skapas i A3
- **Ingen Python-worker-bridge** — skapas i A2
- **Ingen migrering av befintlig Aurora-data** — skapas i A8
- **Inga ändringar i befintliga agent-prompts** — additivt, inget befintligt ändras
- **Ingen ändring av kg_nodes/kg_edges** — Neuron-minnet är oförändrat

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering efter körning

```bash
# Kör migrering (skapar aurora-tabeller)
npx tsx src/cli.ts db-migrate

# Verifiera tabeller
psql neuron -c "SELECT count(*) FROM aurora_nodes;"
# Förväntat: 0 (inga noder ännu)

psql neuron -c "\d aurora_nodes"
# Förväntat: alla kolumner inklusive embedding vector(1024)

# Testa CLI
npx tsx src/cli.ts aurora:status
# Förväntat: "Aurora Knowledge Graph: 0 nodes, 0 edges"
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `003_aurora.sql` skapar aurora_nodes + aurora_edges + index | SQL-test |
| `aurora-schema.ts` med AuroraNodeSchema + AuroraEdgeSchema + AuroraGraphSchema | Enhetstest |
| `aurora-graph.ts` med alla CRUD-funktioner | Enhetstest |
| `applyAuroraConfidenceDecay` minskar confidence korrekt | Enhetstest |
| `saveAuroraGraph` dual-write (JSON + Postgres) | Enhetstest |
| `autoEmbedAuroraNodes` genererar embeddings | Enhetstest (mock) |
| `semanticSearch` fungerar med `table: 'aurora_nodes'` | Enhetstest |
| SQL-injection-skydd i tabellnamn-parameter | Enhetstest |
| CLI `aurora:status` visar korrekt info | Enhetstest |
| MCP-tool `aurora_status` returnerar JSON | Enhetstest |
| 984 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Helt additivt:

1. **Nya tabeller** — påverkar inte befintliga `kg_nodes`/`kg_edges`
2. **Nya filer** — `src/aurora/` är en ny katalog, inget befintligt ändras
3. **Minimal ändring av befintlig kod** — bara `semantic-search.ts` får en ny parameter
4. **Graceful fallback** — allt fungerar utan Postgres/Ollama

**Rollback:** `git revert <commit>` + `psql neuron -c "DROP TABLE aurora_edges; DROP TABLE aurora_nodes;"`

## Förberedelse (manuellt innan körning)

Postgres och pgvector ska redan vara installerade (från D1/D2). Kontrollera:

```bash
psql neuron -c "SELECT 1;"
# Ska lyckas

psql neuron -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
# Ska visa version (t.ex. 0.8.0)
```
