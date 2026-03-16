import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

describe('renderLiveDashboard', () => {
  const html = renderLiveDashboard('20260316-1035-test-run');

  it('returns a complete HTML document', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('includes the run ID in the header', () => {
    expect(html).toContain('20260316-1035-test-run');
  });

  it('uses dark theme background color', () => {
    expect(html).toContain('#0f172a');
  });

  it('includes EventSource SSE connection', () => {
    expect(html).toContain("new EventSource('/events')");
  });

  it('has agent-tiles section', () => {
    expect(html).toContain('id="agent-tiles"');
  });

  it('has task-list section', () => {
    expect(html).toContain('id="task-list"');
  });

  it('has stoplight section', () => {
    expect(html).toContain('id="stoplight"');
  });

  it('has event-log section', () => {
    expect(html).toContain('id="event-log"');
  });

  it('includes timer, task-count, token, cost, and latency elements', () => {
    expect(html).toContain('id="timer"');
    expect(html).toContain('id="task-count"');
    expect(html).toContain('id="tokens"');
    expect(html).toContain('id="cost"');
    expect(html).toContain('id="latency"');
  });

  it('handles all expected event types in JS', () => {
    expect(html).toContain("'run:start'");
    expect(html).toContain("'agent:start'");
    expect(html).toContain("'agent:end'");
    expect(html).toContain("'agent:text'");
    expect(html).toContain("'task:status'");
    expect(html).toContain("'stoplight'");
    expect(html).toContain("'tokens'");
    expect(html).toContain("'time'");
    expect(html).toContain("'iteration'");
  });

  it('includes auto-reconnect via EventSource (built-in)', () => {
    // EventSource auto-reconnects by default; we just verify the onerror handler exists
    expect(html).toContain('es.onerror');
  });

  it('uses monospace font for event log', () => {
    expect(html).toContain('monospace');
  });

  it('has CSS for agent tiles with flexbox', () => {
    expect(html).toContain('flex-wrap');
    expect(html).toContain('250px');
  });

  it('escapes XSS in run ID', () => {
    const xss = renderLiveDashboard('<script>alert(1)</script>');
    expect(xss).not.toContain('<script>alert(1)</script>');
    expect(xss).toContain('&lt;script&gt;');
  });

  it('includes status colors', () => {
    expect(html).toContain('#22c55e'); // green
    expect(html).toContain('#eab308'); // yellow
    expect(html).toContain('#ef4444'); // red
  });

  it('includes max-width 1200px container', () => {
    expect(html).toContain('1200px');
  });

  it('keeps last 5 lines for agent reasoning', () => {
    expect(html).toContain('>5');
  });

  it('keeps last 200 events in log buffer', () => {
    expect(html).toContain('>200');
  });

  it('HTML handles agent:thinking event', () => {
    expect(html).toContain("'agent:thinking'");
  });

  it('HTML contains reconnect banner', () => {
    expect(html).toContain('reconnect-banner');
    expect(html).toContain('id="reconnect-banner"');
  });

  it('HTML contains thinking-toggle CSS class', () => {
    expect(html).toContain('.thinking-toggle');
  });

  it('HTML contains thinking-content CSS class', () => {
    expect(html).toContain('.thinking-content');
  });

  // New tests for narrative dashboard features

  it('HTML contains narrateEvent function', () => {
    expect(html).toContain('narrateEvent');
  });

  it('HTML contains run-library section', () => {
    expect(html).toContain('run-library');
  });

  it('HTML contains run-selector element', () => {
    expect(html).toContain('id="run-selector"');
  });

  it('HTML contains digest-view element', () => {
    expect(html).toContain('id="digest-view"');
  });

  it('HTML contains live-content wrapper', () => {
    expect(html).toContain('id="live-content"');
  });

  it('HTML contains fmtK number formatting function', () => {
    expect(html).toContain('fmtK');
  });

  it('HTML contains cost calculation logic (3.0 and 15.0 pricing)', () => {
    expect(html).toContain('3.0');
    expect(html).toContain('15.0');
  });

  it('HTML contains agent-stats section', () => {
    expect(html).toContain('agent-stats');
  });

  it('HTML contains fetch /runs call', () => {
    expect(html).toContain("fetch('/runs')");
  });

  it('HTML contains fetch /digest/ call', () => {
    expect(html).toContain("fetch('/digest/'");
  });

  it('HTML contains pulse animation for live dot', () => {
    expect(html).toContain('@keyframes pulse');
    expect(html).toContain('animation:pulse');
  });

  // Rich event log tests

  it('HTML contains filter-btn CSS class', () => {
    expect(html).toContain('.filter-btn');
  });

  it('HTML contains log-entry CSS class', () => {
    expect(html).toContain('.log-entry');
  });

  it('HTML contains log-detail CSS class', () => {
    expect(html).toContain('.log-detail');
  });

  it('HTML contains expand-arrow CSS class', () => {
    expect(html).toContain('.expand-arrow');
  });

  it('HTML contains data-filter attribute on event-log', () => {
    expect(html).toContain('data-filter="alla"');
  });

  it('HTML contains data-category attributes', () => {
    expect(html).toContain('data-category');
  });

  it('HTML contains setLogFilter function', () => {
    expect(html).toContain('setLogFilter');
  });

  it('HTML contains getCategory function', () => {
    expect(html).toContain('getCategory');
  });

  it('HTML contains filter buttons for all categories', () => {
    expect(html).toContain("setLogFilter('alla')");
    expect(html).toContain("setLogFilter('handlingar')");
    expect(html).toContain("setLogFilter('filer')");
    expect(html).toContain("setLogFilter('tester')");
    expect(html).toContain("setLogFilter('beslut')");
  });

  it('HTML contains all audit tool types in narrateEvent', () => {
    expect(html).toContain("'read_file'");
    expect(html).toContain("'write_file'");
    expect(html).toContain("'bash_exec'");
    expect(html).toContain("'graph_query'");
    expect(html).toContain("'search_memory'");
    expect(html).toContain("'write_task_plan'");
    expect(html).toContain("'delegate_parallel_wave'");
    expect(html).toContain("'copy_to_target'");
    expect(html).toContain("'adaptive_hints'");
    expect(html).toContain("'agent_message'");
  });

  it('HTML contains log-group CSS class for smart grouping', () => {
    expect(html).toContain('.log-group');
  });

  it('HTML contains lastReadGroup variable for smart grouping', () => {
    expect(html).toContain('lastReadGroup');
  });

  it('HTML contains CSS filter rules for data-filter categories', () => {
    expect(html).toContain('data-filter="handlingar"');
    expect(html).toContain('data-filter="filer"');
    expect(html).toContain('data-filter="tester"');
    expect(html).toContain('data-filter="beslut"');
  });

  it('pause handler is on log-pause-hint not logEl', () => {
    expect(html).toContain("getElementById('log-pause-hint').addEventListener");
  });

  // ===== RT-3c: Header tests =====

  it('header contains task-count element with uppgifter', () => {
    expect(html).toContain('id="task-count"');
    expect(html).toContain('uppgifter');
  });

  it('header contains latency element with tok/s', () => {
    expect(html).toContain('id="latency"');
    expect(html).toContain('tok/s');
  });

  it('header does NOT contain iterations span', () => {
    expect(html).not.toContain('id="iterations"');
  });

  it('tokens display uses middle dot separator', () => {
    expect(html).toContain('\u00B7');
  });

  it('header has client-side timer with setInterval', () => {
    expect(html).toContain('setInterval');
    expect(html).toContain('timerRunning');
    expect(html).toContain('timerElapsed');
  });

  it('timer syncs with time events (timerElapsed and timerTotal)', () => {
    expect(html).toContain('timerElapsed=data.elapsed');
    expect(html).toContain('timerTotal=');
  });

  it('latency calculated from token output rate', () => {
    expect(html).toContain('lastTokenTime');
    expect(html).toContain('lastTokenOut');
    expect(html).toContain('tokPerSec');
  });

  it('task counter updated on task:status events', () => {
    expect(html).toContain('task-count');
    expect(html).toContain('completed');
  });

  // ===== RT-3c: Task list tests =====

  it('task list supports wave grouping', () => {
    expect(html).toContain('taskWaves');
    expect(html).toContain('Wave');
  });

  it('task list shows descriptions from taskDescriptions', () => {
    expect(html).toContain('taskDescriptions[tid]');
  });

  it('task list shows agent per task', () => {
    expect(html).toContain('taskAgents[tid]');
  });

  it('task list shows time elapsed for running tasks', () => {
    expect(html).toContain('taskStartTimes');
  });

  it('wave tracking from delegate_parallel_wave audit events', () => {
    expect(html).toContain('delegate_parallel_wave');
    expect(html).toContain('taskWaves');
  });

  // ===== RT-3c: Agent panel tests =====

  it('agent panels show status-text span', () => {
    expect(html).toContain('status-text');
  });

  it('agent panels show Arbetar status', () => {
    expect(html).toContain('Arbetar');
  });
});
