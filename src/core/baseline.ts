import fs from 'fs/promises';
import path from 'path';

export interface BaselineResult {
  testsExist: boolean;
  testsPass: boolean;
  testFramework: string | null;
  lintPass: boolean;
  typecheckPass: boolean;
}

/**
 * Detect test status for a target project at the given workspace path.
 * Does NOT run tests — only checks for the presence of test infrastructure.
 */
export async function detectTestStatus(
  workspacePath: string
): Promise<Pick<BaselineResult, 'testsExist' | 'testFramework'>> {
  // 1. Check package.json → scripts.test exists
  try {
    const pkgPath = path.join(workspacePath, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent) as {
      scripts?: { test?: string };
    };
    if (pkg.scripts?.test) {
      const testScript: string = pkg.scripts.test;
      if (testScript.includes('vitest')) {
        return { testsExist: true, testFramework: 'vitest' };
      }
      if (testScript.includes('jest')) {
        return { testsExist: true, testFramework: 'jest' };
      }
      // Has a test script but unknown framework
      return { testsExist: true, testFramework: null };
    }
  } catch {
    // No package.json or error reading
  }

  // 2. Check pyproject.toml → [tool.pytest] section exists
  try {
    const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
    const content = await fs.readFile(pyprojectPath, 'utf-8');
    if (
      content.includes('[tool.pytest]') ||
      content.includes('[tool.pytest.ini_options]')
    ) {
      return { testsExist: true, testFramework: 'pytest' };
    }
  } catch {
    // No pyproject.toml
  }

  // 3. Check if tests/ directory exists
  try {
    const testsDir = path.join(workspacePath, 'tests');
    const stat = await fs.stat(testsDir);
    if (stat.isDirectory()) {
      return { testsExist: true, testFramework: null };
    }
  } catch {
    // No tests/ directory
  }

  // 4. Nothing found
  return { testsExist: false, testFramework: null };
}
