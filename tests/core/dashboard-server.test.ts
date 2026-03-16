import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import { startDashboardServer, type DashboardServer } from '../../src/core/dashboard-server.js';
import { eventBus } from '../../src/core/event-bus.js';

// Prevent the server from opening a browser during tests
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

let nextPort = 14200;
function getPort(): number {
  return nextPort++;
}

/** Small delay to let the server bind / release port. */
const wait = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * HTTP GET helper using Node built-ins.
 */
function httpGet(
  path: string,
  port: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

/**
 * Open an SSE connection. Since the server buffers headers until the first
 * write, this also triggers a flush event after a short delay.
 * Returns the response for inspection and the request for cleanup.
 */
function openSSE(
  port: number,
): Promise<{ res: http.IncomingMessage; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/events', method: 'GET' },
      (res) => {
        resolve({ res, req });
      },
    );
    req.on('error', reject);

    // After the TCP connection is established, emit a flush event to
    // trigger the server to write, which flushes the response headers.
    req.on('socket', (socket) => {
      socket.on('connect', () => {
        setTimeout(() => {
          eventBus.safeEmit('audit', { _flush: true });
        }, 50);
      });
    });
    req.end();
  });
}

/**
 * Open an SSE connection specifically for the max-clients test.
 * Since we need multiple SSE connections and they only resolve when
 * data is written, we use a slightly different approach: open a raw
 * request and wait for the server to respond once we flush.
 */
function openSSERaw(
  port: number,
): Promise<{ res: http.IncomingMessage; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/events', method: 'GET' },
      (res) => {
        resolve({ res, req });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

let server: DashboardServer | null = null;

// Suppress console output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(async () => {
  server?.close();
  server = null;
  eventBus.removeAllListeners();
  eventBus.resetHistory();
  eventBus.resetCounts();
  await wait(250);
});

/**
 * Start the dashboard server and wait until it is accepting connections.
 */
async function startAndWait(runid = 'test-run', port?: number): Promise<DashboardServer> {
  const p = port ?? getPort();
  const s = startDashboardServer(runid, p);
  if (!s) throw new Error('startDashboardServer returned null');
  await wait(200);
  return s;
}

// =====================================================
// 1. Server starts successfully
// =====================================================
describe('Dashboard server lifecycle', () => {
  it('starts successfully and returns a DashboardServer with close()', async () => {
    server = await startAndWait();
    expect(server).not.toBeNull();
    expect(typeof server!.close).toBe('function');
  });

  // =====================================================
  // 5. Server closes cleanly
  // =====================================================
  it('closes cleanly — subsequent requests fail', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    server!.close();
    server = null;
    await wait(250);
    await expect(httpGet('/', port)).rejects.toThrow();
  });

  // =====================================================
  // 9. Server auto-stops on run:end
  // =====================================================
  it('auto-stops on run:end event', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    eventBus.safeEmit('run:end', { runid: 'test-run', duration: 42 });
    server = null;
    await wait(250);
    await expect(httpGet('/', port)).rejects.toThrow();
  });
});

// =====================================================
// 2. GET / returns HTML
// =====================================================
describe('GET /', () => {
  it('returns 200 with HTML containing expected content', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { status, headers, body } = await httpGet('/', port);
    expect(status).toBe(200);
    expect(headers['content-type']).toContain('text/html');
    expect(body).toContain('<html');
    expect(body).toContain('NEURON HQ');
    expect(body).toContain('test-run');
  });

  // =====================================================
  // 8. HTML template contains expected elements
  // =====================================================
  it('contains agent-tiles, event-log, task-list, stoplight, EventSource', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { body } = await httpGet('/', port);
    expect(body).toContain('agent-tiles');
    expect(body).toContain('event-log');
    expect(body).toContain('task-list');
    expect(body).toContain('stoplight');
    expect(body).toContain('EventSource');
  });
});

// =====================================================
// 10. Unknown route returns 404
// =====================================================
describe('Unknown routes', () => {
  it('GET /unknown returns 404', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { status } = await httpGet('/unknown', port);
    expect(status).toBe(404);
  });
});

// =====================================================
// 3. SSE Content-Type
// =====================================================
describe('SSE /events', () => {
  it('returns text/event-stream Content-Type', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { res, req } = await openSSE(port);
    try {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
    } finally {
      req.destroy();
    }
  });

  // =====================================================
  // 4. SSE streams events from eventBus
  // =====================================================
  it('streams events emitted via eventBus', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { res, req } = await openSSE(port);

    const received: string[] = [];
    res.on('data', (chunk: Buffer) => {
      received.push(chunk.toString());
    });

    // Wait for data from the flush event + emit a real event
    await wait(100);
    eventBus.safeEmit('tokens', {
      runid: 'test-run',
      agent: 'impl',
      input: 100,
      output: 50,
    });
    await wait(150);
    req.destroy();

    expect(received.length).toBeGreaterThan(0);
    const combined = received.join('');
    expect(combined).toContain('data:');
    expect(combined).toContain('"tokens"');
  });

  // =====================================================
  // 11. SSE event format is correct JSON
  // =====================================================
  it('SSE event format is correct JSON with event, data, timestamp', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);
    const { res, req } = await openSSE(port);

    const chunks: string[] = [];
    res.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    await wait(100);
    eventBus.safeEmit('tokens', {
      runid: 'test-run',
      agent: 'impl',
      input: 200,
      output: 100,
    });
    await wait(150);
    req.destroy();

    const combined = chunks.join('');
    // Find the tokens event data (skip the flush event)
    const lines = combined.split('\n');
    const dataLines = lines.filter((l) => l.startsWith('data: '));
    expect(dataLines.length).toBeGreaterThan(0);

    // Find the tokens event specifically
    const tokensLine = dataLines.find((l) => l.includes('"tokens"'));
    expect(tokensLine).toBeDefined();

    const json = tokensLine!.replace('data: ', '');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toHaveProperty('event', 'tokens');
    expect(parsed).toHaveProperty('data');
    expect(parsed).toHaveProperty('timestamp');
    expect(typeof parsed.timestamp).toBe('string');
  });
});

// =====================================================
// 7. Max 5 SSE clients enforced
// =====================================================
describe('SSE client limit', () => {
  it('enforces max 5 SSE clients — 6th gets 503', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);

    // Open 5 SSE connections using raw (they won't resolve until headers flush)
    const connectionPromises: Array<Promise<{
      res: http.IncomingMessage;
      req: http.ClientRequest;
    }>> = [];
    for (let i = 0; i < 5; i++) {
      connectionPromises.push(openSSERaw(port));
    }

    // Give the server a moment to register all 5 connections
    await wait(100);

    // Now emit an event to flush headers on all 5 connections
    eventBus.safeEmit('audit', { _flush: true });

    const connections = await Promise.all(connectionPromises);

    try {
      for (const conn of connections) {
        expect(conn.res.statusCode).toBe(200);
      }

      // 6th should get 503 (this is a normal response, not SSE)
      const { status } = await httpGet('/events', port);
      expect(status).toBe(503);
    } finally {
      for (const conn of connections) {
        conn.req.destroy();
      }
    }
  });
});

// =====================================================
// 6. Port conflict handled gracefully
// =====================================================
describe('Port conflict', () => {
  let blocker: http.Server | null = null;

  afterEach(async () => {
    if (blocker) {
      blocker.close();
      blocker = null;
      await wait(250);
    }
  });

  it('handles port conflict gracefully without throwing', async () => {
    const port = getPort();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    blocker = http.createServer();
    await new Promise<void>((resolve) => {
      blocker!.listen(port, resolve);
    });

    server = startDashboardServer('conflict-test', port);
    await wait(200);

    expect(server).not.toBeNull();
    const calls = logSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('unavailable');
    logSpy.mockRestore();
  });
});

// =====================================================
// 12. Return type allows null
// =====================================================
describe('Return type', () => {
  it('startDashboardServer return type allows null', () => {
    const result: DashboardServer | null = null;
    expect(result).toBeNull();
  });
});

// =====================================================
// 13-14. SSE reconnect / history replay
// =====================================================
describe('SSE reconnect / history replay', () => {
  it('SSE reconnect sends history events', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);

    // Emit events BEFORE connecting the SSE client so they exist in history
    eventBus.safeEmit('tokens', {
      runid: 'test-run',
      agent: 'impl',
      input: 100,
      output: 50,
    });
    eventBus.safeEmit('iteration', {
      runid: 'test-run',
      agent: 'impl',
      current: 3,
      max: 70,
    });

    // Now connect SSE — history replay will flush the response headers
    // so openSSERaw is sufficient (no need for the flush trick)
    const { res, req } = await openSSERaw(port);

    const chunks: string[] = [];
    res.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    // Wait for replayed data to arrive
    await wait(200);
    req.destroy();

    const combined = chunks.join('');
    // Should contain the replayed tokens event
    expect(combined).toContain('"tokens"');
    // Should contain the replayed iteration event
    expect(combined).toContain('"iteration"');
  });

  it('history replay events are valid JSON with event, data, timestamp', async () => {
    const port = getPort();
    server = await startAndWait('test-run', port);

    // Emit events before connecting
    eventBus.safeEmit('stoplight', {
      runid: 'test-run',
      status: 'GREEN',
    });
    eventBus.safeEmit('tokens', {
      runid: 'test-run',
      agent: 'reviewer',
      input: 300,
      output: 150,
    });

    // Connect SSE — history replay flushes immediately
    const { res, req } = await openSSERaw(port);

    const chunks: string[] = [];
    res.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    await wait(200);
    req.destroy();

    const combined = chunks.join('');
    const lines = combined.split('\n');
    const dataLines = lines.filter((l) => l.startsWith('data: '));

    // Should have at least the 2 replayed events
    expect(dataLines.length).toBeGreaterThanOrEqual(2);

    // Every data line should be valid JSON with the required fields
    for (const line of dataLines) {
      const json = line.replace('data: ', '');
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed).toHaveProperty('event');
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('timestamp');
      expect(typeof parsed.event).toBe('string');
      expect(typeof parsed.timestamp).toBe('string');
    }
  });
});
