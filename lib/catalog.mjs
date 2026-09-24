import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REGISTRY_URL = 'https://skills.maqamagent.com';
let cached;
export async function loadCatalog() {
  cached ??= JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'registry/catalog.json'), 'utf8'));
  return structuredClone(cached);
}
export async function loadManifest(id) {
  if (!/^[a-z0-9][a-z0-9._-]{0,150}$/.test(id)) throw new Error('Invalid skill ID.');
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'registry/manifests', `${id}.json`), 'utf8'));
}
