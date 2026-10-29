// Isolated dashboard smoke test: in-memory SQLite, local HTTP, synthetic accounts.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import worker from '../worker/index.mjs';
import { digest } from '../worker/community.mjs';

const root = path.resolve(import.meta.dirname, '..'), db = new DatabaseSync(':memory:');
for (const file of (await fs.readdir(path.join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) db.exec(await fs.readFile(path.join(root, 'migrations', file), 'utf8'));
const wrap = sql => {
  let values = [];
  return { bind(...input) { values = input; return this; }, async first() { return db.prepare(sql).get(...values) || null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return this.execute(); }, execute() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } };
};
const stamp = new Date().toISOString();
const secret = randomBytes(32).toString('hex');
db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('reviewer-fixture', 'reviewer@example.com', 'Test reviewer', stamp, stamp);
db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(await digest(secret), 'reviewer-fixture', Date.now() + 600000);
const listingId = crypto.randomUUID();
db.prepare('INSERT INTO listings (id, slug, owner_id, type, name, tagline, description, website, category, pricing, status, created_at, agent_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(listingId, 'fixture-tool', 'reviewer-fixture', 'product', 'Example application (test data)', 'An example application for the dashboard test', 'Synthetic test data. This is not a real submission or a production review.', 'https://example.com/', 'Development', 'Free', 'pending', stamp, JSON.stringify({ compatibility:'A documentation-reading agent.', installation:'Read the public documentation before using this tool.' }));
const env = { ADMIN_EMAIL:'reviewer@example.com', EMAIL_FROM:'test@example.com', EMAIL:{ async send() { throw new Error('This browser test must never send mail.'); } }, DB: { prepare:wrap, async batch(statements) { db.exec('BEGIN'); try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } }, ASSETS: { async fetch(request) {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  if (pathname === '/community-shell.html') return new Response(await fs.readFile(path.join(root,'dist/community-shell.html')), {headers:{'Content-Type':'text/html'}});
  if (pathname.startsWith('/assets/')) {
    const target = path.resolve(root,'dist','.' + pathname);
    if (!target.startsWith(path.join(root,'dist/assets') + path.sep)) return new Response('', {status:404});
    try { return new Response(await fs.readFile(target), {headers:{'Content-Type':target.endsWith('.css') ? 'text/css' : target.endsWith('.woff2') ? 'font/woff2' : 'text/javascript'}}); } catch { return new Response('', {status:404}); }
  }
  const target = path.resolve(root, 'public', '.' + pathname), allowed = path.join(root, 'public') + path.sep;
  if (!target.startsWith(allowed)) return new Response('', {status:404});
  try { return new Response(await fs.readFile(target), {headers:{'Content-Type': /\.(?:mjs|js)$/.test(target) ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'image/webp'}}); } catch { return new Response('', {status:404}); }
} } };
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const response = await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, {method:incoming.method, headers:incoming.headers, ...(!['GET','HEAD'].includes(incoming.method) ? {body:Buffer.concat(chunks)} : {})}), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { outgoing.writeHead(500); outgoing.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:'chrome',headless:true});
const output = path.join(root, 'artifacts/review-browser'); await fs.mkdir(output, {recursive:true});
try {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/review'); await expect(page.locator('#review-dashboard')).toBeHidden();
  await context.addCookies([{name:'skilldash-local',value:secret,url:base}]);
  await page.reload(); await expect(page.locator('#review-summary')).toContainText('1 pending');
  const form = page.locator('.assessment-form');
  await form.getByLabel('Risk level').selectOption('medium');
  await form.getByLabel('Functionality evidence').selectOption('documented');
  await form.getByLabel('Permissions and prerequisites').fill('Public documentation checked. Runtime requires a separately authorized account.');
  await form.getByLabel('Risks, limitations and next action').fill('Paid operations and private-file handling were not tested. Follow up before claiming runtime support.');
  await form.getByLabel('Evidence and test scope').fill('https://example.com/ — documentation fixture only; no external requests made.');
  await page.locator('.review-form textarea[name=note]').fill('Unsaved publication decision stays in place.');
  await form.getByRole('button', {name:'Save assessment',exact:true}).click();
  await expect(page.locator('#community-message')).toContainText('Publication status has not changed');
  await expect(page.locator('#review-summary')).toContainText('0 without an assessment');
  await expect(page.locator('.review-form textarea[name=note]')).toHaveValue('Unsaved publication decision stays in place.');
  assert.equal(db.prepare('SELECT status FROM listings').get().status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, 0);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.getByLabel('Publication status').selectOption('published');
  await page.getByRole('button',{name:'Apply filter',exact:true}).click();
  await expect(page.locator('#review-queue')).toContainText('No applications match');
  await page.getByLabel('Publication status').selectOption('all');
  await page.getByRole('button',{name:'Apply filter',exact:true}).click();
  await expect(page.locator('.community-card')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#review-filter button')).toBeInViewport();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dashboard must not overflow a mobile viewport');
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  assert.deepEqual(errors, []);
  console.log('Review dashboard browser smoke passed: access, assessment persistence, unsaved decision preservation, filters, mobile width; no mail sent.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); db.close(); }
