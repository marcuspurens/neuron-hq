import { describe, it, expect } from 'vitest';
import { AtomicTaskSchema, TaskPlanSchema, validateTaskPlan } from '../../src/core/task-splitter.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AtomicTaskSchema', () => {
  it('validates a correct task object', () => {
    const result = AtomicTaskSchema.safeParse({
      id: 'T1',
      description: 'Create the task splitter module',
      files: ['src/core/task-splitter.ts'],
      passCriterion: 'pnpm typecheck passes',
    });
    expect(result.success).toBe(true);
  });

  it('validates task with dependsOn', () => {
    const result = AtomicTaskSchema.safeParse({
      id: 'T2',
      description: 'Add validation function to module',
      files: ['src/core/task-splitter.ts'],
      passCriterion: 'Unit tests pass',
      dependsOn: ['T1'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects task without passCriterion', () => {
    const result = AtomicTaskSchema.safeParse({
      id: 'T1',
      description: 'Create the task splitter module',
      files: ['src/core/task-splitter.ts'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects task without id', () => {
    const result = AtomicTaskSchema.safeParse({
      description: 'Create something',
      files: ['src/foo.ts'],
      passCriterion: 'Tests pass',
    });
    expect(result.success).toBe(false);
  });
});

describe('TaskPlanSchema', () => {
  it('requires at least 1 task', () => {
    const result = TaskPlanSchema.safeParse({ tasks: [] });
    expect(result.success).toBe(false);
  });

  it('accepts plan with one valid task', () => {
    const result = TaskPlanSchema.safeParse({
      tasks: [{
        id: 'T1',
        description: 'A valid task description here',
        files: ['src/foo.ts'],
        passCriterion: 'Tests pass correctly',
      }],
    });
    expect(result.success).toBe(true);
  });
});

describe('validateTaskPlan', () => {
  it('returns empty array for valid plan', () => {
    const errors = validateTaskPlan({
      tasks: [{
        id: 'T1',
        description: 'Create the task splitter module',
        files: ['src/core/task-splitter.ts'],
        passCriterion: 'pnpm typecheck passes',
      }],
    });
    expect(errors).toEqual([]);
  });

  it('catches unknown dependency', () => {
    const errors = validateTaskPlan({
      tasks: [{
        id: 'T1',
        description: 'Create the task splitter module',
        files: ['src/core/task-splitter.ts'],
        passCriterion: 'pnpm typecheck passes',
        dependsOn: ['T99'],
      }],
    });
    expect(errors).toContainEqual(expect.stringContaining('unknown task T99'));
  });

  it('catches self-dependency', () => {
    const errors = validateTaskPlan({
      tasks: [{
        id: 'T1',
        description: 'Create the task splitter module',
        files: ['src/core/task-splitter.ts'],
        passCriterion: 'pnpm typecheck passes',
        dependsOn: ['T1'],
      }],
    });
    expect(errors).toContainEqual(expect.stringContaining('depends on itself'));
  });

  it('catches dependency cycle (A->B->A)', () => {
    const errors = validateTaskPlan({
      tasks: [
        {
          id: 'A',
          description: 'Task A depends on B here',
          files: ['a.ts'],
          passCriterion: 'Tests pass for A',
          dependsOn: ['B'],
        },
        {
          id: 'B',
          description: 'Task B depends on A here',
          files: ['b.ts'],
          passCriterion: 'Tests pass for B',
          dependsOn: ['A'],
        },
      ],
    });
    expect(errors).toContainEqual(expect.stringContaining('cycle'));
  });

  it('catches too short passCriterion', () => {
    const errors = validateTaskPlan({
      tasks: [{
        id: 'T1',
        description: 'Create the task splitter module',
        files: ['src/core/task-splitter.ts'],
        passCriterion: 'ok',
      }],
    });
    expect(errors).toContainEqual(expect.stringContaining('too short pass criterion'));
  });

  it('catches too short description', () => {
    const errors = validateTaskPlan({
      tasks: [{
        id: 'T1',
        description: 'Do X',
        files: ['src/core/task-splitter.ts'],
        passCriterion: 'pnpm typecheck passes',
      }],
    });
    expect(errors).toContainEqual(expect.stringContaining('too short description'));
  });
});

describe('Manager prompt - Task Planning', () => {
  const prompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');

  it('contains "Task Planning" section', () => {
    expect(prompt).toMatch(/## Task Planning/);
  });

  it('contains rules for atomic tasks', () => {
    expect(prompt).toMatch(/Rules for atomic tasks/);
  });

  it('contains "Delegate one task at a time"', () => {
    expect(prompt).toMatch(/Delegate one task at a time/);
  });
});
