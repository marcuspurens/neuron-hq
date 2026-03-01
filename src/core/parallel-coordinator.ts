import { z } from 'zod';
import type { AtomicTask } from './task-splitter.js';

/**
 * Groups tasks into execution waves using topological sorting.
 * Tasks in the same wave have no dependencies on each other.
 * Wave of a task = max(wave of each dependency) + 1. No deps → wave 0.
 */
export function computeExecutionWaves(tasks: AtomicTask[]): AtomicTask[][] {
  if (tasks.length === 0) return [];

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const waveMap = new Map<string, number>();

  function getWave(id: string): number {
    if (waveMap.has(id)) return waveMap.get(id)!;

    const task = taskMap.get(id);
    if (!task) return 0;

    const deps = task.dependsOn ?? [];
    if (deps.length === 0) {
      waveMap.set(id, 0);
      return 0;
    }

    const wave = Math.max(...deps.map(dep => getWave(dep))) + 1;
    waveMap.set(id, wave);
    return wave;
  }

  for (const task of tasks) {
    getWave(task.id);
  }

  const maxWave = Math.max(...waveMap.values());
  const waves: AtomicTask[][] = [];

  for (let w = 0; w <= maxWave; w++) {
    const waveTasks = tasks.filter(t => waveMap.get(t.id) === w);
    if (waveTasks.length > 0) {
      waves.push(waveTasks);
    }
  }

  return waves;
}

/**
 * Generates a git branch name for a task within a run.
 */
export function taskBranchName(runId: string, taskId: string): string {
  return `neuron/${runId}/task-${taskId}`;
}

/**
 * Detects file conflicts between pairs of tasks in a wave.
 * Returns pairs of tasks that share files.
 */
export function detectFileConflicts(
  wave: AtomicTask[],
): Array<{ taskA: string; taskB: string; sharedFiles: string[] }> {
  const conflicts: Array<{ taskA: string; taskB: string; sharedFiles: string[] }> = [];

  for (let i = 0; i < wave.length; i++) {
    for (let j = i + 1; j < wave.length; j++) {
      const filesA = new Set(wave[i].files);
      const shared = wave[j].files.filter(f => filesA.has(f));
      if (shared.length > 0) {
        conflicts.push({
          taskA: wave[i].id,
          taskB: wave[j].id,
          sharedFiles: shared,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Splits a wave into sub-waves where no tasks share files.
 * Uses greedy coloring: each task is assigned to the first sub-wave
 * that has no file conflict with it.
 */
export function splitConflictingWave(wave: AtomicTask[]): AtomicTask[][] {
  if (wave.length === 0) return [];

  const subWaves: AtomicTask[][] = [];

  for (const task of wave) {
    let placed = false;

    for (const subWave of subWaves) {
      const subWaveFiles = new Set(subWave.flatMap(t => t.files));
      const hasConflict = task.files.some(f => subWaveFiles.has(f));

      if (!hasConflict) {
        subWave.push(task);
        placed = true;
        break;
      }
    }

    if (!placed) {
      subWaves.push([task]);
    }
  }

  return subWaves;
}

export const TaskBranchStatusSchema = z.object({
  taskId: z.string(),
  branch: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  filesModified: z.array(z.string()).default([]),
  testsPassing: z.boolean().optional(),
  error: z.string().optional(),
});

export type TaskBranchStatus = z.infer<typeof TaskBranchStatusSchema>;
