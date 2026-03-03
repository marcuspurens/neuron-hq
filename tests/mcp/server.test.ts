import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all tool registration functions
vi.mock('../../src/mcp/tools/runs.js', () => ({
  registerRunsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/knowledge.js', () => ({
  registerKnowledgeTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/costs.js', () => ({
  registerCostsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/start.js', () => ({
  registerStartTool: vi.fn(),
}));

import { createMcpServer } from '../../src/mcp/server.js';
import { registerRunsTool } from '../../src/mcp/tools/runs.js';
import { registerKnowledgeTool } from '../../src/mcp/tools/knowledge.js';
import { registerCostsTool } from '../../src/mcp/tools/costs.js';
import { registerStartTool } from '../../src/mcp/tools/start.js';

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a server instance', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it('registers all 4 tools', () => {
    createMcpServer();
    expect(registerRunsTool).toHaveBeenCalledTimes(1);
    expect(registerKnowledgeTool).toHaveBeenCalledTimes(1);
    expect(registerCostsTool).toHaveBeenCalledTimes(1);
    expect(registerStartTool).toHaveBeenCalledTimes(1);
  });

  it('passes server to each tool registrar', () => {
    const server = createMcpServer();
    expect(registerRunsTool).toHaveBeenCalledWith(server);
    expect(registerKnowledgeTool).toHaveBeenCalledWith(server);
    expect(registerCostsTool).toHaveBeenCalledWith(server);
    expect(registerStartTool).toHaveBeenCalledWith(server);
  });
});
