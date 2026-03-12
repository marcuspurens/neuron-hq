# Brief: S4 — Process Reward Scoring

## Bakgrund

Idag utvärderas körningar binärt: 🟢 GREEN eller 🔴 RED. Vi vet om det
*fungerade*, men inte *hur effektivt* det gick. Frågor vi inte kan svara på:

- "Task T2 tog 5 iterationer — var det normalt eller slöseri?"
- "Implementer blev blockerad av policy 3 gånger — borde Manager ha varnat?"
- "Reviewer sa YELLOW, Manager re-delegerade — var det rätt beslut?"
- "Liknande uppgifter har historiskt tagit 2 iterationer — varför tog denna 7?"

**Lösning:** Poängsätt varje uppgift (inte bara hela körningen) med
kvantitativa mått: effektivitet, säkerhet, korrekthet. Lagra poäng i
`task_scores.jsonl` och låt Historian analysera trender.

**Förutsättningar:** S2 (atomära uppgifter) ger task-strukturen.
S8 (kvalitetsmått) ger aggregeringssystemet. S4 bygger på båda.

## Scope

Ny scoring-modul som beräknar per-task-poäng från audit.jsonl och usage.json.
Manager-prompten uppdateras för att konsultera historiska poäng. Historian
analyserar trender.

## Uppgifter

### 1. Task reward-modul

Skapa `src/core/task-rewards.ts`:

```typescript
import { z } from 'zod';

export const TaskScoreSchema = z.object({
  task_id: z.string(),
  description: z.string(),
  run_id: z.string(),

  // Raw metrics
  iterations_used: z.number(),
  tokens_input: z.number(),
  tokens_output: z.number(),
  commands_run: z.number(),
  commands_blocked: z.number(),
  diff_insertions: z.number(),
  diff_deletions: z.number(),
  re_delegations: z.number(),

  // Computed scores (0.0–1.0, higher = better)
  scores: z.object({
    efficiency: z.number().min(0).max(1)
      .describe('1.0 = completed in 1 iteration, decays with more iterations'),
    safety: z.number().min(0).max(1)
      .describe('1.0 = no policy blocks, -0.2 per block'),
    first_pass: z.number().min(0).max(1)
      .describe('1.0 = passed first try, 0.5 = needed re-delegation'),
  }),

  // Weighted aggregate
  aggregate: z.number().min(0).max(1),

  // Reviewer verdict for this task
  verdict: z.enum(['PASS', 'FAIL', 'PARTIAL']).optional(),
});

export type TaskScore = z.infer<typeof TaskScoreSchema>;

/**
 * Computes scores for a single task based on audit data.
 *
 * efficiency = max(0, 1 - (iterations_used - 1) * 0.15)
 *   → 1 iteration = 1.0, 2 = 0.85, 5 = 0.4, 7+ = 0.1 (floor)
 *
 * safety = max(0, 1 - commands_blocked * 0.2)
 *   → 0 blocks = 1.0, 1 = 0.8, 5+ = 0.0
 *
 * first_pass = re_delegations === 0 ? 1.0 : 0.5
 *
 * aggregate = efficiency * 0.5 + safety * 0.3 + first_pass * 0.2
 */
export function computeTaskScore(params: {
  task_id: string;
  description: string;
  run_id: string;
  iterations_used: number;
  tokens_input: number;
  tokens_output: number;
  commands_run: number;
  commands_blocked: number;
  diff_insertions: number;
  diff_deletions: number;
  re_delegations: number;
  verdict?: 'PASS' | 'FAIL' | 'PARTIAL';
}): TaskScore;

/**
 * Extracts per-task metrics from audit.jsonl entries.
 * Groups entries by task_id (from delegation notes) and computes
 * iterations, commands, blocks, diff stats per task.
 */
export function extractTaskMetrics(
  auditEntries: Array<Record<string, unknown>>,
  taskPlan: Array<{ id: string; description: string }>
): Array<{
  task_id: string;
  description: string;
  iterations_used: number;
  tokens_input: number;
  tokens_output: number;
  commands_run: number;
  commands_blocked: number;
  diff_insertions: number;
  diff_deletions: number;
  re_delegations: number;
}>;

/**
 * Reads task_plan.md + audit.jsonl + usage.json from a run directory
 * and produces task_scores.jsonl (one JSON line per task).
 */
export async function computeAllTaskScores(runDir: string): Promise<TaskScore[]>;

/**
 * Loads historical task scores from previous runs.
 * Returns scores for tasks with similar descriptions (fuzzy match).
 */
export function findSimilarTaskScores(
  historicalScores: TaskScore[],
  description: string,
  threshold?: number // Jaccard similarity, default 0.4
): TaskScore[];
```

### 2. Integration i finalizeRun

I `src/core/run.ts`, efter `computeRunMetrics()`, anropa `computeAllTaskScores()`:

```typescript
// After metrics computation:
try {
  const scores = await computeAllTaskScores(runDir);
  // scores already written to task_scores.jsonl by computeAllTaskScores
} catch {
  // Non-fatal — task scores are informational
}
```

### 3. Manager-prompt: konsultera historiska poäng

I `prompts/manager.md`, lägg till i Task Planning-sektionen:

```markdown
### Historical Task Performance
Before delegating a task, check if similar tasks have been done before:
- Use `graph_query` to find patterns related to the task
- If previous task scores exist (in prior run dirs), note the average
  aggregate score
- If similar tasks scored below 0.5 historically, consider:
  - Breaking the task into smaller pieces
  - Adding extra guidance in the delegation
  - Flagging it as higher risk
```

### 4. Historian-prompt: trendanalys av task scores

I `prompts/historian.md`, utöka "Quality Metrics Analysis":

```markdown
### Task Score Trends
If `task_scores.jsonl` exists in the run directory:
1. Report the average aggregate score across all tasks
2. Flag any task with aggregate < 0.5 as "inefficient"
3. Flag any task with safety < 0.8 as "policy risk"
4. Compare with previous runs' task scores if available
5. Write a "## Uppgiftseffektivitet" section in runs.md with per-task summary
```

### 5. Tester

Skriv tester i `tests/core/task-rewards.test.ts`:

1. `computeTaskScore` — 1 iteration → efficiency 1.0
2. `computeTaskScore` — 3 iterationer → efficiency 0.7
3. `computeTaskScore` — 7 iterationer → efficiency 0.1 (floor)
4. `computeTaskScore` — 0 policy blocks → safety 1.0
5. `computeTaskScore` — 3 policy blocks → safety 0.4
6. `computeTaskScore` — 5+ blocks → safety 0.0 (floor)
7. `computeTaskScore` — 0 re-delegations → first_pass 1.0
8. `computeTaskScore` — 1+ re-delegations → first_pass 0.5
9. `computeTaskScore` — aggregate beräknas med rätt vikter (0.5/0.3/0.2)
10. `computeTaskScore` — perfekt uppgift → aggregate 1.0
11. `extractTaskMetrics` — grupperar audit-entries korrekt per task
12. `extractTaskMetrics` — hanterar tom lista
13. `extractTaskMetrics` — räknar re-delegeringar (samma task_id > 1 delegation)
14. `findSimilarTaskScores` — hittar tasks med liknande beskrivningar
15. `findSimilarTaskScores` — returnerar tom lista om ingen match
16. `TaskScoreSchema` validerar korrekt score-objekt
17. `TaskScoreSchema` avvisar scores utanför 0–1

## Acceptanskriterier

- [ ] `src/core/task-rewards.ts` existerar med `computeTaskScore()`, `extractTaskMetrics()`, `computeAllTaskScores()`, `findSimilarTaskScores()`
- [ ] `task_scores.jsonl` skrivs automatiskt till `runs/<runid>/` efter varje körning
- [ ] Scoring-formler: efficiency decays med iterationer, safety decays med blocks, first_pass binär
- [ ] Aggregate = efficiency×0.5 + safety×0.3 + first_pass×0.2
- [ ] `prompts/manager.md` inkluderar "Historical Task Performance"
- [ ] `prompts/historian.md` inkluderar "Task Score Trends"
- [ ] 17+ tester i `tests/core/task-rewards.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Scoring-formlerna är godtyckliga initialt — vikterna (0.5/0.3/0.2)
och decay-kurvan behöver kalibreras mot verkliga körningar. Men formler är
enkla att justera i efterhand. Koden är additivt (ny fil, ny artefakt).
Prompt-ändringar i Manager och Historian är tillägg, inte omskrivningar.

Risken att Manager överreagerar på historiska poäng finns — om en liknande
uppgift scorade lågt en gång kan Manager bli onödigt försiktig. Därför
sätts thresholden lågt (0.4) och Manager instrueras att bara *notera*,
inte blockera.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 598+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-process-reward-scoring.md --hours 1
```
