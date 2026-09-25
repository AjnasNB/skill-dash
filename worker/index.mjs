import catalog from '../registry/catalog.json' with { type: 'json' };
import { searchCatalog } from '../lib/search.mjs';
import { COLLECTIONS, GUIDES } from '../site/content.mjs';

const byId = new Map(catalog.skills.map(skill => [skill.id, skill]));
const canonical = 'https://skills.maqamagent.com';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex, follow', ...extra } });
const guidePaths = new Set(GUIDES.map(guide => guide.path));
const collectionPaths = new Set(COLLECTIONS.map(collection => `/collections/${collection.slug}`));
export function validateSubmission(input) {
  if (!input || typeof input !== 'object' || typeof input.repo !== 'string' || typeof input.path !== 'string') throw new Error('Provide a public GitHub repository URL and skill folder.');
  const url = new URL(input.repo);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash) throw new Error('Use an HTTPS github.com repository URL.');
  const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (!match || match[1] === '.' || match[1] === '..' || match[2] === '.' || match[2] === '..') throw new Error('Use https://github.com/owner/repository.');
  const repo = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
  const folder = input.path.trim().replace(/\/SKILL\.md$/, '').replace(/\/$/, '');
  if (folder !== '.' && (folder.length > 300 || !/^[A-Za-z0-9_. /-]+$/.test(folder) || folder.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.git')))) throw new Error('Provide a relative skill folder without parent traversal.');
  return { repo, path: folder };
}
async function submission(request, env) {
  if (!env.DB) return json({ error: 'Submissions are temporarily unavailable. Please use the GitHub contribution form.' }, 503);
  const origin = request.headers.get('Origin');
  const here = new URL(request.url);
  if (origin && origin !== canonical && origin !== here.origin) return json({ error: 'This origin cannot submit skills.' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send application/json.' }, 415);
  if (Number(request.headers.get('content-length')) > 4096) return json({ error: 'Submission is too large.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'A submission body is required.' }, 400);
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); return json({ error: 'Submission is too large.' }, 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let input;
  try {
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    input = validateSubmission(JSON.parse(new TextDecoder().decode(buffer)));
  } catch (error) { return json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }, 400); }
  const existingSkill = catalog.skills.find(skill => skill.repo.toLowerCase() === input.repo.toLowerCase() && skill.path === input.path);
  if (existingSkill) return json({ id: existingSkill.id, status: 'published', message: 'This skill is already in the library.' });
  const date = new Date().toISOString().slice(0, 10);
  const client = request.headers.get('CF-Connecting-IP') || 'local';
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${date}:skill-library:${client}`));
  const key = [...new Uint8Array(hashed)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const limit = await env.DB.prepare('INSERT INTO rate_limits (client_key, requests, expires_at) VALUES (?, 1, ?) ON CONFLICT(client_key) DO UPDATE SET requests = requests + 1 RETURNING requests')
    .bind(key, Date.now() + 86400000).first();
  if (limit.requests > 10) return json({ error: 'The daily submission limit is 10 per network. Try again tomorrow.' }, 429, { 'Retry-After': '86400' });
  const id = crypto.randomUUID();
  const row = await env.DB.prepare('INSERT INTO submissions (id, repo, skill_path, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(repo, skill_path) DO NOTHING RETURNING id')
    .bind(id, input.repo.toLowerCase(), input.path, 'pending', new Date().toISOString()).first();
  const receipt = row || await env.DB.prepare('SELECT id FROM submissions WHERE repo = ? AND skill_path = ?').bind(input.repo.toLowerCase(), input.path).first();
  return json({ id: receipt.id, status: 'pending', message: 'Your source is queued for review. Publication requires a public repository, 1,000+ repository stars, a recognized redistributable license, and valid skill files.' }, 202, { 'Cache-Control': 'no-store' });
}
async function asset(env, request, pathname, extras = {}, status) {
  const url = new URL(request.url); url.pathname = pathname; url.search = '';
  const response = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
  const modified = new Headers(response.headers);
  for (const [key, value] of Object.entries({ ...headers, ...extras })) modified.set(key, value);
  return new Response(request.method === 'HEAD' ? null : response.body, { status: status ?? response.status, headers: modified });
}
const page = (env, request, pathname, { noindex = false, status } = {}) => asset(env, request, pathname, {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'X-Robots-Tag': noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large',
}, status);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
      if (url.pathname === '/api/submissions') {
        if (request.method !== 'POST') return json({ error: 'Use POST to submit a skill.' }, 405, { Allow: 'POST' });
        return await submission(request, env);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, HEAD' });
      if (url.pathname === '/api/health') return json({ status: 'ok', version: '0.1.0', skills: catalog.total, repositories: catalog.sourceCount, generatedAt: catalog.generatedAt });
      if (url.pathname === '/api/skills') {
        const query = url.searchParams.get('q') || '';
        if (query.length > 500) return json({ error: 'Search text must be at most 500 characters.' }, 400);
        const result = searchCatalog(catalog, { query, category: url.searchParams.get('category') || '', sort: url.searchParams.get('sort') || 'relevance', offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 20), official: url.searchParams.get('official') === 'true' });
        return json({ ...result, generatedAt: catalog.generatedAt }, 200, { 'Cache-Control': 'public, max-age=300' });
      }
      if (url.pathname === '/api/categories') return json(catalog.categories, 200, { 'Cache-Control': 'public, max-age=3600' });
      const apiSkill = url.pathname.match(/^\/api\/skills\/([a-z0-9._-]+)(?:\/(download|content|manifest))?$/);
      if (apiSkill) {
        const skill = byId.get(apiSkill[1]);
        if (!skill) return json({ error: 'Skill not found.' }, 404);
        if (apiSkill[2] === 'download') return asset(env, request, `/bundles/${skill.id}.zip`, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${skill.name}.zip"` });
        if (apiSkill[2] === 'content') return asset(env, request, `/documents/${skill.id}.md`, { 'Content-Type': 'text/plain; charset=utf-8' });
        if (apiSkill[2] === 'manifest') return asset(env, request, `/manifests/${skill.id}.json`, { 'Content-Type': 'application/json; charset=utf-8' });
        return json({ ...skill, manifestUrl: `${canonical}/manifests/${skill.id}.json`, contentUrl: `${canonical}/documents/${skill.id}.md`, downloadUrl: `${canonical}/bundles/${skill.id}.zip` }, 200, { 'Cache-Control': 'public, max-age=3600' });
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Endpoint not found.' }, 404);
      if (url.pathname === '/') return page(env, request, '/index.html', { noindex: url.searchParams.has('q') || url.searchParams.has('category') });
      // Keep one public URL for a page, even though its stored asset has an .html suffix.
      const normalized = url.pathname.replace(/(?:\.html|\/)$/, '');
      if (normalized !== url.pathname && (guidePaths.has(normalized) || collectionPaths.has(normalized) || normalized === '/skills' || /^\/skills\/[a-z0-9._-]+$/.test(normalized) && byId.has(normalized.slice(8)))) {
        return Response.redirect(`${canonical}${normalized}${url.search}`, 301);
      }
      if (guidePaths.has(url.pathname) || collectionPaths.has(url.pathname)) return page(env, request, `${url.pathname}.html`);
      if (url.pathname === '/skills') {
        const raw = url.searchParams.get('page') || '1';
        if (!/^[1-9]\d{0,3}$/.test(raw) || Number(raw) > Math.ceil(catalog.total / 48)) return page(env, request, '/404.html', { noindex: true, status: 404 });
        if (url.searchParams.get('page') === '1') return Response.redirect(`${canonical}/skills`, 301);
        return page(env, request, `/directory/page-${raw}.html`);
      }
      const detail = url.pathname.match(/^\/skills\/([a-z0-9._-]+)$/);
      if (detail) {
        const skill = byId.get(detail[1]);
        if (!skill) return page(env, request, '/404.html', { noindex: true, status: 404 });
        return page(env, request, `/skills/${skill.id}.html`);
      }
      if (url.pathname.startsWith('/directory/')) return page(env, request, '/404.html', { noindex: true, status: 404 });
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failed', path: url.pathname, error: error.name || 'Error' }));
      return json({ error: 'The service is temporarily unavailable. Please try again.' }, 503);
    }
  },
  async scheduled(_event, env) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(Date.now()).run();
  },
};
