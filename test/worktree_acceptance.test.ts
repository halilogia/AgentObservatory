import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WorktreeManager } from '../src/runtime/worktree_manager.ts';

test('Worktree acceptance gate only merges a candidate after verification passes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'observatory-gate-'));
  const repo = path.join(tempRoot, 'repo');
  fs.mkdirSync(repo);
  const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  try {
    git(['init', '-b', 'main']);
    git(['config', 'user.name', 'Test']);
    git(['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
    git(['add', 'base.txt']);
    git(['commit', '-m', 'base']);

    const manager = new WorktreeManager();
    const isolated = manager.createAgentWorktree(repo, 'task 1');
    fs.writeFileSync(path.join(isolated.worktreePath, 'feature.txt'), 'accepted\n');
    git(['add', 'feature.txt'], isolated.worktreePath);
    git(['commit', '-m', 'feature'], isolated.worktreePath);

    const rejected = manager.acceptBranch({
      repoPath: repo, sourceBranch: isolated.branch, targetBranch: 'main', verificationCommand: 'node -e "process.exit(1)"'
    });
    assert.equal(rejected.accepted, false, JSON.stringify(rejected));
    assert.equal(rejected.merged, false);
    assert.equal(fs.existsSync(path.join(repo, 'feature.txt')), false);

    const accepted = manager.acceptBranch({
      repoPath: repo, sourceBranch: isolated.branch, targetBranch: 'main', verificationCommand: 'node --version'
    });
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.verificationPassed, true);
    assert.equal(accepted.merged, true);
    assert.equal(fs.readFileSync(path.join(repo, 'feature.txt'), 'utf8').trim(), 'accepted');
    manager.removeWorktree(repo, isolated.worktreePath, true);
    manager.deleteBranch(repo, isolated.branch, true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
