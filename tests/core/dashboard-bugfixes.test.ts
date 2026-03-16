import { describe, it, expect } from 'vitest';
import { renderLiveDashboard } from '../../src/core/dashboard-ui.js';

describe('RT-3d Dashboard Bugfixes', () => {
  const html = renderLiveDashboard('test-run-001');

  // ══════════════════════════════════════════════════
  // Del 1: Status line replaces reasoning
  // ══════════════════════════════════════════════════
  describe('Del 1: Status line replaces reasoning', () => {
    it('does not contain .reasoning CSS class', () => {
      // The .reasoning class should be completely removed
      // (thinking-content has its own class)
      expect(html).not.toMatch(/\.agent-tile\s+\.reasoning/);
      expect(html).not.toMatch(/class="reasoning"/);
    });

    it('does not contain Resonemang toggle element', () => {
      // The toggle for "Resonemang" should be gone
      expect(html).not.toContain('Resonemang</div>');
      // But "Resonemang:" in decision detail is OK (different context)
    });

    it('contains .status-line CSS rule', () => {
      expect(html).toContain('.agent-tile .status-line{');
    });

    it('status-line CSS has correct properties', () => {
      expect(html).toMatch(/\.status-line\{[^}]*max-width:230px/);
      expect(html).toMatch(/\.status-line\{[^}]*text-overflow:ellipsis/);
      expect(html).toMatch(/\.status-line\{[^}]*white-space:nowrap/);
    });

    it('getOrCreateTile creates status-line element', () => {
      // The JS template for agent tiles should include status-line
      expect(html).toContain('class="status-line"');
    });

    it('does not initialize lines array in agent objects', () => {
      // Old code: agents[name]={el:t,lines:[]};
      // New code should not have lines:[]
      expect(html).not.toMatch(/lines:\[\]/);
    });

    it('agent:text handler uses textBuf for sentence extraction', () => {
      expect(html).toContain('textBuf');
    });

    it('agent:text handler splits on sentence-ending punctuation', () => {
      // Matches: split(/(?<=[.!?\n])\s+/)
      expect(html).toMatch(/split\(\/\(\?\<\=\[\.!\?\\n\]\)/);
    });

    it('agent:text handler truncates at 80 characters', () => {
      expect(html).toContain('substring(0,77)');
    });

    it('thinking-toggle and thinking-content still exist', () => {
      // Thinking elements should NOT be removed
      expect(html).toContain('thinking-toggle');
      expect(html).toContain('thinking-content');
    });
  });

  // ══════════════════════════════════════════════════
  // Del 2: Task descriptions
  // ══════════════════════════════════════════════════
  describe('Del 2: Task descriptions', () => {
    it('handles task:plan events to populate taskDescriptions', () => {
      expect(html).toContain("event==='task:plan'");
    });

    it('task:plan handler iterates over data.tasks', () => {
      expect(html).toContain('planTasks=data.tasks');
    });

    it('task:plan handler stores descriptions in taskDescriptions', () => {
      expect(html).toMatch(/taskDescriptions\[planTasks\[pi\]\.id\]/);
    });

    it('task:plan handler calls renderTasks after updating', () => {
      // After populating taskDescriptions, renderTasks should be called
      const taskPlanBlock = html.match(/event==='task:plan'\)\{[\s\S]*?renderTasks\(\)/);
      expect(taskPlanBlock).not.toBeNull();
    });

    it('renderTaskItem only shows dash when description exists', () => {
      // var desc=taskDescriptions[tid]?(' — '+taskDescriptions[tid]):'';
      // \u2014 is the em-dash character —
      expect(html).toContain("taskDescriptions[tid]?(' \u2014 '+taskDescriptions[tid]):''");
    });

    it('narrateEvent handles task:plan', () => {
      expect(html).toContain("case 'task:plan':");
    });
  });

  // ══════════════════════════════════════════════════
  // Del 3: Dropdown error handling
  // ══════════════════════════════════════════════════
  describe('Del 3: Dropdown error handling', () => {
    it('loadRuns catch block is not empty', () => {
      // Old: .catch(function(){});
      // New: .catch(function(err){ ... })
      expect(html).not.toMatch(/\.catch\(function\(\)\{?\s*\}\s*\)/);
    });

    it('loadRuns catch block logs error to console', () => {
      expect(html).toContain("console.error('Failed to load runs:'");
    });

    it('loadRuns catch block shows error message in dropdown', () => {
      expect(html).toContain('Kunde inte ladda');
    });

    it('retry button exists in error message', () => {
      expect(html).toContain('retry-btn');
      expect(html).toContain('loadRuns()');
    });

    it('retry button text is Swedish', () => {
      // F\u00F6rs\u00F6k igen in the HTML output (escaped unicode in JS code)
      expect(html).toMatch(/F.{1,8}rs.{1,8}k igen/);
    });

    it('loadRuns is exposed globally for retry', () => {
      expect(html).toContain('window.loadRuns=loadRuns');
    });

    it('loadRuns checks response.ok', () => {
      expect(html).toContain("if(!r.ok)throw");
    });
  });

  // ══════════════════════════════════════════════════
  // Del 4: Decision events
  // ══════════════════════════════════════════════════
  describe('Del 4: Decision events', () => {
    it('decision handler calls addLogEntry', () => {
      expect(html).toContain("event==='decision'");
      expect(html).toContain('addLogEntry(event,data,ts)');
    });

    it('addLogEntry has proper decision rendering', () => {
      expect(html).toContain("event==='decision' && data.decision");
      expect(html).toContain('decision-detail');
    });

    it('decision rendering shows confidence with emoji', () => {
      expect(html).toMatch(/confEmoji/);
    });

    it('decision rendering supports expand/collapse', () => {
      expect(html).toContain('detail-expand');
      expect(html).toContain("classList.toggle('expanded')");
    });

    it('decision rendering shows why field', () => {
      expect(html).toContain("Varf");
      expect(html).toContain("dec.why");
    });

    it('decision rendering shows alternatives if present', () => {
      expect(html).toContain('Alternativ');
      expect(html).toContain('dec.alternatives');
    });
  });
});
