import { EventStore, globalStore } from '../core/event_store.ts';
import { globalSqlite } from '../core/sqlite_store.ts';
import type { TaskEvent, TaskStatus, TaskSummary } from '../core/types.ts';

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

export function paint(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

export function hms(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toTimeString().split(' ')[0];
}

const MAX_PENDING_TOOLS = 500;

type ToolKind = 'read' | 'edit' | 'write' | 'bash' | 'grep' | 'glob' | 'agent' | 'other';

export interface ToolInfo {
  name: string;
  kind: ToolKind;
  target: string;
}

// JSON kaçışlarını okunur hale getirir ve boşlukları sıkıştırır.
export function cleanText(text: unknown): string {
  return String(text ?? '')
    .replace(/\\\\/g, '/')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

// Absolute yolları cwd'ye göre rölatifleştirir; proje dışı uzun yolları kısaltır.
export function shortPath(p: unknown): string {
  const norm = String(p ?? '').replace(/\\+/g, '/').replace(/\s+/g, ' ').trim();
  if (!norm) return '';
  const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm.toLowerCase() === cwd.toLowerCase()) return '.';
  if (norm.toLowerCase().startsWith(cwd.toLowerCase() + '/')) {
    return truncate(norm.slice(cwd.length + 1), 70);
  }
  const parts = norm.split('/').filter(Boolean);
  if (parts.length > 3) return '.../' + parts.slice(-3).join('/');
  return truncate(norm, 70);
}

export function describeTool(name: string, input: any): ToolInfo {
  const n = String(name || 'tool');
  const inp = input && typeof input === 'object' ? input : {};
  const file = inp.file_path ?? inp.path ?? inp.filePath ?? inp.notebook_path;
  const lower = n.toLowerCase();
  if (lower === 'read') return { name: n, kind: 'read', target: shortPath(file) };
  if (lower === 'edit' || lower === 'multiedit') return { name: n, kind: 'edit', target: shortPath(file) };
  if (lower === 'write') return { name: n, kind: 'write', target: shortPath(file) };
  if (/bash|powershell|shell|command|exec/.test(lower)) {
    const cmd = inp.command ?? inp.cmd ?? '';
    return { name: n, kind: 'bash', target: truncate(cleanText(Array.isArray(cmd) ? cmd.join(' ') : cmd), 80) };
  }
  if (lower === 'grep') {
    const where = inp.path ? ` (${shortPath(inp.path)})` : '';
    return { name: n, kind: 'grep', target: `"${truncate(cleanText(inp.pattern), 50)}"${where}` };
  }
  if (lower === 'glob') return { name: n, kind: 'glob', target: truncate(cleanText(inp.pattern), 70) };
  if (lower === 'agent' || lower === 'task') {
    const desc = truncate(cleanText(inp.description || inp.prompt), 80);
    const type = inp.subagent_type ? ` (${cleanText(inp.subagent_type)})` : '';
    return { name: n, kind: 'agent', target: desc + type };
  }
  const preview = Object.keys(inp).length ? truncate(cleanText(JSON.stringify(inp)).replace(/[{}"]/g, ''), 70) : '';
  return { name: n, kind: 'other', target: preview };
}

export function formatToolCall(name: string, input: any): string {
  const info = describeTool(name, input);
  switch (info.kind) {
    case 'read': return `${paint('yellow', '📖 OKUYOR')}: ${paint('gray', info.target)}`;
    case 'edit': return `${paint('yellow', '✏️ DÜZENLİYOR')}: ${paint('gray', info.target)}`;
    case 'write': return `${paint('yellow', '📝 YAZIYOR')}: ${paint('gray', info.target)}`;
    case 'bash': return `${paint('yellow', '💻 KOMUT')}: ${paint('gray', info.target)}`;
    case 'grep': return `${paint('yellow', '🔎 KOD ARAMA')}: ${paint('gray', info.target)}`;
    case 'glob': return `${paint('yellow', '📁 DOSYA LİSTELEME')}: ${paint('gray', info.target)}`;
    case 'agent':
      return paint('magenta', `${COLORS.bold}🤖 [ALT AJAN (SUBAGENT) BAŞLATILDI]: ${info.target}`);
    default:
      return `${paint('yellow', '⚡ ARAÇ')} ${paint('bold', info.name)}${info.target ? ': ' + paint('gray', info.target) : ''}`;
  }
}

export function formatToolCompleted(
  info: ToolInfo | undefined,
  output: unknown,
  isError: boolean,
  exitCode?: number
): string {
  const out = truncate(cleanText(output), 80);
  const code = exitCode !== undefined && exitCode !== null ? ` [kod: ${exitCode}]` : '';
  const kind = info?.kind ?? 'other';
  const target = info?.target || '';

  if (kind === 'agent') {
    const summary = out || '(tamamlandı)';
    return isError
      ? `${paint('red', '✖ ALT AJAN HATASI')}: ${paint('gray', summary)}`
      : paint('magenta', `${COLORS.bold}🤖 [ALT AJAN GÖREVİ BİTİRDİ]: ${summary}`);
  }
  if (isError) {
    const label = info ? `${info.name}${target ? ' ' + target : ''}` : 'araç';
    return `${paint('red', '✖ ARAÇ HATASI')} ▶ ${paint('bold', label)}${code}: ${paint('gray', out || '(hata)')}`;
  }

  const done: Record<ToolKind, string> = {
    read: 'OKUNDU', edit: 'DÜZENLENDİ', write: 'YAZILDI', bash: 'KOMUT TAMAMLANDI',
    grep: 'ARAMA BİTTİ', glob: 'LİSTELEME BİTTİ', agent: '', other: 'ARAÇ BİTTİ'
  };
  const label = done[kind];
  if (kind === 'read' || kind === 'edit' || kind === 'write') {
    return `${paint('green', `✔ ${label}`)}: ${paint('bold', target)}`;
  }
  const head = info && kind === 'other' ? `${label} ▶ ${paint('bold', info.name)}` : label;
  const detail = kind === 'bash' || kind === 'other' ? out : target;
  return `${paint('green', `✔ ${head}`)}${code}${detail ? ': ' + paint('gray', detail) : ''}`;
}

// Tek bir olayı terminale basar (canlı akış ve oturum incelemesi ortak kullanır).
interface ActiveMessageState {
  taskId: string;
  agent: string;
  isOpen: boolean;
}
const activeMessage: ActiveMessageState = { taskId: '', agent: '', isOpen: false };

export function closeMessageBlockIfNeeded(): void {
  if (activeMessage.isOpen) {
    console.log(paint('gray', '         └' + '─'.repeat(45)));
    activeMessage.isOpen = false;
  }
}

function printEvent(evt: TaskEvent, pendingTools: Map<string, ToolInfo>): void {
  const parentId = evt.data?.parentTaskId || evt.parentTaskId;
  const childPrefix = parentId ? paint('yellow', '   └─ ') : '';
  const time = childPrefix + paint('gray', hms(evt.timestamp));
  const agent = paint('cyan', `[${evt.agent.toUpperCase()}]`);

  if (evt.type !== 'message.delta') {
    closeMessageBlockIfNeeded();
  }

  switch (evt.type) {
    case 'task.started':
      console.log(`\n${time} ${agent} ${paint('green', '▶ GÖREV BAŞLADI')}: ${paint('bold', evt.data.prompt || '')}`);
      if (evt.sessionId) {
        console.log(`         ${paint('gray', '│')} Oturum ID: ${paint('yellow', evt.sessionId)}`);
      }
      if (evt.data.model) {
        console.log(`         ${paint('gray', '│')} Model: ${evt.data.model}`);
      }
      break;

    case 'tool.invoked': {
      const toolName = evt.data.name || 'tool';
      const toolId = evt.data.id || evt.data.toolUseId;
      if (toolId) {
        pendingTools.set(String(toolId), describeTool(toolName, evt.data.input));
        if (pendingTools.size > MAX_PENDING_TOOLS) {
          const oldest = pendingTools.keys().next().value;
          if (oldest !== undefined) pendingTools.delete(oldest);
        }
      }
      console.log(`${time} ${agent} ${formatToolCall(toolName, evt.data.input)}`);
      break;
    }

    case 'tool.completed': {
      const toolId = evt.data.toolUseId || evt.data.id;
      let info = toolId ? pendingTools.get(String(toolId)) : undefined;
      if (toolId) pendingTools.delete(String(toolId));
      if (!info && evt.data.name) info = describeTool(evt.data.name, {});
      console.log(`${time} ${agent} ${formatToolCompleted(info, evt.data.output, !!evt.data.isError, evt.data.exitCode)}`);
      break;
    }

    case 'message.delta': {
      const delta = evt.data.text || '';
      if (!delta.trim()) break;

      if (!activeMessage.isOpen || activeMessage.taskId !== evt.taskId) {
        closeMessageBlockIfNeeded();
        console.log(`${time} ${agent} ${paint('cyan', '💬 Yanıt:')}`);
        activeMessage.taskId = evt.taskId;
        activeMessage.agent = evt.agent;
        activeMessage.isOpen = true;
      }

      const lines = delta.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw.trim()) {
          console.log(paint('gray', '         │'));
          continue;
        }

        let formatted = raw;
        if (raw.startsWith('#')) {
          formatted = paint('bold', paint('yellow', raw));
        } else if (raw.trim().startsWith('- ') || raw.trim().startsWith('* ')) {
          formatted = paint('white', raw);
        } else if (raw.startsWith('```')) {
          formatted = paint('gray', raw);
        } else {
          formatted = paint('white', raw);
        }

        console.log(`         ${paint('gray', '│')} ${formatted}`);
      }
      break;
    }

    case 'usage.updated': {
      const u = evt.data.usage || {};
      console.log(`${time} ${agent} ${paint('magenta', '📊 TOKEN')}: Girdi: ${u.inputTokens || 0} · Önbellek: ${u.cachedTokens || 0} · Çıktı: ${u.outputTokens || 0}`);
      break;
    }

    case 'task.completed':
      console.log(`${time} ${agent} ${paint('green', '✔ GÖREV TAMAMLANDI')}`);
      console.log(paint('gray', '─'.repeat(80)));
      break;

    case 'task.failed':
      console.log(`${time} ${agent} ${paint('red', '✖ GÖREV BAŞARISIZ')}: ${evt.data.error}`);
      console.log(paint('gray', '─'.repeat(80)));
      break;

    case 'task.cancelled':
      console.log(`${time} ${agent} ${paint('yellow', '⏹ GÖREV İPTAL EDİLDİ')}: ${evt.data.reason}`);
      console.log(paint('gray', '─'.repeat(80)));
      break;
  }
}

// Oturum seçici durumu: canlı akış / seçim listesi / görev incelemesi.
type ViewMode = 'live' | 'picker' | 'inspect';
let viewMode: ViewMode = 'live';
let pickerTasks: TaskSummary[] = [];
const PICKER_LIMIT = 15;
let selectedIndex = 0;

export function getViewMode(): ViewMode {
  return viewMode;
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
}

function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'completed': return paint('green', '✔ Tamamlandı');
    case 'running':
    case 'pending': return paint('yellow', '▶ Çalışıyor');
    case 'cancelled': return paint('yellow', '⏹ İptal');
    default: return paint('red', '✖ Hata');
  }
}

function shortId(id: string | null | undefined, len: number): string {
  if (!id) return '-';
  return id.length > len ? id.slice(0, len) + '...' : id;
}

function clearScreen(): void {
  try {
    process.stdout.write('\x1b[H\x1b[2J');
  } catch {}
}

export const PAGE_SIZE = 7;
let scrollOffset = 0;

// Saf pencereleme: seçili öğeyi görünür tutan en küçük kaydırmayı hesaplar.
export function computeWindow(
  selected: number,
  offset: number,
  total: number,
  pageSize: number = PAGE_SIZE
): { offset: number; end: number; hasAbove: boolean; hasBelow: boolean } {
  let off = Math.max(0, offset);
  if (selected < off) off = selected;
  if (selected >= off + pageSize) off = selected - pageSize + 1;
  off = Math.max(0, Math.min(off, Math.max(0, total - pageSize)));
  const end = Math.min(total, off + pageSize);
  return { offset: off, end, hasAbove: off > 0, hasBelow: end < total };
}

export function getScrollOffset(): number {
  return scrollOffset;
}

// Seçili satırın indeksini liste sınırları içinde tutar (boş listede 0).
function clampSelection(): void {
  if (pickerTasks.length === 0) {
    selectedIndex = 0;
    return;
  }
  selectedIndex = Math.min(Math.max(0, selectedIndex), pickerTasks.length - 1);
}

export function getSelectedIndex(): number {
  return selectedIndex;
}

// Seçimi delta kadar kaydırır (döngüsel); liste boşsa güvenli no-op.
// clamp=true ise uçlarda durur (PageUp/PageDown), aksi halde döngüsel.
export function moveSelection(delta: number, clamp: boolean = false): void {
  const n = pickerTasks.length;
  if (n === 0 || !Number.isFinite(delta)) return;
  if (clamp) {
    selectedIndex = Math.min(Math.max(0, selectedIndex + delta), n - 1);
  } else {
    selectedIndex = (((selectedIndex + delta) % n) + n) % n;
  }
  renderSessionPicker();
}

// Seçimi mutlak bir indekse (liste sınırlarına kırpılarak) taşır; liste boşsa no-op.
export function jumpSelection(index: number): void {
  const n = pickerTasks.length;
  if (n === 0 || Number.isNaN(index)) return;
  selectedIndex = Math.min(Math.max(0, index), n - 1);
  renderSessionPicker();
}

// Yalnızca test için: seçici listesini doğrudan ayarlar (render etmez).
export function setPickerTasksForTest(tasks: TaskSummary[]): void {
  pickerTasks = tasks;
  selectedIndex = 0;
  scrollOffset = 0;
}

// Son görevleri yükler ve ok tuşlarıyla gezilebilir seçim moduna geçer.
export function showSessionPicker(): TaskSummary[] {
  viewMode = 'picker';
  try {
    pickerTasks = globalSqlite.getRecentTasks(PICKER_LIMIT);
  } catch {
    pickerTasks = [];
  }
  renderSessionPicker();
  return pickerTasks;
}

// Yüklü görev listesini sabit yükseklikte (en fazla 15 satır) çizer.
function renderSessionPicker(): void {
  clampSelection();
  const width = Math.max(40, (process.stdout.columns || 80) - 1);
  const total = pickerTasks.length;
  const win = computeWindow(selectedIndex, scrollOffset, total);
  scrollOffset = win.offset;
  const rule = (label = ''): string => {
    const head = label ? `─── ${label} ` : '';
    return paint('gray', head + '─'.repeat(Math.max(0, width - head.length)));
  };
  const lines: string[] = [];

  lines.push(truncate(` 🔭 AGENT OBSERVATORY · Oturum / Görev Seçici · Son ${total} görev`, width));
  lines.push(paint('cyan', '═'.repeat(width)));
  lines.push(win.hasAbove ? paint('gray', `   ▲ daha fazla (${win.offset} görev yukarıda)`) : '');

  if (total === 0) lines.push(paint('gray', ' Kayıtlı görev bulunamadı.'));
  for (let i = win.offset; i < win.end; i++) {
    const t = pickerTasks[i];
    const selected = i === selectedIndex;
    const running = t.status === 'running' || t.status === 'pending';
    const duration = formatDuration(running ? Date.now() - t.startTime : t.durationMs);
    const icon = t.status === 'completed' ? '✔' : running ? '▶' : t.status === 'cancelled' ? '⏹' : '✖';
    const prefix = `${selected ? ' ▶ ' : '   '}[${String(i + 1).padStart(2)}] ${hms(t.startTime).slice(0, 5)} [${t.agent.toUpperCase()}] ${icon} ${duration} │ `;
    const prompt = cleanText(t.prompt) || '(boş prompt)';
    const row = prefix + truncate(prompt, Math.max(4, width - prefix.length));
    if (selected) {
      lines.push(paint('bold', paint('cyan', row)));
    } else {
      const color = t.status === 'completed' ? 'green' : running ? 'yellow' : t.status === 'cancelled' ? 'yellow' : 'red';
      lines.push(row.replace(icon, paint(color, icon)));
    }
  }

  lines.push(win.hasBelow
    ? paint('gray', `   ▼ daha fazla (${total} görevden ${selectedIndex + 1}'üncüsü)`)
    : (total > 0 ? paint('gray', `   (${total} görevden ${selectedIndex + 1}'üncüsü)`) : ''));

  const sel = total > 0 ? pickerTasks[selectedIndex] : null;
  lines.push(rule('Seçili Görev Detayı'));
  lines.push(sel
    ? truncate(` ID: ${shortId(sel.taskId, 14)} │ Oturum: ${shortId(sel.sessionId, 8)} │ Model: ${sel.model || '-'}`, width)
    : ' -');
  lines.push(sel ? truncate(` Prompt: ${cleanText(sel.prompt) || '(boş prompt)'}`, width) : ' -');
  lines.push(paint('yellow', truncate('[↑ / ↓] Gezin · [Enter] İncele · [Esc / C] Canlı Akış · [Q] Çıkış', width)));

  clearScreen();
  process.stdout.write(lines.join('\n') + '\n');
}

// Seçici listesindeki n. (1 tabanlı) görevi açar; geçersizse false döner.
export function selectSession(n: number): boolean {
  if (!Number.isInteger(n) || n < 1 || n > pickerTasks.length) return false;
  selectedIndex = n - 1;
  inspectTask(pickerTasks[n - 1].taskId);
  return true;
}

// Enter: vurgulanan görevi inceler; liste boşsa no-op.
export function openSelected(): boolean {
  clampSelection();
  if (pickerTasks.length === 0) return false;
  inspectTask(pickerTasks[selectedIndex].taskId);
  return true;
}

// Seçici/inceleme modu tuş işleyicisi. 'live': canlı akışa dönülmeli, 'handled': işlendi, null: ilgisiz tuş.
// Ok tuşları yalnızca picker modunda çalışır.
export function handlePickerKey(key: string): 'live' | 'handled' | null {
  if (viewMode === 'picker') {
    if (key === '\u001b[A' || key === '\u001bOA' || key === 'k' || key === 'K') { moveSelection(-1); return 'handled'; }
    if (key === '\u001b[B' || key === '\u001bOB' || key === 'j' || key === 'J') { moveSelection(1); return 'handled'; }
    if (key === '\u001b[5~') { moveSelection(-PAGE_SIZE, true); return 'handled'; }
    if (key === '\u001b[6~') { moveSelection(PAGE_SIZE, true); return 'handled'; }
    if (key === '\u001b[H' || key === '\u001b[1~') { jumpSelection(0); return 'handled'; }
    if (key === '\u001b[F' || key === '\u001b[4~') { jumpSelection(pickerTasks.length - 1); return 'handled'; }
    if (key === '\r' || key === '\n') { openSelected(); return 'handled'; }
    if (/^[1-9]$/.test(key)) { selectSession(Number(key)); return 'handled'; }
    if (key === '\u001b' || key === 'c' || key === 'C') return 'live';
  } else if (viewMode === 'inspect') {
    if (key === 's' || key === 'S' || key === '\u001b') { showSessionPicker(); return 'handled'; }
    if (key === 'c' || key === 'C') return 'live';
  }
  return null;
}

// Bir görevin özetini ve tüm olaylarını adım adım basar.
export function inspectTask(taskId: string): void {
  viewMode = 'inspect';
  clearScreen();

  let task: TaskSummary | null = null;
  let events: TaskEvent[] = [];
  try {
    task = globalSqlite.getTask(taskId);
    events = globalSqlite.getEvents(taskId);
  } catch (err: any) {
    console.log(paint('red', `Hata: ${err.message}`));
  }

  console.log(paint('cyan', '═'.repeat(80)));
  console.log(` ${paint('bold', '🔍 GÖREV İNCELEME')} · ${paint('gray', taskId)}`);
  console.log(paint('cyan', '═'.repeat(80)));

  if (!task && events.length === 0) {
    console.log(paint('red', ' Görev bulunamadı.'));
  } else {
    if (task) {
      const running = task.status === 'running' || task.status === 'pending';
      const duration = formatDuration(running ? Date.now() - task.startTime : task.durationMs);
      console.log(` Ajan: ${paint('cyan', `[${task.agent.toUpperCase()}]`)} · Durum: ${statusLabel(task.status)} · Süre: ${duration} · Başlangıç: ${hms(task.startTime)}`);
      console.log(` Oturum ID: ${paint('yellow', task.sessionId || '-')}${task.model ? ` · Model: ${task.model}` : ''}`);
      if (task.parentTaskId) console.log(` Üst görev: ${paint('gray', task.parentTaskId)}`);
      console.log(` Prompt: ${paint('bold', cleanText(task.prompt))}`);
      if (task.usage) {
        console.log(` ${paint('magenta', '📊 TOKEN')}: Girdi: ${task.usage.inputTokens || 0} · Önbellek: ${task.usage.cachedTokens || 0} · Çıktı: ${task.usage.outputTokens || 0}`);
      }
      if (task.error) console.log(` ${paint('red', 'Hata')}: ${task.error}`);
    }
    console.log(paint('gray', '─'.repeat(80)));
    console.log(paint('bold', ` Olaylar (${events.length})`));

    const pending = new Map<string, ToolInfo>();
    for (const evt of events) printEvent(evt, pending);
    closeMessageBlockIfNeeded();

    if (task?.assistantText) {
      console.log(paint('cyan', '\n' + '═'.repeat(80)));
      console.log(paint('bold', ' Nihai Yanıt:'));
      console.log(task.assistantText);
    }
  }

  console.log(paint('cyan', '═'.repeat(80)));
  console.log(paint('yellow', '[Esc / S] Oturum Listesine Dön · [C] Canlı Akış'));
}

// Canlı moda dönüş: cli.ts gibi dış çağıranlar için.
export function resetViewMode(): void {
  viewMode = 'live';
}

export class TerminalUI {
  private store: EventStore;
  private pendingTools: Map<string, ToolInfo> = new Map();
  private boundOnEvent: (evt: TaskEvent) => void;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastSeq: number = 0;
  private seenEventIds: Set<string> = new Set();
  private keyListener: ((chunk: Buffer | string) => void) | null = null;

  constructor(store: EventStore = globalStore) {
    this.store = store;
    this.boundOnEvent = this.onEvent.bind(this);
  }

  start(): void {
    this.renderHeader();
    this.store.on('event', this.boundOnEvent);
  }

  startWatchMode(intervalMs: number = 300, clean: boolean = true): void {
    try {
      console.clear();
    } catch {}
    this.renderHeader();
    this.store.on('event', this.boundOnEvent);

    this.lastSeq = clean ? globalSqlite.getMaxSeq() : 0;
    if (!clean) {
      this.pollSqlite();
    }

    this.pollInterval = setInterval(() => {
      this.pollSqlite();
    }, intervalMs);

    this.setupKeyboard();
  }

  private loadHistory(): void {
    console.log(paint('yellow', '\n📜 [GEÇMİŞ] Tüm geçmiş olaylar veritabanından yükleniyor...\n'));
    this.seenEventIds.clear();
    this.lastSeq = 0;
    this.pollSqlite();
  }

  private setupKeyboard(): void {
    const stdin = process.stdin;
    if (!stdin.isTTY || this.keyListener) return;
    try {
      stdin.setRawMode(true);
    } catch {
      return;
    }
    stdin.resume();
    this.keyListener = (chunk: Buffer | string) => {
      const key = chunk.toString();
      if (key === '\u0003' || key === 'q' || key === 'Q') {
        this.stop();
        process.exit(0);
      } else if (viewMode !== 'live' && handlePickerKey(key) === 'handled') {
        // seçici/inceleme tuşu işlendi
      } else if (key === 's' || key === 'S') {
        showSessionPicker();
      } else if (key === 'c' || key === 'C' || key === '\u001b') {
        // Canlı akışa dön: seçici/inceleme modundan çık, ekranı temizle.
        viewMode = 'live';
        try {
          console.clear();
        } catch {}
        this.renderHeader();
      } else if (key === 'h' || key === 'H') {
        viewMode = 'live';
        this.loadHistory();
      }
    };
    stdin.on('data', this.keyListener);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.store.off('event', this.boundOnEvent);
    if (this.keyListener) {
      process.stdin.off('data', this.keyListener);
      this.keyListener = null;
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
      process.stdin.pause();
    }
  }

  private pollSqlite(): void {
    // Seçici/inceleme açıkken ekranı bozmamak için bekle; canlı moda dönünce birikenler basılır.
    if (viewMode !== 'live') return;
    try {
      const newEvents = globalSqlite.getEventsSinceSeq(this.lastSeq);
      for (const evt of newEvents) {
        if (!this.seenEventIds.has(evt.id)) {
          this.seenEventIds.add(evt.id);
          this.lastSeq = Math.max(this.lastSeq, evt.seq);
          this.renderEvent(evt);
        }
      }
    } catch {
      // Ignore concurrent file lock reads in SQLite WAL
    }
  }

  renderHeader(): void {
    console.log(paint('cyan', '═'.repeat(80)));
    console.log(` ${paint('bold', '🔭 AGENT OBSERVATORY')} · ${paint('green', 'Canlı Olay Akışı')} · ${paint('gray', hms())}`);
    console.log(` ${paint('gray', 'Kısayollar: [S] Oturum Seç · [H] Tüm Geçmiş · [C] Canlı Akış / Temizle · [Q] Çıkış')}`);
    console.log(paint('cyan', '═'.repeat(80)));
  }

  onEvent(evt: TaskEvent): void {
    if (viewMode !== 'live') return;
    if (this.seenEventIds.has(evt.id)) return;
    this.seenEventIds.add(evt.id);
    this.renderEvent(evt);
  }

  private renderEvent(evt: TaskEvent): void {
    printEvent(evt, this.pendingTools);
  }
}
