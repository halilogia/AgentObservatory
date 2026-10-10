import assert from 'node:assert';
import { FleetOrchestrator } from '../src/runtime/fleet_orchestrator.ts';

const orchestrator = new FleetOrchestrator();

// 1. Yinelenen ID hatası
assert.throws(() => {
  orchestrator.validateDag([
    { id: 'dup', agent: 'claude', prompt: 'a' },
    { id: 'dup', agent: 'codex', prompt: 'b' }
  ]);
}, /Yinelenen görev ID/, 'Yinelenen ID tespit edilmeli');

// 2. Olmayan bağımlılık referansı
assert.throws(() => {
  orchestrator.validateDag([
    { id: 't1', agent: 'claude', prompt: 'a', dependsOn: ['ghost'] }
  ]);
}, /bulunmayan bir bağımlılığa referans/, 'Eksik bağımlılık tespit edilmeli');

// 3. Döngüsel bağımlılık (Cycle) tespiti
assert.throws(() => {
  orchestrator.validateDag([
    { id: 'A', agent: 'claude', prompt: 'a', dependsOn: ['B'] },
    { id: 'B', agent: 'codex', prompt: 'b', dependsOn: ['C'] },
    { id: 'C', agent: 'agy', prompt: 'c', dependsOn: ['A'] }
  ]);
}, /döngüsel bağımlılık/, 'A -> B -> C -> A döngüsü tespit edilmeli');

// 4. Geçerli DAG başarıyla geçmeli
assert.doesNotThrow(() => {
  orchestrator.validateDag([
    { id: 'schema', agent: 'claude', prompt: 'DB schema' },
    { id: 'api', agent: 'claude', prompt: 'Backend API', dependsOn: ['schema'] },
    { id: 'ui', agent: 'codex', prompt: 'Frontend UI', dependsOn: ['schema'] },
    { id: 'e2e', agent: 'agy', prompt: 'E2E Tests', dependsOn: ['api', 'ui'] }
  ]);
}, 'Geçerli DAG doğrulamasını hatasız geçmeli');

console.log('✔ fleet_orchestrator.test.ts başarıyla geçti!');
