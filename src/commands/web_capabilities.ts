// Her CLI'nin yetenekleri (skill, ajan, komut, MCP, eklenti): yalnızca AD ve KISA AÇIKLAMA okunur.
// Gizli değerler (MCP env, jetonlar, argümanlar) asla okunup döndürülmez; yapılandırma dosyalarından yalnızca anahtar adları alınır.
import fs from 'node:fs';
import path from 'node:path';

export interface CapItem { name: string; desc?: string; scope?: 'project' }
export interface Caps { skills: CapItem[]; agents: CapItem[]; commands: CapItem[]; mcp: CapItem[]; plugins: CapItem[] }
export type EngineCaps = Record<'claude' | 'codex' | 'opencode' | 'agy', Caps>;

const MAX_ITEMS = 300;
const MAX_FILE = 8 * 1024 * 1024; // ~/.claude.json geçmişle şişebilir

const empty = (): Caps => ({ skills: [], agents: [], commands: [], mcp: [], plugins: [] });
const readText = (f: string): string => { try { const st = fs.statSync(f); return st.isFile() && st.size <= MAX_FILE ? fs.readFileSync(f, 'utf8') : ''; } catch { return ''; } };
const readJson = (f: string): any => { try { return JSON.parse(readText(f)); } catch { return null; } };
const dirs = (d: string): string[] => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name); } catch { return []; } };
const mdFiles = (d: string): string[] => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile() && /\.md$/i.test(e.name)).map((e) => e.name); } catch { return []; } };
const clip = (s: string | undefined, n = 200): string | undefined => { const t = (s || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? t.slice(0, n - 1) + '…' : t) : undefined; };

/** `---` önyüzündeki (frontmatter) yalnızca `name` ve `description` alanları; çok satırlı `>`/`|` blokları ilk satıra kadar okunur */
export function frontmatter(text: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^(name|description)\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?$/.test(v)) { v = ''; for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) v += ' ' + lines[j].trim(); }
    out[kv[1]] = v.trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function skillsIn(dir: string, scope?: 'project'): CapItem[] {
  return dirs(dir).flatMap((d) => {
    const t = readText(path.join(dir, d, 'SKILL.md'));
    if (!t) return [];
    const fm = frontmatter(t);
    return [{ name: fm.name || d, desc: clip(fm.description), scope }];
  });
}
function mdIn(dir: string, scope?: 'project'): CapItem[] {
  return mdFiles(dir).map((f) => { const fm = frontmatter(readText(path.join(dir, f))); return { name: fm.name || f.replace(/\.md$/i, ''), desc: clip(fm.description), scope }; });
}
const names = (o: unknown, scope?: 'project'): CapItem[] => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o as object).map((name) => ({ name, scope })) : []);

// JSONC: yalnızca satır başındaki // yorumları ve blok yorumları atılır (URL içindeki // korunur)
function parseJsonc(text: string): any {
  try { return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')); } catch { return null; }
}

function uniq(items: CapItem[]): CapItem[] {
  const seen = new Set<string>(); const out: CapItem[] = [];
  for (const i of items) { const k = i.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(i); }
  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ITEMS);
}
function finish(c: Caps): Caps { return { skills: uniq(c.skills), agents: uniq(c.agents), commands: uniq(c.commands), mcp: uniq(c.mcp), plugins: uniq(c.plugins) }; }

export function readCapabilities(home: string, cwd?: string): EngineCaps {
  const proj = cwd && fs.existsSync(cwd) ? cwd : undefined;

  // ---- Claude Code ----
  const cl = empty();
  cl.skills.push(...skillsIn(path.join(home, '.claude', 'skills')));
  cl.agents.push(...mdIn(path.join(home, '.claude', 'agents')));
  cl.commands.push(...mdIn(path.join(home, '.claude', 'commands')));
  const cj = readJson(path.join(home, '.claude.json'));
  cl.mcp.push(...names(cj?.mcpServers), ...names(readJson(path.join(home, '.claude', 'settings.json'))?.mcpServers));
  const ip = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
  cl.plugins.push(...names(ip?.plugins));
  if (proj) {
    cl.skills.push(...skillsIn(path.join(proj, '.claude', 'skills'), 'project'));
    cl.agents.push(...mdIn(path.join(proj, '.claude', 'agents'), 'project'));
    cl.commands.push(...mdIn(path.join(proj, '.claude', 'commands'), 'project'));
    cl.mcp.push(...names(readJson(path.join(proj, '.mcp.json'))?.mcpServers, 'project'));
    const pj = cj?.projects && Object.entries(cj.projects as Record<string, any>).find(([k]) => path.resolve(k).toLowerCase() === path.resolve(proj).toLowerCase());
    if (pj) cl.mcp.push(...names((pj[1] as any)?.mcpServers, 'project'));
  }

  // ---- Codex ----
  const cx = empty();
  cx.skills.push(...skillsIn(path.join(home, '.codex', 'skills')));
  cx.commands.push(...mdIn(path.join(home, '.codex', 'prompts')));
  const toml = readText(path.join(home, '.codex', 'config.toml'));
  for (const m of toml.matchAll(/^\[mcp_servers\.("[^"]+"|[A-Za-z0-9_-]+)\]\s*$/gm)) cx.mcp.push({ name: m[1].replace(/"/g, '') });
  if (proj) cx.skills.push(...skillsIn(path.join(proj, '.codex', 'skills'), 'project'));

  // ---- OpenCode ----
  const oc = empty();
  oc.agents.push({ name: 'build', desc: 'Yerleşik: varsayılan ajan' }, { name: 'plan', desc: 'Yerleşik: yalnızca inceler, dosya değiştirmez' });
  const ocDir = path.join(home, '.config', 'opencode');
  const ocCfg = parseJsonc(readText(path.join(ocDir, 'opencode.jsonc'))) || readJson(path.join(ocDir, 'opencode.json'));
  oc.agents.push(...names(ocCfg?.agent)); oc.commands.push(...names(ocCfg?.command)); oc.mcp.push(...names(ocCfg?.mcp));
  for (const d of ['agent', 'agents']) oc.agents.push(...mdIn(path.join(ocDir, d)));
  for (const d of ['command', 'commands']) oc.commands.push(...mdIn(path.join(ocDir, d)));
  for (const d of ['skill', 'skills']) oc.skills.push(...skillsIn(path.join(ocDir, d)));
  oc.plugins.push(...(Array.isArray(ocCfg?.plugin) ? ocCfg.plugin.filter((p: unknown) => typeof p === 'string').map((p: string) => ({ name: p })) : []));
  if (proj) {
    oc.agents.push(...mdIn(path.join(proj, '.opencode', 'agent'), 'project')); oc.commands.push(...mdIn(path.join(proj, '.opencode', 'command'), 'project'));
    const pc = parseJsonc(readText(path.join(proj, 'opencode.jsonc'))) || readJson(path.join(proj, 'opencode.json'));
    oc.agents.push(...names(pc?.agent, 'project')); oc.mcp.push(...names(pc?.mcp, 'project'));
  }

  // ---- Antigravity (agy) ----
  const ag = empty();
  ag.skills.push(...skillsIn(path.join(home, '.gemini', 'config', 'skills')), ...skillsIn(path.join(home, '.gemini', 'antigravity', 'skills')));
  ag.mcp.push(...names(readJson(path.join(home, '.gemini', 'config', 'mcp_config.json'))?.mcpServers), ...names(readJson(path.join(home, '.gemini', 'antigravity', 'mcp_config.json'))?.mcpServers));
  if (proj) ag.skills.push(...skillsIn(path.join(proj, '.agents', 'skills'), 'project'));

  return { claude: finish(cl), codex: finish(cx), opencode: finish(oc), agy: finish(ag) };
}
