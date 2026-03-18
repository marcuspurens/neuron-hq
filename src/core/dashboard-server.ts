import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { eventBus } from './event-bus.js';
import { renderLiveDashboard } from './dashboard-ui.js';
import { calcCost } from './pricing.js';
import { extractDecisions } from './decision-extractor.js';
import type { AuditEntry, EventData } from './decision-extractor.js';

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
 * Summary of a single run, returned by GET /runs.
 */
export interface RunSummary {
  runid: string;
  briefTitle: string;
  date: string;
  durationMin: number;
  stoplight: 'GREEN' | 'YELLOW' | 'RED' | 'unknown';
  testsAdded: number;
  costUsd: number;
  hasDigest: boolean;
}

/**
 * Enrich an audit event with display-friendly fields.
 *
 * Creates a shallow copy — the original data object is never mutated.
 * - `display_files`: workspace-prefix-stripped version of `files_touched`
 * - `display_command`: cleaned bash command from `note`
 */
export function enrichAuditEvent(data: Record<string, unknown>): Record<string, unknown> {
  const enriched = { ...data };

  // Strip workspace prefix from files_touched → display_files
  if (Array.isArray(enriched.files_touched)) {
    enriched.display_files = (enriched.files_touched as string[]).map((f) => {
      const wsIdx = f.indexOf('/neuron-hq/');
      return wsIdx >= 0 ? f.slice(wsIdx + '/neuron-hq/'.length) : f;
    });
  }

  // Clean bash command → display_command
  if (enriched.tool === 'bash_exec' && typeof enriched.note === 'string') {
    let cmd = (enriched.note as string).replace(/^Command:\s*/, '');
    const andIdx = cmd.indexOf(' && ');
    if (andIdx >= 0 && cmd.substring(0, andIdx).startsWith('cd ')) {
      cmd = cmd.slice(andIdx + 4);
    }
    enriched.display_command = cmd;
  }

  return enriched;
}

/**
 * Start a minimal HTTP server for the live SSE-powered dashboard.
 *
 * Serves the rendered dashboard HTML on `/` and an SSE stream on `/events`.
 * Automatically closes when the `run:end` event fires.
 *
 * @param runid - The run identifier to display in the dashboard.
 * @param port - The port to listen on (defaults to DASHBOARD_PORT).
 * @param runsDir - Optional path to the runs directory for the /runs endpoint.
 * @returns A DashboardServer handle, or null if startup fails entirely.
 */
export function startDashboardServer(
  runid: string,
  port: number = DASHBOARD_PORT,
  runsDir?: string,
): DashboardServer | null {
  try {
    const sseClients = new Set<http.ServerResponse>();

    const onAnyCallback = (event: string, data: unknown): void => {
      // Enrich audit events with display-friendly fields (shallow copy)
      const enrichedData = (event === 'audit' && data && typeof data === 'object')
        ? enrichAuditEvent(data as Record<string, unknown>)
        : data;

      const payload = `data: ${JSON.stringify({ event, data: enrichedData, timestamp: new Date().toISOString() })}\n\n`;
      for (const client of sseClients) {
        try {
          client.write(payload);
        } catch {  /* intentional: SSE client may have disconnected */
          sseClients.delete(client);
        }
      }
    };

    eventBus.onAny(onAnyCallback);

    const server = http.createServer(async (req, res) => {
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

        // Replay history for reconnect state
        for (const entry of eventBus.history) {
          try {
            const payload = `data: ${JSON.stringify({ event: entry.event, data: entry.data, timestamp: entry.timestamp })}\n\n`;
            res.write(payload);
          } catch {  /* intentional: client may have disconnected during replay */
            // ignore — client may have disconnected during replay
          }
        }

        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      // GET /runs — list all run summaries
      if (req.method === 'GET' && url === '/runs') {
        if (!runsDir) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
          return;
        }

        try {
          const entries = await fsp.readdir(runsDir, { withFileTypes: true });
          const summaries: RunSummary[] = [];

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const metricsPath = path.join(runsDir, entry.name, 'metrics.json');
            const digestPath = path.join(runsDir, entry.name, 'digest.md');

            try {
              const metricsRaw = await fsp.readFile(metricsPath, 'utf-8');
              const metrics = JSON.parse(metricsRaw);

              let hasDigest = false;
              try { await fsp.access(digestPath); hasDigest = true; } catch { /* intentional: noop */ }

              // Read brief title
              let briefTitle = entry.name;
              try {
                const briefRaw = await fsp.readFile(path.join(runsDir, entry.name, 'brief.md'), 'utf-8');
                const m = briefRaw.match(/^#\s+(.+)/m);
                if (m) briefTitle = m[1].trim();
              } catch { /* intentional: noop */ }

              // Read stoplight
              let stoplight: string = 'unknown';
              try {
                const reportRaw = await fsp.readFile(path.join(runsDir, entry.name, 'report.md'), 'utf-8');
                const sm = reportRaw.match(/STOPLIGHT.*?(GREEN|YELLOW|RED)/i);
                if (sm) stoplight = sm[1].toUpperCase();
              } catch { /* intentional: noop */ }

              const durationMin = metrics.timing?.duration_seconds
                ? Math.round(metrics.timing.duration_seconds / 60)
                : 0;
              const costUsd = calcCost(
                metrics.tokens?.total_input ?? 0,
                metrics.tokens?.total_output ?? 0,
                'sonnet'
              );

              summaries.push({
                runid: entry.name,
                briefTitle,
                date: metrics.timing?.started_at?.substring(0, 10) ?? '',
                durationMin,
                stoplight: stoplight as RunSummary['stoplight'],
                testsAdded: metrics.testing?.tests_added ?? 0,
                costUsd: Math.round(costUsd * 100) / 100,
                hasDigest,
              });
            } catch {  /* intentional: skip runs with invalid metrics */
              // Skip runs without valid metrics.json
            }
          }

          // Sort newest first
          summaries.sort((a, b) => b.runid.localeCompare(a.runid));

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(summaries));
        } catch (err) {
          console.error('[dashboard-server] listing runs failed:', err);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
        return;
      }

      // GET /brief/:runid — fetch brief content for a specific run
      if (req.method === 'GET' && url.startsWith('/brief/')) {
        const briefRunid = decodeURIComponent(url.slice('/brief/'.length));
        if (!runsDir) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('No runs directory configured');
          return;
        }
        const briefPath = path.join(runsDir, briefRunid, 'brief.md');
        try {
          const content = await fsp.readFile(briefPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(content);
        } catch {  /* intentional: brief file not found — return 404 */
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Brief not found');
        }
        return;
      }

      // GET /digest/:runid — fetch digest content for a specific run
      if (req.method === 'GET' && url.startsWith('/digest/')) {
        const reqRunid = url.slice('/digest/'.length);
        if (!runsDir || !reqRunid || reqRunid.includes('..')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        try {
          const digestContent = await fsp.readFile(
            path.join(runsDir, reqRunid, 'digest.md'), 'utf-8'
          );
          res.writeHead(200, {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(digestContent);
        } catch {  /* intentional: digest file not found — return 404 */
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Digest not found');
        }
        return;
      }

      // GET /decisions/:runid — extract decisions from a run's audit log
      if (req.method === 'GET' && url.startsWith('/decisions/')) {
        const reqRunid = decodeURIComponent(url.slice('/decisions/'.length));
        if (!runsDir || !reqRunid) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        try {
          const auditPath = path.join(runsDir, reqRunid, 'audit.jsonl');
          const auditContent = await fsp.readFile(auditPath, 'utf-8');
          const auditEntries: AuditEntry[] = auditContent
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => { try { return JSON.parse(line); } catch { /* intentional: skip malformed JSON */ return null; } })
            .filter((e): e is AuditEntry => e !== null);

          // Extract thinking text from agent:thinking events in audit
          const thinkingEntries = auditEntries.filter(
            (e) => e.tool === 'agent:thinking' || (e as Record<string,unknown>).event === 'agent:thinking'
          );
          const thinkingText = thinkingEntries.map(e => (e as Record<string,unknown>).text ?? e.note ?? '').join('\n\n');

          // Build event data from audit
          const agentEvents: EventData[] = auditEntries.map(e => ({
            event: (e.tool ?? 'unknown') as string,
            data: e as Record<string, unknown>,
            timestamp: e.ts ?? new Date().toISOString(),
          }));

          const decisions = extractDecisions(thinkingText, auditEntries, agentEvents, reqRunid);

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(decisions, null, 2));
        } catch {  /* intentional: decisions data not found — return 404 */
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Decisions not found');
        }
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
        } catch {  /* intentional: client may already be gone */
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
