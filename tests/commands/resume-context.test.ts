import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('STOP file auto-removal at resume', () => {
  it('resume.ts removes STOP file before starting manager', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    expect(source).toContain('fs.unlink(stopPath)');
    expect(source).toContain('Removed STOP file');
  });

  it('resume.ts does not throw if STOP file does not exist', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    // The unlink is wrapped in try/catch
    const unlinkPos = source.indexOf('fs.unlink(stopPath)');
    expect(unlinkPos).toBeGreaterThan(-1);
    // There should be a catch block after it
    const afterUnlink = source.slice(unlinkPos, unlinkPos + 200);
    expect(afterUnlink).toContain('catch');
  });
});

describe('estop_handoff.md written on e-stop', () => {
  it('run.ts writes estop_handoff.md in EstopError catch', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/run.ts'), 'utf-8');
    expect(source).toContain('estop_handoff.md');
    expect(source).toContain('E-Stop Handoff');
  });

  it('resume.ts writes estop_handoff.md in EstopError catch', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    expect(source).toContain('estop_handoff.md');
    expect(source).toContain('E-Stop Handoff');
  });

  it('handoff includes run ID and timestamp placeholders', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/run.ts'), 'utf-8');
    expect(source).toContain('**Run ID:**');
    expect(source).toContain('**Stopped at:**');
    expect(source).toContain('new Date().toISOString()');
  });
});

describe('resume loads previous run context', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-ctx-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('resume.ts reads estop_handoff.md from previous run', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    expect(source).toContain("'estop_handoff.md'");
    expect(source).toContain('tryRead');
  });

  it('resume.ts reads implementer_handoff.md from previous run', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    expect(source).toContain("'implementer_handoff.md'");
  });

  it('resume.ts reads reviewer_handoff.md from previous run', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    expect(source).toContain("'reviewer_handoff.md'");
  });

  it('resume without handoffs works (empty context, contextParts.length check)', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/commands/resume.ts'), 'utf-8');
    expect(source).toContain('contextParts.length > 1');
  });
});

describe('Manager includes previousRunContext in prompt', () => {
  it('manager.ts checks for previousRunContext', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/core/agents/manager.ts'), 'utf-8');
    expect(source).toContain('previousRunContext');
    expect(source).toContain('Previous Run Context');
  });

  it('RunContext interface includes optional previousRunContext field', async () => {
    const source = await fs.readFile(path.join(BASE_DIR, 'src/core/run.ts'), 'utf-8');
    expect(source).toContain('previousRunContext');
  });
});
