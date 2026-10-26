import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const port = 8791;
const feeds = [
  { id: 'codex', name: 'OpenAI · Codex', origin: 'site', url: 'https://learn.chatgpt.com/docs/changelog/rss.xml', page: 'https://learn.chatgpt.com/docs/changelog' },
  { id: 'antigravity', name: 'Google · Antigravity', origin: 'site', url: 'https://antigravity.google/blog/rss.xml', page: 'https://antigravity.google/changelog' },
  { id: 'claude-code', name: 'Anthropic · Claude Code', origin: 'github', url: 'https://raw.githubusercontent.com/anthropics/claude-code/main/feed.xml', page: 'https://support.claude.com/en/articles/12138966-release-notes' },
  { id: 'opencode', name: 'OpenCode', origin: 'github', url: 'https://github.com/anomalyco/opencode/releases.atom', page: 'https://opencode.ai/changelog' },
];

function decode(value = '') {
  const entities = (text) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
      const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (entity[0] !== '#') return names[entity.toLowerCase()] ?? match;
      const n = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    });
  return entities(entities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function field(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'));
  return match ? decode(match[1]) : '';
}

function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi)].map((m) => m[0]);
  return blocks.map((block, index) => {
    const atom = /^\s*<entry/i.test(block);
    const link = atom
      ? block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1]
      : field(block, 'link');
    const title = field(block, 'title') || 'Başlıksız güncelleme';
    const date = field(block, 'published') || field(block, 'updated') || field(block, 'pubDate') || field(block, 'date');
    const summary = field(block, 'summary') || field(block, 'description') || field(block, 'content');
    const url = (link || '').trim();
    if (!/^https:\/\//i.test(url)) return null;
    const timestamp = Date.parse(date);
    return {
      id: `${source.id}:${url}`,
      sourceId: source.id,
      source: source.name,
      origin: source.origin,
      title: title.slice(0, 300),
      url,
      date: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      summary: summary.slice(0, 900),
      order: index,
    };
  }).filter(Boolean).slice(0, 35);
}

const lastGood = new Map();

async function loadSource(source) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(source.url, {
        headers: { 'User-Agent': 'AgentObservatory-AIUpdates/1.0', Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      const items = parseFeed(xml, source);
      if (!items.length) throw new Error('Akışta okunabilir kayıt bulunamadı');
      const result = { source: source.id, name: source.name, origin: source.origin, page: source.page, ok: true, count: items.length, items };
      lastGood.set(source.id, result);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  const previous = lastGood.get(source.id);
  if (previous) return { ...previous, stale: true, error: lastError?.message || 'Kaynağa erişilemedi' };
  return { source: source.id, name: source.name, origin: source.origin, page: source.page, ok: false, count: 0, error: lastError?.message || 'Kaynağa erişilemedi', items: [] };
}

const mime = { '/': 'text/html; charset=utf-8', '/index.html': 'text/html; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, name: 'Agent Observatory AI Updates' }));
    return;
  }
  if (url.pathname === '/api/updates') {
    const sources = await Promise.all(feeds.map(loadSource));
    const items = sources.flatMap((source) => source.items).sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ checkedAt: new Date().toISOString(), sources: sources.map(({ items: _items, ...source }) => source), items }));
    return;
  }
  const file = mime[url.pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(path.join(root, url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
    res.writeHead(200, { 'content-type': file, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'" });
    res.end(body);
  } catch { res.writeHead(500); res.end('Dashboard file unavailable'); }
});

server.listen(port, host, () => console.log(`AI Updates dashboard listening at http://${host}:${port}`));
