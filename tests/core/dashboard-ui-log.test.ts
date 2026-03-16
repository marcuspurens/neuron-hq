import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

describe('dashboard-ui rich event log', () => {
  const html = renderLiveDashboard('test-run-001');

  // --- Filter buttons ---
  it('includes filter button container with log-filters class', () => {
    expect(html).toContain('log-filters');
  });

  it('includes Alla filter button', () => {
    expect(html).toContain("setLogFilter('alla')");
    expect(html).toContain('>Alla</button>');
  });

  it('includes Handlingar filter button', () => {
    expect(html).toContain("setLogFilter('handlingar')");
  });

  it('includes Filer filter button', () => {
    expect(html).toContain("setLogFilter('filer')");
  });

  it('includes Tester filter button', () => {
    expect(html).toContain("setLogFilter('tester')");
  });

  it('includes Beslut filter button', () => {
    expect(html).toContain("setLogFilter('beslut')");
  });

  it('has setLogFilter function defined', () => {
    expect(html).toContain('function setLogFilter(');
  });

  it('has data-filter attribute on event log', () => {
    expect(html).toContain('data-filter="alla"');
  });

  // --- CSS-based filtering ---
  it('has CSS rules for handlingar filter', () => {
    expect(html).toContain('data-filter="handlingar"');
  });

  it('has CSS rules for filer filter', () => {
    expect(html).toContain('data-filter="filer"');
  });

  it('has CSS rules for tester filter', () => {
    expect(html).toContain('data-filter="tester"');
  });

  it('has CSS rules for beslut filter', () => {
    expect(html).toContain('data-filter="beslut"');
  });

  // --- Expandable entries ---
  it('has expand-arrow CSS class', () => {
    expect(html).toContain('.expand-arrow');
  });

  it('has log-entry CSS class with cursor pointer', () => {
    expect(html).toContain('.log-entry');
    expect(html).toContain('cursor:pointer');
  });

  it('has log-detail CSS class with display:none default', () => {
    expect(html).toContain('.log-detail{display:none');
  });

  it('has CSS rule for expanded arrow rotation', () => {
    expect(html).toContain('.log-entry.expanded .expand-arrow');
    expect(html).toContain('rotate(90deg)');
  });

  it('has CSS rule for showing details on expanded', () => {
    expect(html).toContain('.log-entry.expanded+.log-detail{display:block');
  });

  // --- Category system ---
  it('has getCategory function defined', () => {
    expect(html).toContain('function getCategory(');
  });

  it('getCategory handles decision events', () => {
    expect(html).toContain("'beslut'");
  });

  it('getCategory handles file events', () => {
    expect(html).toContain("'fil'");
  });

  // --- Audit tool type narration ---
  it('handles read_file audit tool', () => {
    expect(html).toContain("==='read_file'");
  });

  it('handles write_file audit tool', () => {
    expect(html).toContain("==='write_file'");
  });

  it('handles bash_exec audit tool', () => {
    expect(html).toContain("==='bash_exec'");
  });

  it('handles graph_query audit tool', () => {
    expect(html).toContain("==='graph_query'");
  });

  it('handles search_memory audit tool', () => {
    expect(html).toContain("==='search_memory'");
  });

  it('handles write_task_plan audit tool', () => {
    expect(html).toContain("==='write_task_plan'");
  });

  it('handles delegate_parallel_wave audit tool', () => {
    expect(html).toContain("==='delegate_parallel_wave'");
  });

  it('handles copy_to_target audit tool', () => {
    expect(html).toContain("==='copy_to_target'");
  });

  it('handles adaptive_hints audit tool', () => {
    expect(html).toContain("==='adaptive_hints'");
  });

  it('handles agent_message audit tool', () => {
    expect(html).toContain("==='agent_message'");
  });

  // --- Bash truncation ---
  it('truncates bash commands at 60 chars', () => {
    expect(html).toContain('.length>60');
    expect(html).toContain('.substring(0,57)');
  });

  // --- Smart grouping ---
  it('has lastReadGroup variable for grouping', () => {
    expect(html).toContain('lastReadGroup');
  });

  it('uses 3-second window for grouping reads', () => {
    expect(html).toContain('3000');
  });

  // --- Buffer size ---
  it('uses 200-entry buffer limit', () => {
    expect(html).toContain('children.length>200');
    expect(html).not.toContain('children.length>50)');
  });

  // --- Display files/command support ---
  it('uses display_files from enriched audit events', () => {
    expect(html).toContain('display_files');
  });

  it('uses display_command from enriched audit events', () => {
    expect(html).toContain('display_command');
  });

  // --- Detail expansion data ---
  it('creates detail rows with labels', () => {
    expect(html).toContain('detail-row');
    expect(html).toContain('label');
  });

  it('shows exit_code for bash commands in details', () => {
    expect(html).toContain('exit_code');
  });

  it('shows diff_stats for write operations in details', () => {
    expect(html).toContain('diff_stats');
  });
});
