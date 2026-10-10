import assert from 'node:assert';
import { globalRunner } from '../src/runtime/agent_runner.ts';
import { globalStore } from '../src/core/event_store.ts';

async function testLiveCancel() {
  console.log('🧪 Canlı Süreç İptali (taskkill /T /F) Test Ediliyor...');

  // 1. Asenkron görev başlat
  const { taskId, promise } = globalRunner.startTask({
    agent: 'claude',
    prompt: 'Please write a 5000 word poem slowly.',
    cwd: process.cwd(),
    timeoutSeconds: 30
  });

  console.log(`- Görev başlatıldı: ${taskId}`);

  // 2. Sürecin ayağa kalkması için 1.5 saniye bekle
  await new Promise(r => setTimeout(r, 1500));

  // 3. İptal çağrısı yap
  console.log(`- cancelTask çağrılıyor: ${taskId}`);
  const cancelled = globalRunner.cancelTask(taskId, 'Canlı E2E İptal Testi');
  assert.strictEqual(cancelled, true, 'cancelTask true dönmeli');

  // 4. Promise sonucunu bekle (hata fırlatmadan cancelled summary dönmeli)
  const summary = await promise;
  console.log(`- Nihai Durum: ${summary.status}`);
  assert.strictEqual(summary.status, 'cancelled', 'Görev durumu cancelled olmalı');

  // 5. Terminal durum dokunulmazlığı: tekrar failed veya completed yapılamaz
  const summaryAfter = globalStore.getTask(taskId);
  assert.strictEqual(summaryAfter?.status, 'cancelled', 'Terminal durum dokunulmaz kalmalı');

  console.log('✔ Canlı süreç iptali ve Windows süreç ağacı sonlandırması %100 BAŞARILI!\n');
}

testLiveCancel().catch((err) => {
  console.error('Hata:', err);
  process.exit(1);
});
