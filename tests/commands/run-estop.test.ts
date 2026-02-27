import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('runCommand STOP-file pre-check', () => {
  it('run.ts checks for STOP file before starting', async () => {
    const runSource = await fs.readFile(
      path.join(BASE_DIR, 'src/commands/run.ts'),
      'utf-8'
    );
    expect(runSource).toContain('STOP file exists from a previous session');
    expect(runSource).toContain('process.exit(1)');
  });

  it('STOP check happens before baseline verification', async () => {
    const runSource = await fs.readFile(
      path.join(BASE_DIR, 'src/commands/run.ts'),
      'utf-8'
    );
    const stopCheckPos = runSource.indexOf('STOP file exists from a previous session');
    const baselinePos = runSource.indexOf('Running baseline verification');
    expect(stopCheckPos).toBeGreaterThan(-1);
    expect(baselinePos).toBeGreaterThan(-1);
    expect(stopCheckPos).toBeLessThan(baselinePos);
  });
});
