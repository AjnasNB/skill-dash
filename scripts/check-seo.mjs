import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import catalog from '../registry/catalog.json' with { type: 'json' };
import { COLLECTIONS, GUIDES, ORIGIN } from '../site/content.mjs';

const output = path.resolve(import.meta.dirname, '../dist');
const pages = [{ file: 'index.html', route: '/', interactive: true },
  ...catalog.skills.map(skill => ({ file: `skills/${skill.id}.html`, route: `/skills/${skill.id}`, interactive: true, skill })),
  ...COLLECTIONS.map(item => ({ file: `collections/${item.slug}.html`, route: `/collections/${item.slug}` })),
  ...GUIDES.map(item => ({ file: `${item.path.slice(1)}.html`, route: item.path })),
  ...Array.from({ length: Math.ceil(catalog.total / 48) }, (_, i) => ({ file: `directory/page-${i + 1}.html`, route: i ? `/skills?page=${i + 1}` : '/skills', directory: true })),
];
const directorySkills = new Set();
const canonicalUrls = new Set();
const titles = new Set();
for (const page of pages) {
  const html = await fs.readFile(path.join(output, page.file), 'utf8');
  const expected = ORIGIN + page.route;
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)];
  assert.equal(canonicals.length, 1, `${page.file}: exactly one canonical`);
  assert.equal(canonicals[0][1].replaceAll('&amp;', '&'), expected);
  assert.ok(!canonicalUrls.has(expected), `${page.file}: unique canonical`);
  canonicalUrls.add(expected);
  assert.equal((html.match(/<title>/g) || []).length, 1, `${page.file}: one title`);
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(!titles.has(title), `${page.file}: unique page title`);
  titles.add(title);
  assert.ok(html.includes('property="og:url"') && html.includes('name="twitter:card"'), `${page.file}: share metadata`);
  assert.ok(html.includes('<h1>') && !html.includes('<div id="root"></div>'), `${page.file}: readable HTML`);
  const json = html.match(/<script type="application\/ld\+json" id="page-schema">([\s\S]*?)<\/script>/);
  assert.ok(json, `${page.file}: structured data`);
  const schema = JSON.parse(json[1]);
  assert.equal(schema['@context'], 'https://schema.org');
  if (page.interactive) {
    const bootstrap = JSON.parse(html.match(/<script type="application\/json" id="skill-library-bootstrap">([\s\S]*?)<\/script>/)[1]);
    assert.equal(bootstrap.catalog.total, catalog.total);
    if (page.skill) {
      assert.equal(bootstrap.preview.id, page.skill.id);
      assert.ok(bootstrap.preview.text.includes('name:'));
      assert.ok(html.includes(`/bundles/${page.skill.id}.zip`));
      assert.ok(html.includes(page.skill.revision));
      assert.ok(schema['@graph'].some(item => item['@type'] === 'DigitalDocument'));
    }
  } else assert.ok(!html.includes('type="module"'), `${page.file}: guide/directory is usable without application JavaScript`);
  if (page.directory) for (const match of html.matchAll(/href="\/skills\/([a-z0-9._-]+)"/g)) directorySkills.add(match[1]);
}
assert.equal(directorySkills.size, catalog.total, 'Directory pagination links to every skill');
for (const skill of catalog.skills) assert.ok(directorySkills.has(skill.id), `Missing directory link: ${skill.id}`);
const sitemap = await fs.readFile(path.join(output, 'sitemaps/skills.xml'), 'utf8');
assert.equal((sitemap.match(/<url>/g) || []).length, catalog.total);
const general = await fs.readFile(path.join(output, 'sitemaps/pages.xml'), 'utf8');
assert.equal((general.match(/<url>/g) || []).length, pages.length - catalog.total);
const png = await fs.readFile(path.join(output, 'social-card.png'));
assert.equal(png.subarray(1, 4).toString(), 'PNG');
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
console.log(JSON.stringify({ status: 'passed', readablePages: pages.length, skillPages: catalog.total, allSkillsLinked: directorySkills.size, uniqueCanonicalUrls: canonicalUrls.size, structuredData: true, socialImage: '1200x630 PNG' }));
