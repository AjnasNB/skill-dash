#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_ROOT, REGISTRY_URL } from '../lib/catalog.mjs';
import { searchCatalog, resolveSkill } from '../lib/search.mjs';
import { installSkill, installDiscovery, listInstalled, planInstall, fetchVerifiedFile } from '../lib/install.mjs';
import {validateAgentDetails} from '../lib/listing-details.mjs';
import { currentCatalog, currentManifest } from '../lib/live-catalog.mjs';

const help = `Skill Library — searchable skills for Codex, Claude Code, and Delta Harness

  skill-library search "make a launch video" [--json] [--limit 10]
  skill-library show <skill-id> [--content] [--json]
  skill-library install <skill-id> --agent codex [--global] [--dry-run]
  skill-library setup --agent all --global
  skill-library list --agent claude --global [--json]
  skill-library submit <github-repo-url> --path skills/my-skill
  skill-library mcp
  skill-library connect --host all --global [--dry-run] [--json]
  skill-library connect --host all --cwd <project-folder>
  skill-library doctor --host all --global [--json]
  skill-library update --agent codex --global [--apply] [--json]

Targets: codex, claude, delta, all. Codex/Claude default to this project.
Delta requires --global. Use --cwd <folder> for a different project.
Installs preserve supporting files and licenses, verify checksums, and never
run upstream scripts. Existing unmanaged skills are never overwritten.
Use --force to replace an earlier managed revision after reviewing changes.

Source stars are repository stars, not individual skill ratings.
Search refreshes from the public library. Use --offline for the package's pinned catalog.
Updates default to a plan. --apply updates unchanged managed skills and preserves local edits.
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
      offline: { type: 'boolean' }, apply: { type: 'boolean' },
      agent: { type: 'string' }, cwd: { type: 'string' }, limit: { type: 'string' },
      host: { type: 'string' },
      category: { type: 'string' }, sort: { type: 'string' }, path: { type: 'string' },
    },
  });
  json = Boolean(values.json);
  const [command = 'help', ...rest] = positionals;
  let registry;
  const selectedCatalog = async () => (registry ??= await currentCatalog({ offline: Boolean(values.offline) })).catalog;
  const selectedManifest = async skill => currentManifest(skill, { offline: Boolean(values.offline) || registry?.stale === true });
  const output = value => console.log(json ? JSON.stringify(value, null, 2) : typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (values.version) {
    output(JSON.parse(await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version);
  } else if (values.help || command === 'help') {
    output(help);
  } else if (command === 'mcp') {
    const { startMcp } = await import('../lib/mcp.mjs');
    await startMcp();
  } else if (command === 'connect') {
    const { connectHosts } = await import('../lib/connect.mjs');
    output(await connectHosts({ host: values.host || 'all', global: Boolean(values.global), dryRun: Boolean(values['dry-run']), cwd: values.cwd ? path.resolve(values.cwd) : process.cwd() }));
  } else if (command === 'doctor') {
    const { libraryDoctor } = await import('../lib/doctor.mjs');
    const report = await libraryDoctor({host:values.host || 'all',global:Boolean(values.global),cwd:values.cwd ? path.resolve(values.cwd):process.cwd()});
    output(report); if(report.status!=='ready')process.exitCode=1;
  } else if (command === 'update') {
    if (values.offline) throw new Error('Managed updates require the current online catalog.');
    const { updateInstalled } = await import('../lib/update.mjs');
    const agents = values.agent === 'all' ? ['codex','claude','delta'] : [values.agent || 'codex'];
    const reports = [];
    for (const agent of agents) reports.push({ agent, ...await updateInstalled({ agent, global: Boolean(values.global),
      cwd: values.cwd ? path.resolve(values.cwd) : process.cwd(), apply: Boolean(values.apply), dryRun: Boolean(values['dry-run']) }) });
    output(reports);
    if (reports.some(report => report.results.some(result => result.status === 'preserved'))) process.exitCode = 1;
  } else if (command === 'search') {
    const catalog = await selectedCatalog();
    const results = searchCatalog(catalog, { query: rest.join(' '), category: values.category, sort: values.sort, limit: Number(values.limit || 10) });
    if (json) output({ ...results, generatedAt: catalog.generatedAt, catalogSource: registry.basis, stale: registry.stale, ...(registry.warning ? {warning:registry.warning} : {}) });
    else output(`${results.total} matches • catalog ${catalog.generatedAt.slice(0, 10)}\n\n${results.skills.map(skill => `${skill.id}\n  ${skill.description.slice(0, 220)}\n  ${skill.repo} • ${skill.stars.toLocaleString()} repository stars • ${skill.license}`).join('\n\n') || 'No matches. Try fewer words or a broader description.'}`);
    if (!json && registry.warning) console.error(registry.warning);
  } else if (command === 'show') {
    if (!rest[0]) throw new Error('Provide a skill ID or an unambiguous name.');
    const skill = resolveSkill(await selectedCatalog(), rest[0]);
    const manifest = await selectedManifest(skill);
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
      const skill = resolveSkill(await selectedCatalog(), rest[0]);
      manifest = await selectedManifest(skill);
    }
    for (const agent of agents) {
      const options = { agent, global: Boolean(values.global), cwd: values.cwd ? path.resolve(values.cwd) : process.cwd(), force: Boolean(values.force), dryRun: Boolean(values['dry-run']) };
      if (command === 'list') results.push({ agent, skills: await listInstalled(options) });
      else if (command === 'setup') {
        const text = await fs.readFile(path.join(PACKAGE_ROOT, 'skills/skill-library/SKILL.md'), 'utf8');
        results.push(await installDiscovery(text, { ...options, update: true }));
      } else if (values['dry-run']) results.push({ ...planInstall(manifest.skill, options), status: 'planned', source: manifest.skill.sourceUrl });
      else results.push(await installSkill(manifest, options));
    }
    output(results);
    if (!json && command !== 'list') console.log('\nStart a new Codex/Claude session or refresh Delta’s Skills panel to discover installed skills.');
  } else if (command === 'submit') {
    const repo = rest[0];
    if (!repo || !values.path) throw new Error('Use submit https://github.com/owner/repo --path skills/skill-name');
    const details=validateAgentDetails({repository:repo,skillPath:values.path},'skill');
    const form=new URL('/publish',REGISTRY_URL);form.searchParams.set('type','skill');form.searchParams.set('repository',details.repository);form.searchParams.set('skillPath',details.skillPath);
    output({status:'owner-verification-required',formUrl:form.href,schemaUrl:`${REGISTRY_URL}/api/submission-schema`,agentDetails:details,message:'Prepared a skill proposal. The owner must verify email and submit its public details through this form. A receipt is emailed after submission; publication requires review.'});
  } else throw new Error(`Unknown command: ${command}. Run skill-library --help.`);
} catch (error) {
  if (json) console.log(JSON.stringify({ error: error.message }));
  else console.error(`Skill Library: ${error.message}`);
  process.exitCode = 1;
}
