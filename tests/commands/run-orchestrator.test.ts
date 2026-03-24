import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('Orchestrator agent order in run.ts', () => {
  let runSource: string;

  beforeAll(async () => {
    runSource = await fs.readFile(
      path.join(BASE_DIR, 'src/commands/run.ts'),
      'utf-8'
    );
  });

  // AC15: runConsolidator() runs after Historian and before Observer-retro
  // Use the call site comment (not function definition) to verify orchestrator order
  it('Consolidator runs AFTER Historian in orchestrator', () => {
    const historianComment = runSource.indexOf('// Historian: write run summary');
    const consolidatorComment = runSource.indexOf('// Consolidator: reorganize graph');
    expect(historianComment).toBeGreaterThan(-1);
    expect(consolidatorComment).toBeGreaterThan(-1);
    expect(historianComment).toBeLessThan(consolidatorComment);
  });

  it('Consolidator runs BEFORE Observer-retro in orchestrator', () => {
    const consolidatorComment = runSource.indexOf('// Consolidator: reorganize graph');
    const observerComment = runSource.indexOf('// Observer: prompt-health report');
    expect(consolidatorComment).toBeGreaterThan(-1);
    expect(observerComment).toBeGreaterThan(-1);
    expect(consolidatorComment).toBeLessThan(observerComment);
  });

  // AC16: runConsolidator() catches errors and continues to Observer-retro
  it('runConsolidator() has try/catch error handling', () => {
    // Extract the runConsolidator function body
    const fnStart = runSource.indexOf('async function runConsolidator');
    expect(fnStart).toBeGreaterThan(-1);

    // Find the function body (from fnStart to the next top-level function/export)
    const fnBody = runSource.slice(fnStart, runSource.indexOf('\nexport', fnStart));

    expect(fnBody).toContain('try {');
    expect(fnBody).toContain('catch (err)');
    expect(fnBody).toContain('continuing to Observer-retro');
  });

  it('runConsolidator() is a standalone function (not inline)', () => {
    // Verify it's defined as a separate function, not inline in the main flow
    expect(runSource).toMatch(/async function runConsolidator\(/);
  });

  it('Consolidator is instantiated inside runConsolidator()', () => {
    const fnStart = runSource.indexOf('async function runConsolidator');
    const fnBody = runSource.slice(fnStart, runSource.indexOf('\nexport', fnStart));

    expect(fnBody).toContain('new ConsolidatorAgent(');
    expect(fnBody).toContain('agent.run()');
  });
});
