#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, loadManifest, PACKAGE_ROOT, REGISTRY_URL } from '../lib/catalog.mjs';
import { searchCatalog, resolveSkill } from '../lib/search.mjs';
import { installSkill, installDiscovery, listInstalled, planInstall, fetchVerifiedFile } from '../lib/install.mjs';

const help = `Skill Library — searchable skills for Codex, Claude Code, and Delta Harness

  skill-library search "make a launch video" [--json] [--limit 10]
  skill-library show <skill-id> [--content] [--json]
  skill-library install <skill-id> --agent codex [--global] [--dry-run]
  skill-library setup --agent all --global
  skill-library list --agent claude --global [--json]
  skill-library submit <github-repo-url> --path skills/my-skill
  skill-library mcp

Targets: codex, claude, delta, all. Codex/Claude default to this project.
Delta requires --global. Use --cwd <folder> for a different project.
Installs preserve supporting files and licenses, verify checksums, and never
run upstream scripts. Existing unmanaged skills are never overwritten.
Use --force to replace an earlier managed revision after reviewing changes.

Source stars are repository stars, not individual skill ratings.
Search works offline from this npm package's pinned catalog.
Website: ${REGISTRY_URL}
`;
let json = process.argv.includes('--json');
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      json: { type: 'boolean' }, global: { type: 'boolean', short: 'g' }, force: { type: 'boolean' },
      'dry-run': { type: 'boolean' }, content: { type: 'boolean' },
      agent: { type: 'string' }, cwd: { type: 'string' }, limit: { type: 'string' },
      category: { type: 'string' }, sort: { type: 'string' }, path: { type: 'string' },
    },
  });
  json = Boolean(values.json);
  const [command = 'help', ...rest] = positionals;
  const output = value => console.log(json ? JSON.stringify(value, null, 2) : typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (values.version) {
    output(JSON.parse(await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version);
  } else if (values.help || command === 'help') {
    output(help);
  } else if (command === 'mcp') {
    const { startMcp } = await import('../lib/mcp.mjs');
    await startMcp();
  } else if (command === 'search') {
    const catalog = await loadCatalog();
    const results = searchCatalog(catalog, { query: rest.join(' '), category: values.category, sort: values.sort, limit: Number(values.limit || 10) });
    if (json) output({ ...results, generatedAt: catalog.generatedAt });
    else output(`${results.total} matches • catalog ${catalog.generatedAt.slice(0, 10)}\n\n${results.skills.map(skill => `${skill.id}\n  ${skill.description.slice(0, 220)}\n  ${skill.repo} • ${skill.stars.toLocaleString()} repository stars • ${skill.license}`).join('\n\n') || 'No matches. Try fewer words or a broader description.'}`);
  } else if (command === 'show') {
    if (!rest[0]) throw new Error('Provide a skill ID or an unambiguous name.');
    const skill = resolveSkill(await loadCatalog(), rest[0]);
    const manifest = await loadManifest(skill.id);
    if (values.content) {
      const file = manifest.files.find(file => file.path === 'SKILL.md');
      const text = (await fetchVerifiedFile(file)).toString('utf8');
      output(json ? { ...skill, content: text } : text);
    } else output({ ...skill, files: manifest.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), install: `npx agent-skill-library install ${skill.id} --agent codex` });
  } else if (command === 'install' || command === 'setup' || command === 'list') {
    const selected = values.agent || 'codex';
    const agents = selected === 'all' ? ['codex', 'claude', 'delta'] : [selected];
    if (agents.includes('delta') && !values.global) throw new Error('Add --global when targeting Delta or all agents. For a project, choose codex or claude.');
    const results = [];
    let manifest;
    if (command === 'install') {
      if (!rest[0]) throw new Error('Provide a skill ID.');
      const skill = resolveSkill(await loadCatalog(), rest[0]);
      manifest = await loadManifest(skill.id);
    }
    for (const agent of agents) {
      const options = { agent, global: Boolean(values.global), cwd: values.cwd ? path.resolve(values.cwd) : process.cwd(), force: Boolean(values.force), dryRun: Boolean(values['dry-run']) };
      if (command === 'list') results.push({ agent, skills: await listInstalled(options) });
      else if (command === 'setup') {
        const text = await fs.readFile(path.join(PACKAGE_ROOT, 'skills/skill-library/SKILL.md'), 'utf8');
        results.push(await installDiscovery(text, options));
      } else if (values['dry-run']) results.push({ ...planInstall(manifest.skill, options), status: 'planned', source: manifest.skill.sourceUrl });
      else results.push(await installSkill(manifest, options));
    }
    output(results);
    if (!json && command !== 'list') console.log('\nStart a new Codex/Claude session or refresh Delta’s Skills panel to discover installed skills.');
  } else if (command === 'submit') {
    const repo = rest[0];
    if (!repo || !values.path) throw new Error('Use submit https://github.com/owner/repo --path skills/skill-name');
    const response = await fetch(`${REGISTRY_URL}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, path: values.path }), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Submission failed (${response.status})`);
    output(result);
  } else throw new Error(`Unknown command: ${command}. Run skill-library --help.`);
} catch (error) {
  if (json) console.log(JSON.stringify({ error: error.message }));
  else console.error(`Skill Library: ${error.message}`);
  process.exitCode = 1;
}
