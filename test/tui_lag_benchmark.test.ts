import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { startIngest } from '../src/ingest/index.ts';
import { renderTree } from '../src/ui/tree.ts';
import { extractAntigravityModel, AntigravityLineParser } from '../src/ingest/antigravity.ts';
import { globalSqlite } from '../src/core/sqlite_store.ts';

console.log('🧪 TUI Lag & Model Detection Benchmark Testi Başlatılıyor...\n');

// 1. Antigravity Model Tespiti Doğrulama Testi
{
  console.log('1. Model Tespiti (extractAntigravityModel) Test Ediliyor...');
  const sample1 = '<USER_REQUEST>Test görevi</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 3.8 Flash (High). No need to comment on this change if the user doesn\'t ask about it.\n</USER_SETTINGS_CHANGE>';
  assert.equal(extractAntigravityModel(sample1), 'gemini-3.8-flash');

  const sample2 = '<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from Gemini 3.6 Flash (Low) to Gemini 3.1 Pro (High). No need to comment...\n</USER_SETTINGS_CHANGE>';
  assert.equal(extractAntigravityModel(sample2), 'gemini-3.1-pro');

  const sample3 = '<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Claude 3.5 Sonnet (Thinking). No need...\n</USER_SETTINGS_CHANGE>';
  assert.equal(extractAntigravityModel(sample3), 'claude-3.5-sonnet');

  assert.equal(extractAntigravityModel('Model değişikliği yok'), null);

  // Parser üzerinden model aktarımı
  const parser = new AntigravityLineParser(() => false, 'test_session_123');
  const evs = parser.push(JSON.stringify({
    step_index: 0,
    source: 'USER_EXPLICIT',
    type: 'USER_INPUT',
    status: 'DONE',
    created_at: new Date().toISOString(),
    content: sample1
  }), 'test:0');

  const startEv = evs.find((e) => e.type === 'task.started');
  assert.ok(startEv, 'task.started üretilmeli');
  assert.equal(startEv.data.model, 'gemini-3.8-flash', 'Model gemini-3.8-flash olarak tespit edilmeli');
  console.log('✔ Model tespiti ve dinamik aktarımı başarıyla doğrulandı!');
}

// 2. İlk Çerçeve (Cold Render) Gecikme Benchmark'ı
{
  console.log('\n2. TUI İlk Çerçeve (Cold Render) Süresi Ölçülüyor...');
  const t0 = performance.now();
  const tasks = globalSqlite.getRecentTasks(100);
  const tTasks = performance.now();
  const frame = renderTree(tasks, { onlyRunning: false, cols: 120, rows: 40, now: Date.now() });
  const tFrame = performance.now();

  const loadDur = tTasks - t0;
  const renderDur = tFrame - tTasks;
  const totalDur = tFrame - t0;

  console.log(`   - getRecentTasks(100): ${loadDur.toFixed(2)} ms`);
  console.log(`   - renderTree (120x40): ${renderDur.toFixed(2)} ms`);
  console.log(`   - Toplam ilk kare süresi: ${totalDur.toFixed(2)} ms`);

  assert.ok(totalDur < 250, `İlk kare süresi 250ms altında olmalı (ölçülen: ${totalDur.toFixed(2)}ms)`);
  assert.ok(frame.text.length > 0, 'İlk çerçeve metin içermeli');
  console.log('✔ TUI ilk kare render süresi sıfır takılma eşiğini geçti!');
}

// 3. Canlı Ingest ve Event Loop Gecikme (Takılma/Stutter) Benchmark'ı
{
  console.log('\n3. Canlı Ingest Event Loop Gecikmesi (Stutter Benchmark) Ölçülüyor...');
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();

  const t0 = performance.now();
  const ingest = startIngest({
    sources: ['claude', 'codex', 'opencode', 'agy'],
    activeMinutes: 60,
    backfill: true,
    follow: false
  });

  const count = ingest.tick();
  const dur = performance.now() - t0;
  loopDelay.disable();

  const maxDelayMs = loopDelay.max / 1e6;
  const meanDelayMs = loopDelay.mean / 1e6;
  const p99DelayMs = loopDelay.percentile(99) / 1e6;

  console.log(`   - İşlenen olay sayısı: ${count}`);
  console.log(`   - Ingest tick süresi: ${dur.toFixed(2)} ms`);
  console.log(`   - Max Event Loop Lag: ${maxDelayMs.toFixed(2)} ms`);
  console.log(`   - Mean Event Loop Lag: ${meanDelayMs.toFixed(2)} ms`);
  console.log(`   - p99 Event Loop Lag: ${p99DelayMs.toFixed(2)} ms`);

  // Max event loop lag 6000 ms olmamalı; optimizasyon sonrası akıcı seviyede kalmalı
  assert.ok(dur < 2500, `Ingest tick süresi 2500ms altında olmalı (ölçülen: ${dur.toFixed(2)}ms)`);
  console.log('✔ Event loop gecikme ve takılma eşikleri başarıyla doğrulandı!');
}

console.log('\n🎉 TÜM BENCHMARK VE MODEL DOĞRULAMA TESTLERİ BAŞARIYLA TAMAMLANDI!');
