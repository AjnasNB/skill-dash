import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { parse } from 'smol-toml';
import { assertNoLinks } from './install.mjs';
import { MCP_URL } from './mcp-tools.mjs';

export const HOSTS = ['codex','claude','cursor','antigravity'];
export function connectionPlan(host, { global = false, home = os.homedir(), cwd = process.cwd() } = {}) {
  if (!HOSTS.includes(host)) throw new Error('Choose --host codex, claude, cursor, antigravity, or all.');
  const base = path.resolve(global ? home : cwd);
  const relative = host === 'codex' ? '.codex/config.toml' : host === 'claude' ? global ? '.claude.json' : '.mcp.json' : host === 'cursor' ? '.cursor/mcp.json' : global ? '.gemini/config/mcp_config.json' : '.agents/mcp_config.json';
  return { host, scope: global ? 'user' : 'project', path: path.join(base,relative), url: MCP_URL };
}
const owns = entry => entry?.url === MCP_URL || entry?.serverUrl === MCP_URL || entry?.args?.some(arg => typeof arg === 'string' && (arg === 'agent-skill-library' || arg.startsWith('agent-skill-library@')));
function checkEntry(entry) {
  if (!entry) return;
  if (!owns(entry)) throw new Error('An unrelated server already uses the skill-library name. Rename it deliberately before connecting SkillDash.');
  if (entry.disabled === true || entry.enabled === false) throw new Error('The SkillDash server is disabled. Re-enable it deliberately before reconnecting.');
  if (entry.disabledTools?.length || entry.disabled_tools?.length || entry.enabled_tools || entry.headers || entry.env || entry.bearer_token_env_var) throw new Error('The SkillDash entry has custom policy or credentials. Preserve and review it before changing the transport.');
}
export function mergeConnection(text, host) {
  if (host === 'codex') {
    const value = text.trim() ? parse(text) : {}, entry = value.mcp_servers?.['skill-library'];
    checkEntry(entry);
    if (entry?.url === MCP_URL) return text;
    if (entry) throw new Error('An existing local Skill Library server is configured. Preserve it or remove that entry explicitly before switching to HTTP.');
    const next = text.trimEnd() + '\n\n[mcp_servers.skill-library]\nurl = "' + MCP_URL + '"\nstartup_timeout_sec = 20\ntool_timeout_sec = 45\n';
    parse(next); return next;
  }
  const value = text.trim() ? JSON.parse(text) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.mcpServers && (typeof value.mcpServers !== 'object' || Array.isArray(value.mcpServers))) throw new Error('Invalid MCP configuration object.');
  const entry = value.mcpServers?.['skill-library']; checkEntry(entry);
  const expected = host === 'antigravity' ? { serverUrl: MCP_URL } : host === 'claude' ? { type: 'http', url: MCP_URL } : { url: MCP_URL };
  if (entry && JSON.stringify(entry) === JSON.stringify(expected)) return text;
  value.mcpServers ||= {}; value.mcpServers['skill-library'] = expected;
  return JSON.stringify(value,null,2) + '\n';
}
async function writeConnection(plan, { dryRun = false } = {}) {
  await assertNoLinks(plan.path);
  const stat = await fs.lstat(plan.path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (stat && (!stat.isFile() || stat.nlink > 1 || stat.size > 2000000)) throw new Error('MCP config must be a bounded regular file without links.');
  const before = stat ? await fs.readFile(plan.path,'utf8') : '', after = mergeConnection(before,plan.host);
  if (before === after) return { ...plan, status: 'already-connected' };
  if (dryRun) return { ...plan, status: 'planned' };
  const directory = path.dirname(plan.path);
  await fs.mkdir(directory,{ recursive: true }); await assertNoLinks(plan.path);
  const stage = path.join(directory,`.skilldash-config-${randomUUID()}.tmp`);
  const backup = stat ? plan.path + `.skilldash-${randomUUID()}.bak` : null;
  try {
    await fs.writeFile(stage,after,{ flag: 'wx', mode: stat ? stat.mode & 0o777 : 0o600 });
    const current = await fs.readFile(plan.path,'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (current !== (stat ? before : null)) throw new Error('The config changed during setup. Retry after the other editor finishes.');
    await assertNoLinks(plan.path);
    if (backup) await fs.writeFile(backup,before,{ flag: 'wx', mode: 0o600 });
    await fs.rename(stage,plan.path);
    return { ...plan, status: 'connected', backup, restart: 'Restart or refresh this host to load its MCP configuration.' };
  } finally { await fs.rm(stage,{ force: true }); }
}
export async function connectHosts(options = {}) {
  const hosts = !options.host || options.host === 'all' ? HOSTS : options.host.split(',');
  const plans = hosts.map(host => connectionPlan(host.trim(),options));
  // Validate every selected file before changing any of them.
  for (const plan of plans) await writeConnection(plan,{ dryRun: true });
  const results = [];
  for (const plan of plans) results.push(await writeConnection(plan,options));
  return results;
}

export async function inspectConnections(options = {}) {
  const hosts = !options.host || options.host === 'all' ? HOSTS : options.host.split(',');
  const results = [];
  for (const host of hosts) {
    const plan = connectionPlan(host.trim(),options);
    await assertNoLinks(plan.path);
    const stat = await fs.lstat(plan.path).catch(error => { if(error.code==='ENOENT')return null;throw error; });
    if(!stat){results.push({...plan,status:'not-configured'});continue;}
    if(!stat.isFile()||stat.nlink>1||stat.size>2000000)throw new Error('Unsafe MCP configuration file.');
    const text = await fs.readFile(plan.path,'utf8'), value = host === 'codex' ? parse(text) : JSON.parse(text);
    const entry = (host === 'codex' ? value.mcp_servers : value.mcpServers)?.['skill-library'];
    results.push({...plan,status: !entry ? 'not-configured' : entry.enabled === false || entry.disabled === true ? 'disabled' : (entry.url || entry.serverUrl) === MCP_URL ? 'configured' : 'different-transport'});
  }
  return results;
}
