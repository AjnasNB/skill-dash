import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

const digest = data => createHash('sha256').update(data).digest('hex');
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || /[\\:\x00-\x1f]/.test(value)) return false;
  return !value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
export async function assertNoLinks(target) {
  const absolute = path.resolve(target);
  let cursor = path.parse(absolute).root;
  for (const part of path.relative(cursor, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error(`Refusing a linked installation path: ${cursor}`);
  }
}
function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}
async function removeOwnedTemporary(parent, target) {
  if (!inside(parent, target) || !path.basename(target).startsWith('.skill-library-')) throw new Error('Invalid temporary directory');
  await assertNoLinks(target);
  await fs.rm(target, { recursive: true, force: true });
}
export function targetRoot(agent, options = {}) {
  const { global = false, cwd = process.cwd(), home = os.homedir(), platform = process.platform, appData = process.env.APPDATA, deltaHome = process.env.DELTA_DATA_DIR } = options;
  if (agent === 'codex') return path.resolve(global ? home : cwd, '.agents', 'skills');
  if (agent === 'claude') return path.resolve(global ? home : cwd, '.claude', 'skills');
  if (agent === 'delta') {
    if (!global) throw new Error('Delta has a user library. Add --global for Delta installation.');
    const data = deltaHome || (platform === 'win32' ? path.join(appData || path.join(home, 'AppData', 'Roaming'), 'Delta Harness') :
      platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Delta Harness') : path.join(home, '.config', 'Delta Harness'));
    return path.resolve(data, 'skills');
  }
  throw new Error('Choose --agent codex, claude, delta, or all.');
}
export function planInstall(skill, options = {}) {
  if (!skill || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) || skill.name.length > 64 || skill.name === 'synced') throw new Error('Skill name is not portable.');
  const root = targetRoot(options.agent || 'codex', options);
  const destination = path.join(root, skill.name);
  if (!inside(root, destination)) throw new Error('Invalid destination.');
  return { id: skill.id, name: skill.name, agent: options.agent || 'codex', root, destination, revision: skill.revision, files: skill.fileCount, bytes: skill.bytes };
}
export function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 600) throw new Error('Invalid skill manifest.');
  const skill = manifest.skill;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill?.repo || '') || !/^[a-f0-9]{40}$/.test(skill?.revision || '')) throw new Error('Source must be pinned to a GitHub commit.');
  const names = new Set();
  let size = 0;
  for (const file of manifest.files) {
    if (!safeRelative(file.path) || !safeRelative(file.sourcePath) || !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isInteger(file.bytes) || file.bytes < 0 || file.bytes > 4_000_000 ||
      file.mode !== undefined && ![0o644, 0o755].includes(file.mode)) throw new Error('Unsafe file in manifest.');
    if (file.path.toLowerCase() === '.skill-library.json' || names.has(file.path.toLowerCase())) throw new Error('Colliding manifest paths.');
    names.add(file.path.toLowerCase());
    const expected = `https://raw.githubusercontent.com/${skill.repo}/${skill.revision}/${file.sourcePath.split('/').map(encodeURIComponent).join('/')}`;
    if (file.url !== expected) throw new Error('Unexpected skill download URL.');
    size += file.bytes;
  }
  if (size > 24_000_000 || !manifest.files.some(f => f.path === 'SKILL.md')) throw new Error('Skill is incomplete or too large.');
}
export async function fetchVerifiedFile(file, fetcher = fetch) {
  const response = await fetcher(file.url, { redirect: 'error', signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'agent-skill-library' } });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${file.path}`);
  if (Number(response.headers.get('content-length')) > file.bytes) throw new Error(`Unexpected size: ${file.path}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > file.bytes) { await reader.cancel(); throw new Error(`Unexpected size: ${file.path}`); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  if (buffer.length !== file.bytes || digest(buffer) !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
  return buffer;
}
async function enumerate(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Existing skill contains a symbolic link.');
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await enumerate(path.join(directory, entry.name), name));
    else if (entry.isFile()) result.push(name);
    else throw new Error('Existing skill contains a special file.');
  }
  return result;
}
async function installFiles(skill, descriptors, getFile, options = {}) {
  const plan = planInstall(skill, options);
  await assertNoLinks(plan.root);
  await assertNoLinks(plan.destination);
  const current = await fs.lstat(plan.destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  let previous;
  if (current) {
    if (!current.isDirectory()) throw new Error(`Destination is not a directory: ${plan.destination}`);
    previous = JSON.parse(await fs.readFile(path.join(plan.destination, '.skill-library.json'), 'utf8').catch(() => { throw new Error(`A skill already exists at ${plan.destination}. It is not managed by Skill Library; choose another location.`); }));
    if (previous.id !== skill.id) throw new Error(`A different skill source owns ${plan.destination}. Remove it explicitly before switching sources.`);
    if (!Array.isArray(previous.files) || previous.files.some(file => !safeRelative(file.path))) throw new Error('Invalid installation record.');
    const actual = await enumerate(plan.destination);
    const managed = new Set(['.skill-library.json', ...previous.files.map(file => file.path)]);
    if (actual.some(file => !managed.has(file))) throw new Error('This skill contains extra local files. Preserve or move them before replacing it.');
    let changed = actual.length !== managed.size;
    for (const file of previous.files) {
      const data = await fs.readFile(path.join(plan.destination, file.path)).catch(() => null);
      if (!data || digest(data) !== file.sha256) changed = true;
    }
    if (changed && !options.force) throw new Error('The installed skill was edited locally. Use --force only after preserving your changes.');
    const sameFiles = previous.files.length === descriptors.length && descriptors.every(file => previous.files.some(old => old.path === file.path && old.sha256 === file.sha256));
    if (!changed && previous.revision === skill.revision && sameFiles) return { ...plan, status: 'already-installed' };
    if (!options.force) throw new Error('A different revision is installed. Inspect the new source and use --force to replace the managed files.');
  }
  if (options.dryRun) return { ...plan, status: 'planned' };
  await fs.mkdir(plan.root, { recursive: true });
  await assertNoLinks(plan.root);
  const parent = path.dirname(plan.root);
  const stage = path.join(parent, `.skill-library-stage-${randomUUID()}`);
  const backup = path.join(parent, `.skill-library-backup-${randomUUID()}`);
  await fs.mkdir(stage);
  let backedUp = false, committed = false;
  try {
    let index = 0;
    const worker = async () => {
      while (index < descriptors.length) {
        const file = descriptors[index++];
        if (!safeRelative(file.path) || !inside(stage, path.join(stage, file.path))) throw new Error('Unsafe skill path.');
        const bytes = await getFile(file);
        if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
        const target = path.join(stage, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes, { flag: 'wx', mode: file.mode || 0o644 });
      }
    };
    const results = await Promise.allSettled(Array.from({ length: Math.min(6, descriptors.length) }, worker));
    const error = results.find(result => result.status === 'rejected');
    if (error) throw error.reason;
    await fs.writeFile(path.join(stage, '.skill-library.json'), JSON.stringify({ schemaVersion: 1, id: skill.id, repo: skill.repo, revision: skill.revision, installedAt: new Date().toISOString(), files: descriptors.map(({ path, sha256 }) => ({ path, sha256 })) }, null, 2), { flag: 'wx' });
    await assertNoLinks(plan.destination);
    if (current) { await fs.rename(plan.destination, backup); backedUp = true; }
    else if (await fs.lstat(plan.destination).catch(() => null)) throw new Error('The destination appeared during installation. Try again.');
    try { await fs.rename(stage, plan.destination); committed = true; }
    catch (error) { if (backedUp) { await fs.rename(backup, plan.destination); backedUp = false; } throw error; }
    if (backedUp) await removeOwnedTemporary(parent, backup);
    return { ...plan, status: 'installed' };
  } finally {
    if (!committed) await removeOwnedTemporary(parent, stage);
  }
}
export async function installSkill(manifest, options = {}) {
  validateManifest(manifest);
  return installFiles(manifest.skill, manifest.files, file => fetchVerifiedFile(file, options.fetcher), options);
}
export async function installDiscovery(text, options = {}) {
  const data = Buffer.from(text);
  const descriptor = { path: 'SKILL.md', sha256: digest(data), bytes: data.length };
  return installFiles({ id: 'skill-library-discovery', name: 'skill-library', repo: 'AjnasNB/skill-dash', revision: digest(data), fileCount: 1, bytes: data.length }, [descriptor], async () => data, options);
}
export async function listInstalled(options = {}) {
  const root = targetRoot(options.agent || 'codex', options);
  await assertNoLinks(root);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const marker = await fs.readFile(path.join(root, entry.name, '.skill-library.json'), 'utf8').catch(() => null);
    if (marker) { try { const { id, revision, installedAt } = JSON.parse(marker); result.push({ id, revision, installedAt, path: path.join(root, entry.name) }); } catch {} }
  }
  return result;
}
