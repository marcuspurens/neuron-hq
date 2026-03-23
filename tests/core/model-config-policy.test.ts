import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { AgentModelMapSchema } from '../../src/core/model-registry.js';

describe('agent_models in limits.yaml', () => {
  it('loads agent_models from limits.yaml', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    const limitsContent = yaml.parse(raw) as Record<string, unknown>;
    expect(limitsContent.agent_models).toBeDefined();
  });

  it('agent_models validates as AgentModelMap', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    const limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const result = AgentModelMapSchema.safeParse(limitsContent.agent_models);
    expect(result.success).toBe(true);
  });

  it('all agents use Sonnet default — no per-agent overrides (S128)', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    const limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const agentModels = limitsContent.agent_models as Record<string, unknown>;
    expect(Object.keys(agentModels)).toHaveLength(0);
  });
});
