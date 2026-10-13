import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint, '-H', 'Accept: application/vnd.github.raw+json'], { encoding: 'utf8', maxBuffer: 8_000_000 }));
const repo = 'anthropics/claude-plugins-official';
const metadata = api(`repos/${repo}`);
const commit = api(`repos/${repo}/commits/${metadata.default_branch}`).sha;
const manifest = api(`repos/${repo}/contents/.claude-plugin/marketplace.json?ref=${commit}`);
if (!Array.isArray(manifest.plugins) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid upstream marketplace');
const checkedAt = new Date().toISOString();
const tools = manifest.plugins.map(plugin => {
  if (!/^[a-z0-9._-]+$/i.test(plugin.name)) throw new Error('Invalid plugin name');
  const source = plugin.source;
  const relative = typeof source === 'string' && source.startsWith('./');
  const repository = relative ? `https://github.com/${repo}` : typeof source === 'object' ? source.url?.replace(/\.git$/, '') : null;
  if (!repository || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Unsupported plugin source: ${plugin.name}`);
  const revision = relative ? commit : /^[a-f0-9]{40}$/.test(source.sha || '') ? source.sha : null;
  const sourcePath = relative ? source.slice(2) : source.path || '';
  if (sourcePath.split('/').includes('..')) throw new Error('Invalid source path');
  const documentationUrl = revision ? `${repository}/tree/${revision}${sourcePath ? '/' + sourcePath.split('/').map(encodeURIComponent).join('/') : ''}` : repository;
  return { id: `claude-plugin--${plugin.name}`, name: plugin.displayName || plugin.name, type: 'plugin', repo: repository.replace('https://github.com/', ''), repository,
    description: plugin.description || 'Read the upstream plugin documentation for details.', capabilities: [plugin.category || 'agent workflow'],
    author: plugin.author?.name || 'See upstream', host: 'Claude Code', revision, documentationUrl, downloadUrl: revision ? `${repository}/archive/${revision}.zip` : null,
    repositoryStars: null, checkedAt, license: 'Check the upstream plugin license',
    marketplace: { name: manifest.name, repository: `https://github.com/${repo}`, revision: commit, repositoryStars: metadata.stargazers_count },
    access: 'Review the upstream README for installation, permissions, account requirements and pricing. A free directory listing does not make an external service free.',
    selection: 'Metadata from the pinned official Claude plugin marketplace. This is not a SkillDash security review or a star count for this individual plugin.' };
}).sort((a,b) => a.name.localeCompare(b.name));
const directory = JSON.parse(await fs.readFile(new URL('registry/agent-tools.json', root), 'utf8'));
directory.tools = [...directory.tools.filter(tool => !tool.marketplace), ...tools];
directory.total = directory.tools.length;
directory.generatedAt = checkedAt;
directory.pluginSource = { repository: repo, revision: commit, checkedAt, count: tools.length, repositoryStars: metadata.stargazers_count };
await fs.writeFile(new URL('registry/agent-tools.json', root), JSON.stringify(directory, null, 2) + '\n');
console.log(`Recorded ${tools.length} plugins from ${repo}@${commit}; ${directory.total} total tools. No plugin code was installed or executed.`);
