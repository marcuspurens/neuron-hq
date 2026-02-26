import { describe, it, expect, vi } from 'vitest';

// Mock cli.ts to prevent program.parse() from running at import time
vi.mock('../../src/cli.js', () => ({
  BASE_DIR: '/mock/base',
}));

import { formatHealthReport, type HealthData } from '../../src/commands/monitor.js';

function makeHealth(overrides: Partial<HealthData> = {}): HealthData {
  return {
    status: 'ok',
    tests: { passed: 204, total: 204 },
    components: {
      sqlite3: { ok: true },
    },
    data_dir: { manifests_count: 1, embeddings_count: 65 },
    ...overrides,
  };
}

describe('formatHealthReport', () => {
  it('formats ok status correctly', () => {
    const report = formatHealthReport(makeHealth({ status: 'ok' }));
    expect(report).toContain('✅ ok');
    expect(report).toContain('204/204 passed');
  });

  it('formats degraded status correctly', () => {
    const report = formatHealthReport(makeHealth({ status: 'degraded' }));
    expect(report).toContain('❌ degraded');
  });

  it('formats error status with cross mark', () => {
    const report = formatHealthReport(makeHealth({ status: 'error' }));
    expect(report).toContain('❌ error');
  });

  it('shows component details when present', () => {
    const health = makeHealth({
      components: {
        sqlite3: { ok: true },
        paddleocr: { ok: false, reason: 'not installed' },
      },
    });
    const report = formatHealthReport(health);
    expect(report).toContain('✅ sqlite3');
    expect(report).toContain('❌ paddleocr — not installed');
  });

  it('shows all components as ok when all pass', () => {
    const health = makeHealth({
      components: {
        sqlite3: { ok: true },
        paddleocr: { ok: true },
        redis: { ok: true },
      },
    });
    const report = formatHealthReport(health);
    expect(report).toContain('✅ sqlite3');
    expect(report).toContain('✅ paddleocr');
    expect(report).toContain('✅ redis');
    expect(report).not.toContain('❌');
  });

  it('includes data summary', () => {
    const report = formatHealthReport(
      makeHealth({ data_dir: { manifests_count: 3, embeddings_count: 120 } })
    );
    expect(report).toContain('3 manifests · 120 embeddings');
  });

  it('includes separator line', () => {
    const report = formatHealthReport(makeHealth());
    expect(report).toContain('───');
  });

  it('includes Components header', () => {
    const report = formatHealthReport(makeHealth());
    expect(report).toContain('Components:');
  });

  it('component without detail has no dash suffix', () => {
    const health = makeHealth({
      components: { sqlite3: { ok: true } },
    });
    const report = formatHealthReport(health);
    const line = report.split('\n').find((l) => l.includes('sqlite3'))!;
    expect(line.trim()).toBe('✅ sqlite3');
  });
});
