# F1: Neuron körningsstatistik — Bayesisk per agent/modul

## Bakgrund

Neuron HQ samlar redan rik data efter varje körning: `metrics.json` (timing, tester, kod, delegationer), `task_scores.jsonl` (per-task efficiency/safety/first_pass), `usage.json` (tokens per agent) och `audit.jsonl` (varje tool call). Allt lagras även i Postgres (`runs`, `metrics`, `task_scores`, `audit_entries`).

Men ingen aggregering sker. Vi vet inte om Implementer blir bättre över tid, om vissa brief-typer alltid ger YELLOW, eller om re-delegationer ökar.

F1 bygger ett **statistik-lager** som efter varje körning uppdaterar Bayesiska beliefs per dimension (agent, modul, brief-typ). Samma logistiska Bayesian-formel som F0, men nu för Neurons egen prestation.

## Dimensioner att spåra

| Dimension | Nyckel | Exempel |
|-----------|--------|---------|
| Agent-roll | `agent:<role>` | `agent:implementer` |
| Brief-typ | `brief:<type>` | `brief:feature`, `brief:refactor`, `brief:bugfix` |
| Target | `target:<name>` | `target:neuron-hq` |
| Modell | `model:<id>` | `model:claude-sonnet-4-5` |

## Signaler (vad som räknas som framgång/misslyckande)

Varje körning ger ett **utfall** per dimension baserat på:

```typescript
type RunOutcome = {
  dimension: string;        // t.ex. "agent:implementer"
  success: boolean;         // baserat på regler nedan
  weight: number;           // signal-styrka (0.05–0.25)
  evidence: string;         // förklaring
};
```

### Signal-regler

| Signal | success = true | success = false | weight |
|--------|---------------|-----------------|--------|
| Stoplight GREEN | status = 'green' | status ∈ ('yellow', 'red', 'error') | 0.20 |
| Inga re-delegationer | re_delegations = 0 | re_delegations > 0 | 0.10 |
| Inga blockade kommandon | commands_blocked = 0 | commands_blocked > 0 | 0.08 |
| Tester ökade | tests_added > 0 | tests_added = 0 (vid feature-brief) | 0.06 |
| Task-score bra | aggregate ≥ 0.7 | aggregate < 0.7 | 0.12 |
| Under token-budget | tokens < median * 1.5 | tokens ≥ median * 1.5 | 0.05 |

## Uppgifter

### 1. Ny databasmigrering `009_run_statistics.sql`

```sql
CREATE TABLE IF NOT EXISTS run_beliefs (
  id SERIAL PRIMARY KEY,
  dimension TEXT NOT NULL,          -- 'agent:implementer', 'brief:feature', etc.
  confidence REAL NOT NULL DEFAULT 0.5,
  total_runs INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dimension)
);

CREATE TABLE IF NOT EXISTS run_belief_audit (
  id SERIAL PRIMARY KEY,
  dimension TEXT NOT NULL,
  runid TEXT NOT NULL,
  old_confidence REAL NOT NULL,
  new_confidence REAL NOT NULL,
  success BOOLEAN NOT NULL,
  weight REAL NOT NULL,
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_run_beliefs_dimension ON run_beliefs(dimension);
CREATE INDEX idx_run_belief_audit_dimension ON run_belief_audit(dimension);
CREATE INDEX idx_run_belief_audit_runid ON run_belief_audit(runid);
```

### 2. Ny modul `src/core/run-statistics.ts`

Funktioner:

```typescript
// Klassificera brief-typ baserat på brief.md-innehåll
classifyBrief(briefPath: string): Promise<'feature' | 'refactor' | 'bugfix' | 'test' | 'docs' | 'infrastructure'>

// Samla signaler från en körning
collectOutcomes(runDir: string): Promise<RunOutcome[]>

// Uppdatera beliefs i Postgres (använd bayesianUpdate från F0)
updateRunBeliefs(outcomes: RunOutcome[]): Promise<void>

// Hämta alla beliefs (sorterade efter confidence)
getBeliefs(filter?: { prefix?: string }): Promise<RunBelief[]>

// Hämta audit trail för en dimension
getBeliefHistory(dimension: string): Promise<RunBeliefAudit[]>

// Beräkna sammanfattning
getSummary(): Promise<{
  strongest: RunBelief[];   // topp 5 högst confidence
  weakest: RunBelief[];     // topp 5 lägst confidence
  trending_up: RunBelief[]; // förbättras senaste 5 körningar
  trending_down: RunBelief[];
}>
```

Brief-klassificering — heuristik baserad på nyckelord i titeln:
- `feature`/`add`/`implement`/`new` → feature
- `refactor`/`clean`/`restructure` → refactor
- `fix`/`bug`/`broken` → bugfix
- `test` → test
- `doc`/`readme` → docs
- Övrigt → infrastructure

### 3. Integration i `finalizeRun()`

I `src/core/run.ts`, efter `computeAllTaskScores()`:

```typescript
// Collect run outcomes and update beliefs
const outcomes = await collectOutcomes(ctx.runDir);
await updateRunBeliefs(outcomes);
```

Wrapped i try/catch (som F0:s confidence-integration) — statistik-fel ska aldrig stoppa en körning.

### 4. CLI-kommando `neuron:statistics`

```bash
# Visa alla beliefs
npx tsx src/cli.ts neuron:statistics

# Filtrera per prefix
npx tsx src/cli.ts neuron:statistics --filter agent
npx tsx src/cli.ts neuron:statistics --filter brief
npx tsx src/cli.ts neuron:statistics --filter model

# Visa historik för en dimension
npx tsx src/cli.ts neuron:statistics --history agent:implementer

# Visa sammanfattning (starkast, svagast, trender)
npx tsx src/cli.ts neuron:statistics --summary
```

Output-format:

```
📊 Neuron Run Statistics

Dimension                   Confidence  Runs  Successes  Trend
agent:implementer           0.82       45    37         ↑
agent:reviewer              0.78       45    35         →
agent:merger                0.91       45    41         ↑
brief:feature               0.74       28    21         →
brief:refactor              0.85       12    10         ↑
target:neuron-hq            0.80       45    36         →
model:claude-sonnet-4-5     0.79       40    32         →
```

### 5. MCP-tool `neuron_run_statistics`

```typescript
{
  name: "neuron_run_statistics",
  description: "Get Bayesian beliefs about Neuron run performance per agent, brief type, target, and model",
  inputSchema: {
    type: "object",
    properties: {
      filter: { type: "string", description: "Filter prefix: 'agent', 'brief', 'model', 'target'" },
      dimension: { type: "string", description: "Specific dimension for history, e.g. 'agent:implementer'" },
      summary: { type: "boolean", description: "Return strongest/weakest/trends summary" }
    }
  }
}
```

### 6. Retroaktiv backfill

Engångsoperation: Loopa genom alla befintliga `runs/*/metrics.json` och kör `collectOutcomes()` + `updateRunBeliefs()` på var och en i kronologisk ordning.

```bash
npx tsx src/cli.ts neuron:statistics --backfill
```

### 7. Tester

**Enhetstester:**
- `classifyBrief()` — korrekt klassificering av 6 brief-typer
- `collectOutcomes()` — rätt signaler från mock-metrics
- Bayesian update ger rätt confidence-förändring
- Tomt metrics-resultat → inga outcomes (graceful)

**Integrationstester:**
- `updateRunBeliefs()` → rad i `run_beliefs` + audit i `run_belief_audit`
- Upprepad uppdatering → confidence ökar/minskar korrekt
- `getBeliefs()` med filter returnerar rätt subset
- `getSummary()` returnerar sorterade listor
- `--backfill` processar befintliga körningar

**MCP-tester:**
- `neuron_run_statistics` returnerar korrekt format
- Filter och dimension fungerar
- Summary-flagga returnerar trender

## Avgränsningar

- Ingen UI/dashboard (framtida idé)
- Ingen automatisk anpassning av Manager-beteende (det är F2)
- Ingen prediktiv modell — bara deskriptiv statistik med Bayesian update
- Brief-klassificering är heuristisk, inte LLM-baserad

## Verifiering

```bash
pnpm test
npx tsx src/cli.ts db-migrate
npx tsx src/cli.ts neuron:statistics --backfill
npx tsx src/cli.ts neuron:statistics --summary
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| Migrering 009 skapar `run_beliefs` + `run_belief_audit` | `db-migrate` utan fel |
| `collectOutcomes()` extraherar signaler från metrics | Enhetstest |
| Bayesian update korrekt (logit-transform) | Enhetstest |
| `classifyBrief()` klassificerar 6 typer | Enhetstest |
| Integration i `finalizeRun()` med try/catch | Enhetstest + integrationstest |
| CLI `neuron:statistics` visar tabell | Manuell verifiering |
| CLI `--history` visar audit trail | Manuell verifiering |
| CLI `--summary` visar trender | Manuell verifiering |
| CLI `--backfill` processar alla befintliga körningar | Manuell verifiering |
| MCP `neuron_run_statistics` returnerar JSON | MCP-test |
| ≥20 nya tester | `pnpm test` |

## Risk

**Låg.** All data finns redan — vi aggregerar bara. `try/catch` skyddar körningar.

**Rollback:** Ta bort migrering 009, ta bort `run-statistics.ts`, ta bort `finalizeRun`-raden. Ingen befintlig funktionalitet påverkas.
