import { describe, it, expect } from 'vitest';
import {
  computeExecutionWaves,
  taskBranchName,
  detectFileConflicts,
  splitConflictingWave,
  TaskBranchStatusSchema,
} from '../../src/core/parallel-coordinator.js';
import type { AtomicTask } from '../../src/core/task-splitter.js';

function makeTask(id: string, deps: string[] = [], files: string[] = [`file-${id}.ts`]): AtomicTask {
  return { id, description: `Task ${id}`, files, passCriterion: 'test passes', dependsOn: deps };
}

describe('computeExecutionWaves', () => {
  it('no dependencies → all tasks in one wave', () => {
    const t1 = makeTask('T1');
    const t2 = makeTask('T2');
    const t3 = makeTask('T3');
    const waves = computeExecutionWaves([t1, t2, t3]);
    expect(waves).toEqual([[t1, t2, t3]]);
  });

  it('linear dependencies → separate waves', () => {
    const t1 = makeTask('T1');
    const t2 = makeTask('T2', ['T1']);
    const t3 = makeTask('T3', ['T2']);
    const waves = computeExecutionWaves([t1, t2, t3]);
    expect(waves).toEqual([[t1], [t2], [t3]]);
  });

  it('diamond dependency → two waves', () => {
    const t1 = makeTask('T1');
    const t2 = makeTask('T2');
    const t3 = makeTask('T3', ['T1', 'T2']);
    const t4 = makeTask('T4', ['T1', 'T2']);
    const waves = computeExecutionWaves([t1, t2, t3, t4]);
    expect(waves).toEqual([[t1, t2], [t3, t4]]);
  });

  it('empty list → empty result', () => {
    expect(computeExecutionWaves([])).toEqual([]);
  });

  it('single task → one wave', () => {
    const t1 = makeTask('T1');
    const waves = computeExecutionWaves([t1]);
    expect(waves).toEqual([[t1]]);
  });

  it('mixed deps — T1 independent, T2→T1, T3 independent', () => {
    const t1 = makeTask('T1');
    const t2 = makeTask('T2', ['T1']);
    const t3 = makeTask('T3');
    const waves = computeExecutionWaves([t1, t2, t3]);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toEqual([t1, t3]);
    expect(waves[1]).toEqual([t2]);
  });
});

describe('taskBranchName', () => {
  it('correct format', () => {
    expect(taskBranchName('run-123', 'T1')).toBe('neuron/run-123/task-T1');
  });
});

describe('detectFileConflicts', () => {
  it('no overlap → empty array', () => {
    const wave = [
      makeTask('T1', [], ['file-a.ts']),
      makeTask('T2', [], ['file-b.ts']),
    ];
    expect(detectFileConflicts(wave)).toEqual([]);
  });

  it('shared file → reports pair', () => {
    const wave = [
      makeTask('T1', [], ['shared.ts']),
      makeTask('T2', [], ['shared.ts']),
    ];
    const conflicts = detectFileConflicts(wave);
    expect(conflicts).toEqual([
      { taskA: 'T1', taskB: 'T2', sharedFiles: ['shared.ts'] },
    ]);
  });

  it('three tasks, two share file', () => {
    const wave = [
      makeTask('T1', [], ['a.ts']),
      makeTask('T2', [], ['a.ts', 'b.ts']),
      makeTask('T3', [], ['c.ts']),
    ];
    const conflicts = detectFileConflicts(wave);
    expect(conflicts).toEqual([
      { taskA: 'T1', taskB: 'T2', sharedFiles: ['a.ts'] },
    ]);
  });
});

describe('splitConflictingWave', () => {
  it('no conflict → single group', () => {
    const t1 = makeTask('T1', [], ['a.ts']);
    const t2 = makeTask('T2', [], ['b.ts']);
    const t3 = makeTask('T3', [], ['c.ts']);
    const wave = [t1, t2, t3];
    const result = splitConflictingWave(wave);
    expect(result).toEqual([wave]);
  });

  it('conflict → separate groups', () => {
    const t1 = makeTask('T1', [], ['shared.ts']);
    const t2 = makeTask('T2', [], ['shared.ts']);
    const t3 = makeTask('T3', [], ['other.ts']);
    const result = splitConflictingWave([t1, t2, t3]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([t1, t3]);
    expect(result[1]).toEqual([t2]);
  });
});

describe('TaskBranchStatusSchema', () => {
  it('validates correct object', () => {
    const result = TaskBranchStatusSchema.safeParse({
      taskId: 'T1',
      branch: 'neuron/run-1/task-T1',
      status: 'completed',
      filesModified: ['a.ts'],
      testsPassing: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = TaskBranchStatusSchema.safeParse({
      taskId: 'T1',
      branch: 'neuron/run-1/task-T1',
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});
