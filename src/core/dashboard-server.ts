import http from 'node:http';
import { exec } from 'node:child_process';
import { eventBus } from './event-bus.js';
import { renderLiveDashboard } from './dashboard-ui.js';

const MAX_SSE_CLIENTS = 5;
const DASHBOARD_PORT = 4200;

/**
 * Handle returned by startDashboardServer to allow graceful shutdown.
 */
export interface DashboardServer {
  close(): void;
  port: number;
}

/**
 * Start a minimal HTTP server for the live SSE-powered dashboard.
 *
 * Serves the rendered dashboard HTML on `/` and an SSE stream on `/events`.
 * Automatically closes when the `run:end` event fires.
 *
 * @param runid - The run identifier to display in the dashboard.
 * @param port - The port to listen on (defaults to DASHBOARD_PORT).
 * @returns A DashboardServer handle, or null if startup fails entirely.
 */
export function startDashboardServer(runid: string, port: number = DASHBOARD_PORT): DashboardServer | null {
  try {
    const sseClients = new Set<http.ServerResponse>();

    const onAnyCallback = (event: string, data: unknown): void => {
      const payload = `data: ${JSON.stringify({ event, data, timestamp: new Date().toISOString() })}\n\n`;
      for (const client of sseClients) {
        try {
          client.write(payload);
        } catch {
          sseClients.delete(client);
        }
      }
    };

    eventBus.onAny(onAnyCallback);

    const server = http.createServer((req, res) => {
      const url = req.url ?? '/';

      if (req.method === 'GET' && url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLiveDashboard(runid));
        return;
      }

      if (req.method === 'GET' && url === '/events') {
        if (sseClients.size >= MAX_SSE_CLIENTS) {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('Too many SSE clients');
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      // Everything else → 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(port);

    server.on('listening', () => {
      console.log(`[Dashboard] Live at http://localhost:${port}`);
      exec(`open http://localhost:${port}`);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Dashboard] Port ${port} unavailable, dashboard disabled`);
      } else {
        console.error(`[Dashboard] Server error: ${err.message}`);
      }
    });

    const close = (): void => {
      eventBus.removeOnAny(onAnyCallback);
      for (const client of sseClients) {
        try {
          client.end();
        } catch {
          // ignore — client may already be gone
        }
      }
      sseClients.clear();
      server.close();
    };

    // Auto-close on run:end
    const onRunEnd = (): void => {
      close();
    };
    eventBus.once('run:end', onRunEnd);

    return { close, port };
  } catch (err: unknown) {
    console.error(`[Dashboard] Failed to start: ${err}`);
    return null;
  }
}
