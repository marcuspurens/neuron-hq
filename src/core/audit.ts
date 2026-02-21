import fs from 'fs/promises';
import crypto from 'crypto';
import { type AuditEntry } from './types.js';

export class AuditLogger {
  constructor(private auditFilePath: string) {}

  /**
   * Append an entry to the audit log.
   */
  async log(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.auditFilePath, line, 'utf-8');
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
