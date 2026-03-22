import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { AgentModelMapSchema } from '../../src/core/model-registry.js';

describe('agent_models in limits.yaml', () => {
  let limitsContent: Record<string, unknown>;

  it('loads agent_models from limits.yaml', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    limitsContent = yaml.parse(raw) as Record<string, unknown>;
    expect(limitsContent.agent_models).toBeDefined();
  });

  it('agent_models validates as AgentModelMap', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const result = AgentModelMapSchema.safeParse(limitsContent.agent_models);
    expect(result.success).toBe(true);
  });

  it('agent_models has Opus overrides for manager, reviewer, brief-agent (S123)', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const agentModels = limitsContent.agent_models as Record<string, unknown>;
    expect(Object.keys(agentModels)).toHaveLength(3);
    expect(agentModels).toHaveProperty('manager');
    expect(agentModels).toHaveProperty('reviewer');
    expect(agentModels).toHaveProperty('brief-agent');
    for (const role of ['manager', 'reviewer', 'brief-agent']) {
      const cfg = agentModels[role] as Record<string, unknown>;
      expect(cfg.model).toBe('claude-opus-4-6');
      expect(cfg.maxTokens).toBe(128000);
    }
  });
});
