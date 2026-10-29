// Ajanlar arası nedensellik: bir ajanın araç çağrısı (MCP run_agent/start_task/run_codex/run_claude/run_agy ya da
// kabuktan `codex exec "..."`, `claude -p "..."`, `agy -p "..."`, `opencode run "..."`) başka bir ajanı başlattığında
// başlatılan görev, çağıran görevin alt ajanı (parent_task_id) olur. Alt görevin kendi oturumu ve yaşam döngüsü korunur;
// bağ yalnızca görev satırına yazılır. Eşleşme: ajan + istem anahtarı + zaman penceresi.
import type { AgentType } from './types.ts';

export interface SpawnIntent { agent: AgentType | null; prompt: string }

/** Araç çağrısından alt görev ancak bu pencerede başlamışsa eşleşir (çağrıdan biraz önce kaydedilmiş olabilir). */
export const SPAWN_WINDOW_BEFORE_MS = 15_000;
export const SPAWN_WINDOW_AFTER_MS = 5 * 60_000;

const MCP_TOOL_RE = /(?:^|[_.:\-/])(run_agent|start_task|run_codex|run_claude|run_agy)$/i;
const MCP_AGENT: Record<string, AgentType | null> = { run_agent: null, start_task: null, run_codex: 'codex', run_claude: 'claude', run_agy: 'agy' };
const AGENTS = new Set<AgentType>(['claude', 'codex', 'agy', 'hermes', 'ollama', 'opencode', 'freebuff', 'commandcode']);

/** CLI çağrısı: ikili adı + istemi taşıyan alt komut/bayrak (istem bundan sonraki ilk tırnaklı argümandır). */
const CLI_RE = /(?:^|[\s;&|(`"'\\/])(codex|claude|agy|opencode)(?:\.exe|\.cmd|\.ps1)?\s+([^\n]*)/gi;
const CLI_VERB: Record<string, RegExp> = {
  codex: /^(?:[^"']*?\s)?exec\b/i,
  claude: /(?:^|\s)(?:-p|--print)\b/i,
  agy: /(?:^|\s)(?:-p|--print|--prompt)\b/i,
  opencode: /^(?:[^"']*?\s)?run\b/i
};

/** İstem karşılaştırma anahtarı: boşluk/tırnak/büyük-küçük farkları yok sayılır, ilk 60 karakter. */
export function promptKey(s: unknown): string {
  return String(s ?? '').replace(/\\(["'`$])/g, '$1').replace(/["'`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
}

/** İki istem aynı görevi mi anlatıyor? (kabuk kaçışları ve ajanın eklediği sonekler yüzünden önek eşleşmesi yeterli) */
export function promptsMatch(a: string, b: string): boolean {
  if (a.length < 6 || b.length < 6) return a.length > 0 && a === b;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function commandOf(input: any): string {
  const c = input?.command ?? input?.CommandLine ?? input?.commandLine ?? input?.cmd ?? input?.script;
  if (Array.isArray(c)) return c.map(String).join(' ');
  return typeof c === 'string' ? c : '';
}

function firstQuoted(s: string): string {
  const m = /"((?:[^"\\]|\\.)*)"|'([^']*)'/.exec(s);
  return m ? (m[1] ?? m[2] ?? '') : '';
}

/** Araç çağrısı başka bir ajanı başlatıyor mu? Başlatıyorsa hedef ajan (bilinmiyorsa null) ve istem. */
export function detectSpawn(name: unknown, input: any): SpawnIntent | null {
  const tool = String(name || '');
  const mcp = MCP_TOOL_RE.exec(tool);
  if (mcp) {
    const kind = mcp[1].toLowerCase();
    const prompt = String(input?.prompt ?? '');
    if (!prompt.trim()) return null;
    const named = String(input?.agent ?? '').toLowerCase() as AgentType;
    return { agent: MCP_AGENT[kind] ?? (AGENTS.has(named) ? named : null), prompt };
  }
  const cmd = commandOf(input);
  if (!cmd) return null;
  for (const m of cmd.matchAll(CLI_RE)) {
    const bin = m[1].toLowerCase() as AgentType;
    const rest = m[2];
    const verb = CLI_VERB[bin]?.exec(rest);
    if (!verb) continue;
    const prompt = firstQuoted(rest.slice(verb.index + verb[0].length));
    if (prompt.trim()) return { agent: bin, prompt };
  }
  return null;
}
