import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { installSkill, validateManifest, targetRoot, listInstalled } from '../lib/install.mjs';

function fixture() {
  const content = {
    'SKILL.md': Buffer.from('---\nname: useful-skill\ndescription: A portable testing skill.\n---\nRead references/guide.md.\n'),
    'references/guide.md': Buffer.from('This reference must survive installation.\n'),
    'scripts/never-run.mjs': Buffer.from('throw new Error("MUST NOT EXECUTE")'),
    'LICENSE': Buffer.from('MIT License\nPermission is hereby granted, free of charge'),
  };
  const revision = 'a'.repeat(40), repo = 'example/skills';
  const manifest = { schemaVersion: 1, skill: { id: 'example--useful-skill', name: 'useful-skill', repo, revision, fileCount: 4, bytes: 300 },
    files: Object.entries(content).map(([name, data]) => ({ path: name, sourcePath: `skills/useful-skill/${name}`, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), url: `https://raw.githubusercontent.com/${repo}/${revision}/skills/useful-skill/${name}` })) };
  const fetcher = async url => { const file = manifest.files.find(file => file.url === url); return new Response(content[file.path]); };
  return { content, manifest, fetcher };
}
test('installs complete, verified skills in project and personal agent locations without executing scripts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-library-test-'));
  const { manifest, fetcher, content } = fixture();
  for (const agent of ['codex', 'claude', 'delta']) {
    const options = { agent, global: true, home: root, deltaHome: path.join(root, 'delta'), fetcher };
    const result = await installSkill(manifest, options);
    assert.equal(result.status, 'installed');
    for (const [name, data] of Object.entries(content)) assert.deepEqual(await fs.readFile(path.join(result.destination, name)), data);
    assert.equal((await listInstalled(options))[0].id, manifest.skill.id);
    assert.equal((await installSkill(manifest, options)).status, 'already-installed');
  }
  assert.equal(targetRoot('codex', { cwd: root }), path.join(root, '.agents', 'skills'));
  assert.equal(targetRoot('claude', { cwd: root }), path.join(root, '.claude', 'skills'));
  assert.throws(() => targetRoot('delta', { cwd: root }), /global/);
});
test('bad hashes leave no installed or staged partial skill', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-library-badhash-'));
  const { manifest } = fixture();
  await assert.rejects(installSkill(manifest, { cwd: root, fetcher: async () => new Response('tampered') }), /Checksum|size/);
  assert.equal(await fs.stat(path.join(root, '.agents/skills/useful-skill')).catch(() => null), null);
  const directories = await fs.readdir(path.join(root, '.agents'));
  assert.ok(!directories.some(name => name.startsWith('.skill-library-stage')));
});
test('protects unmanaged files, local edits, and untracked supporting resources', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-library-edits-'));
  const { manifest, fetcher } = fixture();
  const result = await installSkill(manifest, { cwd: root, fetcher });
  await fs.writeFile(path.join(result.destination, 'SKILL.md'), 'My local edits');
  await assert.rejects(installSkill(manifest, { cwd: root, fetcher }), /edited locally/);
  assert.equal(await fs.readFile(path.join(result.destination, 'SKILL.md'), 'utf8'), 'My local edits');
  await fs.writeFile(path.join(result.destination, 'my-notes.md'), 'Keep these notes');
  await assert.rejects(installSkill(manifest, { cwd: root, fetcher, force: true }), /extra local files/);
  await fs.unlink(path.join(result.destination, 'my-notes.md'));
  await installSkill(manifest, { cwd: root, fetcher, force: true });
  await fs.unlink(path.join(result.destination, '.skill-library.json'));
  await assert.rejects(installSkill(manifest, { cwd: root, fetcher, force: true }), /not managed/);
});
test('rejects traversal, Windows reserved paths, case collisions, mutable commits, and foreign download origins', () => {
  for (const bad of ['../escape', '/escape', 'C:/escape', 'CON.txt', 'folder/.. /file', 'folder\\file', 'folder/NUL', '.SKILL-LIBRARY.json']) {
    const { manifest } = fixture(); manifest.files[0].path = bad;
    assert.throws(() => validateManifest(manifest), /Unsafe|Colliding/);
  }
  const collision = fixture().manifest; collision.files.push({ ...collision.files[0], path: 'skill.md' });
  assert.throws(() => validateManifest(collision), /Colliding/);
  const foreign = fixture().manifest; foreign.files[0].url = 'https://example.com/payload';
  assert.throws(() => validateManifest(foreign), /Unexpected/);
  const mutable = fixture().manifest; mutable.skill.revision = 'main';
  assert.throws(() => validateManifest(mutable), /pinned/);
});
test('refuses an agent directory replaced by a link or Windows junction', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-library-link-'));
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-library-external-'));
  await fs.symlink(external, path.join(root, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  const { manifest, fetcher } = fixture();
  await assert.rejects(installSkill(manifest, { cwd: root, fetcher }), /linked/);
  assert.deepEqual(await fs.readdir(external), []);
});
