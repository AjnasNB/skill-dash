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
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['get_library_info','plan_skill_install', 'read_skill', 'search_listings', 'search_skills','search_tools']);
    const info=JSON.parse((await client.callTool({name:'get_library_info',arguments:{}})).content[0].text);
    assert.equal(info.minimumRepositoryStars,10000);assert.ok(info.skillCount>=4000);assert.equal(info.submission.authentication.includes('email'),true);
    const plugins=JSON.parse((await client.callTool({name:'search_tools',arguments:{type:'plugin',query:''}})).content[0].text);
    assert.ok(plugins.tools.length>0);assert.ok(plugins.tools.every(tool=>(tool.repositoryStars>=10000||tool.marketplace?.repositoryStars>=10000)&&tool.documentationUrl.includes(tool.revision)));
    const next=JSON.parse((await client.callTool({name:'search_tools',arguments:{type:'plugin',offset:10}})).content[0].text);
    assert.equal(next.offset,10);assert.ok(next.tools.every(t=>!plugins.tools.some(p=>p.id===t.id)));
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
