import fs from 'node:fs/promises';
import path from 'node:path';
import { ORIGIN } from '../site/content.mjs';

const root = path.resolve(import.meta.dirname, '..');
const key = (await fs.readFile(path.join(root, 'public/indexnow-key.txt'), 'utf8')).trim();
if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('Invalid public IndexNow key.');
const keyLocation = `${ORIGIN}/indexnow-key.txt`;
const deployed = await fetch(keyLocation, { signal: AbortSignal.timeout(20000) });
if (!deployed.ok || (await deployed.text()).trim() !== key) throw new Error('Deploy the public ownership key before notifying IndexNow.');
const urls = [];
for (const name of ['pages', 'skills']) {
  const sitemap = await fs.readFile(path.join(root, 'dist/sitemaps', `${name}.xml`), 'utf8');
  urls.push(...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll('&amp;', '&')));
}
if (urls.length > 10000 || urls.some(url => new URL(url).origin !== ORIGIN)) throw new Error('Invalid IndexNow URL batch.');
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(ORIGIN).hostname, key, keyLocation, urlList: urls }),
  signal: AbortSignal.timeout(45000),
});
const report = { submittedAt: new Date().toISOString(), endpoint: 'https://api.indexnow.org/indexnow', host: new URL(ORIGIN).hostname, urlCount: urls.length, status: response.status, accepted: response.status === 200 || response.status === 202, response: (await response.text()).slice(0, 500), note: 'Acceptance acknowledges the notification; it does not guarantee crawling, indexing or ranking.' };
await fs.mkdir(path.join(root, 'artifacts/seo'), { recursive: true });
await fs.writeFile(path.join(root, 'artifacts/seo/indexnow.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.accepted) process.exitCode = 1;
