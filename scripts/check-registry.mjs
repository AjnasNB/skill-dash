import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'registry/catalog.json'), 'utf8'));
assert.equal(catalog.total, catalog.skills.length);
assert.ok(catalog.total >= 2000, 'At least 2,000 real skills are required.');
assert.equal(new Set(catalog.skills.map(s => s.id)).size, catalog.total);
for (const skill of catalog.skills) {
  assert.ok(skill.stars >= 1000, `${skill.id}: source stars below minimum`);
  assert.match(skill.revision, /^[a-f0-9]{40}$/);
  assert.match(skill.sha256, /^[a-f0-9]{64}$/);
  assert.ok(skill.license && skill.description.length >= 12);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'registry/manifests', `${skill.id}.json`), 'utf8'));
  assert.deepEqual(manifest.skill, skill, `${skill.id}: catalog and manifest differ`);
  assert.equal(manifest.files.length, skill.fileCount);
  assert.ok(manifest.files.some(file => file.path === 'SKILL.md'));
  assert.ok(manifest.files.some(file => /license|copying/i.test(file.path)), `${skill.id}: missing license file`);
  assert.equal(new Set(manifest.files.map(f => f.path.toLowerCase())).size, manifest.files.length, `${skill.id}: case collision`);
  for (const file of manifest.files) {
    assert.ok(!file.path.startsWith('/') && !file.path.includes('\\') && !file.path.includes(':') && !file.path.split('/').some(p => p === '..' || p === '.' || !p));
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.url.startsWith(`https://raw.githubusercontent.com/${skill.repo}/${skill.revision}/`));
    assert.ok(file.bytes >= 0 && file.bytes <= 4_000_000);
  }
}
console.log(`Verified ${catalog.total} catalog entries, pinned revisions, licenses, and file manifests.`);
