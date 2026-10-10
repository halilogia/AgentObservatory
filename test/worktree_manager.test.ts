import assert from 'node:assert';
import { WorktreeManager } from '../src/runtime/worktree_manager.ts';

const wtManager = new WorktreeManager();
const currentRepo = process.cwd();

assert.ok(wtManager.isGitRepo(currentRepo), 'Mevcut dizin Git repository olarak algılanmalı');

const activeWts = wtManager.listWorktrees(currentRepo);
assert.ok(Array.isArray(activeWts) && activeWts.length >= 1, 'En az ana worktree listelenmeli');
assert.ok(activeWts[0].worktreePath, 'Worktree nesnesi geçerli bir yola sahip olmalı');

const headSha = wtManager.getHeadSha(currentRepo);
assert.ok(headSha && headSha.length >= 40, 'Geçerli 40 karakterlik Git HEAD SHA dönmeli');

const curBranch = wtManager.getCurrentBranch(currentRepo);
assert.ok(curBranch, 'Mevcut branch adı dönmeli');

console.log('✔ worktree_manager.test.ts başarıyla geçti!');
