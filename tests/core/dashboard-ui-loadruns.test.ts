import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

describe('loadRuns error handling', () => {
  const html = renderLiveDashboard('20260316-test-loadruns');

  it('loadRuns catch handler displays error message (not empty)', () => {
    // The catch should NOT be empty: .catch(function(){})
    // It should contain console.error and innerHTML assignment
    expect(html).toContain("console.error('Failed to load runs:'");
    expect(html).not.toMatch(/\.catch\(function\(\)\s*\{\s*\}\)/);
  });

  it('error message includes "Kunde inte ladda körningar"', () => {
    // In the rendered HTML, unicode escapes are in the JS string
    expect(html).toContain('Kunde inte ladda k\\u00F6rningar');
  });

  it('retry button "Försök igen" is rendered on error', () => {
    expect(html).toContain('F\\u00F6rs\\u00F6k igen');
    expect(html).toContain('retry-btn');
  });

  it('catch handler checks r.ok and throws on non-ok response', () => {
    expect(html).toContain("if(!r.ok)throw new Error('HTTP '+r.status)");
  });

  it('window.loadRuns is assigned for retry button accessibility', () => {
    expect(html).toContain('window.loadRuns=loadRuns');
  });

  it('retry button calls loadRuns() on click', () => {
    expect(html).toContain('onclick="event.stopPropagation();loadRuns();"');
  });

  it('error display has warning icon unicode', () => {
    expect(html).toContain('\\u26A0\\uFE0F');
  });
});
