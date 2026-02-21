import fs from 'fs/promises';
import crypto from 'crypto';
import { type Manifest, type RunId } from './types.js';

export class ManifestManager {
  constructor(private manifestPath: string) {}

  /**
   * Create a new manifest.
   */
  async create(data: Partial<Manifest>): Promise<Manifest> {
    const manifest: Manifest = {
      runid: data.runid!,
      target_name: data.target_name!,
      target_start_sha: data.target_start_sha!,
      workspace_branch: data.workspace_branch!,
      started_at: data.started_at || new Date().toISOString(),
      commands: data.commands || [],
      checksums: data.checksums || {},
      signature: data.signature,
    };

    await this.save(manifest);
    return manifest;
  }

  /**
   * Save manifest to disk.
   */
  async save(manifest: Manifest): Promise<void> {
    const content = JSON.stringify(manifest, null, 2);
    await fs.writeFile(this.manifestPath, content, 'utf-8');
  }

  /**
   * Load manifest from disk.
   */
  async load(): Promise<Manifest> {
    const content = await fs.readFile(this.manifestPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Add a command execution record.
   */
  async addCommand(command: string, exitCode: number): Promise<void> {
    const manifest = await this.load();
    manifest.commands.push({
      ts: new Date().toISOString(),
      command,
      exit_code: exitCode,
    });
    await this.save(manifest);
  }

  /**
   * Add checksums for artifacts.
   */
  async addChecksums(checksums: Record<string, string>): Promise<void> {
    const manifest = await this.load();
    manifest.checksums = { ...manifest.checksums, ...checksums };
    await this.save(manifest);
  }

  /**
   * Mark manifest as completed.
   */
  async complete(): Promise<void> {
    const manifest = await this.load();
    manifest.completed_at = new Date().toISOString();
    await this.save(manifest);
  }

  /**
   * Compute checksum of a file.
   */
  static async checksumFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify checksums in manifest against actual files.
   */
  async verifyChecksums(runsDir: string, runid: RunId): Promise<{
    valid: boolean;
    mismatches: string[];
  }> {
    const manifest = await this.load();
    const mismatches: string[] = [];

    for (const [filename, expectedChecksum] of Object.entries(manifest.checksums)) {
      const filePath = `${runsDir}/${runid}/${filename}`;
      try {
        const actualChecksum = await ManifestManager.checksumFile(filePath);
        if (actualChecksum !== expectedChecksum) {
          mismatches.push(`${filename}: checksum mismatch`);
        }
      } catch (error) {
        mismatches.push(`${filename}: file not found or unreadable`);
      }
    }

    return {
      valid: mismatches.length === 0,
      mismatches,
    };
  }
}
