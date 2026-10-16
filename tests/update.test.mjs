import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { currentCatalog, currentManifest, fetchBoundedJson } from '../lib/live-catalog.mjs';
import { installSkill } from '../lib/install.mjs';
import { updateInstalled } from '../lib/update.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');
function fixture(revision, text) {
  const bytes = Buffer.from(text), skill = { id: 'example--useful-skill', name: 'useful-skill', repo: 'example/skills',
    path: 'skills/useful-skill', revision: revision.repeat(40), fileCount: 1, bytes: bytes.length,
    description: 'A testing skill.', tags: ['testing'], sha256: hash(bytes) };
  const manifest = { schemaVersion: 1, skill, files: [{ path: 'SKILL.md', sourcePath: `${skill.path}/SKILL.md`, bytes: bytes.length,
    sha256: hash(bytes), url: `https://raw.githubusercontent.com/${skill.repo}/${skill.revision}/${skill.path}/SKILL.md` }] };
  const catalog = { generatedAt: '2026-10-16T00:00:00Z', skills: [skill] };
  const fetcher = async url => {
    if (String(url).endsWith('/catalog.json')) return Response.json(catalog);
    if (String(url).includes('/manifests/')) return Response.json(manifest);
    assert.equal(String(url), manifest.files[0].url); return new Response(bytes);
  };
  return { manifest, fetcher, skill };
}
async function sandbox(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldash-update-test-')));
  t.after(async () => {
    const relative = path.relative(await fs.realpath(os.tmpdir()), root);
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(root).startsWith('skilldash-update-test-')) await fs.rm(root, {recursive:true,force:true});
  });
  return root;
}
test('managed update plans before applying and preserves the chosen source', async t => {
  const cwd = await sandbox(t), older = fixture('a', 'Original skill'), newer = fixture('b', 'Updated skill');
  const installed = await installSkill(older.manifest, {cwd,fetcher:older.fetcher});
  const plan = await updateInstalled({cwd,fetcher:newer.fetcher});
  assert.equal(plan.results[0].status,'planned');
  assert.equal(await fs.readFile(path.join(installed.destination,'SKILL.md'),'utf8'),'Original skill');
  const result = await updateInstalled({cwd,fetcher:newer.fetcher,apply:true});
  assert.equal(result.results[0].status,'installed');
  assert.equal(await fs.readFile(path.join(installed.destination,'SKILL.md'),'utf8'),'Updated skill');
  assert.equal((await updateInstalled({cwd,fetcher:newer.fetcher})).results[0].status,'current');
});
test('automatic managed revisions never overwrite local edits, even with force present', async t => {
  const cwd = await sandbox(t), older=fixture('a','Original skill'), newer=fixture('b','Updated skill');
  const installed=await installSkill(older.manifest,{cwd,fetcher:older.fetcher});
  await fs.writeFile(path.join(installed.destination,'SKILL.md'),'My local changes');
  const result=await updateInstalled({cwd,fetcher:newer.fetcher,apply:true,force:true});
  assert.equal(result.results[0].status,'preserved'); assert.match(result.results[0].reason,/edited locally/);
  assert.equal(await fs.readFile(path.join(installed.destination,'SKILL.md'),'utf8'),'My local changes');
});
test('live discovery is labeled and offline fallback never pretends to be refreshed', async () => {
  const newer=fixture('b','Updated skill'), result=await currentCatalog({fetcher:newer.fetcher});
  assert.equal(result.basis,'live-https'); assert.equal(result.stale,false);
  const fallback=await currentCatalog({fetcher:async()=>{throw new Error('Offline');}});
  assert.equal(fallback.basis,'package-fallback'); assert.equal(fallback.stale,true);
  await assert.rejects(currentCatalog({fetcher:async()=>{throw new Error('Offline');},requireLive:true}),/Offline/);
  const changed=structuredClone(newer.manifest);changed.skill.revision='c'.repeat(40);
  await assert.rejects(currentManifest(newer.skill,{fetcher:async()=>Response.json(changed)}));
  await assert.rejects(fetchBoundedJson('https://library.example',2,async()=>new Response('large')) ,/too large/);
});

test('an edit made while a managed update downloads is preserved', async t => {
  const cwd = await sandbox(t), older = fixture('a', 'Original skill'), newer = fixture('b', 'Updated skill');
  const installed = await installSkill(older.manifest, {cwd, fetcher: older.fetcher});
  const file = path.join(installed.destination, 'SKILL.md');
  const fetcher = async url => {
    if (new URL(url).hostname === 'raw.githubusercontent.com') await fs.writeFile(file, 'Edited during download');
    return newer.fetcher(url);
  };
  const result = await updateInstalled({cwd, fetcher, apply: true});
  assert.equal(result.results[0].status, 'preserved');
  assert.match(result.results[0].reason, /changed during download/);
  assert.equal(await fs.readFile(file, 'utf8'), 'Edited during download');
});
