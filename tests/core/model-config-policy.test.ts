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

  it('has researcher and historian overrides (librarian uses default Sonnet)', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const agentModels = limitsContent.agent_models as Record<string, unknown>;
    expect(agentModels).toHaveProperty('researcher');
    expect(agentModels).toHaveProperty('historian');
    expect(agentModels).not.toHaveProperty('librarian');
  });

  it('overridden agents use haiku model', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const agentModels = limitsContent.agent_models as Record<string, Record<string, string>>;
    expect(agentModels.researcher.model).toBe('claude-haiku-4-5-20251001');
    expect(agentModels.historian.model).toBe('claude-haiku-4-5-20251001');
  });

  it('overridden agents have anthropic provider', async () => {
    const limitsPath = path.join(process.cwd(), 'policy', 'limits.yaml');
    const raw = await fs.readFile(limitsPath, 'utf-8');
    limitsContent = yaml.parse(raw) as Record<string, unknown>;
    const agentModels = limitsContent.agent_models as Record<string, Record<string, string>>;
    expect(agentModels.researcher.provider).toBe('anthropic');
    expect(agentModels.historian.provider).toBe('anthropic');
  });
});
