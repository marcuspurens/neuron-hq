import { describe, it, expect } from 'vitest';
import { parsePromptHierarchy, buildHierarchicalPrompt } from '../../src/core/prompt-hierarchy.js';
import { loadPromptHierarchy } from '../../src/core/prompt-hierarchy.js';
import path from 'path';

describe('parsePromptHierarchy', () => {
  it('returns all content as core when no markers present', () => {
    const content = '# Title\n\nSome content here.\n';
    const result = parsePromptHierarchy(content);
    expect(result.core).toBe('# Title\n\nSome content here.');
    expect(result.archive.size).toBe(0);
  });

  it('extracts a single archive section', () => {
    const content = [
      '# Title',
      '',
      'Core content.',
      '',
      '<!-- ARCHIVE: details -->',
      '## Details',
      '',
      'Detailed info here.',
      '<!-- /ARCHIVE -->',
      '',
      'More core.',
    ].join('\n');

    const result = parsePromptHierarchy(content);
    expect(result.archive.size).toBe(1);
    expect(result.archive.get('details')).toBe('## Details\n\nDetailed info here.');
    expect(result.core).toContain('Core content.');
    expect(result.core).toContain('More core.');
    expect(result.core).not.toContain('ARCHIVE');
    expect(result.core).not.toContain('Detailed info');
  });

  it('extracts multiple archive sections', () => {
    const content = [
      'Intro.',
      '',
      '<!-- ARCHIVE: alpha -->',
      'Alpha content.',
      '<!-- /ARCHIVE -->',
      '',
      'Middle.',
      '',
      '<!-- ARCHIVE: beta -->',
      'Beta content.',
      '<!-- /ARCHIVE -->',
      '',
      'End.',
    ].join('\n');

    const result = parsePromptHierarchy(content);
    expect(result.archive.size).toBe(2);
    expect(result.archive.get('alpha')).toBe('Alpha content.');
    expect(result.archive.get('beta')).toBe('Beta content.');
    expect(result.core).toContain('Intro.');
    expect(result.core).toContain('Middle.');
    expect(result.core).toContain('End.');
  });

  it('supports closing tag with name: <!-- /ARCHIVE: name -->', () => {
    const content = [
      'Core.',
      '<!-- ARCHIVE: section1 -->',
      'Section 1 body.',
      '<!-- /ARCHIVE: section1 -->',
      'After.',
    ].join('\n');

    const result = parsePromptHierarchy(content);
    expect(result.archive.get('section1')).toBe('Section 1 body.');
    expect(result.core).toContain('Core.');
    expect(result.core).toContain('After.');
  });

  it('collapses triple+ newlines to double in core', () => {
    const content = [
      'Before.',
      '',
      '<!-- ARCHIVE: removed -->',
      'Archived stuff.',
      '<!-- /ARCHIVE -->',
      '',
      'After.',
    ].join('\n');

    const result = parsePromptHierarchy(content);
    // Should not have 3+ consecutive newlines
    expect(result.core).not.toMatch(/\n{3,}/);
    expect(result.core).toBe('Before.\n\nAfter.');
  });

  it('trims the core result', () => {
    const content = '\n\n# Title\n\nContent.\n\n';
    const result = parsePromptHierarchy(content);
    expect(result.core).toBe('# Title\n\nContent.');
  });

  it('handles whitespace around markers', () => {
    const content = [
      'Core text.',
      '  <!-- ARCHIVE: spaced -->  ',
      'Spaced section body.',
      '  <!-- /ARCHIVE -->  ',
      'More core.',
    ].join('\n');

    const result = parsePromptHierarchy(content);
    expect(result.archive.size).toBe(1);
    expect(result.archive.get('spaced')).toBe('Spaced section body.');
    expect(result.core).toContain('Core text.');
    expect(result.core).toContain('More core.');
    expect(result.core).not.toContain('ARCHIVE');
  });

  it('treats nested markers as literal text (no nesting support)', () => {
    const content = [
      'Core.',
      '<!-- ARCHIVE: outer -->',
      'Outer start.',
      '<!-- ARCHIVE: inner -->',
      'Inner content.',
      '<!-- /ARCHIVE -->',
      'Outer end.',
      '<!-- /ARCHIVE -->',
      'After.',
    ].join('\n');

    const result = parsePromptHierarchy(content);
    // The first <!-- /ARCHIVE --> closes "outer", so "inner" marker is literal text inside outer
    // The second <!-- /ARCHIVE --> is left over and ignored (not a valid block)
    const outerContent = result.archive.get('outer');
    expect(outerContent).toBeDefined();
    // The inner ARCHIVE marker should appear as literal text within the outer block
    expect(outerContent).toContain('<!-- ARCHIVE: inner -->');
    expect(outerContent).toContain('Inner content.');
  });
});

describe('buildHierarchicalPrompt', () => {
  const hierarchy = {
    core: 'Core prompt text.',
    archive: new Map([
      ['section-a', '## Section A\n\nA content.'],
      ['section-b', '## Section B\n\nB content.'],
    ]),
  };

  it('returns only core when no archive sections requested', () => {
    expect(buildHierarchicalPrompt(hierarchy)).toBe('Core prompt text.');
  });

  it('returns only core when empty array passed', () => {
    expect(buildHierarchicalPrompt(hierarchy, [])).toBe('Core prompt text.');
  });

  it('appends requested archive sections in order', () => {
    const result = buildHierarchicalPrompt(hierarchy, ['section-b', 'section-a']);
    expect(result).toBe(
      'Core prompt text.\n\n## Section B\n\nB content.\n\n## Section A\n\nA content.',
    );
  });

  it('silently ignores unknown section names', () => {
    const result = buildHierarchicalPrompt(hierarchy, ['section-a', 'nonexistent']);
    expect(result).toBe('Core prompt text.\n\n## Section A\n\nA content.');
  });

  it('inserts overlay after core when provided', () => {
    const result = buildHierarchicalPrompt(hierarchy, undefined, 'Model-specific instructions.');
    expect(result).toBe('Core prompt text.\n\nModel-specific instructions.');
  });

  it('inserts overlay between core and archive sections', () => {
    const result = buildHierarchicalPrompt(
      hierarchy,
      ['section-a'],
      'Overlay text here.',
    );
    expect(result).toBe(
      'Core prompt text.\n\nOverlay text here.\n\n## Section A\n\nA content.',
    );
  });

  it('does not insert overlay when it is undefined', () => {
    const result = buildHierarchicalPrompt(hierarchy, ['section-a'], undefined);
    expect(result).toBe('Core prompt text.\n\n## Section A\n\nA content.');
  });

  it('does not insert overlay when it is an empty string', () => {
    const result = buildHierarchicalPrompt(hierarchy, ['section-a'], '');
    expect(result).toBe('Core prompt text.\n\n## Section A\n\nA content.');
  });
});

describe('loadPromptHierarchy', () => {
  it('reads a file and returns PromptHierarchy', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/manager.md'));
    expect(hierarchy.core).toBeTruthy();
    expect(hierarchy.archive.size).toBeGreaterThan(0);
  });

  it('returns all content as core for files without archive markers', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/implementer.md'));
    expect(hierarchy.core).toBeTruthy();
    expect(hierarchy.archive.size).toBe(0);
  });
});

describe('Integration: manager.md', () => {
  it('has at least 5 archive sections', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/manager.md'));
    expect(hierarchy.archive.size).toBeGreaterThanOrEqual(5);
  });

  it('core contains "Your Role" and "Core Principles"', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/manager.md'));
    expect(hierarchy.core).toContain('Your Role');
    expect(hierarchy.core).toContain('Core Principles');
  });

  it('buildHierarchicalPrompt with all archives reconstructs full content (minus markers)', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/manager.md'));
    const allSections = Array.from(hierarchy.archive.keys());
    const reconstructed = buildHierarchicalPrompt(hierarchy, allSections);
    // The reconstructed prompt should contain all the same headings/keywords
    expect(reconstructed).toContain('Task Planning');
    expect(reconstructed).toContain('Knowledge Graph');
    expect(reconstructed).toContain('After Researcher Completes');
    expect(reconstructed).toContain('Auto-trigger Librarian');
    expect(reconstructed).toContain('Meta-trigger');
    expect(reconstructed).toContain('no tests');
  });
});

describe('Integration: reviewer.md', () => {
  it('has at least 3 archive sections', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/reviewer.md'));
    expect(hierarchy.archive.size).toBeGreaterThanOrEqual(3);
  });

  it('core contains "Your Role" and "Blocking Criteria"', async () => {
    const hierarchy = await loadPromptHierarchy(path.join(__dirname, '../../prompts/reviewer.md'));
    expect(hierarchy.core).toContain('Your Role');
    expect(hierarchy.core).toContain('Blocking Criteria');
  });
});

describe('buildHierarchicalPrompt with overlay', () => {
  const hierarchy = {
    core: 'Core prompt text.',
    archive: new Map([
      ['section-a', '## Section A\n\nA content.'],
      ['section-b', '## Section B\n\nB content.'],
    ]),
  };

  it('inserts overlay between core and archive sections', () => {
    const result = buildHierarchicalPrompt(hierarchy, ['section-a'], '## Overlay\n\nOverlay content.');
    expect(result).toBe(
      'Core prompt text.\n\n## Overlay\n\nOverlay content.\n\n## Section A\n\nA content.',
    );
  });

  it('works with overlay and no archive sections', () => {
    const result = buildHierarchicalPrompt(hierarchy, [], '## Overlay\n\nOverlay content.');
    expect(result).toBe('Core prompt text.\n\n## Overlay\n\nOverlay content.');
  });

  it('works with overlay and undefined archive sections', () => {
    const result = buildHierarchicalPrompt(hierarchy, undefined, '## Overlay\n\nOverlay content.');
    expect(result).toBe('Core prompt text.\n\n## Overlay\n\nOverlay content.');
  });

  it('behaves unchanged when overlay is undefined', () => {
    const result = buildHierarchicalPrompt(hierarchy, ['section-a'], undefined);
    expect(result).toBe('Core prompt text.\n\n## Section A\n\nA content.');
  });
});
