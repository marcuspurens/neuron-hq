import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startDashboardServer, type DashboardServer, type RunSummary } from '../../src/core/dashboard-server.js';
import { eventBus } from '../../src/core/event-bus.js';

// Prevent the server from opening a browser during tests
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

let nextPort = 15200;
function getPort(): number {
  return nextPort++;
}

const wait = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

function httpGet(
  urlPath: string,
  port: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

let server: DashboardServer | null = null;
const tmpDirs: string[] = [];

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

async function makeTmpDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'neuron-dash-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  server?.close();
  server = null;
  eventBus.removeAllListeners();
  eventBus.resetHistory();
  eventBus.resetCounts();
  await wait(250);
  for (const dir of tmpDirs) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

async function startAndWait(
  runid: string,
  port: number,
  runsDir?: string,
): Promise<DashboardServer> {
  const s = startDashboardServer(runid, port, runsDir);
  if (!s) throw new Error('startDashboardServer returned null');
  await wait(200);
  return s;
}

// =====================================================
// GET /runs — no runsDir
// =====================================================
describe('GET /runs without runsDir', () => {
  it('returns empty array when runsDir is not provided', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { status, body } = await httpGet('/runs', port);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual([]);
  });
});

// =====================================================
// GET /runs — with runsDir
// =====================================================
describe('GET /runs with runsDir', () => {
  it('returns empty array when runsDir is empty', async () => {
    const runsDir = await makeTmpDir();
    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { status, body } = await httpGet('/runs', port);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual([]);
  });

  it('returns run summaries for dirs with valid metrics.json', async () => {
    const runsDir = await makeTmpDir();
    const runName = '20260315-1200-test-run';
    const runPath = path.join(runsDir, runName);
    await fsp.mkdir(runPath);

    // Write metrics.json
    await fsp.writeFile(path.join(runPath, 'metrics.json'), JSON.stringify({
      timing: { started_at: '2026-03-15T12:00:00Z', duration_seconds: 1800 },
      tokens: { total_input: 100000, total_output: 20000 },
      testing: { tests_added: 5 },
    }));

    // Write brief.md
    await fsp.writeFile(path.join(runPath, 'brief.md'), '# My Test Brief\n\nSome content');

    // Write report.md with stoplight
    await fsp.writeFile(path.join(runPath, 'report.md'), '## STOPLIGHT: GREEN\n\nAll good');

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { status, body } = await httpGet('/runs', port);
    expect(status).toBe(200);

    const summaries: RunSummary[] = JSON.parse(body);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].runid).toBe(runName);
    expect(summaries[0].briefTitle).toBe('My Test Brief');
    expect(summaries[0].date).toBe('2026-03-15');
    expect(summaries[0].durationMin).toBe(30);
    expect(summaries[0].stoplight).toBe('GREEN');
    expect(summaries[0].testsAdded).toBe(5);
    expect(summaries[0].costUsd).toBeGreaterThan(0);
    expect(summaries[0].hasDigest).toBe(false);
  });

  it('detects hasDigest when digest.md exists', async () => {
    const runsDir = await makeTmpDir();
    const runName = '20260315-1300-digest-run';
    const runPath = path.join(runsDir, runName);
    await fsp.mkdir(runPath);

    await fsp.writeFile(path.join(runPath, 'metrics.json'), JSON.stringify({
      timing: { started_at: '2026-03-15T13:00:00Z', duration_seconds: 600 },
      tokens: { total_input: 50000, total_output: 10000 },
    }));

    // Write digest.md
    await fsp.writeFile(path.join(runPath, 'digest.md'), '# Digest\nContent');

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { body } = await httpGet('/runs', port);
    const summaries: RunSummary[] = JSON.parse(body);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].hasDigest).toBe(true);
  });

  it('skips dirs without metrics.json', async () => {
    const runsDir = await makeTmpDir();
    await fsp.mkdir(path.join(runsDir, 'run-no-metrics'));
    await fsp.mkdir(path.join(runsDir, 'run-with-metrics'));
    await fsp.writeFile(path.join(runsDir, 'run-with-metrics', 'metrics.json'), JSON.stringify({
      timing: { started_at: '2026-03-15T12:00:00Z', duration_seconds: 60 },
      tokens: { total_input: 1000, total_output: 500 },
    }));

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { body } = await httpGet('/runs', port);
    const summaries: RunSummary[] = JSON.parse(body);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].runid).toBe('run-with-metrics');
  });

  it('sorts runs newest first (by runid descending)', async () => {
    const runsDir = await makeTmpDir();
    const runs = ['20260310-0100-a', '20260315-0200-b', '20260312-0300-c'];
    for (const name of runs) {
      await fsp.mkdir(path.join(runsDir, name));
      await fsp.writeFile(path.join(runsDir, name, 'metrics.json'), JSON.stringify({
        timing: { started_at: '2026-03-15T12:00:00Z', duration_seconds: 60 },
        tokens: {},
      }));
    }

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { body } = await httpGet('/runs', port);
    const summaries: RunSummary[] = JSON.parse(body);
    expect(summaries).toHaveLength(3);
    expect(summaries[0].runid).toBe('20260315-0200-b');
    expect(summaries[1].runid).toBe('20260312-0300-c');
    expect(summaries[2].runid).toBe('20260310-0100-a');
  });

  it('defaults stoplight to unknown when report.md is missing', async () => {
    const runsDir = await makeTmpDir();
    const runName = '20260315-1400-no-report';
    await fsp.mkdir(path.join(runsDir, runName));
    await fsp.writeFile(path.join(runsDir, runName, 'metrics.json'), JSON.stringify({
      timing: { started_at: '2026-03-15T14:00:00Z' },
      tokens: {},
    }));

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { body } = await httpGet('/runs', port);
    const summaries: RunSummary[] = JSON.parse(body);
    expect(summaries[0].stoplight).toBe('unknown');
  });

  it('uses runid as briefTitle when brief.md is missing', async () => {
    const runsDir = await makeTmpDir();
    const runName = '20260315-1500-no-brief';
    await fsp.mkdir(path.join(runsDir, runName));
    await fsp.writeFile(path.join(runsDir, runName, 'metrics.json'), JSON.stringify({
      timing: { started_at: '2026-03-15T15:00:00Z' },
      tokens: {},
    }));

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { body } = await httpGet('/runs', port);
    const summaries: RunSummary[] = JSON.parse(body);
    expect(summaries[0].briefTitle).toBe(runName);
  });

  it('returns CORS header on /runs', async () => {
    const runsDir = await makeTmpDir();
    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { headers } = await httpGet('/runs', port);
    expect(headers['access-control-allow-origin']).toBe('*');
  });
});

// =====================================================
// GET /digest/:runid
// =====================================================
describe('GET /digest/:runid', () => {
  it('returns 404 when runsDir is not provided', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { status } = await httpGet('/digest/some-run', port);
    expect(status).toBe(404);
  });

  it('returns 404 when runid contains path traversal', async () => {
    const runsDir = await makeTmpDir();
    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { status } = await httpGet('/digest/../etc/passwd', port);
    expect(status).toBe(404);
  });

  it('returns 404 when digest does not exist', async () => {
    const runsDir = await makeTmpDir();
    await fsp.mkdir(path.join(runsDir, 'some-run'));
    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { status, body } = await httpGet('/digest/some-run', port);
    expect(status).toBe(404);
    expect(body).toBe('Digest not found');
  });

  it('returns digest content when it exists', async () => {
    const runsDir = await makeTmpDir();
    const runName = '20260315-1600-digest-test';
    await fsp.mkdir(path.join(runsDir, runName));
    const digestContent = '# Run Digest\n\n## Summary\nAll went well.';
    await fsp.writeFile(path.join(runsDir, runName, 'digest.md'), digestContent);

    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);
    const { status, headers, body } = await httpGet(`/digest/${runName}`, port);
    expect(status).toBe(200);
    expect(headers['content-type']).toContain('text/markdown');
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(body).toBe(digestContent);
  });
});

// =====================================================
// Backwards compatibility
// =====================================================
describe('Backwards compatibility', () => {
  it('existing routes still work with runsDir parameter', async () => {
    const runsDir = await makeTmpDir();
    const port = getPort();
    server = await startAndWait('test-run', port, runsDir);

    // HTML dashboard still works
    const { status: htmlStatus, body: htmlBody } = await httpGet('/', port);
    expect(htmlStatus).toBe(200);
    expect(htmlBody).toContain('<html');

    // 404 for unknown routes still works
    const { status: notFoundStatus } = await httpGet('/unknown', port);
    expect(notFoundStatus).toBe(404);
  });
});
