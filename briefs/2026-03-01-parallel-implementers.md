# Brief: S3 — Parallella Implementers

## Bakgrund

Idag kör Manager EN Implementer åt gången, sekventiellt. Om briefen har 4
uppgifter (T1–T4) och T1+T2 är oberoende av varandra, väntar T2 ändå på att T1
ska bli klar. Det slösar tid — speciellt när uppgifterna rör olika filer.

S2 (atomär uppgiftsdelning) ger redan en task-plan med `dependsOn`-fält.
S3 utnyttjar detta: uppgifter utan inbördes beroenden kan köras parallellt
av separata Implementer-instanser, var och en på sin egen git-branch.

**Avgränsning:** S3 implementerar *infrastrukturen* för parallell exekvering —
branch-isolering, koordinering, och säker merge. Strategin är konservativ:
vid merge-konflikter avbryts mergen och Manager informeras. Ingen automatisk
konfliktlösning.

## Scope

Fem delar:

1. **`parallel-coordinator.ts`** — analyserar task-plan, grupperar oberoende
   uppgifter, hanterar branch-livscykel
2. **`git.ts`** — nya metoder: `mergeBranch()`, `detectMergeConflicts()`
3. **`manager.ts`** — parallell delegering via `Promise.allSettled()`
4. **`implementer.ts`** — skriver per-task handoff med branch-info
5. **Prompt-uppdateringar** — Manager och Merger informeras om parallella flödet

## Uppgifter

### 1. Parallel coordinator-modul

Skapa `src/core/parallel-coordinator.ts`:

```typescript
import { z } from 'zod';
import type { AtomicTask } from './task-splitter.js';

/**
 * Groups tasks into parallel execution waves.
 * Tasks in the same wave have no dependencies on each other.
 *
 * Example:
 *   T1 (no deps), T2 (no deps), T3 (depends T1), T4 (depends T1, T2)
 *   → Wave 1: [T1, T2]  (parallel)
 *   → Wave 2: [T3]      (after T1)
 *   → Wave 3: [T4]      (after T1 + T2)
 */
export function computeExecutionWaves(
  tasks: AtomicTask[]
): AtomicTask[][];

/**
 * Returns the branch name for a task.
 * Format: neuron/<runid>/task-<taskId>
 */
export function taskBranchName(runId: string, taskId: string): string;

/**
 * Checks if tasks in a wave have overlapping file sets.
 * Returns pairs of tasks with file conflicts.
 * These should NOT run in parallel even if dependsOn allows it.
 */
export function detectFileConflicts(
  wave: AtomicTask[]
): Array<{ taskA: string; taskB: string; sharedFiles: string[] }>;

/**
 * Splits a wave into safe parallel groups.
 * Tasks sharing files are moved to separate sub-waves.
 */
export function splitConflictingWave(
  wave: AtomicTask[]
): AtomicTask[][];

export const TaskBranchStatusSchema = z.object({
  taskId: z.string(),
  branch: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  filesModified: z.array(z.string()).default([]),
  testsPassing: z.boolean().optional(),
  error: z.string().optional(),
});

export type TaskBranchStatus = z.infer<typeof TaskBranchStatusSchema>;
```

### 2. Git merge-metoder

I `src/core/git.ts`, lägg till:

```typescript
/**
 * Detects if merging source into current branch would cause conflicts.
 * Uses git merge --no-commit --no-ff to test, then aborts.
 *
 * @returns List of conflicting file paths, or empty array if clean merge
 */
async detectMergeConflicts(sourceBranch: string): Promise<string[]>;

/**
 * Merges source branch into current branch.
 * Uses --no-ff to preserve branch history.
 * Throws if conflicts are detected (caller must handle).
 *
 * @returns Merge commit SHA
 */
async mergeBranch(
  sourceBranch: string,
  commitMessage: string
): Promise<string>;

/**
 * Deletes a local branch (cleanup after merge).
 */
async deleteBranch(branchName: string): Promise<void>;
```

### 3. Manager: parallell delegering

I `src/core/agents/manager.ts`, lägg till en ny metod vid sidan av
`delegateToImplementer()`:

```typescript
/**
 * Delegates a wave of independent tasks to parallel Implementers.
 * Each Implementer works on its own branch.
 *
 * Uses Promise.allSettled() — if one fails, others continue.
 * Returns results per task: success (with handoff) or failure (with error).
 */
private async delegateParallelWave(
  wave: AtomicTask[],
  waveIndex: number
): Promise<Array<TaskBranchStatus>>;
```

Uppdatera huvudflödet i Manager att använda `computeExecutionWaves()`:

```typescript
// After task plan is created:
const waves = computeExecutionWaves(taskPlan);

for (const [i, wave] of waves.entries()) {
  // Split wave if file conflicts exist
  const safeGroups = splitConflictingWave(wave);

  for (const group of safeGroups) {
    if (group.length === 1) {
      // Single task — use existing sequential path
      await this.delegateToImplementer({ task: group[0].description });
    } else {
      // Multiple independent tasks — run in parallel
      const results = await this.delegateParallelWave(group, i);
      // Check results, handle failures
    }
  }
}
```

### 4. Implementer: per-task handoff

I `src/core/agents/implementer.ts`, skriv en handoff-fil per uppgift:

```typescript
// At end of run(), write task handoff:
const handoff = {
  taskId: this.taskId,
  branch: this.branchName,
  filesModified: await this.getModifiedFiles(),
  testsPassing: this.lastTestResult?.passed ?? false,
  completedAt: new Date().toISOString(),
};

await fs.writeFile(
  path.join(this.runDir, `task_${this.taskId}_handoff.json`),
  JSON.stringify(handoff, null, 2)
);
```

### 5. Merger: sekventiell branch-merge

I `src/core/agents/merger.ts`, utöka för att hantera parallella branchar:

```typescript
// Before copying to target, merge all task branches:
// 1. Read all task_*_handoff.json files
// 2. For each completed task branch:
//    a. Detect conflicts with current workspace state
//    b. If clean → merge
//    c. If conflicts → report and skip (Manager handles in next iteration)
// 3. After all merges, proceed with existing copy-to-target flow
```

Lägg till nytt verktyg `merge_task_branch`:

```typescript
{
  name: 'merge_task_branch',
  description: 'Merge a completed task branch into the main workspace branch. Returns merge result.',
  input_schema: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      source_branch: { type: 'string' },
    },
    required: ['task_id', 'source_branch'],
  },
}
```

### 6. Manager-prompt

I `prompts/manager.md`, lägg till en ny ARCHIVE-sektion:

```markdown
<!-- ARCHIVE: parallel-tasks -->
## Parallel Task Execution

When your task plan has independent tasks (no shared dependsOn), they will
run in parallel on separate git branches.

### Rules for Parallel Tasks
1. **File isolation** — Tasks running in parallel MUST NOT modify the same files.
   If two tasks touch the same file, they will be sequenced automatically.
2. **Branch per task** — Each parallel task gets branch `neuron/<runid>/task-<id>`.
3. **Merge order** — After all parallel tasks complete, branches are merged
   sequentially into the main workspace branch.
4. **Conflict handling** — If a merge conflict occurs, the conflicting task
   is marked as FAILED and you must re-delegate it in the next wave.

### When NOT to Parallelize
- Tasks that modify shared configuration files (package.json, tsconfig.json)
- Tasks that both add imports to the same module
- Tasks where the second task's approach depends on the first task's result
<!-- /ARCHIVE: parallel-tasks -->
```

### 7. Merger-prompt

I `prompts/merger.md`, lägg till:

```markdown
<!-- ARCHIVE: parallel-merge -->
## Merging Parallel Task Branches

When multiple Implementers ran in parallel, merge their branches before
copying to the target repo:

1. Read all `task_*_handoff.json` files in the run directory
2. For each completed task (sorted by task ID):
   - Use `merge_task_branch` to merge into the main workspace branch
   - If merge fails (conflict) → note in report, skip this task
3. After merging, proceed with normal copy-to-target flow
4. In report, list which tasks were merged and which had conflicts
<!-- /ARCHIVE: parallel-merge -->
```

### 8. Policy-uppdatering

I `policy/limits.yaml`, uppdatera:

```yaml
# Change from 1 to allow parallel execution
max_parallel_implementers: 3    # Max 3 simultaneous Implementers per wave
```

### 9. Tester

Skriv tester i `tests/core/parallel-coordinator.test.ts`:

1. `computeExecutionWaves` — inga beroenden → alla i en wave
2. `computeExecutionWaves` — linjära beroenden (T1→T2→T3) → 3 waves
3. `computeExecutionWaves` — diamantberoende (T1→T3, T2→T3) → 2 waves
4. `computeExecutionWaves` — tom lista → tom lista
5. `computeExecutionWaves` — en uppgift → en wave
6. `computeExecutionWaves` — blandat (T1 oberoende, T2→T1, T3 oberoende) → [[T1,T3],[T2]]
7. `taskBranchName` — korrekt format
8. `detectFileConflicts` — inga överlapp → tom lista
9. `detectFileConflicts` — delad fil → rapporterar paret
10. `detectFileConflicts` — tre tasks, två delar fil → korrekt par
11. `splitConflictingWave` — ingen konflikt → en grupp
12. `splitConflictingWave` — konflikt → separata grupper
13. `TaskBranchStatusSchema` — validerar korrekt objekt
14. `TaskBranchStatusSchema` — avvisar ogiltig status

Skriv tester i `tests/core/git-merge.test.ts`:

15. `detectMergeConflicts` — clean merge → tom lista
16. `detectMergeConflicts` — konflikt → lista med filnamn
17. `mergeBranch` — clean merge → returnerar SHA
18. `mergeBranch` — konflikt → kastar Error
19. `deleteBranch` — raderar branch

Skriv tester i `tests/agents/manager-parallel.test.ts`:

20. Manager skapar execution waves från task plan
21. Manager delegerar single-task wave sekventiellt
22. Manager delegerar multi-task wave parallellt
23. Manager hanterar mixed results (en lyckas, en misslyckas)
24. Manager sekvenserar tasks med filkonflikter

Skriv tester i `tests/prompts/manager-parallel-lint.test.ts`:

25. Manager-prompt innehåller `<!-- ARCHIVE: parallel-tasks -->`
26. Manager-prompt nämner "Parallel Task Execution"

Skriv tester i `tests/prompts/merger-parallel-lint.test.ts`:

27. Merger-prompt innehåller `<!-- ARCHIVE: parallel-merge -->`
28. Merger-prompt nämner `merge_task_branch`

## Acceptanskriterier

- [ ] `src/core/parallel-coordinator.ts` existerar med `computeExecutionWaves()`, `detectFileConflicts()`, `splitConflictingWave()`
- [ ] `src/core/git.ts` har `detectMergeConflicts()`, `mergeBranch()`, `deleteBranch()`
- [ ] Manager delegerar parallellt via `Promise.allSettled()` för oberoende tasks
- [ ] Implementer skriver `task_<id>_handoff.json` per uppgift
- [ ] Merger har `merge_task_branch`-verktyg
- [ ] Konflikt → avbryt merge + rapportera (ingen auto-lösning)
- [ ] `prompts/manager.md` har ARCHIVE `parallel-tasks`
- [ ] `prompts/merger.md` har ARCHIVE `parallel-merge`
- [ ] `policy/limits.yaml` har `max_parallel_implementers`
- [ ] 14+ tester i `tests/core/parallel-coordinator.test.ts`
- [ ] 5+ tester i `tests/core/git-merge.test.ts`
- [ ] 5+ tester i `tests/agents/manager-parallel.test.ts`
- [ ] 4+ prompt-lint-tester
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**High.** Ändrar det centrala orkestreringsflödet. Tre specifika risker:

1. **Merge-konflikter** — Två Implementers ändrar samma fil. Mitigering:
   `detectFileConflicts()` förhindrar detta i planeringsfasen;
   `detectMergeConflicts()` fångar det i merge-fasen. Konflikter avbryter
   (ingen auto-lösning), så ingen data förloras.

2. **Asynkrona fel** — En Implementer kraschar medan andra kör.
   `Promise.allSettled()` (inte `Promise.all()`) säkerställer att övriga
   slutförs. Misslyckade uppgifter rapporteras, inte tysta.

3. **Branch-explosion** — Varje task skapar en branch. Cleanup sker via
   `deleteBranch()` efter lyckad merge. Vid avbrott rensas branches vid
   nästa körning.

Kodstorleken hålls nere genom att bygga på befintlig S2-infrastruktur
(task-splitter) och befintlig git-hantering.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 715+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-parallel-implementers.md --hours 1
```
