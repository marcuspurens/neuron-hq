import fs from 'fs/promises';
import path from 'path';

export interface ScaffoldOptions {
  name: string;
  language: 'typescript' | 'python';
  template: 'library' | 'cli' | 'mcp-server' | 'api';
  targetDir: string;
}

/**
 * Scaffold a new project from a template.
 *
 * Creates a project directory with boilerplate files based on the
 * chosen language and template. Idempotent: returns immediately if
 * the target directory already exists.
 */
export async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
  const { name, language, template, targetDir } = options;
  const projectDir = path.join(targetDir, name);

  // Idempotent: skip if directory already exists
  try {
    await fs.access(projectDir);
    return;
  } catch {  /* intentional: file may not exist */
    // Directory doesn't exist — continue
  }

  // Only 'library' template is supported for now
  if (template !== 'library') {
    throw new Error(
      `Template '${template}' is not yet implemented. Only 'library' is supported.`
    );
  }

  // Create project root
  await fs.mkdir(projectDir, { recursive: true });

  if (language === 'typescript') {
    await scaffoldTypescriptLibrary(projectDir, name);
  } else {
    await scaffoldPythonLibrary(projectDir, name);
  }
}

/**
 * Generate files for a TypeScript library project.
 */
async function scaffoldTypescriptLibrary(projectDir: string, name: string): Promise<void> {
  // package.json
  const packageJson = {
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      test: 'vitest run',
      typecheck: 'tsc --noEmit',
      build: 'tsc',
      lint: 'echo lint',
    },
    dependencies: {},
    devDependencies: {
      vitest: '^1.2.2',
      typescript: '^5.3.3',
    },
  };
  await fs.writeFile(
    path.join(projectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  );

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: './dist',
      rootDir: './src',
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', 'tests'],
  };
  await fs.writeFile(
    path.join(projectDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n'
  );

  // vitest.config.ts
  const vitestConfig = [
    "import { defineConfig } from 'vitest/config';",
    '',
    'export default defineConfig({',
    '  test: {',
    "    include: ['tests/**/*.test.ts'],",
    '  },',
    '});',
    '',
  ].join('\n');
  await fs.writeFile(path.join(projectDir, 'vitest.config.ts'), vitestConfig);

  // src/index.ts
  await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'src', 'index.ts'),
    "export const VERSION = '0.1.0';\n"
  );

  // tests/index.test.ts
  await fs.mkdir(path.join(projectDir, 'tests'), { recursive: true });
  const testContent = [
    "import { expect, test } from 'vitest';",
    "import { VERSION } from '../src/index.js';",
    '',
    "test('VERSION is 0.1.0', () => {",
    "  expect(VERSION).toBe('0.1.0');",
    '});',
    '',
  ].join('\n');
  await fs.writeFile(path.join(projectDir, 'tests', 'index.test.ts'), testContent);

  // .gitignore
  const gitignore = ['node_modules', 'dist', '*.tgz', '.env', ''].join('\n');
  await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);
}

/**
 * Generate files for a Python library project.
 */
async function scaffoldPythonLibrary(projectDir: string, name: string): Promise<void> {
  const moduleName = name.replace(/-/g, '_');

  // pyproject.toml
  const pyproject = [
    '[project]',
    `name = "${name}"`,
    'version = "0.1.0"',
    'requires-python = ">=3.10"',
    '',
    '[tool.pytest.ini_options]',
    'testpaths = ["tests"]',
    '',
  ].join('\n');
  await fs.writeFile(path.join(projectDir, 'pyproject.toml'), pyproject);

  // src/<module_name>/__init__.py
  const srcDir = path.join(projectDir, 'src', moduleName);
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, '__init__.py'), 'VERSION = "0.1.0"\n');

  // tests/test_init.py
  const testsDir = path.join(projectDir, 'tests');
  await fs.mkdir(testsDir, { recursive: true });
  const testContent = [
    `from ${moduleName} import VERSION`,
    '',
    '',
    'def test_version():',
    '    assert VERSION == "0.1.0"',
    '',
  ].join('\n');
  await fs.writeFile(path.join(testsDir, 'test_init.py'), testContent);

  // .gitignore
  const gitignore = ['__pycache__', '*.pyc', '.venv', 'dist', '*.egg-info', ''].join('\n');
  await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);
}
