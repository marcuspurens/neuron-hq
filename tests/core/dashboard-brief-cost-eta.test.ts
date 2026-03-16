import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

describe('T3: Brief Panel', () => {
  const html = renderLiveDashboard('test-run');

  it('contains brief-panel CSS rules', () => {
    expect(html).toContain('.brief-panel{');
    expect(html).toContain('.brief-panel h3{');
    expect(html).toContain('.brief-panel .brief-summary{');
    expect(html).toContain('.brief-panel .brief-full{');
    expect(html).toContain('.brief-panel .brief-toggle{');
    expect(html).toContain('.brief-panel.expanded .brief-full{display:block}');
  });

  it('contains brief-panel HTML structure', () => {
    expect(html).toContain('id="brief-panel"');
    expect(html).toContain('id="brief-title"');
    expect(html).toContain('id="brief-summary"');
    expect(html).toContain('id="brief-full"');
    expect(html).toContain('id="brief-toggle"');
  });

  it('brief panel starts hidden', () => {
    expect(html).toContain('id="brief-panel" class="brief-panel" style="display:none"');
  });

  it('brief panel has onclick toggleBrief', () => {
    expect(html).toContain('onclick="toggleBrief()"');
  });

  it('contains toggleBrief JS function', () => {
    expect(html).toContain('function toggleBrief()');
    expect(html).toContain('window.toggleBrief=toggleBrief');
  });

  it('contains brief event handler in SSE dispatcher', () => {
    expect(html).toContain("event==='brief'");
  });

  it('brief handler sets display to block', () => {
    expect(html).toContain("bp.style.display='block'");
  });

  it('brief handler sets title, summary, and fullContent', () => {
    expect(html).toContain("data.title||'Brief'");
    expect(html).toContain("data.summary||''");
    expect(html).toContain("data.fullContent||''");
  });

  it('brief panel appears inside container before run-library', () => {
    const briefIdx = html.indexOf('id="brief-panel"');
    const runLibIdx = html.indexOf('id="run-library"');
    const containerIdx = html.indexOf('class="container"');
    expect(briefIdx).toBeGreaterThan(containerIdx);
    expect(briefIdx).toBeLessThan(runLibIdx);
  });

  it('toggle text changes between expanded and collapsed', () => {
    expect(html).toContain('Visa hela briefen');
    // Uses unicode for Dölj
    expect(html).toContain('lj briefen');
  });
});

describe('T4: Per-Agent Cost Display', () => {
  const html = renderLiveDashboard('test-run');

  it('contains PRICE_IN and PRICE_OUT constants', () => {
    expect(html).toContain('var PRICE_IN=3.0,PRICE_OUT=15.0;');
  });

  it('per-agent cost calculation present', () => {
    expect(html).toContain('at2.cost=(at2.tokIn*PRICE_IN+at2.tokOut*PRICE_OUT)/1000000');
  });

  it('per-agent token display includes dollar cost', () => {
    expect(html).toContain("at2.cost.toFixed(2)");
  });

  it('total cost uses PRICE constants instead of hardcoded values', () => {
    expect(html).toContain('totalCost=(totalIn*PRICE_IN+totalOut*PRICE_OUT)/1000000');
    // Should NOT contain hardcoded cost calculation anymore
    expect(html).not.toContain('totalCost=(totalIn*3.0+totalOut*15.0)');
  });

  it('initializes at2.cost if not present', () => {
    expect(html).toContain('if(!at2.cost)at2.cost=0');
  });
});

describe('T5: ETA Calculation', () => {
  const html = renderLiveDashboard('test-run');

  it('contains taskDurations variable', () => {
    expect(html).toContain('var taskDurations={}');
  });

  it('contains etaText variable', () => {
    expect(html).toContain("var etaText=''");
  });

  it('tracks durations for completed tasks', () => {
    expect(html).toContain("data.status==='completed' && taskStartTimes[data.taskId]");
    expect(html).toContain('taskDurations[data.taskId]=(Date.now()-taskStartTimes[data.taskId])/1000');
  });

  it('contains updateETA function', () => {
    expect(html).toContain('function updateETA()');
  });

  it('updateETA uses median calculation', () => {
    expect(html).toContain('var median=');
    expect(html).toContain('durs.sort(');
  });

  it('updateETA requires at least 3 completed durations', () => {
    expect(html).toContain('durs.length<3');
  });

  it('updateETA shows Klar! when all tasks complete', () => {
    expect(html).toContain('Klar!');
  });

  it('updateETA shows estimated minutes remaining', () => {
    expect(html).toContain('min kvar');
  });

  it('ETA updates on 10-second interval', () => {
    expect(html).toContain('setInterval(updateETA,10000)');
  });

  it('ETA element exists in header', () => {
    expect(html).toContain('id="eta"');
  });

  it('ETA element is after latency span', () => {
    const latencyIdx = html.indexOf('id="latency"');
    const etaIdx = html.indexOf('id="eta"');
    expect(etaIdx).toBeGreaterThan(latencyIdx);
  });
});
