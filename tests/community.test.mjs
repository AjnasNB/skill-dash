import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../worker/index.mjs';
import { validateListing, digest, deliverNotifications } from '../worker/community.mjs';
const origin = 'https://skills.maqamagent.com';
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_submissions.sql', '0002_community.sql','0003_agent_submissions.sql']) db.exec(fs.readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const wrap = sql => {
    let values = []; return { bind(...input) { values = input; return this; }, async first() { return db.prepare(sql).get(...values) || null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { const info = db.prepare(sql).run(...values); return { meta: { changes: Number(info.changes) } }; }, execute() { const info = db.prepare(sql).run(...values); return { meta: { changes: Number(info.changes) } }; } };
  };
  const mail = [], env = { DB: { prepare: wrap, async batch(statements) { db.exec('BEGIN'); try { const results = statements.map(statement => statement.execute()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } }, EMAIL_FROM: 'skilldash@cognifyr.co', ADMIN_EMAIL: 'contact@cognifyr.co', EMAIL: { async send(data) { mail.push(data); return { messageId: `mail-${mail.length}` }; } }, ASSETS: { async fetch() { return new Response('<!doctype html><html><head><!-- SEO_HEAD --></head><body><div id="root"></div></body></html>'); } } };
  const call = (path, data, cookie, method) => worker.fetch(new Request(origin + path, { method: method || (data === undefined ? 'GET' : 'POST'), headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) }), env);
  const signIn = async (email = 'creator@example.com') => { assert.equal((await call('/api/auth/start', { email, displayName: 'Creator' })).status, 202); const secret = mail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1]; const response = await call('/api/auth/verify', { token: secret }); assert.equal(response.status, 200); return { cookie: response.headers.get('Set-Cookie').split(';')[0], secret, response }; };
  return { db, env, mail, call, signIn };
}
const listing = { type: 'product', name: 'Useful tool', tagline: 'A useful tool for software teams', description: 'A public developer product with documented features and a clear source. Helps teams retain reproducible task evidence.', website: 'https://example.com/tool', sourceUrl: 'https://github.com/example/tool', category: 'Development', pricing: 'Free', rights: true };
test('magic links verify an email exactly once and only hashed credentials are stored', async () => {
  const f = fixture(), login = await f.signIn();
  assert.match(login.response.headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax; Max-Age=1209600; Secure/);
  assert.match(login.cookie, /^__Host-skilldash=/);
  assert.equal((await f.call('/api/auth/verify', { token: login.secret })).status, 401);
  const session = await (await f.call('/api/auth/session', undefined, login.cookie)).json(); assert.equal(session.user.verified, true); assert.equal(session.user.admin, false);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM login_tokens').get().n, 0);
  assert.equal(f.db.prepare('SELECT token_hash FROM sessions').get().token_hash, await digest(login.cookie.split('=')[1]));
  assert.equal((await f.call('/api/auth/logout', {}, login.cookie)).status, 200);
  assert.equal((await (await f.call('/api/auth/session', undefined, login.cookie)).json()).user, null);
  f.db.close();
});
test('failed and expired sign-in messages never create usable sessions or claim delivery', async () => {
  const f = fixture(); f.env.EMAIL.send = async () => { throw new Error('send failed'); };
  assert.equal((await f.call('/api/auth/start', { email: 'creator@example.com', displayName: 'Creator' })).status, 503);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM login_tokens').get().n, 0);
  f.env.EMAIL.send = async data => { f.mail.push(data); return { messageId: 'mail' }; };
  await f.call('/api/auth/start', { email: 'creator@example.com', displayName: 'Creator' });
  const secret = f.mail.at(-1).text.match(/#token=([a-f0-9]{64})/)[1]; f.db.exec('UPDATE login_tokens SET expires_at = 0');
  assert.equal((await f.call('/api/auth/verify', { token: secret })).status, 401); f.db.close();
});
test('community writes reject anonymous users, cross-site requests and oversized streams', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/community/listings', listing)).status, 401);
  const cross = new Request(origin + '/api/auth/start', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal((await worker.fetch(cross, f.env)).status, 403);
  const large = new Request(origin + '/api/auth/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x'.repeat(20000) }) });
  assert.equal((await worker.fetch(large, f.env)).status, 413);
  const spoof = new Request(origin + '/api/community/review', { headers: { 'X-User-Email': 'contact@cognifyr.co' } });
  assert.equal((await worker.fetch(spoof, f.env)).status, 401); f.db.close();
});
test('listing validation rejects private URLs, credential URLs, unsupported types and missing publication rights', () => {
  assert.equal(validateListing(listing).name, 'Useful tool');
  for (const website of ['http://example.com', 'https://user:pass@example.com', 'https://127.0.0.1', 'https://192.168.1.1', 'https://10.0.0.1', 'https://site.local', 'javascript:alert(1)']) assert.throws(() => validateListing({ ...listing, website }));
  assert.throws(() => validateListing({ ...listing, rights: false })); assert.throws(() => validateListing({ ...listing, type: 'ad' }));
});
test('review approval gates publication, share pages, badges and idempotent account voting', async () => {
  const f = fixture(), owner = await f.signIn(), admin = await f.signIn('contact@cognifyr.co');
  const submitted = await f.call('/api/community/listings', listing, owner.cookie); assert.equal(submitted.status, 202); const receipt = await submitted.json();
  assert.equal((await (await f.call('/api/community/listings')).json()).total, 0);
  assert.equal((await f.call(`/listings/${receipt.slug}`)).status, 404);
  assert.equal((await f.call('/api/community/review', undefined, owner.cookie)).status, 403);
  assert.equal((await f.call(`/api/community/review/${receipt.id}`, { status: 'published', note: 'Checked the public source.' }, admin.cookie)).status, 400);
  const approval = { status: 'published', note: 'Checked source, public claims and rights.', checks: { source: true, details: true, rights: true },agentDetails:{compatibility:'A client that reads the public tool documentation.',installation:'Read the source documentation and configure only with owner authorization.'} };
  assert.equal((await f.call(`/api/community/review/${receipt.id}`, approval, admin.cookie)).status, 200);
  assert.equal((await f.call(`/api/community/review/${receipt.id}`, approval, admin.cookie)).status, 409);
  const result = await (await f.call('/api/community/listings')).json(); assert.equal(result.total, 1); assert.equal(result.listings[0].verified, true); assert.equal(result.listings[0].email, undefined);
  const page = await f.call(`/listings/${receipt.slug}`); assert.equal(page.status, 200); assert.match(await page.text(), /Listed on SkillDash/);
  const badge = await f.call(`/badges/${receipt.slug}.svg`); assert.equal(badge.status, 200); assert.equal(badge.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal((await f.call(`/api/community/listings/${receipt.id}/vote`, { voted: true }, undefined, 'PUT')).status, 401);
  for (let i = 0; i < 3; i++) { const voted = await (await f.call(`/api/community/listings/${receipt.id}/vote`, { voted: true }, owner.cookie, 'PUT')).json(); assert.equal(voted.votes, 1); }
  assert.equal((await (await f.call(`/api/community/listings/${receipt.id}/vote`, undefined, owner.cookie)).json()).voted, true);
  assert.equal((await (await f.call(`/api/community/listings/${receipt.id}/vote`, { voted: false }, owner.cookie, 'PUT')).json()).votes, 0);
  f.db.close();
});
test('notification failures retain a durable retry and successful sends are not repeated', async () => {
  const f = fixture(), owner = await f.signIn();
  await f.call('/api/community/listings', listing, owner.cookie);
  f.env.EMAIL.send = async () => { throw Object.assign(new Error('temporary'), { code: 'E_RATE_LIMIT_EXCEEDED' }); };
  await deliverNotifications(f.env);
  const pending = f.db.prepare('SELECT * FROM notifications').get(); assert.equal(pending.attempts, 1); assert.equal(pending.status, 'pending'); assert.equal(pending.last_error, 'E_RATE_LIMIT_EXCEEDED');
  f.db.exec('UPDATE notifications SET next_attempt_at = 0'); f.env.EMAIL.send = async data => { f.mail.push(data); return { messageId: 'delivered' }; };
  await deliverNotifications(f.env); const delivered = f.db.prepare('SELECT * FROM notifications').get(); assert.equal(delivered.status, 'sent'); assert.equal(delivered.message_id, 'delivered');
  const count = f.mail.length; await deliverNotifications(f.env); assert.equal(f.mail.length, count); assert.equal(f.mail.at(-1).to, 'contact@cognifyr.co'); f.db.close();
});
test('private contacts stay reviewer-only, receipts reach the verified owner, and approval requires defined agent usage',async()=>{
  const f=fixture(),owner=await f.signIn(),admin=await f.signIn('contact@cognifyr.co');
  assert.equal((await f.call('/api/community/listings',{...listing,contactEmail:'wrong@example.com'},owner.cookie)).status,400);
  const input={...listing,type:'chatbot',contactEmail:'creator@example.com',phone:'office phone - optional',agentDetails:{compatibility:'HTTP clients'}};
  const submitted=await f.call('/api/community/listings',input,owner.cookie);assert.equal(submitted.status,202);const receipt=await submitted.json();assert.equal(receipt.receiptEmail,'queued');
  const contact=f.db.prepare('SELECT * FROM listing_contacts WHERE listing_id = ?').get(receipt.id);assert.equal(contact.email,'creator@example.com');assert.equal(contact.phone_validation,'not-verified');
  assert.equal((await f.call('/api/community/review',undefined,owner.cookie)).status,403);
  const review=await (await f.call('/api/community/review',undefined,admin.cookie)).json();assert.equal(review.listings[0].contact_phone,'office phone - optional');
  const approval={status:'published',note:'Source, details and rights checked.',checks:{source:true,details:true,rights:true}};
  assert.equal((await f.call(`/api/community/review/${receipt.id}`,approval,admin.cookie)).status,400);
  await deliverNotifications(f.env);const confirmation=f.mail.find(mail=>mail.subject.startsWith('We received your SkillDash submission'));assert.equal(confirmation.to,'creator@example.com');assert.ok(confirmation.text.includes('/account'));assert.ok(!confirmation.text.includes('office phone'));
  assert.equal((await f.call(`/api/community/review/${receipt.id}`,{...approval,agentDetails:{compatibility:'HTTP client with owner-authorized credentials.',installation:'Read public documentation and configure a test environment first.'}},admin.cookie)).status,200);
  const publicResponse=await (await f.call('/api/community/listings')).json();assert.equal(publicResponse.listings[0].agentDetails.compatibility,'HTTP client with owner-authorized credentials.');const publicText=JSON.stringify(publicResponse);assert.ok(!publicText.includes('creator@example.com'));assert.ok(!publicText.includes('office phone'));
  await deliverNotifications(f.env);assert.ok(f.mail.some(mail=>mail.subject.startsWith('Your SkillDash listing is published')&&mail.to==='creator@example.com'));f.db.close();
});
test('a rejected submission sends an account review update without publishing a page',async()=>{
  const f=fixture(),owner=await f.signIn(),admin=await f.signIn('contact@cognifyr.co');
  const receipt=await (await f.call('/api/community/listings',listing,owner.cookie)).json();
  assert.equal((await f.call(`/api/community/review/${receipt.id}`,{status:'rejected',note:'Source details need correction before review.'},admin.cookie)).status,200);
  await deliverNotifications(f.env);assert.ok(f.mail.some(mail=>mail.subject.startsWith('Your SkillDash submission review')&&mail.text.includes('/account')));assert.equal((await f.call('/listings/'+receipt.slug)).status,404);f.db.close();
});
test('public pages escape user text and private account/review pages are never indexed or cached', async () => {
  const f = fixture(), owner = await f.signIn(), admin = await f.signIn('contact@cognifyr.co');
  const receipt = await (await f.call('/api/community/listings', { ...listing, name: '<script>alert(1)</script>', tagline: '<img src=x onerror=alert(1)> is unsafe text' }, owner.cookie)).json();
  await f.call(`/api/community/review/${receipt.id}`, { status: 'published', note: 'Fixture reviewed for escaping.', checks: { source: true, details: true, rights: true },agentDetails:{compatibility:'HTTP clients',installation:'Use the documented public API.'} }, admin.cookie);
  const html = await (await f.call(`/listings/${receipt.slug}`)).text(); assert.ok(!html.includes('<script>alert(1)</script>')); assert.ok(html.includes('&lt;script&gt;'));
  for (const route of ['/account', '/review']) { const response = await f.call(route); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow'); }
  const sitemap = await (await f.call('/sitemaps/community.xml')).text(); assert.match(sitemap, new RegExp(receipt.slug)); assert.ok(!sitemap.includes('/account')); f.db.close();
});
