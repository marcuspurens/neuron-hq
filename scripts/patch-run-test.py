"""Patch tests/core/run.test.ts to add maybeInjectConsolidationTrigger tests."""

filepath = 'tests/core/run.test.ts'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Update import to include maybeInjectConsolidationTrigger
old_import = "import { countMemoryRuns, countCompletedRuns, maybeInjectMetaTrigger, RunOrchestrator, COPY_SKIP_DIRS, type RunContext, EstopError, checkEstop } from '../../src/core/run.js';"
new_import = "import { countMemoryRuns, countCompletedRuns, maybeInjectMetaTrigger, maybeInjectConsolidationTrigger, RunOrchestrator, COPY_SKIP_DIRS, type RunContext, EstopError, checkEstop } from '../../src/core/run.js';"
assert old_import in content, 'Could not find import line'
content = content.replace(old_import, new_import, 1)

# 2. Add test block after the maybeInjectMetaTrigger describe block
# Find the end of the maybeInjectMetaTrigger tests block
marker = """describe('countCompletedRuns', () => {"""

new_tests = """describe('maybeInjectConsolidationTrigger', () => {
  it('injects trigger when runCount is a multiple of consolidationFrequency', () => {
    const brief = 'Test brief';
    for (const count of [10, 20, 30]) {
      const result = maybeInjectConsolidationTrigger(brief, count, 10);
      expect(result).toContain('⚡ Consolidation-trigger:');
    }
  });

  it('does NOT inject trigger when runCount is not a multiple', () => {
    const brief = 'Test brief';
    for (const count of [9, 11, 15]) {
      const result = maybeInjectConsolidationTrigger(brief, count, 10);
      expect(result).not.toContain('⚡ Consolidation-trigger:');
    }
  });

  it('does NOT inject trigger at run 0', () => {
    const result = maybeInjectConsolidationTrigger('Test brief', 0, 10);
    expect(result).not.toContain('⚡ Consolidation-trigger:');
  });

  it('respects custom consolidation frequency', () => {
    expect(maybeInjectConsolidationTrigger('brief', 5, 5)).toContain('⚡ Consolidation-trigger:');
    expect(maybeInjectConsolidationTrigger('brief', 7, 5)).not.toContain('⚡ Consolidation-trigger:');
  });

  it('does NOT inject trigger when frequency is 0', () => {
    const result = maybeInjectConsolidationTrigger('brief', 10, 0);
    expect(result).not.toContain('⚡ Consolidation-trigger:');
  });

  it('uses default frequency of 10 when not specified', () => {
    expect(maybeInjectConsolidationTrigger('brief', 10)).toContain('⚡ Consolidation-trigger:');
    expect(maybeInjectConsolidationTrigger('brief', 5)).not.toContain('⚡ Consolidation-trigger:');
  });
});

""" + marker

assert marker in content, f'Could not find marker: {marker}'
content = content.replace(marker, new_tests, 1)

with open(filepath, 'w') as f:
    f.write(content)

print('Patched tests/core/run.test.ts successfully')
