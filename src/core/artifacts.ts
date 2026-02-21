import fs from 'fs/promises';
import path from 'path';
import { type StoplightStatus } from './types.js';

export class ArtifactsManager {
  constructor(private runDir: string) {}

  /**
   * Ensure run directory exists.
   */
  async init(): Promise<void> {
    await fs.mkdir(this.runDir, { recursive: true });
    await fs.mkdir(path.join(this.runDir, 'research'), { recursive: true });
  }

  /**
   * Write brief.md (snapshot of input brief).
   */
  async writeBrief(content: string): Promise<void> {
    await fs.writeFile(path.join(this.runDir, 'brief.md'), content, 'utf-8');
  }

  /**
   * Write baseline.md (baseline verification).
   */
  async writeBaseline(content: string): Promise<void> {
    await fs.writeFile(path.join(this.runDir, 'baseline.md'), content, 'utf-8');
  }

  /**
   * Write report.md with stoplight status.
   */
  async writeReport(stoplight: StoplightStatus, content: string): Promise<void> {
    const stoplightMd = this.formatStoplight(stoplight);
    const fullContent = `${stoplightMd}\n\n${content}`;
    await fs.writeFile(path.join(this.runDir, 'report.md'), fullContent, 'utf-8');
  }

  private formatStoplight(status: StoplightStatus): string {
    const icon = (val: string) => {
      if (val === 'PASS' || val === 'OK' || val === 'COMPLETE' || val === 'LOW') {
        return '✅';
      }
      if (val === 'FAIL' || val === 'TOO_BIG' || val === 'INCOMPLETE' || val === 'HIGH') {
        return '❌';
      }
      return '⚠️';
    };

    return [
      '# Run Status',
      '',
      `${icon(status.baseline_verify)} Baseline verify: ${status.baseline_verify}`,
      `${icon(status.after_change_verify)} After-change verify: ${status.after_change_verify}`,
      `${icon(status.diff_size)} Diff size: ${status.diff_size}`,
      `${icon(status.risk)} Risk: ${status.risk}`,
      `${icon(status.artifacts)} Artifacts: ${status.artifacts}`,
      '',
    ].join('\n');
  }

  /**
   * Write questions.md.
   */
  async writeQuestions(questions: string[]): Promise<void> {
    const content =
      questions.length === 0
        ? '# Questions\n\nNo blockers.'
        : `# Questions\n\n${questions.map((q, i) => `## ${i + 1}. ${q}`).join('\n\n')}`;

    await fs.writeFile(path.join(this.runDir, 'questions.md'), content, 'utf-8');
  }

  /**
   * Write ideas.md.
   */
  async writeIdeas(ideas: string): Promise<void> {
    await fs.writeFile(path.join(this.runDir, 'ideas.md'), ideas, 'utf-8');
  }

  /**
   * Write knowledge.md.
   */
  async writeKnowledge(content: string): Promise<void> {
    await fs.writeFile(path.join(this.runDir, 'knowledge.md'), content, 'utf-8');
  }

  /**
   * Write research/sources.md.
   */
  async writeSources(content: string): Promise<void> {
    await fs.writeFile(
      path.join(this.runDir, 'research', 'sources.md'),
      content,
      'utf-8'
    );
  }

  /**
   * Write redaction_report.md.
   */
  async writeRedactionReport(content: string): Promise<void> {
    await fs.writeFile(
      path.join(this.runDir, 'redaction_report.md'),
      content,
      'utf-8'
    );
  }

  /**
   * Read brief.md.
   */
  async readBrief(): Promise<string> {
    return await fs.readFile(path.join(this.runDir, 'brief.md'), 'utf-8');
  }

  /**
   * Check if all required artifacts exist.
   */
  async checkCompleteness(): Promise<{ complete: boolean; missing: string[] }> {
    const required = [
      'brief.md',
      'baseline.md',
      'report.md',
      'questions.md',
      'ideas.md',
      'knowledge.md',
      'audit.jsonl',
      'manifest.json',
      'usage.json',
      'redaction_report.md',
    ];

    const missing: string[] = [];

    for (const filename of required) {
      const filePath = path.join(this.runDir, filename);
      try {
        await fs.access(filePath);
      } catch {
        missing.push(filename);
      }
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }

  /**
   * Get paths to all artifacts.
   */
  getArtifactPaths(): Record<string, string> {
    return {
      brief: path.join(this.runDir, 'brief.md'),
      baseline: path.join(this.runDir, 'baseline.md'),
      report: path.join(this.runDir, 'report.md'),
      questions: path.join(this.runDir, 'questions.md'),
      ideas: path.join(this.runDir, 'ideas.md'),
      knowledge: path.join(this.runDir, 'knowledge.md'),
      sources: path.join(this.runDir, 'research', 'sources.md'),
      audit: path.join(this.runDir, 'audit.jsonl'),
      manifest: path.join(this.runDir, 'manifest.json'),
      usage: path.join(this.runDir, 'usage.json'),
      redaction_report: path.join(this.runDir, 'redaction_report.md'),
    };
  }
}
