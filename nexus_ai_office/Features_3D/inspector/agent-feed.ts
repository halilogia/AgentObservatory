// Ajan olay akışı. ŞİMDİLİK SİMÜLE (demo): gerçek backend bağlanınca yalnızca bu dosyadaki
// `feed` uygulaması değiştirilir; çekmece arayüzü aynı kalır.

export type LogLevel = 'info' | 'ok' | 'warn' | 'err' | 'cmd' | 'user' | 'agent';
export interface LogLine { t: number; level: LogLevel; text: string }

export interface AgentSnapshot {
  task: string;
  phases: string[];
  phase: number;
  progress: number; // 0..1, aktif faz içinde
  paused: boolean;
  lines: LogLine[];
  /** oturum boyunca üretilen toplam satır (artımlı çizim için) */
  total: number;
}

export const CODE_PHASES = ['Düşünüyor', 'Okuyor / İnceliyor', 'Kodluyor', 'Test Ediyor'];

export interface FeedConfig {
  task: string;
  kind: string;
  name?: string;
  role?: string;
  model?: string;
}
const configs = new Map<string, FeedConfig>();

interface CliToolMeta {
  cliTag: string;
  version: string;
  officialTools: string[];
}

function getCliMeta(name: string): CliToolMeta {
  const n = name.toLowerCase();
  if (n.includes('claude')) {
    return {
      cliTag: 'claude',
      version: 'v2.1.296',
      officialTools: ['Bash', 'Edit', 'Read', 'Write', 'Glob', 'Grep', 'LS', 'WebSearch', 'Fetch', 'Task', 'MCP']
    };
  }
  if (n.includes('codex')) {
    return {
      cliTag: 'codex',
      version: 'v0.156.1',
      officialTools: ['exec', 'apply', 'review', 'read_file', 'workspace_edit', 'web_search', 'mcp', 'plugin', 'worktree']
    };
  }
  if (n.includes('antigravity') || n.includes('agy')) {
    return {
      cliTag: 'agy',
      version: 'v1.3.6',
      officialTools: ['view_file', 'replace_file_content', 'write_to_file', 'run_command', 'manage_task', 'invoke_subagent', 'schedule', 'search_web', 'mcp']
    };
  }
  if (n.includes('chatgpt')) {
    return {
      cliTag: 'chatgpt-web',
      version: 'v1.0.0',
      officialTools: ['ask', 'search', 'code_interpreter', 'canvas', 'memory', 'mcp']
    };
  }
  return {
    cliTag: 'nexus-agent',
    version: 'v1.0.0',
    officialTools: ['reason', 'read', 'code', 'test', 'mcp']
  };
}

class Session {
  lines: LogLine[] = [];
  phase = 0;
  paused = false;
  total = 0;
  constructor(readonly id: string) {
    this.initCli();
  }

  private initCli(): void {
    const c = configs.get(this.id);
    const name = c?.name || (this.id === 'manager' ? 'Planning Manager' : this.id);
    const role = c?.role || (this.id === 'manager' ? 'Ajan koordinasyonu' : 'Yardımcı ajan');
    const meta = getCliMeta(name);

    this.push('info', `[${name} CLI ${meta.version} · Oturum Bağlandı]`);
    this.push('info', `Çalışma Alanı: SpatialAIOrchestration3D · Rol: ${role}`);
    this.push('info', `Resmi Araçlar: ${meta.officialTools.join(', ')}`);
    this.push('cmd', `$ ${meta.cliTag} session --connect --interactive`);
    this.push('ok', `✔ CLI oturumu aktif · Talimat bekleniyor ($)`);
  }

  push(level: LogLevel, text: string): void {
    this.lines.push({ t: Date.now(), level: level, text: text });
    this.total++;
    if (this.lines.length > 400) this.lines.shift();
  }

  tick(): boolean {
    return false; // Sahte demo döngüsü kaldırıldı; oturum gerçek CLI komutları ve durumlarla beslenir
  }

  snapshot(): AgentSnapshot {
    const c = configs.get(this.id);
    return {
      task: c?.task || '',
      phases: CODE_PHASES,
      phase: this.phase,
      progress: (this.phase + 1) / CODE_PHASES.length,
      paused: this.paused,
      lines: this.lines,
      total: this.total
    };
  }

  send(prompt: string): void {
    const c = configs.get(this.id);
    const name = c?.name || this.id;
    this.push('user', prompt);
    this.push('cmd', `$ ${prompt}`);
    this.push('info', `[${name}] Talimat yürütülüyor...`);
    this.push('ok', `[${name}] ✔ İşlem başarıyla tamamlandı (exit: 0)`);
  }

  setPhase(phase: number): void {
    this.phase = Math.max(0, Math.min(CODE_PHASES.length - 1, phase));
    const c = configs.get(this.id);
    const name = c?.name || this.id;
    const meta = getCliMeta(name);

    if (phase === 0) {
      this.push('cmd', `$ ${meta.cliTag} --effort high (thinking)`);
      this.push('info', `[${name}] [Düşünüyor] Mimari mantık ve planlama yürütülüyor (reasoning)...`);
    } else if (phase === 1) {
      const readTool = meta.cliTag === 'claude' ? 'Read / Grep / Glob' : meta.cliTag === 'codex' ? 'read_file / web_search' : meta.cliTag === 'agy' ? 'view_file / search_web' : 'read';
      this.push('cmd', `$ ${meta.cliTag} tool: ${readTool}`);
      this.push('info', `[${name}] [Okuyor / İnceliyor] Dokümantasyon ve kütüphane taranıyor...`);
    } else if (phase === 2) {
      const editTool = meta.cliTag === 'claude' ? 'Edit / Write' : meta.cliTag === 'codex' ? 'apply / workspace_edit' : meta.cliTag === 'agy' ? 'replace_file_content / write_to_file' : 'code';
      this.push('cmd', `$ ${meta.cliTag} tool: ${editTool}`);
      this.push('info', `[${name}] [Kodluyor] Kod üretimi ve dosya düzenleme yapılıyor...`);
    } else if (phase === 3) {
      const testTool = meta.cliTag === 'claude' ? 'Bash ($ npm test)' : meta.cliTag === 'codex' ? 'exec ($ npm test)' : meta.cliTag === 'agy' ? 'run_command ($ npm test)' : 'test ($ npm test)';
      this.push('cmd', `$ ${meta.cliTag} tool: ${testTool}`);
      this.push('info', `[${name}] [Test Ediyor] QA Laboratuvarında testler çalıştırılıyor...`);
    }
  }
}

const sessions = new Map<string, Session>();
const listeners = new Set<(id: string) => void>();
let timer = 0;

function session(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = new Session(id);
    sessions.set(id, s);
  }
  return s;
}
function notify(id: string): void { listeners.forEach(function (l) { l(id); }); }

export const feed = {
  /** dinamik ajan için görev/simülasyon türünü bildirir */
  configure: function (id: string, c: FeedConfig): void {
    configs.set(id, c);
    const existing = sessions.get(id);
    if (!existing) {
      session(id);
    }
  },
  /** arayüz eylemi sonucu günlüğe satır ekler */
  note: function (id: string, level: LogLevel, text: string): void { session(id).push(level, text); notify(id); },
  /** ajan kaldırıldığında oturumunu siler */
  forget: function (id: string): void { configs.delete(id); sessions.delete(id); },
  snapshot: function (id: string): AgentSnapshot { return session(id).snapshot(); },
  send: function (id: string, prompt: string): void { session(id).send(prompt); notify(id); },
  setPaused: function (id: string, p: boolean): void {
    const s = session(id); s.paused = p; s.push('warn', p ? 'ajan duraklatıldı (kullanıcı)' : 'ajan devam ediyor');
    notify(id);
  },
  setPhase: function (id: string, p: number): void {
    session(id).setPhase(p);
    notify(id);
  },
  onChange: function (cb: (id: string) => void): void { listeners.add(cb); },
  start: function (): void {
    if (timer) return;
    timer = window.setInterval(function () {
      sessions.forEach(function (s, id) { if (s.tick()) notify(id); });
    }, 2000);
  }
};
