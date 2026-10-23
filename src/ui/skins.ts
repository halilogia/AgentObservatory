// Görünüm temaları (skin): bir oturumu, geldiği CLI'ın görünümüne yakın çizer.
// Saf biçimlendirme: G/Ç yok. Renk kapalıysa (NO_COLOR / TTY değil) düz metin üretir.
// Doğruluk notu: claude / codex / opencode temaları o CLI'ların bilinen düzenine, agy teması kullanıcının
// antigravity-cli istemcisine ve Google mavisine dayanır; birebir kopya değil, "yakın" görünümdür.
import os from 'node:os';

export type ToolKind = 'exec' | 'read' | 'write' | 'edit' | 'search' | 'other';
export interface ToolView { kind: ToolKind; name: string; summary: string }
export type SkinId = 'claude' | 'codex' | 'agy' | 'opencode' | 'generic';

export interface HeaderInfo { agent: string; taskId: string; cwd?: string; model?: string }
export interface FooterInfo { status: 'completed' | 'failed' | 'cancelled'; durationMs?: number; tokensIn?: number; tokensOut?: number; error?: string; errorKind?: string }

export interface Skin {
  id: SkinId;
  header(i: HeaderInfo): string;
  user(prompt: string): string;
  /** asistan bloğunun ilk satır öneki */
  assistantOpen: string;
  /** devam satırları öneki */
  assistantIndent: string;
  tool(v: ToolView): string;
  toolResult(lines: string[], more: number): string;
  footer(i: FooterInfo): string;
}

export type Paint = (rgb: [number, number, number] | null, s: string, style?: 'bold' | 'dim') => string;

export function makePaint(useColor: boolean): Paint {
  return (rgb, s, style) => {
    if (!useColor) return s;
    const st = style === 'bold' ? '\x1b[1m' : style === 'dim' ? '\x1b[2m' : '';
    const col = rgb ? `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m` : '';
    return `${st}${col}${s}\x1b[0m`;
  };
}

// ---------- yardımcılar ----------
const HOME = os.homedir();

export function shortPath(p: string): string {
  if (!p) return p;
  let s = String(p).replace(/\\/g, '/');
  const home = HOME.replace(/\\/g, '/');
  if (s.toLowerCase().startsWith(home.toLowerCase())) s = '~' + s.slice(home.length);
  const parts = s.split('/');
  return parts.length > 4 ? '…/' + parts.slice(-3).join('/') : s;
}

function clip(s: string, n: number): string {
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

export function fmtTokens(n?: number): string {
  if (n === undefined) return '';
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
}

export function fmtDuration(ms?: number): string {
  if (ms === undefined) return '';
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.max(s, 0)}s`;
}

/** Ajanlar araçlara farklı adlar verir (Bash / bash / run_command...). Ortak bir görünüme indirir. */
export function describeTool(name: string, input: any): ToolView {
  const n = String(name || 'tool');
  const k = n.toLowerCase();
  const o = input && typeof input === 'object' ? input : {};
  const path = o.file_path ?? o.filePath ?? o.path ?? o.AbsolutePath ?? o.TargetFile ?? o.absolute_path;
  if (/^(bash|shell|powershell|exec|run_command|execute|terminal)/.test(k)) {
    return { kind: 'exec', name: n, summary: clip(o.command ?? o.CommandLine ?? o.cmd ?? JSON.stringify(o), 110) };
  }
  if (/^(read|view_file|cat|open|list_dir|ls)/.test(k)) return { kind: 'read', name: n, summary: path ? shortPath(path) : clip(JSON.stringify(o), 80) };
  if (/^(write|write_to_file|create)/.test(k)) return { kind: 'write', name: n, summary: path ? shortPath(path) : clip(JSON.stringify(o), 80) };
  if (/(edit|replace|patch)/.test(k)) return { kind: 'edit', name: n, summary: path ? shortPath(path) : clip(JSON.stringify(o), 80) };
  if (/^(grep|glob|find|search|grep_search|find_by_name|websearch)/.test(k)) {
    return { kind: 'search', name: n, summary: clip(o.pattern ?? o.query ?? o.Query ?? o.Pattern ?? JSON.stringify(o), 90) };
  }
  return { kind: 'other', name: n, summary: clip(JSON.stringify(o), 90) };
}

function box(lines: string[], paint: Paint, rgb: [number, number, number], round = true): string {
  const w = Math.max(...lines.map((l) => l.length)) + 2;
  const [tl, tr, bl, br] = round ? ['╭', '╮', '╰', '╯'] : ['┌', '┐', '└', '┘'];
  const out = [tl + '─'.repeat(w) + tr, ...lines.map((l) => '│ ' + l.padEnd(w - 1) + '│'), bl + '─'.repeat(w) + br];
  return out.map((l) => paint(rgb, l)).join('\n');
}

function indentLines(text: string, prefix: string): string {
  return String(text).split('\n').map((l) => prefix + l).join('\n');
}

const GRAY: [number, number, number] = [136, 136, 136];
const RED: [number, number, number] = [224, 90, 90];
const GREEN: [number, number, number] = [110, 200, 130];

function statusWord(f: FooterInfo): string {
  return f.status === 'completed' ? '' : f.status === 'cancelled' ? 'Interrupted' : 'Failed';
}
function tokenText(f: FooterInfo): string {
  const parts: string[] = [];
  if (f.tokensIn) parts.push(`in ${fmtTokens(f.tokensIn)}`);
  if (f.tokensOut) parts.push(`out ${fmtTokens(f.tokensOut)}`);
  return parts.join(' · ');
}
function errorLine(f: FooterInfo): string {
  if (f.status !== 'failed' || !f.error) return '';
  const kind = f.errorKind && f.errorKind !== 'unknown' ? ` [${f.errorKind}]` : '';
  return clip(f.error.split('\n')[0], 160) + kind;
}

// ---------- temalar ----------
export function buildSkin(id: SkinId, paint: Paint): Skin {
  switch (id) {
    case 'claude': {
      const ORANGE: [number, number, number] = [217, 119, 87];
      return {
        id,
        header: (i) => box([`* Claude Code`, `  cwd: ${shortPath(i.cwd || '')}${i.model ? '   model: ' + i.model : ''}`], paint, ORANGE),
        user: (p) => indentLines(p, '').split('\n').map((l, n) => paint(GRAY, (n === 0 ? '> ' : '  ') + l)).join('\n'),
        assistantOpen: paint(null, '● '),
        assistantIndent: '  ',
        tool: (v) => `${paint(GREEN, '●')} ${paint(null, v.name, 'bold')}(${v.summary})`,
        toolResult: (lines, more) => lines.map((l, n) => paint(GRAY, (n === 0 ? '  ⎿  ' : '     ') + l)).join('\n') + (more > 0 ? '\n' + paint(GRAY, `     … +${more} lines`) : ''),
        footer: (f) => {
          const dur = f.durationMs !== undefined ? ` for ${fmtDuration(f.durationMs)}` : '';
          const tok = tokenText(f);
          const base = f.status === 'completed' ? paint(ORANGE, `* Worked${dur}`) : paint(RED, `x ${statusWord(f)}${dur}`);
          return base + (tok ? paint(GRAY, ` · ${tok}`) : '') + (errorLine(f) ? '\n' + paint(RED, '  ⎿  ' + errorLine(f)) : '');
        }
      };
    }
    case 'codex': {
      const TEAL: [number, number, number] = [16, 163, 127];
      return {
        id,
        header: (i) => box([`>_ OpenAI Codex`, ``, `model:     ${i.model || '(varsayılan)'}`, `directory: ${shortPath(i.cwd || '')}`], paint, GRAY),
        user: (p) => p.split('\n').map((l, n) => paint(null, (n === 0 ? '› ' : '  ') + l, 'bold')).join('\n'),
        assistantOpen: paint(TEAL, '• '),
        assistantIndent: '  ',
        tool: (v) => {
          const verb = v.kind === 'exec' ? 'Ran' : v.kind === 'read' ? 'Explored' : v.kind === 'write' ? 'Wrote' : v.kind === 'edit' ? 'Edited' : v.kind === 'search' ? 'Searched' : 'Used';
          return `${paint(TEAL, '•')} ${paint(null, verb, 'bold')} ${v.kind === 'other' ? v.name + ' ' : ''}${v.summary}`;
        },
        toolResult: (lines, more) => lines.map((l, n) => paint(GRAY, (n === 0 ? '  └ ' : '    ') + l)).join('\n') + (more > 0 ? '\n' + paint(GRAY, `    … +${more} lines`) : ''),
        footer: (f) => {
          const dur = f.durationMs !== undefined ? ` ${fmtDuration(f.durationMs)}` : '';
          const tok = tokenText(f);
          const label = f.status === 'completed' ? `─ Worked for${dur} ` : `─ ${statusWord(f)}${dur} `;
          return paint(GRAY, label + '─'.repeat(Math.max(4, 44 - label.length))) + (tok ? paint(GRAY, '\n  tokens ' + tok) : '') + (errorLine(f) ? '\n' + paint(RED, '  ■ ' + errorLine(f)) : '');
        }
      };
    }
    case 'agy': {
      const BLUE: [number, number, number] = [66, 133, 244];
      const CYAN: [number, number, number] = [80, 200, 230];
      return {
        id,
        header: (i) => box([`▲ Antigravity CLI`, `Model:     ${i.model || '(varsayılan)'}`, `Workspace: ${shortPath(i.cwd || '')}`], paint, BLUE),
        user: (p) => p.split('\n').map((l, n) => paint(CYAN, (n === 0 ? '> ' : '  ') + l)).join('\n'),
        assistantOpen: paint(BLUE, '◆ '),
        assistantIndent: '  ',
        tool: (v) => `${paint(CYAN, '▸')} ${paint(null, v.name, 'bold')} ${paint(GRAY, v.summary)}`,
        toolResult: (lines, more) => lines.map((l) => paint(GRAY, '    ' + l)).join('\n') + (more > 0 ? '\n' + paint(GRAY, `    … +${more} lines`) : ''),
        footer: (f) => {
          const dur = f.durationMs !== undefined ? ` (${fmtDuration(f.durationMs)})` : '';
          const tok = tokenText(f);
          const base = f.status === 'completed' ? paint(BLUE, `▲ Done${dur}`) : paint(RED, `▲ ${statusWord(f)}${dur}`);
          return base + (tok ? paint(GRAY, ` · ${tok}`) : '') + (errorLine(f) ? '\n' + paint(RED, '  ' + errorLine(f)) : '');
        }
      };
    }
    case 'opencode': {
      const PURPLE: [number, number, number] = [170, 130, 255];
      return {
        id,
        header: (i) => paint(null, `> build · ${i.model || 'default'}`, 'dim') + (i.cwd ? paint(GRAY, `   ${shortPath(i.cwd)}`) : ''),
        user: (p) => p.split('\n').map((l) => paint(PURPLE, '┃ ') + l).join('\n'),
        assistantOpen: '',
        assistantIndent: '',
        tool: (v) => paint(GRAY, `← ${v.kind === 'exec' ? 'Bash' : v.name.charAt(0).toUpperCase() + v.name.slice(1)} ${v.summary}`),
        toolResult: (lines, more) => lines.map((l) => paint(GRAY, '  ' + l)).join('\n') + (more > 0 ? '\n' + paint(GRAY, `  … +${more} lines`) : ''),
        footer: (f) => {
          const tok = tokenText(f);
          const dur = f.durationMs !== undefined ? fmtDuration(f.durationMs) : '';
          const head = f.status === 'completed' ? paint(GRAY, [dur, tok].filter(Boolean).join(' · ')) : paint(RED, `${statusWord(f)} ${dur}`.trim());
          return head + (errorLine(f) ? '\n' + paint(RED, errorLine(f)) : '');
        }
      };
    }
    default:
      return {
        id: 'generic',
        header: (i) => paint(GRAY, `── ${i.agent} · ${i.taskId} ──`),
        user: (p) => paint(GRAY, '> ' + p),
        assistantOpen: '',
        assistantIndent: '',
        tool: (v) => paint(GRAY, `[${v.name}] ${v.summary}`),
        toolResult: (lines, more) => lines.map((l) => paint(GRAY, '  ' + l)).join('\n') + (more > 0 ? '\n' + paint(GRAY, `  … +${more} lines`) : ''),
        footer: (f) => paint(f.status === 'completed' ? GRAY : RED, `── ${f.status} ${fmtDuration(f.durationMs)} ──`) + (errorLine(f) ? '\n' + errorLine(f) : '')
      };
  }
}

export function skinIdForAgent(agent: string): SkinId {
  const a = String(agent).toLowerCase();
  return a === 'claude' || a === 'codex' || a === 'agy' || a === 'opencode' ? a : 'generic';
}
