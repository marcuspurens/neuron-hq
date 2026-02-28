import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffoldProject, type ScaffoldOptions } from '../../src/core/scaffold.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('scaffoldProject', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates correct file structure for TypeScript library', async () => {
    await scaffoldProject({
      name: 'my-ts-lib',
      language: 'typescript',
      template: 'library',
      targetDir: tempDir,
    });

    const projectDir = path.join(tempDir, 'my-ts-lib');
    const expectedFiles = [
      'package.json',
      'tsconfig.json',
      'vitest.config.ts',
      'src/index.ts',
      'tests/index.test.ts',
      '.gitignore',
    ];

    for (const file of expectedFiles) {
      const stat = await fs.stat(path.join(projectDir, file));
      expect(stat.isFile(), `${file} should exist`).toBe(true);
    }
  });

  it('creates correct file structure for Python library', async () => {
    await scaffoldProject({
      name: 'my-py-lib',
      language: 'python',
      template: 'library',
      targetDir: tempDir,
    });

    const projectDir = path.join(tempDir, 'my-py-lib');
    const expectedFiles = [
      'pyproject.toml',
      'src/my_py_lib/__init__.py',
      'tests/test_init.py',
      '.gitignore',
    ];

    for (const file of expectedFiles) {
      const stat = await fs.stat(path.join(projectDir, file));
      expect(stat.isFile(), `${file} should exist`).toBe(true);
    }
  });

  it('generates package.json with correct scripts', async () => {
    await scaffoldProject({
      name: 'scripts-test',
      language: 'typescript',
      template: 'library',
      targetDir: tempDir,
    });

    const raw = await fs.readFile(
      path.join(tempDir, 'scripts-test', 'package.json'),
      'utf-8'
    );
    const pkg = JSON.parse(raw);

    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    expect(pkg.scripts.build).toBe('tsc');
    expect(pkg.scripts.lint).toBe('echo lint');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.type).toBe('module');
  });

  it('generates tsconfig.json with strict mode', async () => {
    await scaffoldProject({
      name: 'strict-test',
      language: 'typescript',
      template: 'library',
      targetDir: tempDir,
    });

    const raw = await fs.readFile(
      path.join(tempDir, 'strict-test', 'tsconfig.json'),
      'utf-8'
    );
    const tsconfig = JSON.parse(raw);

    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.target).toBe('ES2022');
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
  });

  it('is idempotent — does not overwrite existing project', async () => {
    const opts: ScaffoldOptions = {
      name: 'idempotent-test',
      language: 'typescript',
      template: 'library',
      targetDir: tempDir,
    };

    // First scaffold
    await scaffoldProject(opts);

    // Modify a file
    const indexPath = path.join(tempDir, 'idempotent-test', 'src', 'index.ts');
    await fs.writeFile(indexPath, 'export const MODIFIED = true;\n');

    // Scaffold again — should be a no-op
    await scaffoldProject(opts);

    // Verify the file was NOT overwritten
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toBe('export const MODIFIED = true;\n');
  });

  it('throws for unsupported template types', async () => {
    await expect(
      scaffoldProject({
        name: 'cli-test',
        language: 'typescript',
        template: 'cli',
        targetDir: tempDir,
      })
    ).rejects.toThrow("Template 'cli' is not yet implemented. Only 'library' is supported.");

    await expect(
      scaffoldProject({
        name: 'mcp-test',
        language: 'typescript',
        template: 'mcp-server',
        targetDir: tempDir,
      })
    ).rejects.toThrow("Template 'mcp-server' is not yet implemented");

    await expect(
      scaffoldProject({
        name: 'api-test',
        language: 'typescript',
        template: 'api',
        targetDir: tempDir,
      })
    ).rejects.toThrow("Template 'api' is not yet implemented");
  });

  it('generates vitest.config.ts with defineConfig', async () => {
    await scaffoldProject({
      name: 'vitest-test',
      language: 'typescript',
      template: 'library',
      targetDir: tempDir,
    });

    const content = await fs.readFile(
      path.join(tempDir, 'vitest-test', 'vitest.config.ts'),
      'utf-8'
    );

    expect(content).toContain('defineConfig');
    expect(content).toContain("import { defineConfig } from 'vitest/config'");
    expect(content).toContain('tests/**/*.test.ts');
  });

  it('replaces hyphens with underscores for Python module names', async () => {
    await scaffoldProject({
      name: 'my-cool-project',
      language: 'python',
      template: 'library',
      targetDir: tempDir,
    });

    const projectDir = path.join(tempDir, 'my-cool-project');

    // Module directory should use underscores
    const initPath = path.join(projectDir, 'src', 'my_cool_project', '__init__.py');
    const stat = await fs.stat(initPath);
    expect(stat.isFile()).toBe(true);

    // Test file should import with underscored name
    const testContent = await fs.readFile(
      path.join(projectDir, 'tests', 'test_init.py'),
      'utf-8'
    );
    expect(testContent).toContain('from my_cool_project import VERSION');
  });
});
