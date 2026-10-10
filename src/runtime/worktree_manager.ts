import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface WorktreeInfo {
  worktreePath: string;
  headSha: string;
  branch?: string;
  isBare: boolean;
  isLocked: boolean;
  lockReason?: string;
}

export interface WorktreeCreateResult {
  worktreePath: string;
  branch: string;
  created: boolean;
}

export class WorktreeManager {
  /**
   * Runs a git command in the target repo directory safely.
   */
  private runGit(repoPath: string, args: string[], options: { timeoutMs?: number } = {}): string {
    const timeout = options.timeoutMs || 30000;
    try {
      const output = execFileSync('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      return output.trim();
    } catch (err: any) {
      const stderr = err.stderr ? String(err.stderr).trim() : err.message;
      throw new Error(`Git komutu başarısız (${args.join(' ')}): ${stderr}`);
    }
  }

  /**
   * Verifies if the path is a valid Git repository.
   */
  isGitRepo(repoPath: string): boolean {
    try {
      const res = this.runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
      return res === 'true';
    } catch (err: any) {
      return false;
    }
  }

  /**
   * Gets current HEAD commit SHA.
   */
  getHeadSha(repoPath: string, ref: string = 'HEAD'): string {
    return this.runGit(repoPath, ['rev-parse', ref]);
  }

  /**
   * Gets current checked out branch name (or 'HEAD' if detached).
   */
  getCurrentBranch(repoPath: string): string {
    try {
      return this.runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch (err: any) {
      return 'HEAD';
    }
  }

  /**
   * Lists all active worktrees using `git worktree list --porcelain`.
   */
  listWorktrees(repoPath: string): WorktreeInfo[] {
    const output = this.runGit(repoPath, ['worktree', 'list', '--porcelain']);
    if (!output) return [];

    const worktrees: WorktreeInfo[] = [];
    const entries = output.split('\n\n');

    for (const entry of entries) {
      const lines = entry.trim().split('\n');
      if (!lines.length || !lines[0]) continue;

      let wtPath = '';
      let headSha = '';
      let branch: string | undefined;
      let isBare = false;
      let isLocked = false;
      let lockReason: string | undefined;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.substring('worktree '.length).trim();
        } else if (line.startsWith('HEAD ')) {
          headSha = line.substring('HEAD '.length).trim();
        } else if (line.startsWith('branch ')) {
          const rawRef = line.substring('branch '.length).trim();
          branch = rawRef.replace(/^refs\/heads\//, '');
        } else if (line === 'bare') {
          isBare = true;
        } else if (line.startsWith('locked')) {
          isLocked = true;
          const reason = line.substring('locked'.length).trim();
          if (reason) lockReason = reason;
        }
      }

      if (wtPath) {
        worktrees.push({
          worktreePath: path.resolve(wtPath),
          headSha,
          branch,
          isBare,
          isLocked,
          lockReason
        });
      }
    }

    return worktrees;
  }

  /**
   * Creates an isolated worktree for an agent/task.
   * If the branch already exists, it checks it out without `-b`.
   */
  createWorktree(
    repoPath: string,
    branchName: string,
    targetDir?: string,
    baseRef?: string
  ): WorktreeCreateResult {
    const rootRepo = path.resolve(repoPath);
    const existingWorktrees = this.listWorktrees(rootRepo);

    // Default targetDir is ../.observatory-worktrees/<branchName-sanitized>
    const sanitizedName = branchName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const wtPath = targetDir
      ? path.resolve(targetDir)
      : path.resolve(rootRepo, '..', '.observatory-worktrees', sanitizedName);

    // Check if worktree directory already exists in active worktrees
    const existingWt = existingWorktrees.find(
      (w) => path.resolve(w.worktreePath).toLowerCase() === wtPath.toLowerCase()
    );
    if (existingWt) {
      return {
        worktreePath: existingWt.worktreePath,
        branch: existingWt.branch || branchName,
        created: false
      };
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(wtPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Check if branch already exists in repo
    let branchExists = false;
    try {
      this.runGit(rootRepo, ['rev-parse', '--verify', `refs/heads/${branchName}`]);
      branchExists = true;
    } catch (err: any) {
      branchExists = false;
    }

    const args = ['worktree', 'add'];
    if (branchExists) {
      args.push(wtPath, branchName);
    } else {
      args.push('-b', branchName, wtPath);
      if (baseRef) {
        args.push(baseRef);
      }
    }

    this.runGit(rootRepo, args);

    return {
      worktreePath: wtPath,
      branch: branchName,
      created: true
    };
  }

  /**
   * Safely removes a worktree and prunes Git worktree records.
   */
  removeWorktree(repoPath: string, worktreePath: string, force: boolean = true): void {
    const rootRepo = path.resolve(repoPath);
    const resolvedPath = path.resolve(worktreePath);

    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(resolvedPath);

    try {
      this.runGit(rootRepo, args);
    } catch (rmErr: any) {
      // Fallback: If git worktree remove fails, remove directory manually if exists then prune
      if (fs.existsSync(resolvedPath)) {
        try {
          fs.rmSync(resolvedPath, { recursive: true, force: true });
        } catch (dirErr: any) {
          process.stderr.write(`[WorktreeManager] Dizini silme uyarısı (${resolvedPath}): ${dirErr.message}\n`);
        }
      }
    }

    // Prune stale worktrees
    try {
      this.runGit(rootRepo, ['worktree', 'prune']);
    } catch (pruneErr: any) {
      process.stderr.write(`[WorktreeManager] Worktree prune uyarısı: ${pruneErr.message}\n`);
    }
  }

  /**
   * Creates a new branch from a base ref.
   */
  createBranch(repoPath: string, branchName: string, startPoint: string = 'HEAD'): void {
    this.runGit(repoPath, ['branch', branchName, startPoint]);
  }

  /**
   * Deletes a branch safely.
   */
  deleteBranch(repoPath: string, branchName: string, force: boolean = false): void {
    const flag = force ? '-D' : '-d';
    this.runGit(repoPath, ['branch', flag, branchName]);
  }

  /**
   * Merges a source branch into the current checked-out branch.
   */
  mergeBranch(
    repoPath: string,
    sourceBranch: string,
    commitMessage?: string
  ): { success: boolean; conflictFiles?: string[]; error?: string } {
    const args = ['merge', '--no-ff'];
    if (commitMessage) {
      args.push('-m', commitMessage);
    }
    args.push(sourceBranch);

    try {
      this.runGit(repoPath, args);
      return { success: true };
    } catch (err: any) {
      // Check conflict files
      let conflictFiles: string[] = [];
      try {
        const diffOutput = this.runGit(repoPath, ['diff', '--name-only', '--diff-filter=U']);
        if (diffOutput) {
          conflictFiles = diffOutput.split('\n').filter(Boolean);
        }
      } catch (diffErr: any) {
        process.stderr.write(`[WorktreeManager] Çakışma listeleme uyarısı: ${diffErr.message}\n`);
      }

      return {
        success: false,
        conflictFiles,
        error: err.message
      };
    }
  }

  /**
   * Aborts an in-progress merge.
   */
  abortMerge(repoPath: string): void {
    try {
      this.runGit(repoPath, ['merge', '--abort']);
    } catch (abortErr: any) {
      process.stderr.write(`[WorktreeManager] Merge iptal bilgisi: ${abortErr.message}\n`);
    }
  }
}

export const globalWorktreeManager = new WorktreeManager();
