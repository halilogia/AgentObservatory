// web_capabilities: CLI yetenekleri yalnızca ad ve kısa açıklama olarak okunur; gizli değerler döndürülmez
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frontmatter, readCapabilities } from '../src/commands/web_capabilities.ts';

const w = (f: string, t: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-cap-home-'));
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-cap-proj-'));

// frontmatter: tek satır, tırnaklı ve çok satırlı (>) açıklama
assert.deepStrictEqual(frontmatter('---\nname: a\ndescription: "kısa açıklama"\n---\n# x'), { name: 'a', description: 'kısa açıklama' });
assert.strictEqual(frontmatter('---\nname: b\ndescription: >\n  birinci satır\n  ikinci satır\nother: 1\n---').description, 'birinci satır ikinci satır');
assert.deepStrictEqual(frontmatter('başlık yok'), {});

// Claude
w(path.join(home, '.claude/skills/swarm/SKILL.md'), '---\nname: swarm\ndescription: işi dağıt\n---\n');
w(path.join(home, '.claude/skills/adsiz/SKILL.md'), '# frontmatter yok');
w(path.join(home, '.claude/agents/cli-codex.md'), '---\nname: cli-codex\ndescription: Codex\'e devret\n---\n');
w(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'universal-memory': { command: 'x', env: { TOKEN: 'GIZLI-DEGER' } } }, projects: { [proj]: { mcpServers: { yerel: { command: 'y' } } } } }));
w(path.join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'eklenti@market': [] } }));
w(path.join(proj, '.claude/skills/proje-becerisi/SKILL.md'), '---\nname: proje-becerisi\ndescription: yalnızca bu projede\n---\n');
// Codex
w(path.join(home, '.codex/config.toml'), '[mcp_servers.godot_mcp]\ncommand = "x"\n[mcp_servers.godot_mcp.env]\nKEY = "GIZLI"\n[mcp_servers."web-x"]\nurl = "https://a"\n');
// OpenCode (JSONC: yorum, sondaki virgül, URL içinde //)
w(path.join(home, '.config/opencode/opencode.jsonc'), '{\n  // yorum\n  "mcp": { "ctx": { "type": "remote", "url": "https://x.dev/mcp" }, },\n  "agent": { "gozcu": {} }\n}');
// Antigravity
w(path.join(home, '.gemini/config/skills/safe-git/SKILL.md'), '---\nname: safe-git\ndescription: güvenli git\n---\n');
w(path.join(home, '.gemini/config/mcp_config.json'), JSON.stringify({ mcpServers: { playwright: { env: { K: 'GIZLI' } } } }));

const c = readCapabilities(home, proj);
assert.deepStrictEqual(c.claude.skills.map((s) => s.name), ['adsiz', 'proje-becerisi', 'swarm']);
assert.strictEqual(c.claude.skills.find((s) => s.name === 'swarm')?.desc, 'işi dağıt');
assert.strictEqual(c.claude.skills.find((s) => s.name === 'proje-becerisi')?.scope, 'project');
assert.deepStrictEqual(c.claude.agents.map((s) => s.name), ['cli-codex']);
assert.deepStrictEqual(c.claude.mcp.map((s) => s.name), ['universal-memory', 'yerel']);
assert.deepStrictEqual(c.claude.plugins.map((s) => s.name), ['eklenti@market']);
assert.deepStrictEqual(c.codex.mcp.map((s) => s.name), ['godot_mcp', 'web-x'], 'env alt tablosu MCP sayılmaz');
assert.deepStrictEqual(c.opencode.mcp.map((s) => s.name), ['ctx']);
assert.deepStrictEqual(c.opencode.agents.map((s) => s.name), ['build', 'gozcu', 'plan']);
assert.deepStrictEqual(c.agy.skills.map((s) => s.name), ['safe-git']);
assert.deepStrictEqual(c.agy.mcp.map((s) => s.name), ['playwright']);
assert.ok(!JSON.stringify(c).includes('GIZLI'), 'gizli değerler asla dönmez');
// proje yoksa proje kapsamlı öğeler gelmez
assert.ok(!readCapabilities(home).claude.skills.some((s) => s.scope === 'project'));
// boş ev klasörü hata vermez
assert.deepStrictEqual(readCapabilities(fs.mkdtempSync(path.join(os.tmpdir(), 'obs-cap-empty-'))).codex.skills, []);
console.log('✔ web_capabilities: skill/ajan/komut/MCP/eklenti adları, kapsam, gizli değer sızdırmama');
