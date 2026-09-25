import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { parse } from 'yaml';
import { createSkillArchive } from './skill-archive.mjs';
import { categoryFor, words } from '../lib/search.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'registry/sources.json'), 'utf8'));
const cache = path.join(root, '.cache');
await Promise.all(['archives', 'bundles', 'documents', 'metadata'].map(dir => fs.mkdir(path.join(cache, dir), { recursive: true })));
await fs.mkdir(path.join(root, 'registry/manifests'), { recursive: true });
const staging = await fs.mkdtemp(path.join(cache, 'sync-'));
await Promise.all(['manifests', 'bundles', 'documents'].map(dir => fs.mkdir(path.join(staging, dir))));
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
}
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const allowedPath = value => value.length < 500 && !value.includes('\\') && !value.includes(':') &&
  !value.split('/').some(part => !part || part === '..' || part === '.' || ['.git', 'node_modules', '__pycache__'].includes(part) ||
    /^\.env(?:\.|$)/i.test(part) || ['.npmrc', '.netrc', '.pypirc'].includes(part));
const licenseName = name => /^(license|copying)(?:[._-].*)?$/i.test(path.posix.basename(name));
const noticeName = name => /^notice(?:[._-].*)?$/i.test(path.posix.basename(name));
function licenseType(text = '') {
  if (/Apache License|SPDX-License-Identifier:\s*Apache-2\.0/i.test(text)) return 'Apache-2.0';
  if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/Redistribution and use in source and binary forms/.test(text)) return /Neither the name/.test(text) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  if (/ISC License|Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/.test(text)) return 'ISC';
  if (/CC0 1\.0 Universal|creativecommons.org\/publicdomain\/zero/.test(text)) return 'CC0-1.0';
  if (/Mozilla Public License.*2\.0/s.test(text)) return 'MPL-2.0';
  if (/GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(text)) return 'GPL-3.0';
  if (/GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/.test(text)) return 'AGPL-3.0';
  return null;
}
async function github(endpoint) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://api.github.com/${endpoint}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-skill-library-catalog', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`GitHub ${response.status} for ${endpoint}`);
      return await response.json();
    } catch (error) { failure = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); }
  }
  throw failure;
}
async function acquire(source, repo, revision) {
  const key = `${slug(repo.full_name)}-${revision}`;
  const archive = path.join(cache, 'archives', `${key}.tar.gz`);
  if (!(await fs.stat(archive).catch(() => null))) {
    console.log(`Downloading ${repo.full_name}@${revision.slice(0, 8)}`);
    const response = await fetch(`https://codeload.github.com/${repo.full_name}/tar.gz/${revision}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Archive download failed (${response.status})`);
    let size = 0;
    const bound = new Transform({ transform(chunk, _, done) { size += chunk.length; done(size > 250_000_000 ? new Error('Source archive exceeds 250 MB') : null, chunk); } });
    try {
      await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(`${archive}.part`, { flags: 'w' }));
      await fs.rename(`${archive}.part`, archive);
    } catch (error) { await fs.rm(`${archive}.part`, { force: true }); throw error; }
  }
  const files = new Map();
  files.modes = new Map();
  files.unavailable = [];
  let total = 0;
  await tar.t({
    file: archive,
    onReadEntry(entry) {
      const file = entry.path.split('/').slice(1).join('/');
      const wanted = source.prefixes.some(prefix => file.startsWith(prefix)) || licenseName(file) || noticeName(file);
      if (wanted && (['SymbolicLink', 'Link'].includes(entry.type) || entry.type === 'File' && (!allowedPath(file) || entry.size > 4_000_000))) files.unavailable.push(file);
      if (entry.type !== 'File' || !wanted || !allowedPath(file) || entry.size > 4_000_000) { entry.resume(); return; }
      const chunks = [];
      entry.on('data', chunk => {
        total += chunk.length;
        if (total > 600_000_000) throw new Error('Expanded source exceeds 600 MB');
        chunks.push(chunk);
      });
      entry.on('end', () => { files.set(file, Buffer.concat(chunks)); files.modes.set(file, entry.mode & 0o111 ? 0o755 : 0o644); });
    },
  });
  return files;
}
function readMetadata(buffer) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('No YAML frontmatter');
  const metadata = parse(match[1], { maxAliasCount: 0, uniqueKeys: true });
  if (!metadata || typeof metadata !== 'object' || typeof metadata.name !== 'string' || typeof metadata.description !== 'string') throw new Error('Name and description are required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name) || metadata.name.length > 64 || metadata.name === 'synced') throw new Error('Nonportable skill name');
  if (metadata.description.trim().length < 12) throw new Error('Description is too short');
  return { text, metadata };
}
const skills = [], hashes = new Set(), ids = new Set(), sources = [], exclusions = [], failures = [];
const featureNames = new Set(['brag', 'frontend-design', 'impeccable', 'brainstorming', 'hyperframes', 'hyperframes-core', 'test-driven-development', 'webapp-testing', 'skill-creator', 'copywriting', 'planning-with-files']);
const checkedAt = new Date().toISOString();
for (const source of config.sources) {
  try {
    const repo = await github(`repos/${source.repo}`);
    if (repo.private || repo.stargazers_count < config.minimumStars) throw new Error('Source does not meet the public repository / star threshold');
    const commit = await github(`repos/${repo.full_name}/commits/${source.ref || repo.default_branch}`);
    const revision = commit.sha;
    const files = await acquire(source, repo, revision);
    const candidates = [...files.keys()].filter(file => file.endsWith('/SKILL.md') && source.prefixes.some(prefix => file.startsWith(prefix)) &&
      !/(?:^|\/)(?:tests?|fixtures?|examples?|templates?|node_modules|vendor|dist|translations)(?:\/|$)/i.test(file)).sort();
    let added = 0;
    for (const definition of candidates) {
      let info;
      try { info = readMetadata(files.get(definition)); } catch (error) { exclusions.push({ repo: repo.full_name, path: definition, reason: error.message }); continue; }
      const contentHash = sha(Buffer.from(info.text.replace(/\r\n/g, '\n')));
      if (hashes.has(contentHash)) { exclusions.push({ repo: repo.full_name, path: definition, reason: 'Duplicate instruction content' }); continue; }
      const directory = path.posix.dirname(definition);
      if (files.unavailable.some(file => file.startsWith(`${directory}/`))) {
        exclusions.push({ repo: repo.full_name, path: definition, reason: 'Skill contains linked, unsafe, or oversized files; incomplete bundles are excluded' });
        continue;
      }
      let licenseFile, license, cursor = directory;
      while (true) {
        const local = [...files.keys()].filter(file => path.posix.dirname(file) === (cursor || '.') && licenseName(file));
        if (local.length) {
          licenseFile = local.sort()[0];
          license = licenseType(files.get(licenseFile).toString('utf8'));
          break; // A specific license takes precedence over a permissive repository license.
        }
        if (!cursor) break;
        cursor = cursor.includes('/') ? path.posix.dirname(cursor) : '';
      }
      if (!license) {
        exclusions.push({ repo: repo.full_name, path: definition, reason: 'No recognized redistributable license; retained outside the published catalog' });
        continue;
      }
      let id = `${slug(repo.owner.login)}--${slug(repo.name)}--${info.metadata.name}`.slice(0, 146);
      if (ids.has(id)) id = `${id.slice(0, 136)}-${sha(Buffer.from(directory)).slice(0, 8)}`;
      const selected = [...files.keys()].filter(file => file.startsWith(`${directory}/`) &&
        !/(?:^|\/)(?:\.git|node_modules|__pycache__)(?:\/|$)/.test(file));
      const output = new Map(selected.map(file => [file.slice(directory.length + 1), file]));
      if (!licenseFile.startsWith(`${directory}/`)) output.set(`UPSTREAM-${path.posix.basename(licenseFile)}`, licenseFile);
      for (const file of files.keys()) {
        if (noticeName(file) && (path.posix.dirname(file) === '.' || path.posix.dirname(file) === path.posix.dirname(licenseFile)) && !output.has(path.posix.basename(file))) {
          output.set(`UPSTREAM-${path.posix.basename(file)}`, file);
        }
      }
      const bytes = [...output.values()].reduce((sum, file) => sum + files.get(file).length, 0);
      if (bytes > 24_000_000 || output.size > 600) { exclusions.push({ repo: repo.full_name, path: definition, reason: 'Skill bundle exceeds the size/file limit' }); continue; }
      const description = info.metadata.description.replace(/\s+/g, ' ').trim().slice(0, 1200);
      const skill = {
        id, name: info.metadata.name, description, category: categoryFor(info.metadata.name, description),
        tags: words(`${info.metadata.name} ${description}`).slice(0, 18), repo: repo.full_name, owner: repo.owner.login,
        stars: repo.stargazers_count, official: Boolean(source.official), featured: featureNames.has(info.metadata.name),
        license, licensePath: licenseFile, revision, path: directory,
        sourceUrl: `https://github.com/${repo.full_name}/tree/${revision}/${directory}`,
        checkedAt, updatedAt: commit.commit.committer.date, fileCount: output.size, bytes,
        sha256: sha(files.get(definition)), historical: Boolean(source.ref),
      };
      const manifest = {
        schemaVersion: 1, skill,
        files: [...output.entries()].map(([file, sourcePath]) => ({
          path: file, sourcePath, bytes: files.get(sourcePath).length, sha256: sha(files.get(sourcePath)), mode: files.modes.get(sourcePath),
          url: `https://raw.githubusercontent.com/${repo.full_name}/${revision}/${sourcePath.split('/').map(encodeURIComponent).join('/')}`,
        })),
      };
      const bundle = {};
      for (const [file, sourcePath] of output) bundle[`${skill.name}/${file}`] = [files.get(sourcePath), { os: 3, attrs: files.modes.get(sourcePath) << 16 }];
      bundle[`${skill.name}/SKILL-SOURCE.json`] = Buffer.from(JSON.stringify({ ...skill, instruction: 'Original upstream files. Supporting scripts are not executed by the library.' }, null, 2));
      const zip = createSkillArchive(bundle);
      manifest.archiveSha256 = sha(zip);
      await Promise.all([
        fs.writeFile(path.join(staging, 'manifests', `${id}.json`), JSON.stringify(manifest)),
        fs.writeFile(path.join(staging, 'bundles', `${id}.zip`), zip),
        fs.writeFile(path.join(staging, 'documents', `${id}.md`), files.get(definition)),
      ]);
      hashes.add(contentHash); ids.add(id); skills.push(skill); added++;
    }
    sources.push({ repo: repo.full_name, revision, stars: repo.stargazers_count, checkedAt, added, discovered: candidates.length });
    console.log(`${repo.full_name}: ${added}/${candidates.length} skills, ${repo.stargazers_count.toLocaleString()} stars`);
  } catch (error) {
    failures.push({ repo: source.repo, error: error.message });
    console.error(`SOURCE FAILED: ${source.repo}: ${error.message}`);
  }
}
skills.sort((a, b) => a.id.localeCompare(b.id));
const catalog = {
  schemaVersion: 1, generatedAt: checkedAt, minimumRepositoryStars: config.minimumStars,
  total: skills.length, sourceCount: sources.filter(s => s.added > 0).length,
  description: 'Stars belong to source repositories. Revisions and file hashes are pinned. Inclusion is not a security audit or an endorsement by the upstream author.',
  categories: [...new Set(skills.map(s => s.category))].sort().map(name => ({ name, count: skills.filter(s => s.category === name).length })),
  sources, skills,
};
await fs.writeFile(path.join(cache, 'sync-report.json'), JSON.stringify({ generatedAt: checkedAt, total: skills.length, sources, exclusions, failures }, null, 2));
if (failures.length) throw new Error(`${failures.length} source(s) failed. Resolve the failures before replacing the published catalog. See .cache/sync-report.json.`);
if (skills.length < 2000) throw new Error(`Only ${skills.length} valid skills. The catalog minimum is 2,000.`);
for (const skill of skills) {
  for (const [folder, extension, destination] of [['manifests', 'json', path.join(root, 'registry/manifests')], ['bundles', 'zip', path.join(cache, 'bundles')], ['documents', 'md', path.join(cache, 'documents')]]) {
    await fs.copyFile(path.join(staging, folder, `${skill.id}.${extension}`), path.join(destination, `${skill.id}.${extension}`));
  }
}
for (const file of await fs.readdir(path.join(root, 'registry/manifests'))) {
  if (/^[a-z0-9][a-z0-9._-]+\.json$/.test(file) && !ids.has(file.slice(0, -5))) await fs.unlink(path.join(root, 'registry/manifests', file));
}
await fs.writeFile(path.join(root, 'registry/catalog.json'), JSON.stringify(catalog));
await fs.writeFile(path.join(root, 'registry/sync-summary.json'), JSON.stringify({ generatedAt: checkedAt, total: skills.length, sources, excluded: exclusions.length, exclusionReasons: [...new Set(exclusions.map(x => x.reason))].map(reason => ({ reason, count: exclusions.filter(x => x.reason === reason).length })) }, null, 2));
console.log(`Catalog complete: ${skills.length} unique, licensed skills from ${catalog.sourceCount} repositories.`);
if (path.dirname(path.resolve(staging)) === path.resolve(cache) && path.basename(staging).startsWith('sync-')) await fs.rm(staging, { recursive: true, force: true });
