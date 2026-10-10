import assert from 'node:assert';
import { ResourceBroker } from '../src/runtime/resource_broker.ts';

// 1. Semafor Kapasitesi & Kuyruk Sıralaması
const broker = new ResourceBroker({ maxConcurrentTasks: 2 });
assert.strictEqual(broker.getMaxSlots(), 2, 'Kapasite 2 olmalı');

let activeCount = 0;
const executionOrder: number[] = [];

const job = async (id: number, delayMs: number) => {
  const release = await broker.acquireSlot();
  activeCount++;
  assert.ok(activeCount <= 2, `Aynı anda 2'den fazla iş çalışamaz! (Şu an: ${activeCount})`);
  executionOrder.push(id);
  await new Promise((res) => setTimeout(res, delayMs));
  activeCount--;
  release();
};

await Promise.all([
  job(1, 30),
  job(2, 30),
  job(3, 10),
  job(4, 10)
]);

assert.strictEqual(executionOrder.length, 4, '4 iş de sırayla tamamlanmalı');
const stats = broker.getStats();
assert.strictEqual(stats.activeSlots, 0, 'Tüm slotlar serbest bırakılmalı');
assert.strictEqual(stats.queuedSlots, 0, 'Kuyruk boş olmalı');

// 2. Tekil Entegrasyon Kilidi (Single Integration Writer Mutex)
let integrationRunning = false;
const results: number[] = [];

const integrationTask = async (id: number) => {
  return broker.acquireIntegrationLock(async () => {
    assert.strictEqual(integrationRunning, false, 'İki entegrasyon işlemi aynı anda çalışamaz!');
    integrationRunning = true;
    await new Promise((res) => setTimeout(res, 20));
    results.push(id);
    integrationRunning = false;
    return id;
  });
};

const tasksPromise = Promise.all([
  integrationTask(10),
  integrationTask(20),
  integrationTask(30)
]);

const output = await tasksPromise;
assert.deepStrictEqual(output, [10, 20, 30], 'Tüm entegrasyon görevleri kilit sırasıyla tamamlanmalı');

// 3. Task Lease Fencing (Stale Worker Koruması)
const lease1 = broker.issueLease('task_xyz');
assert.ok(broker.isLeaseValid('task_xyz', lease1), 'Aktif lease geçerli olmalı');

const lease2 = broker.issueLease('task_xyz');
assert.ok(broker.isLeaseValid('task_xyz', lease2), 'Yeni lease geçerli olmalı');
assert.ok(!broker.isLeaseValid('task_xyz', lease1), 'Eski epoch lease geçersiz kılınmalı (Fencing)');

broker.revokeLease('task_xyz');
assert.ok(!broker.isLeaseValid('task_xyz', lease2), 'İptal edilen lease geçersiz olmalı');

console.log('✔ resource_broker.test.ts başarıyla geçti!');
