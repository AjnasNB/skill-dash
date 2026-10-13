import { ORIGIN } from '../site/content.mjs';
import { escapeHtml as e, renderHead, metadata, breadcrumbs } from '../site/seo.mjs';
import { validateAgentDetails, validateContact, readAgentDetails } from '../lib/listing-details.mjs';
import {searchAgentTools} from '../lib/agent-directory.mjs';
import {renderAgentFields,renderAgentDetails} from '../public/agent-fields.mjs';

const encoder = new TextEncoder();
const types = ['skill', 'product', 'chatbot', 'plugin', 'library', 'mcp', 'tool'];
const categories = ['Development', 'Design', 'AI & agents', 'Marketing', 'Data & research', 'Cloud & DevOps', 'Security', 'Writing', 'Product & business', 'Documents', 'Automation', 'Video & audio'];
const cookieName = '__Host-skilldash';
const common = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...common, ...extra } });
const now = () => new Date().toISOString();
export const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export async function digest(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function text(value, field, min, max) {
  if (typeof value !== 'string') throw fail(`Provide ${field}.`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result)) throw fail(`${field} must be ${min}–${max} characters.`);
  return result;
}
export function publicUrl(value, optional = false) {
  if (optional && !value) return '';
  let url;
  try { url = new URL(text(value, 'a public HTTPS URL', 8, 500)); } catch { throw fail('Use a public HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[)/.test(url.hostname)) throw fail('Use a public HTTPS URL without credentials.');
  url.search = ''; return url.toString();
}
export function validateListing(input) {
  if (input?.rights !== true) throw fail('Confirm that you own this work or have permission to submit its public details.');
  if (!input || !types.includes(input.type)) throw fail('Choose a skill, product, plugin, library, MCP server or tool.');
  if (!categories.includes(input.category)) throw fail('Choose a category.');
  if (!['Free', 'Open source', 'Freemium', 'Paid'].includes(input.pricing)) throw fail('Choose the product pricing. Listing on SkillDash is always free.');
  return { type: input.type, category: input.category, pricing: input.pricing, name: text(input.name, 'Name', 2, 80).replace(/\s+/g, ' '), tagline: text(input.tagline, 'Tagline', 10, 140), description: text(input.description, 'Description', 50, 5000), website: publicUrl(input.website), source_url: publicUrl(input.sourceUrl, true), agent_details: JSON.stringify(validateAgentDetails(input.agentDetails || input, input.type)) };
}
async function body(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== ORIGIN && origin !== new URL(request.url).origin) throw fail('This origin cannot change SkillDash.', 403);
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw fail('Cross-site requests are not allowed.', 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw fail('Send application/json.', 415);
  if (Number(request.headers.get('Content-Length')) > 16384) throw fail('The request is too large.', 413);
  if (!request.body) throw fail('A request body is required.');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); throw fail('The request is too large.', 413); } chunks.push(value); } } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { const input = JSON.parse(new TextDecoder().decode(buffer)); if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Provide a JSON object.'); return input; } catch (error) { if (error.status) throw error; throw fail('Invalid JSON.'); }
}
async function limit(env, namespace, identity, maximum, window = 3600000) {
  const period = Math.floor(Date.now() / window);
  const key = await digest(`skilldash:${namespace}:${period}:${identity}`);
  const row = await env.DB.prepare('INSERT INTO rate_limits (client_key, requests, expires_at) VALUES (?, 1, ?) ON CONFLICT(client_key) DO UPDATE SET requests = requests + 1 RETURNING requests').bind(key, Date.now() + window * 2).first();
  if (row.requests > maximum) throw fail('Too many attempts. Please try again later.', 429);
}
function sessionCookie(value, request, age = 1209600) {
  // Production is always HTTPS. The unprefixed cookie is local-only for Wrangler development.
  const secure = new URL(request.url).protocol === 'https:';
  return `${secure ? cookieName : 'skilldash-local'}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
async function userFor(request, env) {
  const cookies = request.headers.get('Cookie') || '';
  const value = cookies.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`) || new URL(request.url).protocol === 'http:' && x.startsWith('skilldash-local='))?.split('=')[1];
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  return env.DB.prepare('SELECT u.id, u.email, u.display_name, u.verified_at FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await digest(value), Date.now()).first();
}
const isAdmin = (user, env) => Boolean(user && env.ADMIN_EMAIL && user.email === env.ADMIN_EMAIL.toLowerCase());
const publicUser = (user, env) => user ? { id: user.id, displayName: user.display_name, email: user.email, verified: true, admin: isAdmin(user, env) } : null;
async function authenticated(request, env) { const user = await userFor(request, env); if (!user) throw fail('Sign in with your email to continue.', 401); return user; }
async function administrator(request, env) { const user = await authenticated(request, env); if (!isAdmin(user, env)) throw fail('This page is for the SkillDash reviewer.', 403); return user; }
const listingColumns = 'l.id, l.slug, l.type, l.name, l.tagline, l.description, l.website, l.source_url, l.category, l.pricing, l.status, l.created_at, l.reviewed_at, l.agent_details, u.display_name AS maker, (SELECT COUNT(*) FROM votes v WHERE v.listing_id = l.id) AS votes';
const publicListing = row => { const { agent_details, ...fields } = row; return { ...fields, agentDetails: readAgentDetails(agent_details), sourceUrl: row.source_url, url: `${ORIGIN}/listings/${row.slug}`, badgeUrl: `${ORIGIN}/badges/${row.slug}.svg`, verified: row.status === 'published', verification: 'Source, listing details and publication rights reviewed; not a security certification.' }; };
async function published(env, { query = '', type = '', offset = 0, limit: count = 24 } = {}) {
  const filter = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const conditions = "l.status = 'published' AND (? = '' OR l.type = ?) AND (? = '' OR l.name LIKE ? ESCAPE '\\' OR l.tagline LIKE ? ESCAPE '\\')";
  const result = await env.DB.prepare(`SELECT ${listingColumns} FROM listings l JOIN users u ON u.id = l.owner_id WHERE ${conditions} ORDER BY votes DESC, l.created_at DESC LIMIT ? OFFSET ?`).bind(type, type, query, filter, filter, count, offset).all();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS total FROM listings l WHERE ${conditions}`).bind(type, type, query, filter, filter).first();
  return { listings: result.results.map(publicListing), total: total.total };
}
async function send(env, recipient, subject, content, html) {
  if (!env.EMAIL || !env.EMAIL_FROM) throw fail('Email sign-in is temporarily unavailable. Please try again later.', 503);
  return env.EMAIL.send({ to: recipient, from: { email: env.EMAIL_FROM, name: 'SkillDash' }, replyTo: env.ADMIN_EMAIL, subject, text: content, html });
}
export async function deliverNotifications(env) {
  if (!env.DB || !env.EMAIL || !env.EMAIL_FROM) return;
  const due = await env.DB.prepare("SELECT n.*, l.name, l.slug, l.type, l.website FROM notifications n JOIN listings l ON l.id = n.listing_id WHERE n.status != 'sent' AND n.attempts < 8 AND n.next_attempt_at <= ? AND n.lease_until < ? ORDER BY n.created_at LIMIT 10").bind(Date.now(), Date.now()).all();
  for (const item of due.results) {
    const claimed = await env.DB.prepare("UPDATE notifications SET status = 'sending', attempts = attempts + 1, lease_until = ? WHERE id = ? AND status != 'sent' AND lease_until < ? RETURNING id").bind(Date.now() + 120000, item.id, Date.now()).first();
    if (!claimed) continue;
    const url = item.kind === 'review' ? `${ORIGIN}/review` : item.kind === 'published' ? `${ORIGIN}/listings/${item.slug}` : `${ORIGIN}/account`;
    const phrases = { review: 'was submitted for review', receipt: 'was received and is awaiting review', published: 'is now public', rejected: 'has a review outcome available in your account' };
    const subjects = { review: 'SkillDash review', receipt: 'We received your SkillDash submission', published: 'Your SkillDash listing is published', rejected: 'Your SkillDash submission review' };
    const phrase = phrases[item.kind] || 'has a submission update';
    const subject = `${subjects[item.kind] || 'SkillDash update'}: ${item.name}`;
    const content = `${item.name} (${item.type}) ${phrase}.\n\nWebsite: ${item.website}\nOpen SkillDash: ${url}\n\nSubmission does not mean approval. Listing and voting on SkillDash are free. This is a transactional submission notification.`;
    try {
      const receipt = await send(env, item.recipient, subject, content, `<p>${e(item.name)} (${e(item.type)}) ${e(phrase)}.</p><p><a href="${e(url)}">Open SkillDash</a></p><p>Submission does not mean approval. Listing and voting are free.</p>`);
      await env.DB.prepare("UPDATE notifications SET status = 'sent', message_id = ?, lease_until = 0, last_error = NULL WHERE id = ?").bind(receipt.messageId || 'accepted', item.id).run();
    } catch (error) {
      await env.DB.prepare("UPDATE notifications SET status = 'pending', next_attempt_at = ?, lease_until = 0, last_error = ? WHERE id = ?").bind(Date.now() + Math.min(86400000, 60000 * 2 ** item.attempts), /^[A-Z_]+$/.test(error.code || '') ? error.code : 'EMAIL_DELIVERY_FAILED', item.id).run();
      console.error(JSON.stringify({ event: 'notification_failed', notificationId: item.id, code: error.code || 'EMAIL_DELIVERY_FAILED' }));
    }
  }
}
export async function communityApi(request, env, ctx) {
  const url = new URL(request.url), route = url.pathname;
  if (!route.startsWith('/api/auth/') && !route.startsWith('/api/community/')) return null;
  if (!env.DB && route !== '/tools') return json({ error: 'Community features are temporarily unavailable.' }, 503);
  try {
    if (route === '/api/auth/session' && request.method === 'GET') return json({ user: publicUser(await userFor(request, env), env), signInAvailable: Boolean(env.EMAIL && env.EMAIL_FROM) });
    if (route === '/api/auth/start' && request.method === 'POST') {
      const input = await body(request), email = text(input.email, 'Email', 5, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Provide a valid email address.');
      const name = text(input.displayName || email.split('@')[0], 'Display name', 2, 60);
      if (!env.EMAIL || !env.EMAIL_FROM) throw fail('Email sign-in is temporarily unavailable.', 503);
      await limit(env, 'login-network', request.headers.get('CF-Connecting-IP') || 'local', 20);
      await limit(env, 'login-email', email, 5);
      await limit(env, 'login-total', 'site', 1000, 86400000);
      const secret = token(), hash = await digest(secret), link = `${ORIGIN}/account#token=${secret}`;
      await env.DB.prepare('INSERT INTO login_tokens (token_hash, email, display_name, expires_at) VALUES (?, ?, ?, ?)').bind(hash, email, name, Date.now() + 900000).run();
      try { await send(env, email, 'Your SkillDash sign-in link', `Sign in to SkillDash: ${link}\n\nThis link expires in 15 minutes and works once. If you did not request it, ignore this email.`, `<p>Sign in to SkillDash to submit and vote.</p><p><a href="${e(link)}">Continue to SkillDash</a></p><p>This link expires in 15 minutes and works once. If you did not request it, ignore this email.</p>`); }
      catch { await env.DB.prepare('DELETE FROM login_tokens WHERE token_hash = ?').bind(hash).run(); throw fail('The sign-in email could not be sent. Please try again later.', 503); }
      return json({ message: 'Check your email for a one-time sign-in link. It expires in 15 minutes.' }, 202);
    }
    if (route === '/api/auth/verify' && request.method === 'POST') {
      const input = await body(request);
      if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw fail('The sign-in link is invalid or expired. Request a new link.', 401);
      await limit(env, 'verify-network', request.headers.get('CF-Connecting-IP') || 'local', 30);
      const row = await env.DB.prepare('DELETE FROM login_tokens WHERE token_hash = ? AND expires_at > ? RETURNING email, display_name').bind(await digest(input.token), Date.now()).first();
      if (!row) throw fail('The sign-in link is invalid or expired. Request a new link.', 401);
      await env.DB.prepare('INSERT INTO users (id, email, display_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING').bind(crypto.randomUUID(), row.email, row.display_name, now(), now()).run();
      const user = await env.DB.prepare('SELECT id, email, display_name, verified_at FROM users WHERE email = ?').bind(row.email).first();
      const secret = token();
      await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await digest(secret), user.id, Date.now() + 1209600000).run();
      return json({ user: publicUser(user, env) }, 200, { 'Set-Cookie': sessionCookie(secret, request) });
    }
    if (route === '/api/auth/logout' && request.method === 'POST') {
      await body(request);
      const user = await userFor(request, env);
      const secret = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '=') || x.startsWith('skilldash-local='))?.split('=')[1];
      if (user && secret) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(secret)).run();
      return json({ message: 'Signed out.' }, 200, { 'Set-Cookie': sessionCookie('', request, 0) });
    }
    if (route === '/api/community/listings' && request.method === 'GET') {
      const query = (url.searchParams.get('q') || '').slice(0, 200), type = url.searchParams.get('type') || '';
      if (type && !types.includes(type)) throw fail('Unknown listing type.');
      return json(await published(env, { query, type, offset: Math.trunc(Math.max(0, Math.min(10000, Number(url.searchParams.get('offset')) || 0))) }), 200, { 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' });
    }
    if (route === '/api/community/listings' && request.method === 'POST') {
      const raw = await body(request), user = await authenticated(request, env), input = validateListing(raw), contact = validateContact(raw, user.email);
      await limit(env, 'submit-account', user.id, 5, 86400000);
      const existing = await env.DB.prepare('SELECT id, slug, status FROM listings WHERE website = ?').bind(input.website).first();
      if (existing) return json({ ...existing, message: 'This website already has a listing or review submission.' }, 409);
      const id = crypto.randomUUID(), slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'listing'}-${id.slice(0, 8)}`;
      const statements = [env.DB.prepare('INSERT INTO listings (id, slug, owner_id, type, name, tagline, description, website, source_url, category, pricing, created_at, agent_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, slug, user.id, input.type, input.name, input.tagline, input.description, input.website, input.source_url, input.category, input.pricing, now(), input.agent_details), env.DB.prepare('INSERT INTO listing_contacts (listing_id, email, phone, phone_validation, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, contact.email, contact.phone, contact.phoneValidation, now()), env.DB.prepare('INSERT INTO notifications (id, listing_id, kind, recipient, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'receipt', user.email, now())];
      if (env.ADMIN_EMAIL) statements.push(env.DB.prepare('INSERT INTO notifications (id, listing_id, kind, recipient, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'review', env.ADMIN_EMAIL, now()));
      await env.DB.batch(statements);
      if (ctx?.waitUntil) ctx.waitUntil(deliverNotifications(env));
      return json({ id, slug, status: 'pending', receiptEmail: 'queued', message: 'Submitted for review. A receipt is queued for your verified email. Track the review in your account. Your public share link becomes available after approval.' }, 202);
    }
    if (route === '/api/community/mine' && request.method === 'GET') {
      const user = await authenticated(request, env);
      const rows = await env.DB.prepare(`SELECT ${listingColumns}, l.review_note FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.owner_id = ? ORDER BY l.created_at DESC LIMIT 100`).bind(user.id).all();
      return json({ listings: rows.results.map(publicListing) });
    }
    const vote = route.match(/^\/api\/community\/listings\/([a-f0-9-]{36})\/vote$/);
    if (vote && request.method === 'GET') {
      const user = await authenticated(request, env);
      const listing = await env.DB.prepare("SELECT id FROM listings WHERE id = ? AND status = 'published'").bind(vote[1]).first();
      if (!listing) throw fail('Published listing not found.', 404);
      const count = await env.DB.prepare('SELECT COUNT(*) AS votes FROM votes WHERE listing_id = ?').bind(listing.id).first();
      const own = await env.DB.prepare('SELECT user_id FROM votes WHERE listing_id = ? AND user_id = ?').bind(listing.id, user.id).first();
      return json({ votes: count.votes, voted: Boolean(own) });
    }
    if (vote && request.method === 'PUT') {
      const input = await body(request), user = await authenticated(request, env);
      if (typeof input.voted !== 'boolean') throw fail('Provide voted: true or false.');
      const listing = await env.DB.prepare("SELECT id FROM listings WHERE id = ? AND status = 'published'").bind(vote[1]).first();
      if (!listing) throw fail('Published listing not found.', 404);
      await limit(env, 'vote', user.id, 120);
      if (input.voted) await env.DB.prepare('INSERT INTO votes (listing_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(listing_id, user_id) DO NOTHING').bind(listing.id, user.id, now()).run();
      else await env.DB.prepare('DELETE FROM votes WHERE listing_id = ? AND user_id = ?').bind(listing.id, user.id).run();
      const count = await env.DB.prepare('SELECT COUNT(*) AS votes FROM votes WHERE listing_id = ?').bind(listing.id).first();
      return json({ votes: count.votes, voted: input.voted });
    }
    if (route === '/api/community/review' && request.method === 'GET') {
      await administrator(request, env);
      const rows = await env.DB.prepare(`SELECT ${listingColumns}, l.review_note, u.email AS contact_email, c.phone AS contact_phone, c.phone_validation FROM listings l JOIN users u ON u.id = l.owner_id LEFT JOIN listing_contacts c ON c.listing_id = l.id WHERE l.status = 'pending' ORDER BY l.created_at LIMIT 100`).all();
      const failures = await env.DB.prepare("SELECT id, listing_id, kind, status, attempts, last_error FROM notifications WHERE status != 'sent' ORDER BY created_at DESC LIMIT 20").all();
      return json({ listings: rows.results, notifications: failures.results });
    }
    const review = route.match(/^\/api\/community\/review\/([a-f0-9-]{36})$/);
    if (review && request.method === 'POST') {
      const input = await body(request), user = await administrator(request, env);
      if (!['published', 'rejected'].includes(input.status)) throw fail('Choose approve or reject.');
      const note = text(input.note, 'Review note', 10, 1000);
      if (input.status === 'published' && (!input.checks?.source || !input.checks?.details || !input.checks?.rights)) throw fail('Confirm the source, listing details and publication rights before approval.');
      const row = await env.DB.prepare('SELECT l.*, u.email FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.id = ?').bind(review[1]).first();
      if (!row) throw fail('Listing not found.', 404);
      if (row.status !== 'pending') throw fail('This submission has already been reviewed.', 409);
      const reviewedAt = now(), agentDetails = input.status === 'published' ? validateAgentDetails(input.agentDetails || readAgentDetails(row.agent_details), row.type) : readAgentDetails(row.agent_details);
      if (input.status === 'published' && (!agentDetails.compatibility || !agentDetails.installation)) throw fail('Define agent compatibility and usage instructions before publication.');
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE listings SET status = ?, reviewed_at = ?, reviewer_id = ?, review_note = ?, review_checks = ?, agent_details = ? WHERE id = ? AND status = 'pending'").bind(input.status, reviewedAt, user.id, note, JSON.stringify(input.checks || {}), JSON.stringify(agentDetails), row.id),
        env.DB.prepare("INSERT INTO notifications (id, listing_id, kind, recipient, created_at) SELECT ?, l.id, ?, u.email, ? FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.id = ? AND l.status = ? AND l.reviewed_at = ? ON CONFLICT(listing_id, kind) DO NOTHING").bind(crypto.randomUUID(), input.status === 'published' ? 'published' : 'rejected', reviewedAt, row.id, input.status, reviewedAt),
      ]);
      if (results[0].meta.changes !== 1) throw fail('This submission has already been reviewed.', 409);
      if (ctx?.waitUntil) ctx.waitUntil(deliverNotifications(env));
      return json({ status: input.status, url: `${ORIGIN}/listings/${row.slug}` });
    }
    return json({ error: 'Endpoint or method not found.' }, 405);
  } catch (error) {
    if (!error.status) console.error(JSON.stringify({ event: 'community_failed', path: route, error: error.name || 'Error' }));
    return json({ error: error.status ? error.message : 'Community service is temporarily unavailable.' }, error.status || 503, error.status === 429 ? { 'Retry-After': '3600' } : {});
  }
}

const pageHeader = `<header class="site-header community-header"><a class="wordmark" href="/" aria-label="SkillDash home"><img class="brand-logo" src="/skilldash-logo.webp" width="180" height="60" alt="SkillDash"><span class="beta-tag">FREE</span></a><nav aria-label="Main navigation"><a href="/skills">Skill Library</a><a href="/products">Community</a><a href="/publish">Publish</a></nav><a class="button" href="/account">Sign in / Join</a></header>`;
const pageFooter = `<footer><a class="footer-brand" href="/">SkillDash<span>The free Skill Library and AI directory.</span></a><div><a href="/about">About</a><a href="/publishing-policy">Review policy</a><a href="/privacy">Privacy</a><a href="/for-agents">API & MCP</a></div></footer>`;
const cards = rows => rows.map(row => `<article class="community-card"><span class="eyebrow">${e(row.type)} · ${e(row.category)}</span><h2><a href="/listings/${e(row.slug)}">${e(row.name)}</a></h2><p>${e(row.tagline)}</p><p class="maker">By ${e(row.maker)} · ${e(row.pricing)}</p><span class="reviewed-label">Reviewed listing</span><p>${Number(row.votes)} community votes</p></article>`).join('');
export async function communityPage(request, env) {
  const url = new URL(request.url), route = url.pathname;
  if (!['/products', '/tools', '/publish', '/account', '/review'].includes(route) && !route.startsWith('/listings/') && !route.startsWith('/badges/') && route !== '/sitemaps/community.xml') return null;
  if (!env.DB && route !== '/tools') return json({ error: 'Community features are temporarily unavailable.' }, 503);
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  const detail = route.match(/^\/(listings|badges)\/([a-z0-9-]+)(\.svg)?$/);
  let listing;
  if (detail && (detail[1] === 'badges' ? detail[3] === '.svg' : !detail[3])) listing = await env.DB.prepare(`SELECT ${listingColumns} FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.slug = ? AND l.status = 'published'`).bind(detail[2]).first();
  if (route === '/sitemaps/community.xml') {
    const rows = await env.DB.prepare("SELECT slug, reviewed_at FROM listings WHERE status = 'published' ORDER BY slug LIMIT 45000").all();
    const tools=searchAgentTools();
    const toolPages=Array.from({length:Math.ceil(tools.total/20)},(_,i)=>`<url><loc>${ORIGIN}/tools${i?'?page='+String(i+1):''}</loc><lastmod>${e(tools.generatedAt.slice(0,10))}</lastmod></url>`).join('');
    return new Response(request.method === 'HEAD' ? null : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/products</loc></url>${toolPages}${rows.results.map(row => `<url><loc>${ORIGIN}/listings/${e(row.slug)}</loc><lastmod>${e(row.reviewed_at.slice(0, 10))}</lastmod></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  }
  if (route.startsWith('/badges/')) {
    if (!listing || !route.endsWith('.svg')) return new Response('Published listing not found.', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="40" viewBox="0 0 220 40" role="img" aria-label="Listed on SkillDash"><rect width="220" height="40" rx="6" fill="#166347"/><path d="M17 13h6v6h-6zm9 0h6v6h-6zm-9 9h6v6h-6zm9 0h6v6h-6z" fill="#b9ff65"/><text x="44" y="25" fill="white" font-family="Arial,sans-serif" font-size="15">Listed on SkillDash</text></svg>', { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
  }
  let title = 'SkillDash — free AI products, plugins and Skill Library', description = 'Discover reviewed AI products, agent skills, plugins, MCP servers and libraries. Submit your work free, vote with a verified email and share your public SkillDash page.', main, status = 200, noindex = false, graph = [];
  if (route === '/products') {
    const rawPage = url.searchParams.get('page') || '1';
    const validPage = /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= 1000;
    const current = validPage ? Number(rawPage) : 1;
    const result = await published(env, { offset: (current - 1) * 24 });
    if (!validPage || current > 1 && (current - 1) * 24 >= result.total) status = 404;
    main = `<header class="reading-header"><span class="eyebrow">THE FREE COMMUNITY DIRECTORY</span><h1>Build something useful.<br>Give it a home on SkillDash.</h1><p class="reading-lead">Agent skills, chatbots, AI products, plugins, MCP servers, tools and libraries. Free to submit. Reviewed before publication. Voted on by people with verified emails.</p><a class="button button-green" href="/publish">Publish your work — free</a></header><form class="community-filter" id="community-search"><label for="community-query">Find a product, skill or plugin</label><input id="community-query" name="q" type="search" maxlength="200" placeholder="Search by name or task"><label for="community-type">Type</label><select id="community-type" name="type"><option value="">All types</option>${types.map(type => `<option>${type}</option>`).join('')}</select><button class="button" type="submit">Search</button></form><p id="community-count" role="status">${result.total} reviewed community listings. The curated <a href="/skills">Skill Library</a> is also open to browse.</p><div id="community-results" class="community-grid">${cards(result.listings) || '<p>No community listings have been approved yet. Submit your first project for review.</p>'}</div><nav class="pagination" aria-label="Community pages">${current > 1 ? `<a href="/products?page=${current - 1}">Previous</a>` : ''}${current * 24 < result.total ? `<a href="/products?page=${current + 1}">Next</a>` : ''}</nav>`;
    if (current > 1) title = `AI directory — page ${current} | SkillDash`;
    graph = [{ '@type': 'CollectionPage', name: title, description, url: ORIGIN + route }, { '@type': 'ItemList', itemListElement: result.listings.map((row, index) => ({ '@type': 'ListItem', position: (current - 1) * 24 + index + 1, name: row.name, url: `${ORIGIN}/listings/${row.slug}` })) }];
  } else if (route === '/tools') {
    title = 'Agent tools, plugins, libraries and chatbots | SkillDash';
    description = 'Curated agent software metadata with pinned source documentation. Browse plugins, libraries, MCP servers, tools and chatbots.';
    const query=(url.searchParams.get('q')||'').slice(0,200), type=url.searchParams.get('type')||'', rawPage=url.searchParams.get('page')||'1';
    const current=/^[1-9]\d{0,3}$/.test(rawPage)?Number(rawPage):1;
    const result = searchAgentTools({query,type,offset:(current-1)*20});
    if(!/^[1-9]\d{0,3}$/.test(rawPage)||current>1&&!result.tools.length)status=404;
    const pageUrl = page => {const params=new URLSearchParams();if(query)params.set('q',query);if(type)params.set('type',type);if(page>1)params.set('page',String(page));return '/tools'+(params.size?'?'+params:'');};
    const pages=Math.max(1,Math.ceil(result.total/20));
    noindex=Boolean(query||type);
    if(current>1)title=`Agent tools and plugins, page ${current} | SkillDash`;
    const pagination=`<nav class="pagination" aria-label="Agent tool pages">${current>1?`<a href="${e(pageUrl(current-1))}">Previous</a>`:'<span></span>'}<span>Page ${current} of ${pages}</span>${current<pages?`<a href="${e(pageUrl(current+1))}">Next</a>`:'<span></span>'}</nav>`;
    main = `<header class="reading-header"><h1>Software your agent can use.</h1><p class="reading-lead">Search plugins, libraries, MCP servers, tools and chatbots. Browse the complete recorded official Claude plugin marketplace alongside curated agent repositories.</p><p>Read the pinned source for compatibility, installation, permissions and pricing. Marketplace stars describe the directory, not every plugin. SkillDash links to upstream code; it does not install or run plugins for you.</p><div class="reading-actions"><a class="button button-green" href="/agent.md">Agent instructions</a><a class="button" href="/api/tools">Machine-readable tools</a><a class="button" href="/publish">Add your tool</a></div></header><form class="community-filter" action="/tools"><label for="tool-query">Search by name or task</label><input id="tool-query" name="q" type="search" maxlength="200" value="${e(query)}" placeholder="Browser, design, database…"><label for="tool-type">Type</label><select id="tool-type" name="type"><option value="">All types</option>${['plugin','library','mcp','tool','chatbot'].map(item=>`<option value="${item}"${type===item?' selected':''}>${item}</option>`).join('')}</select><button class="button" type="submit">Search tools</button></form><p role="status">${result.total.toLocaleString('en-US')} matching tools${result.pluginSource?`. ${result.pluginSource.count} plugin entries recorded on ${e(result.pluginSource.checkedAt.slice(0,10))} from the official marketplace`:''}.</p>${pagination}<div class="community-grid">${result.tools.map(tool=>`<article class="community-card tool-card"><p class="tool-kind">${e(tool.type)}${tool.host?' · '+e(tool.host):''}</p><h2>${e(tool.name)}</h2>${tool.author?`<p class="tool-source">By ${e(tool.author)}</p>`:""}<p>${e(tool.description)}</p><p>${e(tool.capabilities.join(' · '))}</p><p class="tool-source">${e(tool.repo)}${tool.repositoryStars!=null?' · '+tool.repositoryStars.toLocaleString('en-US')+' repository stars':''} · checked ${e(tool.checkedAt.slice(0,10))}</p>${tool.marketplace?`<p class="tool-source">Listed in ${e(tool.marketplace.name)} · ${tool.marketplace.repositoryStars.toLocaleString('en-US')} marketplace repository stars</p>`:''}<p>${e(tool.license)}</p><div class="reading-actions"><a href="${e(tool.documentationUrl)}" target="_blank" rel="noopener noreferrer">Read setup & source ↗</a>${tool.downloadUrl?`<a href="${e(tool.downloadUrl)}" rel="noopener noreferrer">Download source ZIP ↗</a>`:''}</div></article>`).join('')||'<p>No tools match. Try a different name or task.</p>'}</div>${pagination}<section class="library-explainer"><h2>Plugins, explained</h2><div class="faq-grid"><details><summary>Does every plugin work in every agent?</summary><p>No. These marketplace entries target Claude Code. Read each source for supported hosts, dependencies and permissions. Portable skills and MCP servers have their own compatibility requirements.</p></details><details><summary>Are plugins and connected services free?</summary><p>SkillDash discovery and submission are free. An upstream plugin or service can require an account, API key or paid plan. Check its current terms before installing.</p></details><details><summary>What does Download source ZIP include?</summary><p>The upstream repository at the recorded commit. A plugin can live in a subfolder of that archive. Follow its README for installation; downloading an archive does not install it.</p></details><details><summary>Can I add my own plugin?</summary><p>Yes. Submit public details through <a href="/publish">Add your tool</a>. A verified email receives review updates. Publication requires owner review.</p></details></div></section><p>Recorded source metadata is separate from reviewed community submissions. Stars and inclusion are not security certification. <a href="/products">Browse reviewed community listings</a>.</p>`;
    graph = [{'@type':'CollectionPage',name:title,description,url:ORIGIN+pageUrl(current)},{'@type':'ItemList',itemListElement:result.tools.map((tool,index)=>({'@type':'ListItem',position:result.offset+index+1,name:tool.name,url:tool.documentationUrl}))}];
  } else if (route === '/account') {
    title = 'Sign in or create your free SkillDash account'; noindex = true;
    main = `<header class="reading-header"><h1>Your work. Your SkillDash.</h1><p class="reading-lead">Join free with a verified email. Submit your work, track reviews and vote. No password to remember.</p></header><div id="account-state"></div><form id="sign-in-form" class="community-form"><label for="display-name">Display name</label><input id="display-name" name="displayName" minlength="2" maxlength="60" required autocomplete="nickname"><label for="login-email">Email address</label><input id="login-email" name="email" type="email" required maxlength="254" autocomplete="email"><button class="button button-green" type="submit">Email my sign-in link</button><p>We email a link that works once and expires in 15 minutes. Your email stays private. Read our <a href="/privacy">privacy information</a>.</p></form><button id="complete-sign-in" class="button button-green" hidden>Complete sign-in</button><section id="my-listings" hidden><h2>Your submissions</h2><div id="my-listings-content"></div></section>`;
  } else if (route === '/publish') {
    title = 'Publish your AI product, plugin or skill free | SkillDash';
    main = `<header class="reading-header"><span class="eyebrow">FREE FOR EVERY CREATOR</span><h1>Publish on SkillDash.</h1><p class="reading-lead">Share a skill, chatbot, AI product, plugin, MCP server, library or tool for agents. No listing fees. No minimum followers or GitHub stars.</p><p>We review sources, listing details and publication rights. Approval creates a public page and a badge you can share. A reviewed listing is not a security certification. <a href="/publishing-policy">How reviews work</a>.</p></header><p id="publish-auth">Sign in with a verified email to submit. <a href="/account">Sign in / Join free</a></p><form id="publish-form" class="community-form" hidden><label for="listing-type">What are you sharing?</label><select id="listing-type" name="type">${types.map(type => `<option>${type}</option>`).join('')}</select><label for="listing-name">Name</label><input id="listing-name" name="name" minlength="2" maxlength="80" required><label for="listing-tagline">Tagline</label><input id="listing-tagline" name="tagline" minlength="10" maxlength="140" required><label for="listing-description">What does it do, and who is it for?</label><textarea id="listing-description" name="description" minlength="50" maxlength="5000" rows="7" required></textarea><label for="listing-website">Public website or repository URL</label><input id="listing-website" name="website" type="url" placeholder="https://" maxlength="500" required><label for="listing-source">Source or documentation URL (optional)</label><input id="listing-source" name="sourceUrl" type="url" placeholder="https://" maxlength="500">${renderAgentFields({},'skill')}<fieldset class="contact-fields"><legend>Private contact details</legend><label for="contact-email">Verified contact email</label><input id="contact-email" name="contactEmail" type="email" readonly required maxlength="254"><p>Your receipt and review updates go to this verified account email. Sign in with another email account to change it.</p><label for="contact-phone">Phone number (optional, private)</label><input id="contact-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"><p>Email and phone are visible only to you and the reviewer for submission follow-up. Phone is optional and is not verified.</p></fieldset><label for="listing-category">Category</label><select id="listing-category" name="category">${categories.map(category => `<option>${e(category)}</option>`).join('')}</select><label for="listing-pricing">Your product’s pricing</label><select id="listing-pricing" name="pricing"><option>Free</option><option>Open source</option><option>Freemium</option><option>Paid</option></select><p>SkillDash listing and voting are always free. The product itself may have its own price.</p><label class="personal-check"><input type="checkbox" name="rights" required> I own this work or have permission to submit its public details.</label><button class="button button-green" type="submit">Submit for review — free</button></form>`;
  } else if (route === '/review') {
    noindex = true; title = 'SkillDash review queue';
    main = '<header class="reading-header"><h1>Review submissions.</h1><p class="reading-lead">Open the source. Verify the details and publication rights. Publish only when all checks are complete.</p></header><p id="review-auth">Sign in with the reviewer email to see the queue.</p><div id="review-queue"></div><section><h2>Notification delivery</h2><div id="notification-status"></div></section>';
  } else if (listing) {
    title = `${listing.name} — ${listing.type} | SkillDash`; description = listing.tagline;
    main = `<article><header class="reading-header"><span class="eyebrow">${e(listing.type)} · ${e(listing.category)}</span><h1>${e(listing.name)}</h1><p class="reading-lead">${e(listing.tagline)}</p><p>By ${e(listing.maker)} · ${e(listing.pricing)}</p><span class="reviewed-label">Reviewed listing · ${e(listing.reviewed_at.slice(0, 10))}</span></header><div class="reading-actions"><a class="button button-green" href="${e(listing.website)}" target="_blank" rel="ugc noopener noreferrer">Visit website ↗</a><button class="button" id="vote-button" data-id="${listing.id}" aria-pressed="false">Vote · <span id="vote-count">${listing.votes}</span></button><button class="button" id="share-listing">Copy share link</button></div><p id="vote-auth">Sign in to vote. One vote per verified account.</p><section class="reading-section"><h2>About ${e(listing.name)}</h2>${listing.description.split(/\n+/).filter(Boolean).map(line => `<p>${e(line)}</p>`).join('')}</section>${renderAgentDetails(readAgentDetails(listing.agent_details))}${listing.source_url ? `<p><a href="${e(listing.source_url)}" target="_blank" rel="ugc noopener noreferrer">Source / documentation ↗</a></p>` : ''}<section class="reading-section"><h2>Showcase your SkillDash listing</h2><p>Use the public link or add this badge to your website or README.</p><img src="/badges/${e(listing.slug)}.svg" alt="Listed on SkillDash" width="220" height="40"><textarea id="listing-badge-code" rows="4" readonly aria-label="SkillDash badge HTML">${e(`<a href="${ORIGIN}/listings/${listing.slug}"><img src="${ORIGIN}/badges/${listing.slug}.svg" alt="Listed on SkillDash" width="220" height="40"></a>`)}</textarea><button class="button" id="copy-badge">Copy badge HTML</button></section><p>We reviewed the source, details and publication rights. This is not a security certification, endorsement or guarantee of product performance.</p></article>`;
    graph = [breadcrumbs([{ name: 'SkillDash', path: '/' }, { name: 'Community', path: '/products' }, { name: listing.name, path: route }]), { '@type': 'WebPage', name: listing.name, description: listing.tagline, url: ORIGIN + route, dateModified: listing.reviewed_at, mainEntity: { '@type': 'CreativeWork', name: listing.name, description: listing.description, url: listing.website, genre: listing.type, author: { '@type': 'Person', name: listing.maker }, sameAs: listing.source_url || listing.website } }];
  } else { status = 404; noindex = true; title = 'Listing not found | SkillDash'; main = '<h1>This listing is not public.</h1><p>Pending submissions are visible only to their owner and the reviewer.</p><a href="/products">Browse reviewed listings</a>'; }
  const shellUrl = new URL('/community-shell.html', request.url);
  const shell = await env.ASSETS.fetch(new Request(shellUrl));
  if (!shell.ok) return json({ error: 'Community page assets are temporarily unavailable.' }, 503);
  const meta = metadata({ path: ['/products','/tools'].includes(route) && Number(url.searchParams.get('page')) > 1 ? `${route}?page=${Number(url.searchParams.get('page'))}` : route, title, description, robots: noindex || status !== 200 ? 'noindex, follow' : 'index, follow, max-image-preview:large' });
  const html = (await shell.text()).replace('<!-- SEO_HEAD -->', () => renderHead(meta, graph)).replace('<div id="root"></div>', () => `${pageHeader}<main class="reading-page community-page">${main}<p id="community-message" role="status" aria-live="polite"></p></main>${pageFooter}<script type="module" src="/community.js"></script>`);
  return new Response(request.method === 'HEAD' ? null : html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': noindex ? 'no-store' : 'public, max-age=60', 'X-Robots-Tag': noindex || status !== 200 ? 'noindex, follow' : 'index, follow, max-image-preview:large', 'Referrer-Policy': noindex ? 'no-referrer' : 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'", 'X-Content-Type-Options': 'nosniff' } });
}
