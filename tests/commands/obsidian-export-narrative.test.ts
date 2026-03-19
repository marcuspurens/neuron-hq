import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exportRunNarrative } from '../../src/commands/obsidian-export.js';

describe('obsidian-export-narrative', () => {
  let tempVault: string;
  let tempRunDir: string;

  beforeEach(async () => {
    tempVault = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
    tempRunDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-'));
  });

  afterEach(async () => {
    await fs.rm(tempVault, { recursive: true, force: true });
    await fs.rm(tempRunDir, { recursive: true, force: true });
  });

  it('exports narrative to Korningar/ with correct filename', async () => {
    const narrative = `---
generated: 2026-03-19T14:30:00
run_id: 20260319-1327-neuron-hq
stoplight: GREEN
agents: [manager, implementer]
---

# Körningsberättelse: Test
`;
    await fs.writeFile(path.join(tempRunDir, 'run-narrative.md'), narrative);

    const result = await exportRunNarrative({
      runDir: tempRunDir,
      runId: '20260319-1327-neuron-hq',
      vault: tempVault,
    });

    expect(result).not.toBeNull();
    const exported = await fs.readFile(result!, 'utf-8');
    expect(exported).toContain('tags: [korning, green]');
    expect(result).toContain('Korningar');
    expect(result).toContain('korning-20260319-1327-neuron-hq.md');
  });

  it('includes correct tags from stoplight', async () => {
    const narrative = `---
generated: 2026-03-19T14:30:00
run_id: test-run
stoplight: RED
agents: [manager]
---

# Körningsberättelse: Test
`;
    await fs.writeFile(path.join(tempRunDir, 'run-narrative.md'), narrative);

    const result = await exportRunNarrative({
      runDir: tempRunDir,
      runId: 'test-run',
      vault: tempVault,
    });

    const exported = await fs.readFile(result!, 'utf-8');
    expect(exported).toContain('tags: [korning, red]');
  });

  it('returns null when run-narrative.md is missing', async () => {
    const result = await exportRunNarrative({
      runDir: tempRunDir,
      runId: 'no-narrative-run',
      vault: tempVault,
    });

    expect(result).toBeNull();
    // Verify no Korningar directory was created
    const exists = await fs.access(path.join(tempVault, 'Korningar')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
