// Rebuild the exact published downloads without changing source revisions.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { zipSync } from 'fflate';
const root = path.resolve(import.meta.dirname, '..'), cache = path.join(root, '.cache');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'registry/catalog.json'), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
await Promise.all(['archives', 'bundles', 'documents'].map(dir => fs.mkdir(path.join(cache, dir), { recursive: true })));
const groups = new Map();
for (const skill of catalog.skills) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'registry/manifests', `${skill.id}.json`), 'utf8'));
  const existing = await fs.readFile(path.join(cache, 'bundles', `${skill.id}.zip`)).catch(() => null);
  const document = await fs.readFile(path.join(cache, 'documents', `${skill.id}.md`)).catch(() => null);
  if (existing && document && digest(existing) === manifest.archiveSha256 && digest(document) === skill.sha256) continue;
  const key = `${skill.repo}@${skill.revision}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(manifest);
}
for (const [key, manifests] of groups) {
  const { repo, revision } = manifests[0].skill;
  const archive = path.join(cache, 'archives', `${repo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${revision}.tar.gz`);
  console.log(`Restoring ${manifests.length} bundles from ${key}`);
  if (!(await fs.stat(archive).catch(() => null))) {
    const response = await fetch(`https://codeload.github.com/${repo}/tar.gz/${revision}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Source archive unavailable: ${repo} (${response.status})`);
    let size = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _, done) { size += chunk.length; done(size > 250_000_000 ? new Error('Archive too large') : null, chunk); } }), createWriteStream(`${archive}.part`));
    await fs.rename(`${archive}.part`, archive);
  }
  const needed = new Set(manifests.flatMap(manifest => manifest.files.map(file => file.sourcePath)));
  const source = new Map();
  await tar.t({ file: archive, onReadEntry(entry) {
    const name = entry.path.split('/').slice(1).join('/');
    if (!needed.has(name) || entry.type !== 'File' || entry.size > 4_000_000) { entry.resume(); return; }
    const chunks = []; entry.on('data', chunk => chunks.push(chunk)); entry.on('end', () => source.set(name, Buffer.concat(chunks)));
  } });
  for (const manifest of manifests) {
    const { skill } = manifest, bundle = {};
    for (const file of manifest.files) {
      const data = source.get(file.sourcePath);
      if (!data || data.length !== file.bytes || digest(data) !== file.sha256) throw new Error(`Source integrity failure: ${skill.id}/${file.path}`);
      bundle[`${skill.name}/${file.path}`] = [data, { os: 3, attrs: (file.mode || 0o644) << 16 }];
    }
    bundle[`${skill.name}/SKILL-SOURCE.json`] = Buffer.from(JSON.stringify({ ...skill, instruction: 'Original upstream files. Supporting scripts are not executed by the library.' }, null, 2));
    const zip = zipSync(bundle, { level: 6, mtime: new Date('2020-01-01T00:00:00Z') });
    if (digest(zip) !== manifest.archiveSha256) throw new Error(`Archive reproducibility failure: ${skill.id}`);
    await fs.writeFile(path.join(cache, 'bundles', `${skill.id}.zip`), zip);
    await fs.writeFile(path.join(cache, 'documents', `${skill.id}.md`), source.get(manifest.files.find(file => file.path === 'SKILL.md').sourcePath));
  }
}
console.log(`All ${catalog.total} downloads match the pinned catalog.`);
