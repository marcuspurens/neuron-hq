import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

// ═══════════════════════════════════════════════════════════════════════════
// Tests for the warning banner in the dashboard UI.
// We render the full HTML and inspect it for warning-related elements,
// CSS rules, and JavaScript event handling.
// ═══════════════════════════════════════════════════════════════════════════

describe('Dashboard warning banner', () => {
  const html = renderLiveDashboard('test-run-warning');

  it('contains warning-banner div with correct id and class', () => {
    expect(html).toContain('id="warning-banner"');
    expect(html).toContain('class="warning-banner"');
  });

  it('has warning-banner CSS with yellow background (#f59e0b)', () => {
    expect(html).toContain('.warning-banner{');
    expect(html).toContain('#f59e0b');
  });

  it('warning-banner has z-index higher than reconnect-banner', () => {
    // reconnect-banner has z-index:100, warning-banner should have z-index:101
    const reconnectMatch = html.match(/\.reconnect-banner\{[^}]*z-index:(\d+)/);
    const warningMatch = html.match(/\.warning-banner\{[^}]*z-index:(\d+)/);

    expect(reconnectMatch).not.toBeNull();
    expect(warningMatch).not.toBeNull();

    const reconnectZ = parseInt(reconnectMatch![1], 10);
    const warningZ = parseInt(warningMatch![1], 10);

    expect(warningZ).toBeGreaterThan(reconnectZ);
  });

  it('JavaScript handles warning event type to show banner', () => {
    // The JS should have a branch for event==='warning' that updates the banner
    expect(html).toContain("'warning'");
    expect(html).toContain('warning-banner');
    // Specifically: it should add the 'visible' class
    expect(html).toContain("'visible'");
  });

  it('narrateEvent returns text for warning events', () => {
    // The narrateEvent function should have a case for 'warning'
    expect(html).toContain("case 'warning'");
    // And it should contain the VARNING text
    expect(html).toContain('VARNING');
  });
});
