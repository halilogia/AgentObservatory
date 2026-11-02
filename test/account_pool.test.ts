import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountPoolManager } from '../src/core/account_pool.ts';
import type { CredentialAdapter } from '../src/core/account_pool.ts';
import { classifyFailure } from '../src/core/failure.ts';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-accounts-test-'));
let fakeCredStore = 'CRED_PRO_1_BASE64';
let currentTime = 1_700_000_000_000;

const fakeAdapter: CredentialAdapter = {
  readAgyCredential() {
    return fakeCredStore;
  },
  writeAgyCredential(base64Blob: string) {
    fakeCredStore = base64Blob;
    return true;
  }
};

const pool = new AccountPoolManager({
  baseDir: tmpDir,
  credAdapter: fakeAdapter,
  now: () => currentTime
});

// 1. Save pro1 and pro2 accounts for agy
const p1 = pool.saveAccount('agy', 'pro1', 'Birinci Pro');
assert.equal(p1.name, 'pro1');
assert.equal(p1.credentialBase64, 'CRED_PRO_1_BASE64');

fakeCredStore = 'CRED_PRO_2_BASE64';
const p2 = pool.saveAccount('agy', 'pro2', 'İkinci Pro');
assert.equal(p2.name, 'pro2');
assert.equal(pool.getActiveAccount('agy')?.name, 'pro2');

// 2. Switch back to pro1 and verify Windows Credential Manager blob is updated
pool.switchAccount('agy', 'pro1');
assert.equal(fakeCredStore, 'CRED_PRO_1_BASE64');
assert.equal(pool.getActiveAccount('agy')?.name, 'pro1');

// 3. Parse agy quota reset format ("Resets in 4h33m24s")
const f = classifyFailure('RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 4h33m24s.');
assert.equal(f.kind, 'rate_limit');
assert.equal(f.cooldownMs, ((4 * 3600) + (33 * 60) + 24) * 1000);

// 4. Auto-failover from pro1 -> pro2 when pro1 hits quota
const switched = pool.failoverToNext('agy', f.cooldownMs!, '429 quota reached', 'pro1');
assert.ok(switched, 'failover should pick pro2');
assert.equal(switched!.name, 'pro2');
assert.equal(fakeCredStore, 'CRED_PRO_2_BASE64', 'failover should write pro2 credential to Windows Credential Manager');

const list = pool.listAccounts('agy');
const listP1 = list.find((a) => a.name === 'pro1')!;
const listP2 = list.find((a) => a.name === 'pro2')!;
assert.equal(listP1.isAvailable, false);
assert.equal(listP2.isAvailable, true);
assert.equal(listP2.isActive, true);

// 5. When both are exhausted, failover returns null
const noneLeft = pool.failoverToNext('agy', 60_000, '429 on pro2', 'pro2');
assert.equal(noneLeft, null);

// 6. After cooldown expires, pro2 becomes available again
currentTime += 120_000;
const prep = pool.prepareAccountForTask('agy');
assert.equal(prep.accountName, 'pro2');

// 7. Claude account pool creates isolated CLAUDE_CONFIG_DIR
const c1 = pool.saveAccount('claude', 'claude_main');
assert.ok(c1.configDir && fs.existsSync(c1.configDir));
const cPrep = pool.prepareAccountForTask('claude', 'claude_main');
assert.equal(cPrep.env.CLAUDE_CONFIG_DIR, c1.configDir);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('✔ account_pool tests passed');
