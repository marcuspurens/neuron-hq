import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

describe('dashboard-ui task list enhancements', () => {
  const html = renderLiveDashboard('test-run-tasks');

  // --- State variables ---
  it('declares taskWaves variable', () => {
    expect(html).toContain('var taskWaves={}');
  });

  it('declares taskStartTimes variable', () => {
    expect(html).toContain('var taskStartTimes={}');
  });

  // --- Wave tracking from audit events ---
  it('handles audit events in handleEvent for wave tracking', () => {
    expect(html).toContain("event==='audit'");
    expect(html).toContain("data.tool==='delegate_parallel_wave'");
  });

  it('extracts wave number from audit data', () => {
    expect(html).toContain('data.wave||data.wave_index||0');
  });

  it('saves task wave assignments from waveTasks array', () => {
    expect(html).toContain('taskWaves[waveTasks[wi].id]=waveNum');
  });

  // --- Start time tracking ---
  it('records task start time on running status', () => {
    expect(html).toContain("data.status==='running' && !taskStartTimes[data.taskId]");
    expect(html).toContain('taskStartTimes[data.taskId]=Date.now()');
  });

  // --- Wave grouping in renderTasks ---
  it('groups tasks by wave number', () => {
    expect(html).toContain('taskWaves[ids[i]]');
    expect(html).toContain("waves={};");
    expect(html).toContain("noWave=[]");
  });

  it('sorts wave numbers numerically', () => {
    expect(html).toContain('Number(a)-Number(b)');
  });

  it('renders wave separator headers', () => {
    expect(html).toContain('Wave ');
    expect(html).toContain('#38bdf8');
  });

  // --- Task item rendering ---
  it('shows task description in renderTaskItem', () => {
    expect(html).toContain('taskDescriptions[tid]');
  });

  it('shows agent name in renderTaskItem', () => {
    expect(html).toContain('taskAgents[tid]');
    expect(html).toContain('cap(taskAgents[tid])');
  });

  it('shows time elapsed for running tasks', () => {
    expect(html).toContain('taskStartTimes[tid]');
    expect(html).toContain('/60000');
  });

  it('shows duration for completed tasks', () => {
    expect(html).toContain("s==='completed'&&taskStartTimes[tid]");
  });

  // --- Preserves updateTask function ---
  it('still contains updateTask function', () => {
    expect(html).toContain('function updateTask(');
  });

  it('updateTask still stores descriptions', () => {
    expect(html).toContain('taskDescriptions[taskId]=description');
  });

  it('updateTask still stores agents', () => {
    expect(html).toContain('taskAgents[taskId]=agent');
  });
});
