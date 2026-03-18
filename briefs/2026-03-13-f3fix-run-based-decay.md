# F3-fix: Byt decay från kalendertid till körningsbaserad

## Bakgrund

F3 införde confidence decay baserat på **dagar sedan senaste uppdatering**. Men det är fel modell — om systemet inte används på en vecka ska beliefs inte försvagas. Decay ska bara ske när systemet **aktivt kör** men en specifik dimension inte bekräftas.

### Nuläge

`applyDecay()` i `run-statistics.ts` tar `daysSinceUpdate` och räknar kalenderdagar. `getBeliefs()` och `getSummary()` beräknar dagar med `Date`-diff.

### Ny modell

Decay baseras på **antal körningar sedan senaste uppdatering av dimensionen**. Grace period = 10 körningar utan bevis. Tabellen `run_beliefs` har redan `total_runs` — men det räknar körningar *för* dimensionen. Vi behöver veta **totalt antal körningar i systemet** för att jämföra.

## Uppgifter

### 1. Ändra `applyDecay()` signatur

Byt från `daysSinceUpdate` till `runsSinceUpdate`:

```typescript
export interface DecayOptions {
  /** Runs without update before decay starts (default 10) */
  gracePeriodRuns?: number;
  /** Decay rate per run toward 0.5 (default 0.02) */
  ratePerRun?: number;
}

export function applyDecay(
  confidence: number,
  runsSinceUpdate: number,
  options?: DecayOptions,
): number {
  const grace = options?.gracePeriodRuns ?? 10;
  const rate = options?.ratePerRun ?? 0.02;

  if (runsSinceUpdate <= grace) return confidence;

  const decayRuns = runsSinceUpdate - grace;
  const neutral = 0.5;
  const decayed = neutral + (confidence - neutral) * Math.pow(1 - rate, decayRuns);
  return Math.round(decayed * 10000) / 10000;
}
```

Ta bort gamla `gracePeriodDays` och `dailyRate`.

### 2. Lägg till `last_run_number` i `run_beliefs`

Skapa migration `011_belief_run_counter.sql`:

```sql
-- Track which run number last updated each belief
ALTER TABLE run_beliefs ADD COLUMN IF NOT EXISTS last_run_number INTEGER DEFAULT 0;

-- Global run counter
CREATE TABLE IF NOT EXISTS run_counter (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_runs INTEGER NOT NULL DEFAULT 0
);
INSERT INTO run_counter (id, total_runs) VALUES (1, 0) ON CONFLICT DO NOTHING;
```

### 3. Uppdatera `updateRunBeliefs()`

Vid varje anrop:
1. Inkrementera `run_counter.total_runs` (en gång per körning, inte per outcome)
2. Sätt `last_run_number = current_total` på varje uppdaterad belief

```typescript
// Hämta och inkrementera global counter (en gång)
const { rows: counterRows } = await pool.query(
  'UPDATE run_counter SET total_runs = total_runs + 1 RETURNING total_runs'
);
const currentRunNumber = counterRows[0].total_runs;

// I upsert-loopen, lägg till last_run_number
await pool.query(
  `INSERT INTO run_beliefs (dimension, confidence, total_runs, successes, last_updated, last_run_number)
   VALUES ($1, $2, $3, $4, NOW(), $5)
   ON CONFLICT (dimension) DO UPDATE
   SET confidence = $2, total_runs = $3, successes = $4, last_updated = NOW(), last_run_number = $5`,
  [outcome.dimension, newConfidence, totalRuns, successes, currentRunNumber],
);
```

### 4. Uppdatera `getBeliefs()` decay-beräkning

Istället för `Date`-diff, beräkna `runsSinceUpdate`:

```typescript
if (filter?.applyDecay !== false) {
  // Hämta global run counter
  const { rows: counterRows } = await pool.query('SELECT total_runs FROM run_counter WHERE id = 1');
  const globalRuns = counterRows[0]?.total_runs ?? 0;

  for (const belief of beliefs) {
    const runsSince = globalRuns - (belief.last_run_number ?? 0);
    belief.confidence = applyDecay(belief.confidence, runsSince);
  }
}
```

Utöka `RunBelief` med `last_run_number?: number` och inkludera det i query+mapping.

### 5. Uppdatera `getSummary()` på samma sätt

Samma ändring — byt `Date`-diff mot `runsSinceUpdate` med global counter.

### 6. Uppdatera tester

Uppdatera `tests/core/confidence-decay-beliefs.test.ts`:
- Byt alla `daysSinceUpdate` → `runsSinceUpdate` i testnamn och anrop
- Uppdatera grace period-tester (14 dagar → 10 körningar)
- Uppdatera decay-beräkningar (rate 0.01 → 0.02)
- Lägg till test: "no decay when system idle" (runsSince=0 oavsett kalendertid)

Uppdatera `tests/core/run-statistics.test.ts` (om det finns tester som rör decay i getBeliefs/getSummary).

Uppdatera dashboard-tester om de refererar till decay-options.

Alla befintliga tester som anropar `applyDecay` med gamla signaturen måste uppdateras.

## Avgränsningar

- Ändra INTE `detectContradictions()` — den berörs inte
- Ändra INTE `bayesianUpdate()` — den berörs inte
- Backfill av `last_run_number` för befintliga beliefs: sätt till 0 (migration default). De kommer visa som "maximalt decayed" tills nästa körning uppdaterar dem — det är OK.

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `applyDecay()` tar `runsSinceUpdate` istället för `daysSinceUpdate` | Kodgranskning |
| Migration 011 skapar `last_run_number` + `run_counter` | `pnpm run db-migrate` |
| `updateRunBeliefs()` inkrementerar global counter | Tester |
| `getBeliefs()` beräknar decay med körningar, inte kalendertid | Tester |
| `getSummary()` beräknar decay med körningar | Tester |
| Alla 1951 befintliga tester gröna (efter uppdatering) | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |

## Risk

**Låg.** Samma matematiska modell, bara annan input (körningar istället för dagar). Migration är additiv (ny kolumn + ny tabell). Befintliga beliefs får default 0 vilket är konservativt.

**Rollback:** `git revert <commit>` + `ALTER TABLE run_beliefs DROP COLUMN last_run_number; DROP TABLE run_counter;`
