import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the modules BEFORE importing the command
vi.mock('../../src/core/knowledge-graph.js', () => ({
  loadGraph: vi.fn(),
}));

vi.mock('../../src/core/graph-health.js', () => ({
  runHealthCheck: vi.fn(),
  generateHealthReport: vi.fn(),
}));

import { loadGraph } from '../../src/core/knowledge-graph.js';
import { runHealthCheck, generateHealthReport } from '../../src/core/graph-health.js';
import { graphHealthCommand } from '../../src/commands/graph-health.js';

describe('graph-health CLI', () => {
  const mockGraph = { nodes: [], edges: [] };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    (loadGraph as any).mockResolvedValue(mockGraph);
  });

  it('outputs markdown report by default', async () => {
    const mockResult = { status: 'GREEN', checks: {}, recommendations: [], summary: { totalNodes: 0, totalEdges: 0, edgesPerNode: 0 }, timestamp: '' };
    (runHealthCheck as any).mockReturnValue(mockResult);
    (generateHealthReport as any).mockReturnValue('# Report');
    
    await graphHealthCommand([]);
    
    expect(generateHealthReport).toHaveBeenCalledWith(mockResult);
    expect(console.log).toHaveBeenCalledWith('# Report');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('outputs JSON with --json flag', async () => {
    const mockResult = { status: 'YELLOW', checks: {}, recommendations: [], summary: { totalNodes: 10, totalEdges: 2, edgesPerNode: 0.2 }, timestamp: '' };
    (runHealthCheck as any).mockReturnValue(mockResult);
    
    await graphHealthCommand(['--json']);
    
    expect(generateHealthReport).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockResult, null, 2));
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('exits with code 0 for GREEN', async () => {
    (runHealthCheck as any).mockReturnValue({ status: 'GREEN', checks: {}, recommendations: [], summary: { totalNodes: 0, totalEdges: 0, edgesPerNode: 0 }, timestamp: '' });
    (generateHealthReport as any).mockReturnValue('');
    await graphHealthCommand([]);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('exits with code 1 for YELLOW', async () => {
    (runHealthCheck as any).mockReturnValue({ status: 'YELLOW', checks: {}, recommendations: [], summary: { totalNodes: 0, totalEdges: 0, edgesPerNode: 0 }, timestamp: '' });
    (generateHealthReport as any).mockReturnValue('');
    await graphHealthCommand([]);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('exits with code 2 for RED', async () => {
    (runHealthCheck as any).mockReturnValue({ status: 'RED', checks: {}, recommendations: [], summary: { totalNodes: 0, totalEdges: 0, edgesPerNode: 0 }, timestamp: '' });
    (generateHealthReport as any).mockReturnValue('');
    await graphHealthCommand([]);
    expect(process.exit).toHaveBeenCalledWith(2);
  });

  it('handles loadGraph failure gracefully', async () => {
    (loadGraph as any).mockRejectedValue(new Error('File not found'));
    await graphHealthCommand([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
