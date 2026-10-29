import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { azureHeaders, emailAvailable, sendEmail, emailStatus } from '../worker/email.mjs';
const id = '8540c0de-899f-5cce-acb5-3ec493af3800';
const env = { EMAIL_PROVIDER: 'azure', AZURE_EMAIL_ENDPOINT: 'https://skilldash-mail.unitedstates.communication.azure.com', AZURE_EMAIL_ACCESS_KEY: Buffer.from('synthetic-test-key').toString('base64'), EMAIL_FROM: 'skilldash@cognifyr.co', ADMIN_EMAIL: 'contact@cognifyr.co' };
test('Azure HMAC signs the exact UTF-8 content, path, query and RFC1123 date', async () => {
  const url = new URL(env.AZURE_EMAIL_ENDPOINT + '/emails:send?api-version=2023-03-31'), body = JSON.stringify({ subject: 'Hello — 你好' }), date = 'Thu, 29 Oct 2026 10:00:00 GMT';
  const headers = await azureHeaders(url, 'POST', body, env.AZURE_EMAIL_ACCESS_KEY, date);
  const hash = createHash('sha256').update(body).digest('base64');
  const signature = createHmac('sha256', Buffer.from(env.AZURE_EMAIL_ACCESS_KEY, 'base64')).update(`POST\n${url.pathname}${url.search}\n${date};${url.host};${hash}`).digest('base64');
  assert.equal(headers['x-ms-content-sha256'], hash);
  assert.equal(headers.Authorization, `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`);
});
test('Azure mail uses the verified sender, existing reply inbox and a stable operation ID', async () => {
  const result = await sendEmail(env, 'creator@example.com', 'Receipt', 'Received', '<p>Received</p>', id, async (url, options) => {
    assert.equal(String(url), env.AZURE_EMAIL_ENDPOINT + '/emails:send?api-version=2023-03-31');
    assert.equal(options.headers['Operation-Id'], id); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    const body = JSON.parse(options.body);
    assert.equal(body.senderAddress, 'skilldash@cognifyr.co');
    assert.deepEqual(body.recipients, { to: [{ address: 'creator@example.com' }] });
    assert.equal(body.replyTo[0].address, 'contact@cognifyr.co'); assert.equal(body.userEngagementTrackingDisabled, true);
    return Response.json({ id, status: 'Running' }, { status: 202, headers: { 'Operation-Location': 'https://untrusted.example/steal-key' } });
  });
  assert.deepEqual(result, { messageId: id, status: 'Running' });
  const status = await emailStatus(env, id, async (url, options) => { assert.ok(String(url).startsWith(env.AZURE_EMAIL_ENDPOINT + '/emails/operations/')); assert.equal(options.method, 'GET'); return Response.json({ id, status: 'Succeeded' }); });
  assert.equal(status.status, 'Succeeded');
});
test('Azure configuration fails closed and provider failures retain safe retry information', async () => {
  assert.equal(emailAvailable({ ...env, AZURE_EMAIL_ACCESS_KEY: '', EMAIL: { send() { throw new Error('Must not fall back'); } } }), false);
  for (const endpoint of ['http://resource.communication.azure.com','https://evil.example','https://resource.communication.azure.com/path','https://user:password@resource.communication.azure.com']) assert.equal(emailAvailable({ ...env, AZURE_EMAIL_ENDPOINT: endpoint }), false);
  const send = fetcher => sendEmail(env, 'creator@example.com', 'Receipt', 'Received', '<p>Received</p>', id, fetcher);
  await assert.rejects(send(async () => new Response('secret provider error', { status: 401 })), { code: 'AZURE_EMAIL_HTTP_401', permanent: true });
  await assert.rejects(send(async () => new Response('', { status: 429 })), { code: 'AZURE_EMAIL_HTTP_429', permanent: false });
  await assert.rejects(send(async () => { throw new Error('network contains credentials'); }), { code: 'AZURE_EMAIL_UNCERTAIN' });
  await assert.rejects(send(async () => Response.json({ id: crypto.randomUUID(), status: 'Running' })), { code: 'AZURE_EMAIL_UNCERTAIN' });
  assert.equal((await emailStatus(env, id, async () => new Response('', { status: 404 }))).status, 'NotFound');
  assert.equal((await emailStatus(env, id, async () => Response.json({ id, status: 'Failed' }))).status, 'Failed');
});
