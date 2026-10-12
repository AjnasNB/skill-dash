import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import packageInfo from '../package.json' with { type: 'json' };
import { registerLibraryTools, MCP_INSTRUCTIONS } from '../lib/mcp-tools.mjs';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version', 'Access-Control-Expose-Headers': 'MCP-Protocol-Version', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function boundedBytes(response, maximum) {
  if (!response.ok || !response.body) throw new Error('Published asset is unavailable.');
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('Asset exceeds the expected size.');
  const reader = response.body.getReader(), chunks = [];
  let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      count += value.byteLength;
      if (count > maximum) { await reader.cancel(); throw new Error('Asset exceeds the expected size.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function handleMcp(request, { catalog, readSkill, searchListings }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  // Anonymous public reads. No cookies, local roots or project memory are consumed.
  if (request.method !== 'POST') return Response.json({ endpoint: 'https://skills.maqamagent.com/mcp', transport: 'Streamable HTTP', stateless: true, readOnly: true,
    tools: ['search_skills','read_skill','plan_skill_install','search_listings'], guide: 'https://skills.maqamagent.com/for-agents' },
    { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS' } });
  const server = registerLibraryTools(new McpServer({ name: 'skill-library', version: packageInfo.version }, { instructions: MCP_INSTRUCTIONS }), { loadCatalog: async () => catalog, readSkill, searchListings });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 8192 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request), headers = new Headers(response.headers);
    for (const [name,value] of Object.entries(cors)) headers.set(name,value);
    return new Response(response.body,{ status: response.status, headers });
  } finally { await server.close(); }
}
export async function readPublishedSkill(env, skill) {
  const base = 'https://skills.maqamagent.com';
  const manifest = JSON.parse(new TextDecoder().decode(await boundedBytes(await env.ASSETS.fetch(new Request(`${base}/manifests/${skill.id}.json`)),524288)));
  const file = manifest.files?.find(file => file.path === 'SKILL.md');
  if (!file || !Number.isInteger(file.bytes) || file.bytes < 0 || file.bytes > 4000000 || file.sha256 !== skill.sha256) throw new Error('Invalid skill manifest.');
  const bytes = await boundedBytes(await env.ASSETS.fetch(new Request(`${base}/documents/${skill.id}.md`)),file.bytes);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte => byte.toString(16).padStart(2,'0')).join('');
  if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error('Skill checksum mismatch.');
  return new TextDecoder().decode(bytes);
}
