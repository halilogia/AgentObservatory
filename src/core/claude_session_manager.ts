import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Returns the path to the centralized claude_session_map.json file
 */
export function getClaudeSessionMapPath(): string {
  const home = os.homedir();
  return path.join(home, '.gemini', 'antigravity', 'claude_session_map.json');
}

/**
 * Resolves the active Antigravity conversation ID from environment or brain directory
 */
export function getActiveAntigravitySessionId(): string {
  if (process.env.ANTIGRAVITY_CONVERSATION_ID && process.env.ANTIGRAVITY_CONVERSATION_ID.trim()) {
    return process.env.ANTIGRAVITY_CONVERSATION_ID.trim();
  }
  if (process.env.GEMINI_CONVERSATION_ID && process.env.GEMINI_CONVERSATION_ID.trim()) {
    return process.env.GEMINI_CONVERSATION_ID.trim();
  }
  if (process.env.CONVERSATION_ID && process.env.CONVERSATION_ID.trim()) {
    return process.env.CONVERSATION_ID.trim();
  }
  try {
    const home = os.homedir();
    const brainDir = path.join(home, '.gemini', 'antigravity', 'brain');
    if (fs.existsSync(brainDir)) {
      const dirs = fs
        .readdirSync(brainDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.length > 20 && !d.name.startsWith('.'))
        .map((d) => ({
          name: d.name,
          mtime: fs.statSync(path.join(brainDir, d.name)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);
      if (dirs.length > 0) {
        return dirs[0].name;
      }
    }
  } catch (err) {
    console.debug('[ClaudeSessionManager] Failed to detect active conversation from brain directory:', err);
  }
  return 'f2594543-f830-4347-be57-5c5aa15a4450';
}

/**
 * Resolves an active Claude Code session ID for the given project directory (cwd)
 * If explicitSessionId is provided (and not 'auto'), it is respected directly.
 */
export function resolveClaudeSessionId(cwd: string, explicitSessionId?: string | null): string | null {
  if (explicitSessionId && explicitSessionId !== 'auto' && explicitSessionId !== 'new') {
    return explicitSessionId;
  }
  if (explicitSessionId === 'new') {
    return null; // Explicit request to start a fresh session
  }
  try {
    const mapFile = getClaudeSessionMapPath();
    if (fs.existsSync(mapFile)) {
      const data = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
      const activeSession = getActiveAntigravitySessionId();
      const normCwd = path.resolve(cwd).toLowerCase();
      const projectMapping = data[activeSession]?.projects?.[normCwd];
      if (projectMapping?.claude_session_id) {
        return projectMapping.claude_session_id;
      }
    }
  } catch (err) {
    console.debug('[ClaudeSessionManager] Lookup error:', err);
  }
  return null;
}

/**
 * Records or updates a Claude Code session ID mapping for the given project directory (cwd)
 */
export function updateClaudeSessionId(cwd: string, claudeSessionId: string, title?: string): void {
  try {
    const mapFile = getClaudeSessionMapPath();
    let data: Record<string, any> = {};
    if (fs.existsSync(mapFile)) {
      try {
        data = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
      } catch (parseErr) {
        console.debug('[ClaudeSessionManager] Failed to parse existing map file, initializing fresh:', parseErr);
      }
    }
    const activeSession = getActiveAntigravitySessionId();
    if (!data[activeSession]) {
      data[activeSession] = {
        projects: {},
        updated_at: new Date().toISOString()
      };
    }
    if (!data[activeSession].projects) {
      data[activeSession].projects = {};
    }

    const normCwd = path.resolve(cwd).toLowerCase();
    data[activeSession].projects[normCwd] = {
      claude_session_id: claudeSessionId,
      raw_cwd: cwd,
      title: title || path.basename(cwd),
      updated_at: new Date().toISOString()
    };
    data[activeSession].updated_at = new Date().toISOString();

    fs.mkdirSync(path.dirname(mapFile), { recursive: true });
    fs.writeFileSync(mapFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[ClaudeSessionManager] Update error:', err);
  }
}
