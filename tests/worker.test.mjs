import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateSubmission } from '../worker/index.mjs';
test('public search returns real catalog results and correct missing-resource status', async () => {
  const response = await worker.fetch(new Request('https://skills.maqamagent.com/api/skills?q=video&limit=3'), {});
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.skills.length, 3);
  assert.ok(json.skills.every(skill => skill.stars >= 1000 && skill.revision.length === 40));
  assert.equal((await worker.fetch(new Request('https://skills.maqamagent.com/api/skills/missing'), {})).status, 404);
  assert.equal((await worker.fetch(new Request(`https://skills.maqamagent.com/api/skills?q=${'x'.repeat(501)}`), {})).status, 400);
  assert.equal((await worker.fetch(new Request('https://skills.maqamagent.com/api/unknown'), {})).status, 404);
});
test('submission validation rejects foreign hosts, credentials, fragments and traversals', () => {
  assert.deepEqual(validateSubmission({ repo: 'https://github.com/owner/repo', path: 'skills/test' }), { repo: 'owner/repo', path: 'skills/test' });
  assert.deepEqual(validateSubmission({ repo: 'https://github.com/owner/repo.git', path: '.' }), { repo: 'owner/repo', path: '.' });
  for (const repo of ['https://github.com.evil.test/owner/repo', 'https://user:pass@github.com/owner/repo', 'http://github.com/owner/repo', 'https://github.com/owner/repo#x']) assert.throws(() => validateSubmission({ repo, path: 'skills/test' }));
  for (const path of ['../escape', '/absolute', 'skills/../../etc', 'a\\b', '.git/config', '']) assert.throws(() => validateSubmission({ repo: 'https://github.com/owner/repo', path }));
});
test('submission errors never claim that a failed write was accepted', async () => {
  const request = () => new Request('https://skills.maqamagent.com/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: 'https://github.com/example/example', path: 'skills/a' }) });
  assert.equal((await worker.fetch(request(), {})).status, 503);
  const failing = { DB: { prepare() { throw new Error('database unavailable'); } } };
  assert.equal((await worker.fetch(request(), failing)).status, 503);
  const crossOrigin = new Request(request(), { headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } });
  assert.equal((await worker.fetch(crossOrigin, failing)).status, 403);
});
