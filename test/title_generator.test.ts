import assert from 'node:assert';
import {
  CONVERSATION_TITLE_SYSTEM_PROMPT,
  CHAPTER_TITLE_SYSTEM_PROMPT,
  postprocessConversationTitle,
  resolveSessionTitle,
  loadAgyHubTitles,
  loadAgyCliTitles
} from '../src/core/title_generator.ts';
import { groupSessions } from '../src/commands/web_sessions.ts';

// 1. Sistem ve Bölüm İstemleri Doğrulama
assert.ok(CONVERSATION_TITLE_SYSTEM_PROMPT.includes('You are a conversation title generator'));
assert.ok(CONVERSATION_TITLE_SYSTEM_PROMPT.includes('3-5 words, title-cased, no prefix'));
assert.ok(CHAPTER_TITLE_SYSTEM_PROMPT.includes('You title chapters of a conversation'));

// 2. postprocessConversationTitle Filtreleri
assert.strictEqual(
  postprocessConversationTitle('  "Title: Fixing The Login Bug."  '),
  'Fixing The Login Bug'
);
assert.strictEqual(
  postprocessConversationTitle('Başlık: Yapay Zeka Sorgulaması.'),
  'Yapay Zeka Sorgulaması'
);
assert.strictEqual(
  postprocessConversationTitle('«Konu: Çoklu Ajan Denetimi»...'),
  'Çoklu Ajan Denetimi'
);
assert.strictEqual(
  postprocessConversationTitle('### **Planning The Websocket Rollout**'),
  'Planning The Websocket Rollout'
);

// 3. Uzun Başlık Kırpma
const longTitle = 'Bu Cok Uzun Bir Baslik Olup Belirlenen Sinirlarin Kesinlikle Uzerine Cikmaktadir';
const cut = postprocessConversationTitle(longTitle, 30);
assert.ok(cut.length <= 32);
assert.ok(cut.endsWith('…'));

// 4. Antigravity Yerel Başlık Çözümleme (AgyHub / CLI DB)
const hubTitles = loadAgyHubTitles();
assert.ok(hubTitles instanceof Map);
// Eğer diskte agyhub_summaries_proto.pb varsa en azından başlık haritası elde edilir
if (hubTitles.size > 0) {
  const [firstId, expectedTitle] = [...hubTitles.entries()][0];
  const resolved = resolveSessionTitle(firstId, 'agy', ['rastgele prompt']);
  assert.strictEqual(resolved, expectedTitle);
}

// 5. Fallback Çözümleme (Bilinmeyen oturumlar)
const fallbackPrompt = 'Masaüstündeki tüm gereksiz log dosyalarını sil';
const resolvedFallback = resolveSessionTitle('unknown-uuid-1234', 'custom-agent', [fallbackPrompt]);
assert.strictEqual(resolvedFallback, fallbackPrompt);

// 5b. Claude oturumu: başlık Claude'un kendi kaydındaki custom-title / ai-title satırından gelir
{
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-claude-'));
  const proj = path.join(root, 'projects', 'C--proj');
  fs.mkdirSync(proj, { recursive: true });
  const sid = '11111111-2222-3333-4444-555555555555';
  const file = path.join(proj, sid + '.jsonl');
  process.env.CLAUDE_CONFIG_DIR = root;
  fs.writeFileSync(file,
    JSON.stringify({ type: 'user', message: { content: 'en son arayüz geliştiriyorduk' } }) + '\n' +
    JSON.stringify({ type: 'ai-title', aiTitle: 'Arayüz geliştirme', sessionId: sid }) + '\n');
  const rowsC = [{ task_id: 'c1', session_id: sid, agent: 'claude', model: 'opus', status: 'completed', prompt: 'en son arayüz geliştiriyorduk', start_time: Date.now() - 5000, end_time: Date.now() }];
  assert.strictEqual(groupSessions(rowsC, Date.now())[0].title, 'Arayüz geliştirme');
  // sonradan verilen ad (custom-title) Claude uygulamasındaki gibi öne geçer; yalnızca eklenen kısım okunur
  fs.appendFileSync(file, JSON.stringify({ type: 'custom-title', customTitle: 'Arayüz sorunları oyun projelerinde', sessionId: sid }) + '\n');
  assert.strictEqual(resolveSessionTitle(sid, 'claude', ['x']), 'Arayüz sorunları oyun projelerinde');
  // kaydı olmayan Claude oturumu istemden başlık alır
  assert.strictEqual(resolveSessionTitle('99999999-0000-0000-0000-000000000000', 'claude', ['Veri temizliği yap']), 'Veri temizliği yap');
  delete process.env.CLAUDE_CONFIG_DIR;

  // Codex: session_index.jsonl içindeki thread_name (aynı kimlikte son kayıt kazanır)
  process.env.CODEX_HOME = path.join(root, 'codex');
  fs.mkdirSync(process.env.CODEX_HOME);
  fs.writeFileSync(path.join(process.env.CODEX_HOME, 'session_index.jsonl'),
    JSON.stringify({ id: 'cx-1', thread_name: 'Eski ad' }) + '\n' + JSON.stringify({ id: 'cx-1', thread_name: 'Game Pass bilgisini ekle' }) + '\n');
  assert.strictEqual(resolveSessionTitle('cx-1', 'codex', ['istem']), 'Game Pass bilgisini ekle');
  delete process.env.CODEX_HOME;

  // OpenCode: opencode.db session.title; varsayılan "New session - …" adı başlık sayılmaz
  process.env.XDG_DATA_HOME = path.join(root, 'xdg');
  fs.mkdirSync(path.join(process.env.XDG_DATA_HOME, 'opencode'), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const odb = new DatabaseSync(path.join(process.env.XDG_DATA_HOME, 'opencode', 'opencode.db'));
  odb.exec('CREATE TABLE session (id text PRIMARY KEY, title text NOT NULL)');
  odb.prepare('INSERT INTO session VALUES (?, ?)').run('ses_named', 'Harita verisini düzelt');
  odb.prepare('INSERT INTO session VALUES (?, ?)').run('ses_default', 'New session - 2026-10-31T12:40:53.433Z');
  odb.close();
  assert.strictEqual(resolveSessionTitle('ses_named', 'opencode', ['istem']), 'Harita verisini düzelt');
  assert.strictEqual(resolveSessionTitle('ses_default', 'opencode', ['Testleri çalıştır']), 'Testleri çalıştır');
  delete process.env.XDG_DATA_HOME;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* açık sqlite bağlantısı Windows'ta silmeyi engelleyebilir */ }
}

// 6. web_sessions.groupSessions Entegrasyonu
const NOW = Date.now();
const rows = [
  { task_id: 't1', session_id: 'custom-session-1', agent: 'claude', model: 'sonnet', status: 'completed', prompt: 'Veri Analizi Görevi', start_time: NOW - 5000, end_time: NOW - 1000 }
];
const sessions = groupSessions(rows, NOW);
assert.strictEqual(sessions.length, 1);
assert.strictEqual(sessions[0].title, 'Veri Analizi Görevi');

console.log('title_generator tests PASSED successfully.');
