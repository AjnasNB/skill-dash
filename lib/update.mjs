import fs from 'node:fs/promises';
import path from 'node:path';
import { currentCatalog, currentManifest } from './live-catalog.mjs';
import { assertNoLinks, installSkill, listInstalled } from './install.mjs';
export async function updateInstalled(options = {}) {
  const { catalog, basis } = await currentCatalog({ ...options, refresh: true, requireLive: true });
  const skills = new Map(catalog.skills.map(skill => [skill.id, skill])), results = [];
  for (const entry of await listInstalled(options)) {
    if (entry.id === 'skill-library-discovery') continue;
    const skill = skills.get(entry.id);
    if (!skill) { results.push({ ...entry, status: 'not-in-current-catalog' }); continue; }
    if (skill.revision === entry.revision) { results.push({ ...entry, status: 'current' }); continue; }
    try {
      await assertNoLinks(entry.path);
      const marker = path.join(entry.path, '.skill-library.json');
      const metadata = await fs.lstat(marker);
      if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 500000) throw new Error('Unsafe installation record.');
      const previous = JSON.parse(await fs.readFile(marker, 'utf8'));
      if (previous.repo !== skill.repo || path.basename(entry.path) !== skill.name) throw new Error('Source ownership or skill name changed; review it explicitly.');
      const manifest = await currentManifest(skill, options);
      const result = await installSkill(manifest, { ...options, update: true, force: false, dryRun: options.apply !== true || options.dryRun === true });
      results.push({ ...result, previousRevision: entry.revision, source: skill.sourceUrl });
    } catch (error) { results.push({ ...entry, status: 'preserved', reason: error.message }); }
  }
  return { basis, catalogGeneratedAt: catalog.generatedAt, applied: options.apply === true && options.dryRun !== true, results };
}
