# Brief: Atomär uppgiftsdelning i Manager

## Bakgrund

Idag delegerar Manager uppgifter till Implementer som fritext: `"Implement X, Y and Z"`.
Uppgiften kan vara bred och täcka flera filer, flera logiska ändringar och flera acceptanskriterier.
Det leder till:

- Stora diffar (>150 rader) som är svårare att granska
- Halvfärdiga implementationer om Implementer tar slut på iterationer
- Svårare att identifiera *vilken* del som gick fel vid RED review
- Otydligt pass/fail — "delvis klart" är svårt att bedöma

**Lösning:** Manager bryter ner briefens uppgifter i **atomära arbetsenheter** — varje enhet
är EN logisk ändring med ETT tydligt pass/fail-kriterium. Implementer får en uppgift i taget.

## Scope

Uppdatera Manager-prompt och lägg till en task-splitting-funktion som tvingar Manager
att strukturera uppgifter före delegering.

## Uppgifter

### 1. Task-splitter utility

Skapa `src/core/task-splitter.ts`:

```typescript
import { z } from 'zod';

export const AtomicTaskSchema = z.object({
  id: z.string().describe('Short ID like T1, T2, T3'),
  description: z.string().describe('One-sentence description of the change'),
  files: z.array(z.string()).describe('Expected files to touch'),
  passCriterion: z.string().describe('How to verify this task passed'),
  dependsOn: z.array(z.string()).optional().describe('IDs of tasks that must complete first'),
});

export type AtomicTask = z.infer<typeof AtomicTaskSchema>;

export const TaskPlanSchema = z.object({
  tasks: z.array(AtomicTaskSchema).min(1),
});

export type TaskPlan = z.infer<typeof TaskPlanSchema>;

/**
 * Validates a task plan: checks for dependency cycles and
 * ensures each task has a clear pass criterion.
 */
export function validateTaskPlan(plan: TaskPlan): string[] {
  const errors: string[] = [];
  const ids = new Set(plan.tasks.map(t => t.id));

  for (const task of plan.tasks) {
    // Check dependencies reference valid task IDs
    for (const dep of task.dependsOn ?? []) {
      if (!ids.has(dep)) {
        errors.push(`Task ${task.id} depends on unknown task ${dep}`);
      }
      if (dep === task.id) {
        errors.push(`Task ${task.id} depends on itself`);
      }
    }

    // Check pass criterion is not empty
    if (task.passCriterion.trim().length < 5) {
      errors.push(`Task ${task.id} has too short pass criterion`);
    }

    // Check description is actionable (starts with verb)
    if (task.description.trim().length < 10) {
      errors.push(`Task ${task.id} has too short description`);
    }
  }

  // Simple cycle detection (topological sort)
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const taskMap = new Map(plan.tasks.map(t => [t.id, t]));

  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const task = taskMap.get(id);
    for (const dep of task?.dependsOn ?? []) {
      if (hasCycle(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const task of plan.tasks) {
    if (hasCycle(task.id)) {
      errors.push(`Dependency cycle detected involving task ${task.id}`);
      break;
    }
  }

  return errors;
}
```

### 2. Manager-prompt: Task Plan Before Delegation

I `prompts/manager.md`, lägg till en ny sektion **Task Planning** efter "Core Principles":

```markdown
## Task Planning

Before delegating to Implementer, you MUST create a task plan. Each task in the plan is
an **atomic unit** — one logical change with one pass/fail criterion.

### Rules for atomic tasks
1. **One change per task**: "Add function X" or "Update config Y" — never "Add X and update Y"
2. **Clear pass criterion**: "pnpm typecheck passes" or "new test in foo.test.ts passes"
3. **Small scope**: Each task should produce <80 lines of diff
4. **Ordered by dependency**: If task T2 needs T1's output, mark dependsOn: ["T1"]

### Example task plan
```
T1: Create AtomicTask schema in src/core/task-splitter.ts
   Pass: pnpm typecheck passes with new file
   Files: src/core/task-splitter.ts

T2: Add validateTaskPlan function (depends on T1)
   Pass: Unit test for cycle detection passes
   Files: src/core/task-splitter.ts, tests/core/task-splitter.test.ts

T3: Update Manager prompt with task planning section
   Pass: Prompt contains "Task Planning" section
   Files: prompts/manager.md
```

### Delegate one task at a time
- Call `delegate_to_implementer` with ONE task from your plan
- Wait for handoff, read result
- If PASS → move to next task
- If FAIL → fix or re-delegate same task (don't skip ahead)
```

### 3. Manager skriver task-plan till fil

I `src/core/agents/manager.ts`, lägg till ett nytt verktyg `write_task_plan`:

```typescript
{
  name: 'write_task_plan',
  description: 'Write a structured task plan to task_plan.md in the run directory. Call this BEFORE delegating to Implementer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            files: { type: 'array', items: { type: 'string' } },
            passCriterion: { type: 'string' },
            dependsOn: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'description', 'files', 'passCriterion'],
        },
      },
    },
    required: ['tasks'],
  },
}
```

Verktygets handler:
- Validera med `validateTaskPlan()`
- Skriv `task_plan.md` i run-katalogen (markdown-tabell)
- Returnera valideringsresultat eller plan-sammanfattning

### 4. Tester

Skriv tester i `tests/core/task-splitter.test.ts`:

1. `AtomicTaskSchema` validerar korrekt task-objekt
2. `AtomicTaskSchema` avvisar task utan passCriterion
3. `validateTaskPlan` returnerar tom array för giltig plan
4. `validateTaskPlan` fångar okänd dependency
5. `validateTaskPlan` fångar self-dependency
6. `validateTaskPlan` fångar dependency-cykel (A→B→A)
7. `validateTaskPlan` fångar för kort passCriterion
8. `validateTaskPlan` fångar för kort description
9. `TaskPlanSchema` kräver minst 1 task
10. Manager-prompten innehåller "Task Planning"-sektion

## Acceptanskriterier

- [ ] `src/core/task-splitter.ts` existerar med `AtomicTaskSchema`, `TaskPlanSchema`, `validateTaskPlan()`
- [ ] `prompts/manager.md` innehåller "Task Planning"-sektion med regler för atomära uppgifter
- [ ] `src/core/agents/manager.ts` har `write_task_plan`-verktyg
- [ ] `task_plan.md` skrivs till run-katalogen vid anrop
- [ ] Validering fångar cykler, saknade dependencies, för korta kriterier
- [ ] 10+ tester i `tests/core/task-splitter.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Ändrar Manager-beteende via prompt — Manager kan tolka instruktionen för strikt
och skapa onödigt många mikro-uppgifter, eller ignorera den helt. Verifieringsportar (S1)
hjälper men garanterar inte. Koden är additivt (nytt verktyg, ny fil), men prompt-ändringen
påverkar hur Manager planerar.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 474+ passed (beroende på om N1 körts först).

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-atomic-task-splitting.md --hours 1
```
