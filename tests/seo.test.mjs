import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../registry/catalog.json' with { type: 'json' };
import worker from '../worker/index.mjs';
import { metadata, renderHead, skillMetadata, skillSchema, homeSchema, jsonForHtml } from '../site/seo.mjs';
import { COLLECTIONS, GUIDES, FAQ, ORIGIN } from '../site/content.mjs';
import packageInfo from '../package.json' with { type: 'json' };
import { parseFragment } from 'parse5';
import { elements, attribute, withoutModuleEntry } from '../site/html-template.mjs';

test('source descriptions cannot escape metadata or JSON-LD script elements', () => {
  const description = 'A "skill" </script><script>alert(1)</script> & more $& \u2028';
  const skill = { ...catalog.skills[0], description };
  const head = renderHead(skillMetadata(skill), [skillSchema(skill)]);
  const scripts = elements(parseFragment(head), 'script');
  assert.equal(scripts.length, 1);
  assert.ok(head.includes('&quot;skill&quot;'));
  assert.ok(head.includes('&lt;/script&gt;'));
  assert.equal(JSON.parse(scripts[0].childNodes.map(node => node.value || '').join(''))['@graph'][0].description, description);
  assert.ok(!jsonForHtml({ text: description }).includes('</script>'));
  assert.equal(JSON.parse(jsonForHtml({ text: description })).text, description);
});
test('static templates remove module entries structurally and preserve inert structured data', () => {
  const html = '<!doctype html><html><head><!-- SEO_HEAD --><SCRIPT\nTYPE="module" src="/app.js"></SCRIPT><link rel="modulepreload" href="/chunk.js"><script type="application/ld+json">{"name":"Example"}</script></head><body><div id="root"></div></body></html>';
  const output = withoutModuleEntry(html);
  const document = parseFragment(output);
  const scripts = elements(document, 'script');
  assert.equal(scripts.length, 1);
  assert.equal(attribute(scripts[0], 'type'), 'application/ld+json');
  assert.equal(elements(document, 'link').length, 0);
  assert.ok(output.includes('<!-- SEO_HEAD -->'));
  assert.ok(output.includes('<div id="root"></div>'));
});

test('metadata identifies the exact skill and does not present repository stars as ratings', () => {
  const skill = catalog.skills[0];
  const meta = skillMetadata(skill);
  assert.equal(meta.url, `${ORIGIN}/skills/${skill.id}`);
  assert.ok(meta.description.length <= 170);
  assert.ok(meta.title.includes(skill.repo));
  const schema = skillSchema(skill);
  assert.equal(schema.version, skill.revision);
  assert.equal(schema.citation, skill.sourceUrl);
  assert.equal(schema.aggregateRating, undefined);
  assert.equal(metadata().url, `${ORIGIN}/`);
});

test('the shared home graph preserves brand identity and visible FAQs after hydration', () => {
  const graph = JSON.parse(jsonForHtml({ '@graph': homeSchema() }))['@graph'];
  const site = graph.find(item => item['@type'] === 'WebSite');
  const app = graph.find(item => item['@type'] === 'SoftwareApplication');
  const faq = graph.find(item => item['@type'] === 'FAQPage');
  assert.equal(site.name, 'SkillDash');
  assert.ok(site.alternateName.includes('Skill Dash'));
  assert.equal(app.softwareVersion, packageInfo.version);
  assert.equal(app.offers.price, '0');
  assert.equal(app.aggregateRating, undefined);
  assert.deepEqual(faq.mainEntity.map(item => [item.name, item.acceptedAnswer.text]), FAQ.map(item => [item.question, item.answer]));
});

test('the agent guide uses the published release and separates catalog refresh from manual updates', () => {
  const guide = GUIDES.find(item => item.path === '/for-agents');
  const setup = guide.sections.find(item => item.title === 'Connect once for every local project');
  const stdio = guide.sections.find(item => item.title === 'Use a local stdio MCP process');
  assert.match(setup.code, new RegExp(`agent-skill-library@${packageInfo.version.replaceAll('.', '\\.')}`));
  assert.equal(JSON.parse(stdio.code).mcpServers['skill-library'].args[1], `agent-skill-library@${packageInfo.version}`);
  const updates = guide.sections.find(item => item.title === 'Update only when you choose');
  assert.ok(updates.paragraphs.join(' ').includes('manual'));
  assert.ok(updates.code.includes('update --agent codex --global --json'));
  assert.ok(!updates.code.includes('--apply'));
});

test('all catalog categories have a distinct crawlable hub and installation guides are published', () => {
  assert.equal(new Set(COLLECTIONS.map(item => item.slug)).size, COLLECTIONS.length);
  for (const category of catalog.categories) assert.ok(COLLECTIONS.some(item => item.category === category.name));
  for (const route of ['/about', '/for-agents', '/guides/codex-skills', '/guides/claude-code-skills', '/guides/skill-safety']) assert.ok(GUIDES.some(guide => guide.path === route));
});

const assetEnv = {
  ASSETS: { fetch: async request => new Response(`<html><body>${new URL(request.url).pathname}</body></html>`, { headers: { 'X-Robots-Tag': 'noindex, follow' } }) },
};
test('public pages serve their pre-rendered assets and HEAD preserves headers without a body', async () => {
  const skill = catalog.skills[0];
  for (const [route, stored] of [[`/skills/${skill.id}`, `/skills/${skill.id}.html`], ['/guides/codex-skills', '/guides/codex-skills.html'], ['/collections/design', '/collections/design.html'], ['/skills?page=2', '/directory/page-2.html']]) {
    const response = await worker.fetch(new Request(ORIGIN + route), assetEnv);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(stored));
    assert.equal(response.headers.get('x-robots-tag'), 'index, follow, max-image-preview:large');
    const head = await worker.fetch(new Request(ORIGIN + route, { method: 'HEAD' }), assetEnv);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-type'), 'text/html; charset=utf-8');
  }
});

test('alternate page URLs redirect, search pages are noindex, and invalid directory pages return 404', async () => {
  const skill = catalog.skills[0];
  for (const [from, to] of [[`/skills/${skill.id}.html`, `/skills/${skill.id}`], ['/guides/codex-skills/', '/guides/codex-skills'], ['/skills?page=1', '/skills']]) {
    const response = await worker.fetch(new Request(ORIGIN + from), assetEnv);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), ORIGIN + to);
  }
  for (const route of ['/?q=video', '/?category=Design']) assert.equal((await worker.fetch(new Request(ORIGIN + route), assetEnv)).headers.get('x-robots-tag'), 'noindex, follow');
  for (const route of ['/skills?page=-1', '/skills?page=9999', '/skills?page=1.5', '/skills/missing-skill', '/directory/page-1.html']) {
    const response = await worker.fetch(new Request(ORIGIN + route), assetEnv);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  }
});
