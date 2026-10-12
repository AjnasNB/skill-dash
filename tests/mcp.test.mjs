import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import packageInfo from '../package.json' with { type: 'json' };

test('installed CLI negotiates its package version and validates bounded MCP searches', { timeout: 20000 }, async () => {
  const client = new Client({ name: 'skilldash-protocol-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../bin/skill-library.mjs', import.meta.url)), 'mcp'] }));
    assert.equal(client.getServerVersion().version, packageInfo.version);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['plan_skill_install', 'read_skill', 'search_listings', 'search_skills']);
    const result = await client.callTool({ name: 'search_skills', arguments: { query: 'make a launch video', limit: 1 } });
    assert.ok(!result.isError);
    const data = JSON.parse(result.content.find(item => item.type === 'text').text);
    assert.ok(data.total > 0);
    assert.equal(data.skills.length, 1);
    const beyondLimit = await client.callTool({ name: 'search_skills', arguments: { query: 'video', limit: 21 } });
    assert.equal(beyondLimit.isError, true);
  } finally {
    await client.close();
  }
});
