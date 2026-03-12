# Brief: S8 — Kvalitetsmått per körning

## Bakgrund

Neuron HQ samlar redan in mycket rådata per körning:
- `audit.jsonl` — varje tool-anrop, tidsstämplar, diff_stats, blockeringar
- `usage.json` — tokens per agent, iterationer, tool-anrop
- `manifest.json` — kommandon med exit-koder, tidsstämplar, checksummor
- `report.md` — testresultat (fritext), stoplight-status

Men **ingen aggregering sker**. Vi kan inte svara på:
- "Hur många tester lades till?" (måste manuellt läsa report.md)
- "Hur effektiv var den här körningen jämfört med förra?" (ingen jämförelse)
- "Vilken agent använde mest tokens per iteration?" (måste räkna manuellt)
- "Hur många re-delegeringar gjordes?" (måste grep:a audit.jsonl)

**Lösning:** Skapa en `metrics.json` per körning som beräknas automatiskt
från befintlig data. Historian analyserar trender över tid.

## Scope

Ny metrics-modul som aggregerar befintlig data till strukturerad `metrics.json`.
Historian-prompten uppdateras för att analysera trender. Inga nya agenter.

## Uppgifter

### 1. Metrics-beräkningsmodul

Skapa `src/core/run-metrics.ts`:

```typescript
import { z } from 'zod';

export const RunMetricsSchema = z.object({
  runid: z.string(),
  computed_at: z.string().datetime(),

  timing: z.object({
    started_at: z.string().datetime(),
    completed_at: z.string().datetime().optional(),
    duration_seconds: z.number().optional(),
  }),

  testing: z.object({
    baseline_passed: z.number(),
    baseline_failed: z.number(),
    after_passed: z.number(),
    after_failed: z.number(),
    tests_added: z.number(),
  }),

  tokens: z.object({
    total_input: z.number(),
    total_output: z.number(),
    by_agent: z.record(z.object({
      input: z.number(),
      output: z.number(),
      iterations: z.number(),
      tokens_per_iteration: z.number(),
    })),
  }),

  code: z.object({
    files_new: z.number(),
    files_modified: z.number(),
    insertions: z.number(),
    deletions: z.number(),
  }),

  delegations: z.object({
    total: z.number(),
    by_target: z.record(z.number()),
    re_delegations: z.number(),
  }),

  policy: z.object({
    commands_run: z.number(),
    commands_blocked: z.number(),
  }),
});

export type RunMetrics = z.infer<typeof RunMetricsSchema>;

/**
 * Computes metrics from existing run artifacts.
 * Reads: usage.json, audit.jsonl, manifest.json, baseline.md, report.md
 * Writes: metrics.json
 */
export async function computeRunMetrics(runDir: string): Promise<RunMetrics>;

/**
 * Parses test counts from baseline.md and report.md text.
 * Extracts "N passed" and "N failed" patterns.
 */
export function parseTestCounts(text: string): { passed: number; failed: number };

/**
 * Counts delegations and re-delegations from audit.jsonl.
 * A re-delegation = same target delegated to more than once.
 */
export function countDelegations(auditEntries: Array<{
  tool: string;
  role: string;
}>): { total: number; by_target: Record<string, number>; re_delegations: number };

/**
 * Aggregates diff stats from audit.jsonl entries that have diff_stats.
 */
export function aggregateDiffStats(auditEntries: Array<{
  diff_stats?: { additions?: number; deletions?: number };
  files_touched?: string[];
}>): { insertions: number; deletions: number; files_new: number; files_modified: number };
```

### 2. Beräkna metrics automatiskt efter varje körning

I `src/core/run.ts` (eller liknande), anropa `computeRunMetrics()` efter att
alla agenter kört klart, innan körningen avslutas:

```typescript
// After all agents complete, before final summary:
const metrics = await computeRunMetrics(runDir);
await writeJSON(path.join(runDir, 'metrics.json'), metrics);
```

### 3. Historian-prompt: trendanalys

I `prompts/historian.md`, lägg till en ny sektion:

```markdown
## Quality Metrics Analysis

After writing the run summary, analyze `metrics.json` for this run:

1. **Efficiency**: Calculate tokens per test added (total_output / tests_added).
   Compare with previous runs if available.
2. **Budget usage**: For each agent, report iterations_used / iterations_limit
   as percentage. Flag any agent above 80%.
3. **Policy health**: If commands_blocked > 0, note the count and investigate.
4. **Delegation pattern**: If re_delegations > 0, note what was re-delegated and why.
5. **Trend**: If previous metrics.json files exist in other run dirs, compare
   tests_added and tokens_per_iteration trends.

Write a short "## Körningseffektivitet" section at the end of the run entry
in runs.md with 2-3 bullet points on efficiency and quality.
```

### 4. Tester

Skriv tester i `tests/core/run-metrics.test.ts`:

1. `parseTestCounts` extraherar "522 passed" korrekt
2. `parseTestCounts` extraherar "522 passed, 1 failed" korrekt
3. `parseTestCounts` returnerar 0 om ingen match
4. `parseTestCounts` hanterar "1 pre-existing fail" som failed
5. `countDelegations` räknar delegate_to_implementer-anrop
6. `countDelegations` identifierar re-delegeringar (>1 anrop till samma target)
7. `countDelegations` returnerar nollor för tom lista
8. `aggregateDiffStats` summerar insertions/deletions
9. `aggregateDiffStats` räknar unika filer (new vs modified)
10. `aggregateDiffStats` hanterar entries utan diff_stats
11. `computeRunMetrics` genererar komplett metrics-objekt från testdata
12. `computeRunMetrics` kastar om runDir saknas
13. `RunMetricsSchema` validerar korrekt metrics-objekt
14. `RunMetricsSchema` avvisar om required fields saknas
15. Historian-prompten innehåller "Quality Metrics Analysis"

## Acceptanskriterier

- [ ] `src/core/run-metrics.ts` existerar med `computeRunMetrics()`, `parseTestCounts()`, `countDelegations()`, `aggregateDiffStats()`
- [ ] `metrics.json` skrivs automatiskt till `runs/<runid>/` efter varje körning
- [ ] `prompts/historian.md` innehåller "Quality Metrics Analysis"-sektion
- [ ] `parseTestCounts` hanterar alla vanliga format ("N passed", "N failed", "N pre-existing fail")
- [ ] 15+ tester i `tests/core/run-metrics.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Helt additivt — läser befintlig data och skriver en ny fil. Inga ändringar
i befintliga agenter eller verktyg. Historian-promptändringen är en tillägg, inte
en omskrivning. Värsta fallet: `metrics.json` har felaktiga siffror, men det
påverkar inte körningens funktionalitet.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 577+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-quality-metrics.md --hours 1
```
