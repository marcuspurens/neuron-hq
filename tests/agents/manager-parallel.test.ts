import { describe, it, expect } from 'vitest';
import { computeExecutionWaves, splitConflictingWave, detectFileConflicts } from '../../src/core/parallel-coordinator.js';
import type { AtomicTask } from '../../src/core/task-splitter.js';

function makeTask(id: string, deps: string[] = [], files: string[] = [`file-${id}.ts`]): AtomicTask {
  return { id, description: `Task ${id} description`, files, passCriterion: 'tests pass', dependsOn: deps };
}

describe('Manager parallel execution', () => {
  it('creates execution waves from task plan', () => {
    const tasks = [
      makeTask('T1'),
      makeTask('T2', ['T1']),
      makeTask('T3'),
      makeTask('T4', ['T1', 'T3']),
    ];

    const waves = computeExecutionWaves(tasks);

    expect(waves.length).toBe(2);

    const wave0Ids = waves[0].map(t => t.id).sort();
    const wave1Ids = waves[1].map(t => t.id).sort();

    expect(wave0Ids).toEqual(['T1', 'T3']);
    expect(wave1Ids).toEqual(['T2', 'T4']);
  });

  it('single-task wave should delegate sequentially', () => {
    const tasks = [
      makeTask('T1'),
      makeTask('T2', ['T1']),
    ];

    const waves = computeExecutionWaves(tasks);

    expect(waves.length).toBe(2);
    expect(waves[1].length).toBe(1);
    expect(waves[1][0].id).toBe('T2');

    const subGroups = splitConflictingWave(waves[1]);
    expect(subGroups).toEqual([[waves[1][0]]]);
  });

  it('multi-task wave delegates in parallel', () => {
    const tasks = [
      makeTask('T1'),
      makeTask('T2'),
      makeTask('T3'),
    ];

    const waves = computeExecutionWaves(tasks);

    expect(waves.length).toBe(1);
    expect(waves[0].length).toBe(3);

    // No file conflicts → single sub-group
    const subGroups = splitConflictingWave(waves[0]);
    expect(subGroups.length).toBe(1);
    expect(subGroups[0].length).toBe(3);
  });

  it('handles mixed results — independent and dependent tasks', () => {
    const tasks = [
      makeTask('T1'),
      makeTask('T2'),
      makeTask('T3', ['T1']),
      makeTask('T4', ['T2']),
    ];

    const waves = computeExecutionWaves(tasks);

    expect(waves.length).toBe(2);

    const wave0Ids = waves[0].map(t => t.id).sort();
    const wave1Ids = waves[1].map(t => t.id).sort();

    expect(wave0Ids).toEqual(['T1', 'T2']);
    expect(wave1Ids).toEqual(['T3', 'T4']);
    expect(waves[0].length).toBe(2);
    expect(waves[1].length).toBe(2);
  });

  it('sequences tasks with file conflicts', () => {
    const tasks = [
      makeTask('T1', [], ['shared.ts']),
      makeTask('T2', [], ['shared.ts']),
      makeTask('T3', [], ['other.ts']),
    ];

    // All independent → single wave
    const waves = computeExecutionWaves(tasks);
    expect(waves.length).toBe(1);
    expect(waves[0].length).toBe(3);

    // Detect T1-T2 conflict on shared.ts
    const conflicts = detectFileConflicts(waves[0]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].sharedFiles).toEqual(['shared.ts']);
    expect(new Set([conflicts[0].taskA, conflicts[0].taskB])).toEqual(new Set(['T1', 'T2']));

    // Split into sub-groups with no intra-group file conflicts
    const subGroups = splitConflictingWave(waves[0]);
    expect(subGroups.length).toBe(2);

    // Verify no group has two tasks sharing a file
    for (const group of subGroups) {
      const allFiles = group.flatMap(t => t.files);
      const uniqueFiles = new Set(allFiles);
      expect(allFiles.length).toBe(uniqueFiles.size);
    }

    // T3 (other.ts) should be grouped with one of the conflicting tasks
    const allGroupIds = subGroups.map(g => g.map(t => t.id).sort());
    // Greedy: T1 goes first, T2 conflicts with T1 so new group, T3 fits with T1
    expect(allGroupIds[0]).toEqual(['T1', 'T3']);
    expect(allGroupIds[1]).toEqual(['T2']);
  });
});
