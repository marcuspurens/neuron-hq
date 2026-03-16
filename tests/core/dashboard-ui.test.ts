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

  it('includes timer, iteration, token, and cost elements', () => {
    expect(html).toContain('id="timer"');
    expect(html).toContain('id="iterations"');
    expect(html).toContain('id="tokens"');
    expect(html).toContain('id="cost"');
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

  it('keeps last 30 lines for agent reasoning', () => {
    expect(html).toContain('30');
  });

  it('keeps last 50 events in log', () => {
    expect(html).toContain('50');
  });
});
