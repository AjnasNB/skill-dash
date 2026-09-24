import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'registry/catalog.json'), 'utf8'));
const output = path.join(root, 'dist');
await Promise.all(['api', 'bundles', 'documents', 'manifests'].map(name => fs.mkdir(path.join(output, name), { recursive: true })));
await fs.copyFile(path.join(root, 'registry/catalog.json'), path.join(output, 'catalog.json'));
for (const skill of catalog.skills) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'registry/manifests', `${skill.id}.json`), 'utf8'));
  const zip = await fs.readFile(path.join(root, '.cache/bundles', `${skill.id}.zip`));
  const document = await fs.readFile(path.join(root, '.cache/documents', `${skill.id}.md`));
  if (createHash('sha256').update(zip).digest('hex') !== manifest.archiveSha256 ||
    createHash('sha256').update(document).digest('hex') !== skill.sha256) throw new Error(`Asset checksum mismatch: ${skill.id}`);
  for (const [source, target, extension] of [['.cache/bundles', 'bundles', 'zip'], ['.cache/documents', 'documents', 'md'], ['registry/manifests', 'manifests', 'json']]) {
    await fs.copyFile(path.join(root, source, `${skill.id}.${extension}`), path.join(output, target, `${skill.id}.${extension}`))
      .catch(error => { throw new Error(`Missing ${skill.id}.${extension}. Run npm run sync before a site build. ${error.message}`); });
  }
}
const index = catalog.skills.map(({ id, name, description, category, tags, repo, stars, license, revision, path: skillPath, sourceUrl, checkedAt, official, featured, fileCount, bytes, sha256 }) =>
  ({ id, name, description, category, tags, repo, stars, license, revision, path: skillPath, sourceUrl, checkedAt, official, featured, fileCount, bytes, sha256 }));
await fs.mkdir(path.join(root, '.cache/worker'), { recursive: true });
await fs.writeFile(path.join(root, '.cache/worker/catalog.json'), JSON.stringify({ ...catalog, skills: index }));
const urls = catalog.skills.map(s => `  <url><loc>https://skills.maqamagent.com/skills/${s.id}</loc></url>`).join('\n');
await fs.writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://skills.maqamagent.com/</loc></url>\n${urls}\n</urlset>`);
console.log(`Prepared ${catalog.total} skill downloads, documents, and manifests.`);
