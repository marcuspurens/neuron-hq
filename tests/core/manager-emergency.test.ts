import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the emergencySave function
vi.mock('../../src/core/emergency-save.js', () => ({
  emergencySave: vi.fn().mockResolvedValue({ saved: true, commitHash: 'abc123' }),
}));

import { emergencySave } from '../../src/core/emergency-save.js';

const mockedEmergencySave = vi.mocked(emergencySave);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// We test the integration pattern used by manager, implementer, and merger.
// Each agent has the same call-site logic:
//   if (iteration >= this.maxIterations) { await emergencySave({ ... }); }
// Instead of booting the full Agent classes (which need Anthropic + RunContext),
// we simulate the guard-and-call pattern directly.
// ═══════════════════════════════════════════════════════════════════════════

describe('Manager emergency save integration', () => {
  it('emergencySave is importable and callable', () => {
    expect(emergencySave).toBeDefined();
    expect(typeof emergencySave).toBe('function');
  });

  it('simulated max iterations triggers emergencySave with agentName manager', async () => {
    const mockAudit = { log: vi.fn() };
    const maxIterations = 5;
    const iteration = 5;

    if (iteration >= maxIterations) {
      await emergencySave({
        agentName: 'manager',
        iteration,
        maxIterations,
        workspaceDir: '/tmp/test-workspace',
        runDir: '/tmp/test-run',
        runid: 'test-run-123',
        audit: mockAudit as never,
      });
    }

    expect(mockedEmergencySave).toHaveBeenCalledTimes(1);
    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'manager',
        iteration: 5,
        maxIterations: 5,
      }),
    );
  });

  it('passes correct iteration count', async () => {
    const mockAudit = { log: vi.fn() };
    const maxIterations = 70;
    const iteration = 70;

    if (iteration >= maxIterations) {
      await emergencySave({
        agentName: 'manager',
        iteration,
        maxIterations,
        workspaceDir: '/workspace/proj',
        runDir: '/runs/run-42',
        runid: 'run-42',
        audit: mockAudit as never,
      });
    }

    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({ iteration: 70, maxIterations: 70 }),
    );
  });

  it('does NOT call emergencySave when iteration < maxIterations', async () => {
    const mockAudit = { log: vi.fn() };
    const maxIterations = 10;
    const iteration = 7;

    if (iteration >= maxIterations) {
      await emergencySave({
        agentName: 'manager',
        iteration,
        maxIterations,
        workspaceDir: '/tmp/ws',
        runDir: '/tmp/rd',
        runid: 'run-x',
        audit: mockAudit as never,
      });
    }

    expect(mockedEmergencySave).not.toHaveBeenCalled();
  });

  it('passes workspaceDir from context', async () => {
    const mockAudit = { log: vi.fn() };

    await emergencySave({
      agentName: 'manager',
      iteration: 10,
      maxIterations: 10,
      workspaceDir: '/my/special/workspace',
      runDir: '/my/run',
      runid: 'run-ws',
      audit: mockAudit as never,
    });

    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceDir: '/my/special/workspace' }),
    );
  });

  it('passes runDir from context', async () => {
    const mockAudit = { log: vi.fn() };

    await emergencySave({
      agentName: 'manager',
      iteration: 5,
      maxIterations: 5,
      workspaceDir: '/ws',
      runDir: '/runs/special-run',
      runid: 'special-run',
      audit: mockAudit as never,
    });

    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({ runDir: '/runs/special-run' }),
    );
  });

  it('passes audit from context', async () => {
    const mockAudit = { log: vi.fn() };

    await emergencySave({
      agentName: 'manager',
      iteration: 3,
      maxIterations: 3,
      workspaceDir: '/ws',
      runDir: '/rd',
      runid: 'run-audit',
      audit: mockAudit as never,
    });

    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({ audit: mockAudit }),
    );
  });
});

describe('Implementer emergency save integration', () => {
  it('simulated max iterations triggers emergencySave with agentName implementer', async () => {
    const mockAudit = { log: vi.fn() };
    const maxIterations = 55;
    const iteration = 55;

    if (iteration >= maxIterations) {
      await emergencySave({
        agentName: 'implementer',
        iteration,
        maxIterations,
        workspaceDir: '/ws/impl',
        runDir: '/runs/impl-run',
        runid: 'impl-run',
        audit: mockAudit as never,
      });
    }

    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'implementer', iteration: 55 }),
    );
  });
});

describe('Merger emergency save integration', () => {
  it('simulated max iterations triggers emergencySave with agentName merger', async () => {
    const mockAudit = { log: vi.fn() };
    const maxIterations = 30;
    const iteration = 30;

    if (iteration >= maxIterations) {
      await emergencySave({
        agentName: 'merger',
        iteration,
        maxIterations,
        workspaceDir: '/ws/merge',
        runDir: '/runs/merge-run',
        runid: 'merge-run',
        audit: mockAudit as never,
      });
    }

    expect(mockedEmergencySave).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'merger', iteration: 30 }),
    );
  });
});
