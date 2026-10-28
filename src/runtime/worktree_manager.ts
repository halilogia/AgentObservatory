import { execSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

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

export interface AcceptanceGateResult {
  accepted: boolean;
  verificationPassed: boolean;
  merged: boolean;
  conflictFiles?: string[];
  error?: string;
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

  /** Creates a uniquely named branch and isolated worktree for one agent run. */
  createAgentWorktree(repoPath: string, taskId: string, baseRef = 'HEAD'): WorktreeCreateResult {
    const slug = taskId.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 48) || 'task';
    const unique = crypto.randomBytes(5).toString('hex');
    return this.createWorktree(repoPath, `observatory/${slug}-${unique}`, undefined, baseRef);
  }

  /**
   * Tests a source branch in a disposable worktree based on the target branch,
   * then merges it into the target only after merge and verification succeed.
   */
  acceptBranch(options: {
    repoPath: string;
    sourceBranch: string;
    targetBranch?: string;
    verificationCommand: string;
    timeoutMs?: number;
  }): AcceptanceGateResult {
    const repoPath = path.resolve(options.repoPath);
    const targetBranch = options.targetBranch ?? this.getCurrentBranch(repoPath);
    if (!options.verificationCommand.trim()) {
      return { accepted: false, verificationPassed: false, merged: false, error: 'Doğrulama komutu zorunludur.' };
    }
    if (this.getCurrentBranch(repoPath) !== targetBranch) {
      return { accepted: false, verificationPassed: false, merged: false, error: `Hedef branch checkout değil: ${targetBranch}` };
    }
    if (this.runGit(repoPath, ['status', '--porcelain'])) {
      return { accepted: false, verificationPassed: false, merged: false, error: 'Hedef çalışma ağacı temiz değil.' };
    }
    const targetSha = this.getHeadSha(repoPath);

    const gateBranch = `observatory/gate-${crypto.randomBytes(6).toString('hex')}`;
    const gatePath = path.resolve(repoPath, '..', '.observatory-worktrees', gateBranch.replaceAll('/', '-'));
    let gateCreated = false;
    try {
      this.createWorktree(repoPath, gateBranch, gatePath, targetBranch);
      gateCreated = true;
      const merge = this.mergeBranch(gatePath, options.sourceBranch, 'observatory: acceptance gate candidate');
      if (!merge.success) {
        return { accepted: false, verificationPassed: false, merged: false, conflictFiles: merge.conflictFiles, error: merge.error };
      }

      try {
        execSync(options.verificationCommand, {
          cwd: gatePath,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: options.timeoutMs ?? 120_000,
          windowsHide: true
        });
      } catch (error: any) {
        const detail = error.stderr ? String(error.stderr).trim() : error.message;
        return { accepted: false, verificationPassed: false, merged: false, error: `Acceptance doğrulaması başarısız: ${detail}` };
      }

      if (this.getCurrentBranch(repoPath) !== targetBranch || this.getHeadSha(repoPath) !== targetSha ||
          this.runGit(repoPath, ['status', '--porcelain'])) {
        return { accepted: false, verificationPassed: true, merged: false, error: 'Doğrulama sırasında hedef branch veya çalışma ağacı değişti.' };
      }

      const finalMerge = this.mergeBranch(repoPath, options.sourceBranch, `observatory: accept ${options.sourceBranch}`);
      if (!finalMerge.success) {
        return { accepted: false, verificationPassed: true, merged: false, conflictFiles: finalMerge.conflictFiles, error: finalMerge.error };
      }
      return { accepted: true, verificationPassed: true, merged: true };
    } catch (error: any) {
      return { accepted: false, verificationPassed: false, merged: false, error: error.message };
    } finally {
      if (gateCreated) this.removeWorktree(repoPath, gatePath, true);
      try { this.deleteBranch(repoPath, gateBranch, true); } catch { /* gate branch may already be absent */ }
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
