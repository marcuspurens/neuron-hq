import { z } from 'zod';

export const AtomicTaskSchema = z.object({
  id: z.string().describe('Short ID like T1, T2, T3'),
  description: z.string().describe('One-sentence description of the change'),
  files: z.array(z.string()).describe('Expected files to touch'),
  passCriterion: z.string().describe('How to verify this task passed'),
  dependsOn: z.array(z.string()).optional().describe('IDs of tasks that must complete first'),
  maxDiffLines: z.number().positive().optional(),
  maxDiffJustification: z.string().min(10).optional(),
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

    // Validate maxDiffLines requires maxDiffJustification
    if (task.maxDiffLines !== undefined) {
      if (!task.maxDiffJustification || task.maxDiffJustification.trim().length < 10) {
        errors.push(
          `Task ${task.id}: maxDiffJustification is required when maxDiffLines is set (min 10 characters)`
        );
      }
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
