import { loadCatalog, loadManifest, REGISTRY_URL } from './catalog.mjs';
import { validateManifest } from './install.mjs';
let current;
export async function fetchBoundedJson(url, maximumBytes, fetcher = fetch) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Library request failed (${response.status}).`);
  if (Number(response.headers.get('content-length')) > maximumBytes) throw new Error('Library response is too large.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new Error('Library response is too large.'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function validateLiveCatalog(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.skills) || value.skills.length > 50000
    || typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) throw new Error('Invalid live library catalog.');
  const ids = new Set();
  for (const skill of value.skills) {
    if (!/^[a-z0-9][a-z0-9._-]{0,150}$/.test(skill.id || '') || ids.has(skill.id)
      || !/^[a-f0-9]{40}$/.test(skill.revision || '') || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill.repo || '')
      || typeof skill.name !== 'string' || skill.name.length > 256 || typeof skill.description !== 'string' || skill.description.length > 10000
      || typeof skill.path !== 'string' || skill.path.length > 2048 || !Array.isArray(skill.tags) || skill.tags.length > 100
      || skill.tags.some(tag => typeof tag !== 'string' || tag.length > 256)
      || !Number.isSafeInteger(skill.fileCount) || skill.fileCount < 1 || skill.fileCount > 600
      || !/^[a-f0-9]{64}$/.test(skill.sha256 || '')) throw new Error('Invalid or duplicate skill in live catalog.');
    ids.add(skill.id);
  }
  return value;
}
export async function currentCatalog(options = {}) {
  if (options.offline) return { catalog: await loadCatalog(), basis: 'package-pinned', stale: true };
  const now = options.now?.() ?? Date.now();
  if (!options.fetcher && current && current.expiresAt > now && !options.refresh) return structuredClone(current.result);
  try {
    const catalog = validateLiveCatalog(await fetchBoundedJson(`${REGISTRY_URL}/catalog.json`, 16_000_000, options.fetcher));
    const result = { catalog, basis: 'live-https', stale: false };
    if (!options.fetcher) current = { expiresAt: now + 300000, result: structuredClone(result) };
    return result;
  } catch (error) {
    if (options.requireLive) throw error;
    return { catalog: await loadCatalog(), basis: 'package-fallback', stale: true, warning: 'Live library unavailable; using this package’s pinned catalog.' };
  }
}
export async function currentManifest(skill, options = {}) {
  const manifest = options.offline ? await loadManifest(skill.id)
    : await fetchBoundedJson(`${REGISTRY_URL}/manifests/${encodeURIComponent(skill.id)}.json`, 2_000_000, options.fetcher);
  validateManifest(manifest);
  if (manifest.skill.id !== skill.id || manifest.skill.repo !== skill.repo || manifest.skill.revision !== skill.revision
    || manifest.skill.name !== skill.name || manifest.skill.path !== skill.path
    || manifest.files.find(file => file.path === 'SKILL.md')?.sha256 !== skill.sha256) throw new Error('Manifest does not match the selected catalog revision. Refresh and inspect the skill again.');
  return manifest;
}
