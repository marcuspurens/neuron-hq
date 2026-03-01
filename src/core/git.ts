import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitOperations {
  constructor(private repoPath: string) {}

  /**
   * Get current SHA of HEAD.
   */
  async getCurrentSHA(): Promise<string> {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: this.repoPath,
    });
    return stdout.trim();
  }

  /**
   * Get current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: this.repoPath,
    });
    return stdout.trim();
  }

  /**
   * Create and checkout a new branch.
   */
  async createBranch(branchName: string): Promise<void> {
    await execAsync(`git checkout -b ${branchName}`, {
      cwd: this.repoPath,
    });
  }

  /**
   * Get diff statistics.
   */
  async getDiffStats(): Promise<{ additions: number; deletions: number }> {
    try {
      const { stdout } = await execAsync('git diff --numstat', {
        cwd: this.repoPath,
      });

      let additions = 0;
      let deletions = 0;

      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        const [add, del] = line.split('\t').map(Number);
        if (!isNaN(add)) additions += add;
        if (!isNaN(del)) deletions += del;
      }

      return { additions, deletions };
    } catch {
      return { additions: 0, deletions: 0 };
    }
  }

  /**
   * Stage files for commit.
   */
  async stageFiles(files: string[]): Promise<void> {
    const fileList = files.join(' ');
    await execAsync(`git add ${fileList}`, {
      cwd: this.repoPath,
    });
  }

  /**
   * Create a commit.
   */
  async commit(message: string): Promise<void> {
    // Escape single quotes in message
    const escapedMessage = message.replace(/'/g, "'\\''");
    await execAsync(`git commit -m '${escapedMessage}'`, {
      cwd: this.repoPath,
    });
  }

  /**
   * Get status (short format).
   */
  async getStatus(): Promise<string> {
    const { stdout } = await execAsync('git status --short', {
      cwd: this.repoPath,
    });
    return stdout;
  }

  /**
   * Clone a repository.
   */
  static async clone(url: string, targetPath: string): Promise<void> {
    await execAsync(`git clone ${url} ${targetPath}`);
  }

  /**
   * Check if path is a git repository.
   */
  static async isGitRepo(path: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: path });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a fresh git repo in workspaceDir and commit all files.
   * Used after copyDirectory so the workspace is isolated from the parent git repo.
   */
  static async initWorkspace(workspaceDir: string, targetName: string): Promise<void> {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Neuron HQ',
      GIT_AUTHOR_EMAIL: 'neuronhq@local',
      GIT_COMMITTER_NAME: 'Neuron HQ',
      GIT_COMMITTER_EMAIL: 'neuronhq@local',
    };
    await execAsync('git init', { cwd: workspaceDir });
    await execAsync('git add -A', { cwd: workspaceDir });
    await execAsync(`git commit -m "Workspace: initial copy from ${targetName}"`, {
      cwd: workspaceDir,
      env,
    });
  }

  /**
   * Detect if merging sourceBranch into the current branch would cause conflicts.
   * Returns an empty array if clean, or a list of conflicting file paths.
   * Always aborts the trial merge to leave the repo clean.
   */
  async detectMergeConflicts(sourceBranch: string): Promise<string[]> {
    try {
      await execAsync(`git merge --no-commit --no-ff ${sourceBranch}`, {
        cwd: this.repoPath,
      });
      // Clean merge — abort to leave repo clean
      await execAsync('git merge --abort', { cwd: this.repoPath });
      return [];
    } catch {
      // Conflict detected — get list of conflicting files
      try {
        const { stdout } = await execAsync(
          'git diff --name-only --diff-filter=U',
          { cwd: this.repoPath },
        );
        const files = stdout
          .trim()
          .split('\n')
          .filter((f) => f.length > 0);
        return files;
      } finally {
        // Always abort to leave the repo clean
        try {
          await execAsync('git merge --abort', { cwd: this.repoPath });
        } catch {
          // Abort may fail if merge state already cleaned up
        }
      }
    }
  }

  /**
   * Merge sourceBranch into the current branch with --no-ff.
   * Returns the merge commit SHA.
   * Throws an Error if the merge fails (e.g. due to conflicts).
   */
  async mergeBranch(sourceBranch: string, commitMessage: string): Promise<string> {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Neuron HQ',
      GIT_AUTHOR_EMAIL: 'neuronhq@local',
      GIT_COMMITTER_NAME: 'Neuron HQ',
      GIT_COMMITTER_EMAIL: 'neuronhq@local',
    };
    // Escape single quotes in commit message
    const escapedMessage = commitMessage.replace(/'/g, "'\\''");
    try {
      await execAsync(
        `git merge --no-ff -m '${escapedMessage}' ${sourceBranch}`,
        { cwd: this.repoPath, env },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    }
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: this.repoPath,
    });
    return stdout.trim();
  }

  /**
   * Delete a local branch. Used for cleanup after merge.
   */
  async deleteBranch(branchName: string): Promise<void> {
    await execAsync(`git branch -D ${branchName}`, {
      cwd: this.repoPath,
    });
  }
}
