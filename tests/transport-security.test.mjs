import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/index.mjs';

const unavailable = new Proxy({}, { get() { throw new Error('HTTP must not access application bindings'); } });

test('public HTTP reads redirect to HTTPS before accessing assets, accounts or data', async () => {
  for (const host of ['skills.maqamagent.com', 'agent-skill-library.ajnasnb.workers.dev']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request(`http://${host}/account?return=skills`, { method }), unavailable);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('Location'), `https://${host}/account?return=skills`);
      assert.equal(response.headers.get('Strict-Transport-Security'), null);
      assert.equal(response.headers.get('Set-Cookie'), null);
      assert.equal(await response.text(), '');
    }
  }
});

test('public HTTP writes are rejected before credentials, cookies or request bodies are processed', async () => {
  for (const route of ['/api/auth/start', '/api/auth/verify', '/api/community/listings', '/mcp']) {
    const request = new Request(`http://skills.maqamagent.com${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const response = await worker.fetch(request, unavailable);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /HTTPS/);
    assert.equal(request.bodyUsed, false);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('Location'), null);
  }
});

test('HTTPS responses retain authentication protections and add HSTS; loopback development stays usable', async () => {
  const env = { DB: {}, ASSETS: { fetch: async () => new Response('<!doctype html><html><head><!-- SEO_HEAD --></head><body><div id="root"></div></body></html>') } };
  for (const route of ['/', '/account', '/api/auth/session', '/api/community/review', '/mcp']) {
    const response = await worker.fetch(new Request(`https://skills.maqamagent.com${route}`), env);
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
    if (route === '/api/community/review') assert.equal(response.status, 401);
    if (route === '/account' || route.startsWith('/api/auth')) assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  for (const host of ['localhost:8787', '127.0.0.1:8787', '[::1]:8787']) {
    const response = await worker.fetch(new Request(`http://${host}/api/health`), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Strict-Transport-Security'), null);
  }
  assert.match(fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'), /Strict-Transport-Security: max-age=31536000/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')).dev.host, 'localhost');
});
