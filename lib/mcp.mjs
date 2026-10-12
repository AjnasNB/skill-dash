import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageInfo from '../package.json' with { type: 'json' };
import { loadCatalog, loadManifest, REGISTRY_URL } from './catalog.mjs';
import { fetchVerifiedFile } from './install.mjs';
import { registerLibraryTools, MCP_INSTRUCTIONS } from './mcp-tools.mjs';
export async function startMcp() {
  const server = registerLibraryTools(new McpServer({ name: 'skill-library', version: packageInfo.version }, { instructions: MCP_INSTRUCTIONS }), {
    loadCatalog,
    readSkill: async skill => {
      const manifest = await loadManifest(skill.id);
      return (await fetchVerifiedFile(manifest.files.find(file => file.path === 'SKILL.md'))).toString('utf8');
    },
    searchListings: async args => {
      const url = new URL('/api/community/listings', REGISTRY_URL); url.searchParams.set('q', args.query);
      if (args.type) url.searchParams.set('type', args.type);
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Directory search failed (${response.status}).`);
      const value = await response.json(); return { ...value, listings: value.listings.slice(0,args.limit) };
    },
  });
  await server.connect(new StdioServerTransport());
}
