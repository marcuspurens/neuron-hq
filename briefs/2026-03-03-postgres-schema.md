# Brief: D1 — Postgres-schema + migrering

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-03-postgres-schema.md --hours 1
```

## Bakgrund

Idag lagrar Neuron HQ all data i platta filer:

- **Knowledge graph** — `memory/graph.json` (139 KB, 750+ noder, full load/save varje gång)
- **Audit log** — `runs/<runid>/audit.jsonl` (append-only JSONL, en fil per körning)
- **Körningsdata** — `runs/<runid>/usage.json`, `metrics.json`, `manifest.json`
- **Minne** — `memory/runs.md`, `patterns.md`, `errors.md`, `techniques.md`

Det funkar med 92 körningar, men skalar inte:
- `graph.json` laddas och sparas helt varje gång (hela filen i minnet)
- Ingen cross-run-sökning i audit utan att öppna varje fil
- Kostnadsberäkning scannar alla `usage.json`-filer
- Ingen semantisk sökning (kommer i D2 med pgvector)

## Problem

1. **Knowledge graph: full load/save** — 139 KB JSON parsas och skrivs varje mutation
2. **Audit per körning** — ingen global sökbarhet
3. **Kostnader** — måste scanna alla `runs/*/usage.json` för varje costs-kommando
4. **Ingen SQL** — kan inte göra queries som "visa alla körningar med RED status"

## Lösning

Lägg till Postgres som databaslager. Behåll befintliga filer som fallback (läs om DB
inte är tillgänglig). All ny data skrivs till Postgres.

## Uppgifter

### 1. Installera dependencies

```bash
pnpm add pg
pnpm add -D @types/pg
```

### 2. Skapa databasmodul (`src/core/db.ts`)

```typescript
import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/neuron',
      max: 5,
    };
    pool = new Pool(config);
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function isDbAvailable(): Promise<boolean> {
  try {
    const p = getPool();
    const client = await p.connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}
```

Nyckel: `isDbAvailable()` gör att hela systemet funkar utan Postgres — fallback till filer.

### 3. Skapa SQL-migrering (`src/core/migrations/001_initial.sql`)

Skapa katalogen `src/core/migrations/` och filen `001_initial.sql`:

```sql
-- Neuron HQ — Initial schema

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge graph nodes
CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pattern', 'error', 'technique', 'run', 'agent')),
  title TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  scope TEXT DEFAULT 'unknown' CHECK (scope IN ('universal', 'project-specific', 'unknown')),
  model TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kg_nodes_type ON kg_nodes(type);
CREATE INDEX idx_kg_nodes_scope ON kg_nodes(scope);
CREATE INDEX idx_kg_nodes_confidence ON kg_nodes(confidence);

-- Knowledge graph edges
CREATE TABLE IF NOT EXISTS kg_edges (
  id SERIAL PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('solves', 'discovered_in', 'related_to', 'causes', 'used_by')),
  metadata JSONB DEFAULT '{}',
  UNIQUE(from_id, to_id, type)
);

CREATE INDEX idx_kg_edges_from ON kg_edges(from_id);
CREATE INDEX idx_kg_edges_to ON kg_edges(to_id);
CREATE INDEX idx_kg_edges_type ON kg_edges(type);

-- Runs
CREATE TABLE IF NOT EXISTS runs (
  runid TEXT PRIMARY KEY,
  target_name TEXT NOT NULL,
  brief_title TEXT,
  status TEXT CHECK (status IN ('running', 'green', 'yellow', 'red', 'error', 'stopped')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  model TEXT,
  workspace_branch TEXT,
  target_start_sha TEXT
);

CREATE INDEX idx_runs_target ON runs(target_name);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_started ON runs(started_at DESC);

-- Usage (token tracking per run)
CREATE TABLE IF NOT EXISTS usage (
  runid TEXT PRIMARY KEY REFERENCES runs(runid),
  model TEXT,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  by_agent JSONB DEFAULT '{}',
  tool_counts JSONB DEFAULT '{}'
);

-- Metrics per run
CREATE TABLE IF NOT EXISTS metrics (
  runid TEXT PRIMARY KEY REFERENCES runs(runid),
  duration_seconds REAL,
  tests_baseline_passed INTEGER,
  tests_baseline_failed INTEGER,
  tests_after_passed INTEGER,
  tests_after_failed INTEGER,
  tests_added INTEGER,
  insertions INTEGER,
  deletions INTEGER,
  files_new INTEGER,
  files_modified INTEGER,
  delegations_total INTEGER,
  re_delegations INTEGER,
  commands_run INTEGER,
  commands_blocked INTEGER,
  raw JSONB
);

-- Audit entries (global, all runs)
CREATE TABLE IF NOT EXISTS audit_entries (
  id SERIAL PRIMARY KEY,
  runid TEXT REFERENCES runs(runid),
  ts TIMESTAMPTZ NOT NULL,
  role TEXT NOT NULL,
  tool TEXT NOT NULL,
  allowed BOOLEAN DEFAULT true,
  input_hash TEXT,
  output_hash TEXT,
  exit_code INTEGER,
  files_touched TEXT[],
  diff_additions INTEGER,
  diff_deletions INTEGER,
  policy_event TEXT,
  note TEXT
);

CREATE INDEX idx_audit_runid ON audit_entries(runid);
CREATE INDEX idx_audit_ts ON audit_entries(ts DESC);
CREATE INDEX idx_audit_role ON audit_entries(role);
CREATE INDEX idx_audit_tool ON audit_entries(tool);
CREATE INDEX idx_audit_blocked ON audit_entries(allowed) WHERE NOT allowed;

-- Task scores
CREATE TABLE IF NOT EXISTS task_scores (
  id SERIAL PRIMARY KEY,
  runid TEXT REFERENCES runs(runid),
  task_id TEXT NOT NULL,
  description TEXT,
  iterations_used INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  commands_run INTEGER,
  commands_blocked INTEGER,
  diff_insertions INTEGER,
  diff_deletions INTEGER,
  re_delegations INTEGER,
  score_efficiency REAL,
  score_safety REAL,
  score_first_pass REAL,
  aggregate REAL,
  UNIQUE(runid, task_id)
);

CREATE INDEX idx_task_scores_runid ON task_scores(runid);
```

### 4. Skapa migreringsverktyg (`src/core/migrate.ts`)

```typescript
export async function runMigrations(pool: Pool): Promise<void> {
  // Läs alla .sql-filer i src/core/migrations/
  // Kolla vilka som redan applicerats (via migrations-tabellen)
  // Kör nya migrationer i ordning
}
```

### 5. Skapa importskript (`src/commands/db-import.ts`)

CLI-kommando: `npx tsx src/cli.ts db-import`

Importerar befintlig data:

1. **Knowledge graph**: Läs `memory/graph.json` → INSERT INTO `kg_nodes` + `kg_edges`
2. **Alla körningar**: Scanna `runs/*/` → INSERT INTO `runs` + `usage` + `metrics`
3. **Audit**: Läs alla `runs/*/audit.jsonl` → INSERT INTO `audit_entries`
4. **Task scores**: Läs alla `runs/*/task_scores.jsonl` → INSERT INTO `task_scores`

Skriptet ska vara idempotent (kör `ON CONFLICT DO NOTHING`).

### 6. Uppdatera `knowledge-graph.ts` — dual write

Ändra `loadGraph()` och `saveGraph()` att använda Postgres om tillgängligt:

```typescript
export async function loadGraph(filePath: string): Promise<KnowledgeGraph> {
  if (await isDbAvailable()) {
    return loadGraphFromDb();
  }
  // Befintlig fil-logik som fallback
  return loadGraphFromFile(filePath);
}
```

Mutationsfunktioner (`addNode`, `addEdge`, `updateNode`, `removeNode`,
`applyConfidenceDecay`) uppdateras att skriva till Postgres direkt istället för
full load → mutate → save.

**Viktigt:** Behåll `saveGraph()` till fil som backup (dual write) så att
`graph.json` alltid är synkad som säkerhetskopia.

### 7. Uppdatera `audit.ts` — dual write

```typescript
export class AuditLogger {
  async log(entry: AuditEntry): Promise<void> {
    // Alltid skriv till JSONL (befintligt)
    await this.appendToFile(entry);

    // Om Postgres tillgänglig, skriv dit också
    if (await isDbAvailable()) {
      await this.insertToDb(entry);
    }
  }
}
```

### 8. Uppdatera `costs.ts` — läs från DB om tillgänglig

```typescript
// Om DB tillgänglig: SELECT från usage + runs tabeller
// Om inte: befintlig fil-scanning (fallback)
```

### 9. Registrera CLI-kommandon

I `src/commands/index.ts`, lägg till:
- `db-import` — importera befintlig data
- `db-migrate` — kör migrationer

### 10. Uppdatera `.env.example`

Lägg till:
```
DATABASE_URL=postgresql://localhost:5432/neuron
```

### 11. Tester

**Nya tester:**

- `tests/core/db.test.ts`:
  - `isDbAvailable` returnerar false utan Postgres (graceful)
  - `getPool` skapar pool med rätt config
  - `closePool` stänger korrekt

- `tests/core/migrate.test.ts`:
  - Migrationer körs i ordning
  - Redan applicerade migrationer hoppas över
  - SQL-syntax valideras

- `tests/core/knowledge-graph-db.test.ts`:
  - `loadGraph` faller tillbaka till fil om DB inte tillgänglig
  - `addNode` skriver till DB om tillgänglig
  - `findNodes` med type-filter via SQL
  - `traverse` via SQL JOIN

- `tests/commands/db-import.test.ts`:
  - Import av graph.json → DB
  - Import av audit.jsonl → DB
  - Import av usage.json → DB
  - Idempotent (kör två gånger utan dubbletter)

**Notera:** Tester som kräver Postgres använder `isDbAvailable()` guard — om Postgres
inte kör, ska testerna SKIPPAS (`test.skipIf(...)` i Vitest), inte misslyckas.

Befintliga 856 tester ska fortfarande passera (oavsett om Postgres kör eller inte).

## Avgränsningar

- Inga vektorer/embeddings i denna brief (det är D2)
- Ingen MCP-server (det är D3)
- Memory-filer (`runs.md`, `patterns.md` etc.) behålls som markdown-filer — de är
  bra som de är och används av Historian/Librarian med frtext
- `manifest.json` behålls som fil (integritetsverifiering med checksums)
- Run-artefakter (report.md, questions.md etc.) behålls som filer (de är
  människoläsbara och bra som markdown)
- Targets (`repos.yaml`) behålls som YAML-fil (ändras sällan, config)
- Policy (`limits.yaml`) behålls som YAML-fil

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `src/core/db.ts` finns med pool-hantering | Fil existerar |
| `001_initial.sql` skapar alla tabeller | SQL-syntax-test |
| `db-import` CLI-kommando fungerar | Enhetstest |
| `db-migrate` CLI-kommando fungerar | Enhetstest |
| `knowledge-graph.ts` dual-write | Enhetstest |
| `audit.ts` dual-write | Enhetstest |
| `costs.ts` läser från DB om tillgänglig | Enhetstest |
| Fallback till filer utan Postgres | Enhetstest |
| Alla tester skippas gracefully utan Postgres | `pnpm test` utan Postgres |
| 856 befintliga tester passerar | `pnpm test` |

## Risk

**High.** Lägger till ett helt nytt lager (databas) under befintlig fil-logik. Men
risken mildras av:

1. **Dual write** — både fil och DB, aldrig bara DB
2. **Graceful fallback** — `isDbAvailable()` gör att allt funkar utan Postgres
3. **Befintliga tester opåverkade** — de kör utan Postgres och ska passera som förut
4. **Idempotent import** — kan köras flera gånger utan problem

**Rollback:** `git revert <commit>` + `pnpm remove pg @types/pg`

## Förberedelse (manuellt innan körning)

Postgres måste vara installerat och igång:

```bash
brew install postgresql@17
brew services start postgresql@17
createdb neuron
```
