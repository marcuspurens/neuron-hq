import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ArtifactsManager } from '../../src/core/artifacts.js';
import type { StoplightStatus } from '../../src/core/types.js';

describe('ArtifactsManager', () => {
  let tempDir: string;
  let manager: ArtifactsManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-test-'));
    manager = new ArtifactsManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('init', () => {
    it('creates the run directory', async () => {
      const runDir = path.join(tempDir, 'run-001');
      const m = new ArtifactsManager(runDir);
      await m.init();
      const stat = await fs.stat(runDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates the research subdirectory', async () => {
      await manager.init();
      const stat = await fs.stat(path.join(tempDir, 'research'));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('writeBrief and readBrief', () => {
    it('writes and reads back the brief content', async () => {
      await manager.writeBrief('# Brief\nThis is the content.');
      const content = await manager.readBrief();
      expect(content).toBe('# Brief\nThis is the content.');
    });
  });

  describe('writeQuestions', () => {
    it('writes "No blockers." for an empty question list', async () => {
      await manager.writeQuestions([]);
      const content = await fs.readFile(path.join(tempDir, 'questions.md'), 'utf-8');
      expect(content).toContain('No blockers.');
    });

    it('numbers each question as a ## heading', async () => {
      await manager.writeQuestions(['First question', 'Second question']);
      const content = await fs.readFile(path.join(tempDir, 'questions.md'), 'utf-8');
      expect(content).toContain('## 1.');
      expect(content).toContain('## 2.');
      expect(content).toContain('First question');
      expect(content).toContain('Second question');
    });
  });

  describe('checkCompleteness', () => {
    it('returns complete:true when all required files exist', async () => {
      await manager.init();
      const required = [
        'brief.md', 'baseline.md', 'report.md', 'questions.md',
        'ideas.md', 'knowledge.md', 'audit.jsonl',
        'manifest.json', 'usage.json', 'redaction_report.md',
      ];
      for (const f of required) {
        await fs.writeFile(path.join(tempDir, f), 'placeholder', 'utf-8');
      }
      const result = await manager.checkCompleteness();
      expect(result.complete).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns complete:false and lists all missing files when none exist', async () => {
      const result = await manager.checkCompleteness();
      expect(result.complete).toBe(false);
      expect(result.missing).toContain('brief.md');
      expect(result.missing).toContain('report.md');
      expect(result.missing).toContain('audit.jsonl');
    });

    it('does not list files that do exist as missing', async () => {
      await fs.writeFile(path.join(tempDir, 'brief.md'), 'content', 'utf-8');
      const result = await manager.checkCompleteness();
      expect(result.missing).not.toContain('brief.md');
      expect(result.missing).toContain('report.md');
    });
  });

  describe('writeReport — formatStoplight', () => {
    const passStatus: StoplightStatus = {
      baseline_verify: 'PASS',
      after_change_verify: 'PASS',
      diff_size: 'OK',
      risk: 'LOW',
      artifacts: 'COMPLETE',
    };

    const failStatus: StoplightStatus = {
      baseline_verify: 'FAIL',
      after_change_verify: 'FAIL',
      diff_size: 'TOO_BIG',
      risk: 'HIGH',
      artifacts: 'INCOMPLETE',
    };

    it('uses ✅ icon for PASS/OK/COMPLETE/LOW values', async () => {
      await manager.writeReport(passStatus, 'body');
      const content = await fs.readFile(path.join(tempDir, 'report.md'), 'utf-8');
      expect(content).toContain('✅ Baseline verify: PASS');
      expect(content).toContain('✅ Diff size: OK');
      expect(content).toContain('✅ Risk: LOW');
      expect(content).toContain('✅ Artifacts: COMPLETE');
    });

    it('uses ❌ icon for FAIL/TOO_BIG/INCOMPLETE/HIGH values', async () => {
      await manager.writeReport(failStatus, 'body');
      const content = await fs.readFile(path.join(tempDir, 'report.md'), 'utf-8');
      expect(content).toContain('❌ Baseline verify: FAIL');
      expect(content).toContain('❌ Diff size: TOO_BIG');
      expect(content).toContain('❌ Risk: HIGH');
      expect(content).toContain('❌ Artifacts: INCOMPLETE');
    });

    it('uses ⚠️ icon for MED risk', async () => {
      await manager.writeReport({ ...passStatus, risk: 'MED' }, 'body');
      const content = await fs.readFile(path.join(tempDir, 'report.md'), 'utf-8');
      expect(content).toContain('⚠️ Risk: MED');
    });

    it('includes the report body after the stoplight section', async () => {
      await manager.writeReport(passStatus, '## Analysis\nSome important details.');
      const content = await fs.readFile(path.join(tempDir, 'report.md'), 'utf-8');
      expect(content).toContain('## Analysis');
      expect(content).toContain('Some important details.');
    });
  });

  describe('getArtifactPaths', () => {
    it('returns correct absolute paths for all artifacts', () => {
      const paths = manager.getArtifactPaths();
      expect(paths.brief).toBe(path.join(tempDir, 'brief.md'));
      expect(paths.report).toBe(path.join(tempDir, 'report.md'));
      expect(paths.audit).toBe(path.join(tempDir, 'audit.jsonl'));
      expect(paths.sources).toBe(path.join(tempDir, 'research', 'sources.md'));
      expect(paths.manifest).toBe(path.join(tempDir, 'manifest.json'));
    });
  });
});
