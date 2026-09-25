import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import catalog from '../registry/catalog.json' with { type: 'json' };

const base = process.env.LIBRARY_TEST_URL || 'http://127.0.0.1:8797';
const output = path.resolve('artifacts/copy-seo');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const skillPath = '/skills/heygen-com--hyperframes--hyperframes';
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + skillPath, { waitUntil: 'networkidle' });
  const dialog = page.locator('dialog');
  await expect(dialog).toBeVisible();
  const skillCopy = dialog.locator('button[data-copy-label="Copy skill"]');
  const skillControl = dialog.locator('.instruction-heading .copy-control');
  await skillCopy.click();
  await expect(skillCopy).toContainText('Copied!');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /name:\s*hyperframes/);
  assert.equal(await skillControl.locator('.copy-check').evaluate(element => getComputedStyle(element).animationName), 'copy-confirm');
  await page.screenshot({ path: path.join(output, 'copy-skill-confirmed.png') });
  await skillCopy.click();
  await expect(skillCopy).toContainText('Copied!');
  const commandCopy = dialog.getByRole('button', { name: 'Copy command', exact: true });
  const commandControl = dialog.locator('.code-block .copy-control');
  await commandCopy.click();
  await expect(commandControl.getByRole('status')).toHaveText('Copied!');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /--agent codex$/);
  await page.screenshot({ path: path.join(output, 'copy-command-confirmed.png') });
  await dialog.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(commandControl.locator('[role="status"]')).toBeEmpty();
  await commandCopy.click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /--agent claude$/);

  // A delayed successful write must not show success before the clipboard accepts it.
  await page.evaluate(() => {
    window.originalClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = text => new Promise((resolve, reject) => setTimeout(() => window.originalClipboardWrite(text).then(resolve, reject), 700));
  });
  await commandCopy.click();
  await expect(commandCopy).toBeDisabled();
  await expect(commandControl.getByRole('status')).toHaveText('Copying…');
  await expect(commandControl.getByRole('status')).toHaveText('Copied!');
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new DOMException('Clipboard denied for this test', 'NotAllowedError'); };
  });
  await skillCopy.click();
  await expect(skillControl.getByRole('status')).toContainText('Copy blocked.');
  await expect(skillCopy).not.toContainText('Copied!');
  await expect(skillControl.getByRole('status')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'copy-permission-denied.png') });
  await page.evaluate(() => { navigator.clipboard.writeText = window.originalClipboardWrite; delete window.originalClipboardWrite; });
  await skillCopy.click();
  await expect(skillCopy).toContainText('Copied!');
  await page.keyboard.press('Escape');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://skills.maqamagent.com/');
  assert.ok(!await page.locator('#page-schema').textContent().then(text => text.includes(`${skillPath}#skill`)));
  await expect(page.getByRole('heading', { name: 'AI agent skills, explained' })).toBeVisible();

  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
  const staticPage = await nojs.newPage();
  await staticPage.goto(base + skillPath);
  await expect(staticPage.getByRole('heading', { name: 'Hyperframes', exact: true })).toBeVisible();
  await expect(staticPage.getByRole('heading', { name: 'Skill instructions', exact: true })).toBeVisible();
  await expect(staticPage.getByRole('link', { name: 'Download complete ZIP' })).toBeVisible();
  await staticPage.screenshot({ path: path.join(output, 'skill-without-javascript.png') });
  await staticPage.goto(base + '/guides/codex-skills');
  await expect(staticPage.getByRole('heading', { name: 'Install AI skills in Codex', exact: true })).toBeVisible();
  await expect(staticPage.locator('main')).toContainText('.agents/skills');
  await staticPage.screenshot({ path: path.join(output, 'codex-guide.png'), fullPage: true });
  await staticPage.goto(base + '/skills?page=2');
  await expect(staticPage.locator('.skill-card')).toHaveCount(48);
  await expect(staticPage.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://skills.maqamagent.com/skills?page=2');

  const recovery = await browser.newContext();
  const recoveryPage = await recovery.newPage();
  recoveryPage.on('pageerror', error => errors.push(error.message));
  await recoveryPage.route('**/catalog.json', route => route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
  await recoveryPage.goto(base + skillPath, { waitUntil: 'networkidle' });
  await expect(recoveryPage.locator('.startup-notice')).toContainText('You can still read the page');
  await expect(recoveryPage.getByRole('link', { name: 'Download complete ZIP' })).toBeVisible();
  await recoveryPage.unroute('**/catalog.json');
  await recoveryPage.getByRole('button', { name: 'Retry interactive search' }).click();
  await expect(recoveryPage.locator('dialog')).toBeVisible();
  await recovery.close();

  const hostile = await browser.newContext();
  const hostilePage = await hostile.newPage();
  hostilePage.on('pageerror', error => errors.push(error.message));
  const attack = 'Visible text </script><img src=x onerror="window.skillInjection=true"> & "quoted"';
  const hostileCatalog = { ...catalog, skills: catalog.skills.map(skill => skill.id === skillPath.slice(8) ? { ...skill, description: attack } : skill) };
  await hostilePage.addInitScript(() => { window.skillInjection = false; });
  await hostilePage.route('**/catalog.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(hostileCatalog) }));
  await hostilePage.goto(base + skillPath, { waitUntil: 'networkidle' });
  await expect(hostilePage.locator('dialog .detail-description')).toHaveText(attack);
  await expect(hostilePage.locator('dialog .detail-description img')).toHaveCount(0);
  assert.equal(await hostilePage.evaluate(() => window.skillInjection), false);
  assert.equal(JSON.parse(await hostilePage.locator('#page-schema').textContent())['@graph'][0].description, attack);
  await hostile.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', error => errors.push(error.message));
  await mobilePage.goto(base + skillPath, { waitUntil: 'networkidle' });
  await mobilePage.getByRole('button', { name: 'Copy command', exact: true }).click();
  const mobileControl = mobilePage.locator('dialog .code-block .copy-control');
  await expect(mobileControl.getByRole('status')).toHaveText('Copied!');
  assert.equal(await mobileControl.locator('.copy-check').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.ok(await mobilePage.locator('dialog').evaluate(element => element.scrollWidth <= element.clientWidth));
  await mobilePage.screenshot({ path: path.join(output, 'mobile-copy-reduced-motion.png') });
  await mobilePage.keyboard.press('Escape');
  assert.ok(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobilePage.screenshot({ path: path.join(output, 'mobile-home.png'), fullPage: true });

  assert.deepEqual(errors, []);
  const report = { status: 'passed', realClipboard: true, skillCopyAnimation: true, commandCopyFeedback: true, repeatedClicks: true, delayedClipboard: true, deniedClipboard: true, retryAfterDenial: true, changedCommandResetsFeedback: true, reducedMotion: true, mobile: true, noJavaScriptPages: true, startupFailureRecovery: true, hostileCatalogTextEscaped: true, canonicalOnNavigation: true, browserErrors: errors };
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error.message.slice(0, 1800));
  process.exitCode = 1;
} finally { await browser.close(); }
