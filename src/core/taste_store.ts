import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

export interface TasteRule {
  category: string;
  text: string;
  confidence: number;
  sourceFile: string;
}

export interface TasteHistoryItem {
  timestamp: number;
  sessionId: string;
  agent: string;
  prompt: string;
  has_preference: boolean;
  category?: string;
  preference?: string;
  confidence?: number;
  reason?: string;
}

export class TasteStore extends EventEmitter {
  private tasteDir: string;
  private rootTasteFile: string;
  private rules: TasteRule[] = [];
  private watcher: fs.FSWatcher | null = null;

  constructor(customDir?: string) {
    super();
    this.tasteDir = customDir || path.join(os.homedir(), '.gemini', 'config', 'taste');
    this.rootTasteFile = path.join(this.tasteDir, 'taste.md');
    this.reload();
  }

  public getRules(): TasteRule[] {
    return [...this.rules];
  }

  public getCategories(): string[] {
    const cats = new Set(this.rules.map(r => r.category));
    return Array.from(cats);
  }

  public getSessionTastes(sessionId: string | null | undefined): TasteHistoryItem[] {
    if (!sessionId) return [];
    const historyFile = path.join(this.tasteDir, 'taste_history.jsonl');
    if (!fs.existsSync(historyFile)) return [];

    const results: TasteHistoryItem[] = [];
    const sid = sessionId.trim().toLowerCase();

    try {
      const content = fs.readFileSync(historyFile, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item: TasteHistoryItem = JSON.parse(line);
          const itemSid = (item.sessionId || '').toLowerCase();
          if (
            item.has_preference &&
            (itemSid === sid || itemSid.startsWith(sid) || sid.startsWith(itemSid))
          ) {
            results.push(item);
          }
        } catch (err) {
          if (process.env.DEBUG_TASTE) console.error('[TasteStore] History item parse error:', err);
        }
      }
    } catch (err) {
      if (process.env.DEBUG_TASTE) console.error('[TasteStore] History file read error:', err);
    }

    return results;
  }

  public reload(): void {
    const newRules: TasteRule[] = [];

    if (!fs.existsSync(this.tasteDir)) {
      this.rules = [];
      return;
    }

    // 1. Ana taste.md'yi oku
    if (fs.existsSync(this.rootTasteFile)) {
      try {
        const content = fs.readFileSync(this.rootTasteFile, 'utf-8');
        newRules.push(...this.parseContent(content, this.rootTasteFile));
      } catch (err) {
        if (process.env.DEBUG_TASTE) console.error('[TasteStore] Root file read error:', err);
      }
    }

    // 2. Alt kategori klasörlerindeki taste.md dosyalarını oku
    try {
      const entries = fs.readdirSync(this.tasteDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subFile = path.join(this.tasteDir, entry.name, 'taste.md');
          if (fs.existsSync(subFile)) {
            try {
              const content = fs.readFileSync(subFile, 'utf-8');
              newRules.push(...this.parseContent(content, subFile, entry.name));
            } catch (err) {
              if (process.env.DEBUG_TASTE) console.error('[TasteStore] Subcategory read error:', err);
            }
          }
        }
      }
    } catch (err) {
      if (process.env.DEBUG_TASTE) console.error('[TasteStore] Readdir error:', err);
    }

    this.rules = newRules;
    this.emit('change', this.rules);
  }

  public watch(): void {
    if (this.watcher) return;
    if (!fs.existsSync(this.tasteDir)) {
      try {
        fs.mkdirSync(this.tasteDir, { recursive: true });
      } catch (err) {
        if (process.env.DEBUG_TASTE) console.error('[TasteStore] Mkdir error:', err);
        return;
      }
    }

    try {
      this.watcher = fs.watch(this.tasteDir, { recursive: true }, () => {
        this.reload();
      });
    } catch (err) {
      if (process.env.DEBUG_TASTE) console.error('[TasteStore] Watch error:', err);
    }
  }

  public stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  public deleteRule(category: string, text: string): boolean {
    let found = false;
    for (const rule of this.rules) {
      if (rule.category.toLowerCase() === category.toLowerCase() && rule.text === text) {
        found = true;
        this.removeFromFile(rule.sourceFile, rule.text);
        break;
      }
    }
    if (found) {
      this.reload();
    }
    return found;
  }

  private removeFromFile(filePath: string, ruleText: string): void {
    if (!fs.existsSync(filePath)) return;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const filtered = lines.filter(l => !l.includes(ruleText));
      fs.writeFileSync(filePath, filtered.join('\n'), 'utf-8');
    } catch (err) {
      if (process.env.DEBUG_TASTE) console.error('[TasteStore] Remove from file error:', err);
    }
  }

  private parseContent(content: string, filePath: string, defaultCategory = 'Taste'): TasteRule[] {
    const rules: TasteRule[] = [];
    const lines = content.split('\n');
    let currentCategory = defaultCategory;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        currentCategory = trimmed.slice(2).trim();
      } else if (trimmed.startsWith('- ') && !trimmed.startsWith('- See ')) {
        const item = trimmed.slice(2).trim();
        const confMatch = item.match(/Confidence:\s*([0-9.]+)/i);
        let conf = 0.80;
        let text = item;

        if (confMatch) {
          conf = parseFloat(confMatch[1]);
          text = item.replace(/\s*Confidence:\s*[0-9.]+/i, '').trim();
          if (text.endsWith('.')) text = text.slice(0, -1);
        }

        rules.push({
          category: currentCategory,
          text,
          confidence: conf,
          sourceFile: filePath
        });
      }
    }

    return rules;
  }
}

export const globalTasteStore = new TasteStore();
