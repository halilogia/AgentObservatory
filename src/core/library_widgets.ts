// Kitaplık: Claude Code'un satır içi çizdiği SVG/HTML parçacıkları (mcp__visualize__show_widget -> tool_use.input.widget_code).
// Oturum JSONL'larından (~/.claude/projects/*/*.jsonl) doğrudan taranır; dosya yoktur, içerik bellekte tutulur.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WidgetItem {
  id: string;            // `${sessionId}:${toolUseId}`
  kind: 'svg' | 'html';
  title: string;
  sessionId: string;
  ts: number;
  size: number;
  code: string;
}

const MAX_FILE = 400 * 1024 * 1024;
const MAX_WIDGET = 2 * 1024 * 1024;
const fileCache = new Map<string, { mtime: number; size: number; items: WidgetItem[] }>();

export function parseWidgetLines(text: string, fallbackSession: string): WidgetItem[] {
  const out: WidgetItem[] = [];
  if (!text.includes('widget_code')) return out;
  for (const line of text.split('\n')) {
    if (!line.includes('"widget_code"')) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    const blocks = o && o.message && Array.isArray(o.message.content) ? o.message.content : [];
    for (const b of blocks) {
      if (!b || b.type !== 'tool_use' || !b.input || typeof b.input.widget_code !== 'string') continue;
      const code: string = b.input.widget_code;
      if (!code.trim() || code.length > MAX_WIDGET) continue;
      const sessionId = String(o.sessionId || fallbackSession);
      const kind = /^\s*<svg[\s>]/i.test(code) ? 'svg' : 'html';
      const title = String(b.input.title || '').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'widget';
      out.push({ id: `${sessionId}:${String(b.id || out.length)}`, kind, title, sessionId, ts: Date.parse(o.timestamp) || 0, size: code.length, code });
    }
  }
  return out;
}

export function scanWidgets(claudeHome: string = path.join(os.homedir(), '.claude')): WidgetItem[] {
  const root = path.join(claudeHome, 'projects');
  const all: WidgetItem[] = [];
  const live = new Set<string>();
  let dirs: fs.Dirent[] = [];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch { return all; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    let files: string[] = [];
    try { files = fs.readdirSync(path.join(root, d.name)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = path.join(root, d.name, f);
      live.add(p);
      try {
        const st = fs.statSync(p);
        if (!st.isFile() || st.size > MAX_FILE) continue;
        const hit = fileCache.get(p);
        if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) { all.push(...hit.items); continue; }
        const buf = fs.readFileSync(p);
        const items = buf.includes('"widget_code"') ? parseWidgetLines(buf.toString('utf8'), f.replace(/\.jsonl$/, '')) : [];
        fileCache.set(p, { mtime: st.mtimeMs, size: st.size, items });
        all.push(...items);
      } catch { /* okunamayan dosya atlanır */ }
    }
  }
  for (const k of [...fileCache.keys()]) if (!live.has(k)) fileCache.delete(k);
  return all;
}

// Widget'ı yöneten ana sayfanın sağladığı CSS sınıfları ve değişkenler olmadan SVG düz siyah görünür; makul bir varsayılan eklenir.
const SVG_STYLE = `<style>
svg{--color-text-primary:#1f2328;--color-text-secondary:#57606a;--color-text-tertiary:#8c959f;--color-border-tertiary:#d0d7de;--color-border-secondary:#afb8c1;--color-background-primary:#ffffff;--color-background-secondary:#f6f8fa}
text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;fill:#1f2328}
.t,.th,.ts{fill:#1f2328}.th{font-weight:600;font-size:14px}.ts{font-size:12px;fill:#57606a}.t{font-size:14px}
.box{fill:#f6f8fa;stroke:#afb8c1}.arr,.leader{fill:none;stroke:#57606a;stroke-width:1.5}
.c-purple rect,.c-purple circle,.c-purple ellipse,.c-purple path{fill:#eeeafc;stroke:#7f77dd}
.c-teal rect,.c-teal circle,.c-teal ellipse,.c-teal path{fill:#d9f2ec;stroke:#1d9e75}
.c-coral rect,.c-coral circle,.c-coral ellipse,.c-coral path{fill:#fbe6df;stroke:#d85a30}
.c-pink rect,.c-pink circle,.c-pink ellipse,.c-pink path{fill:#fbe4ee;stroke:#d4537e}
.c-gray rect,.c-gray circle,.c-gray ellipse,.c-gray path{fill:#ececea;stroke:#888780}
.c-blue rect,.c-blue circle,.c-blue ellipse,.c-blue path{fill:#e1eefb;stroke:#378add}
.c-green rect,.c-green circle,.c-green ellipse,.c-green path{fill:#e6f2d9;stroke:#639922}
.c-amber rect,.c-amber circle,.c-amber ellipse,.c-amber path{fill:#fbefd5;stroke:#ba7517}
.c-red rect,.c-red circle,.c-red ellipse,.c-red path{fill:#fbe3e3;stroke:#e24b4a}
</style>`;

export function renderWidgetSvg(code: string): string {
  let s = code.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  s = s.replace(/^\s*<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs;
    if (!/\sxmlns\s*=/.test(' ' + a)) a += ' xmlns="http://www.w3.org/2000/svg"';
    if (!/\swidth\s*=/.test(' ' + a)) a += ' width="680"';
    return `<svg${a}>${SVG_STYLE}`;
  });
  // yüzde genişlik <img> içinde çözülmez; viewBox'tan sabit boyut türetilir
  const vb = /viewBox\s*=\s*"\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*"/i.exec(s);
  if (vb) s = s.replace(/^(<svg\b[^>]*?)\swidth\s*=\s*"100%"/i, `$1 width="${vb[1]}" height="${vb[2]}"`);
  return s;
}
