import fs from 'fs/promises';
import crypto from 'crypto';
import { type AuditEntry } from './types.js';
import { getPool, isDbAvailable } from './db.js';
import { eventBus } from './event-bus.js';

export class AuditLogger {
  constructor(private auditFilePath: string) {}

  /**
   * Append an entry to the audit log.
   * Dual-write: always writes to JSONL file, also writes to DB if available.
   */
  async log(entry: AuditEntry): Promise<void> {
    // Always write to JSONL file
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.auditFilePath, line, 'utf-8');

    // Emit audit event for real-time observability
    eventBus.safeEmit('audit', entry as unknown as Record<string, unknown>);

    // Also write to DB if available (non-fatal on failure)
    try {
      if (await isDbAvailable()) {
        await this.insertToDb(entry);
      }
    } catch {  /* intentional: best-effort audit append */
      // DB write failure is non-fatal — file is the backup
    }
  }

  /**
   * Insert an audit entry into the database.
   */
  private async insertToDb(entry: AuditEntry): Promise<void> {
    const pool = getPool();

    // Extract runid from the audit file path (format: runs/<runid>/audit.jsonl)
    const runid = this.extractRunId();

    await pool.query(
      `INSERT INTO audit_entries (runid, ts, role, tool, allowed, input_hash, output_hash,
       exit_code, files_touched, diff_additions, diff_deletions, policy_event, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        runid,
        entry.ts,
        entry.role,
        entry.tool,
        entry.allowed,
        entry.input_hash ?? null,
        entry.output_hash ?? null,
        entry.exit_code ?? null,
        entry.files_touched ?? null,
        entry.diff_stats?.additions ?? null,
        entry.diff_stats?.deletions ?? null,
        entry.policy_event ?? null,
        entry.note ?? null,
      ]
    );
  }

  /**
   * Extract run ID from the audit file path.
   * Path format: .../runs/<runid>/audit.jsonl
   */
  private extractRunId(): string | null {
    const parts = this.auditFilePath.split('/');
    const auditIdx = parts.lastIndexOf('audit.jsonl');
    if (auditIdx > 0) {
      return parts[auditIdx - 1];
    }
    return null;
  }

  /**
   * Read all audit entries from the log.
   */
  async readAll(): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(this.auditFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Count total entries in the log.
   */
  async count(): Promise<number> {
    const entries = await this.readAll();
    return entries.length;
  }

  /**
   * Compute a hash of a string (for input/output hashing).
   */
  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}
