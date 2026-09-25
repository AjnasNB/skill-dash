import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import catalog from '../registry/catalog.json' with { type: 'json' };
import { COLLECTIONS, GUIDES, ORIGIN } from '../site/content.mjs';
import { parse } from 'parse5';
import { elements, attribute } from '../site/html-template.mjs';

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
  const document = parse(html);
  const expected = ORIGIN + page.route;
  const canonicals = elements(document, 'link').filter(node => attribute(node, 'rel') === 'canonical');
  assert.equal(canonicals.length, 1, `${page.file}: exactly one canonical`);
  assert.equal(attribute(canonicals[0], 'href'), expected);
  assert.ok(!canonicalUrls.has(expected), `${page.file}: unique canonical`);
  canonicalUrls.add(expected);
  const titleNodes = elements(document, 'title');
  assert.equal(titleNodes.length, 1, `${page.file}: one title`);
  const title = titleNodes[0].childNodes.map(node => node.value || '').join('');
  assert.ok(!titles.has(title), `${page.file}: unique page title`);
  titles.add(title);
  assert.ok(html.includes('property="og:url"') && html.includes('name="twitter:card"'), `${page.file}: share metadata`);
  assert.ok(html.includes('<h1>') && !html.includes('<div id="root"></div>'), `${page.file}: readable HTML`);
  const scripts = elements(document, 'script');
  const json = scripts.find(node => attribute(node, 'id') === 'page-schema' && attribute(node, 'type') === 'application/ld+json');
  assert.ok(json, `${page.file}: structured data`);
  const schema = JSON.parse(json.childNodes.map(node => node.value || '').join(''));
  assert.equal(schema['@context'], 'https://schema.org');
  if (page.interactive) {
    assert.ok(scripts.some(node => attribute(node, 'type') === 'module'), `${page.file}: interactive entry point`);
    if (page.skill) {
      assert.ok(html.includes('<h2>Skill instructions</h2>') && html.includes('class="markdown"'), `${page.file}: full readable instructions`);
      assert.ok(html.includes(`/bundles/${page.skill.id}.zip`));
      assert.ok(html.includes(page.skill.revision));
      assert.ok(schema['@graph'].some(item => item['@type'] === 'DigitalDocument'));
    }
  } else assert.ok(!scripts.some(node => attribute(node, 'type') === 'module'), `${page.file}: guide/directory is usable without application JavaScript`);
  if (page.directory) for (const node of elements(document, 'a')) {
    const match = attribute(node, 'href')?.match(/^\/skills\/([a-z0-9._-]+)$/);
    if (match) directorySkills.add(match[1]);
  }
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
