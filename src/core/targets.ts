import fs from 'fs/promises';
import yaml from 'yaml';
import { TargetsFileSchema, type Target, type TargetsFile } from './types.js';

export class TargetsManager {
  constructor(private targetsFilePath: string) {}

  /**
   * Load all targets from repos.yaml.
   */
  async loadTargets(): Promise<Target[]> {
    try {
      const content = await fs.readFile(this.targetsFilePath, 'utf-8');
      const parsed = yaml.parse(content);
      const validated = TargetsFileSchema.parse(parsed);
      return validated.targets;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet, return empty
        return [];
      }
      throw error;
    }
  }

  /**
   * Save targets to repos.yaml.
   */
  async saveTargets(targets: Target[]): Promise<void> {
    const data: TargetsFile = { targets };
    const content = yaml.stringify(data);
    await fs.writeFile(this.targetsFilePath, content, 'utf-8');
  }

  /**
   * Add a new target.
   */
  async addTarget(target: Target): Promise<void> {
    const targets = await this.loadTargets();

    // Check if target with this name already exists
    const existing = targets.find((t) => t.name === target.name);
    if (existing) {
      throw new Error(`Target '${target.name}' already exists`);
    }

    targets.push(target);
    await this.saveTargets(targets);
  }

  /**
   * Get a target by name.
   */
  async getTarget(name: string): Promise<Target | undefined> {
    const targets = await this.loadTargets();
    return targets.find((t) => t.name === name);
  }

  /**
   * Remove a target by name.
   */
  async removeTarget(name: string): Promise<boolean> {
    const targets = await this.loadTargets();
    const filtered = targets.filter((t) => t.name !== name);

    if (filtered.length === targets.length) {
      return false; // Not found
    }

    await this.saveTargets(filtered);
    return true;
  }

  /**
   * List all target names.
   */
  async listTargetNames(): Promise<string[]> {
    const targets = await this.loadTargets();
    return targets.map((t) => t.name);
  }
}
