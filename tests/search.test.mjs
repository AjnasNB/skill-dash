import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalog, resolveSkill } from '../lib/search.mjs';
const skills = [
  { id: 'a--video', name: 'hyperframes', description: 'Create launch films and motion graphics from your website.', repo: 'heygen/hyperframes', category: 'Video & audio', stars: 2500, official: true },
  { id: 'b--design', name: 'frontend-design', description: 'Design accessible React websites and interfaces.', repo: 'author/design', category: 'Design', stars: 9000 },
  { id: 'c--test', name: 'webapp-testing', description: 'Test web applications with Playwright and capture screenshots.', repo: 'author/testing', category: 'Development', stars: 4000 },
];
test('finds skills from descriptions and related task vocabulary, not just names', () => {
  assert.equal(searchCatalog(skills, { query: 'brag video' }).skills[0].id, 'a--video');
  assert.equal(searchCatalog(skills, { query: 'accessible websites' }).skills[0].id, 'b--design');
  assert.equal(searchCatalog(skills, { query: 'capture screenshots' }).skills[0].id, 'c--test');
  assert.equal(searchCatalog(skills, { query: 'unfindable-987654321' }).total, 0);
});
test('filters, paginates, and ranks exact names above popular partial matches', () => {
  assert.equal(searchCatalog(skills, { official: true }).total, 1);
  assert.equal(searchCatalog(skills, { category: 'Design' }).skills[0].id, 'b--design');
  assert.equal(searchCatalog(skills, { sort: 'stars', limit: 1, offset: 1 }).skills[0].id, 'c--test');
  assert.equal(searchCatalog(skills, { query: 'hyperframes' }).skills[0].name, 'hyperframes');
  assert.equal(searchCatalog(skills, { limit: 1 }).skills.length, 1);
});
test('ambiguous names require explicit source IDs', () => {
  assert.equal(resolveSkill(skills, 'a--video').name, 'hyperframes');
  assert.throws(() => resolveSkill([...skills, { ...skills[0], id: 'duplicate' }], 'hyperframes'), /Several sources/);
});
