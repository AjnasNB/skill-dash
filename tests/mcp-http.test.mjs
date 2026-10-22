import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadCatalog } from '../lib/catalog.mjs';
import { handleMcp, readPublishedSkill, boundedBytes } from '../worker/mcp.mjs';
import packageInfo from '../package.json' with { type:'json' };

test('MCP asset bounds apply to decoded content while retaining streamed size protection', async () => {
  const response = () => new Response('tiny', { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '24' } });
  assert.equal(new TextDecoder().decode(await boundedBytes(response(), 4)), 'tiny');
  await assert.rejects(boundedBytes(response(), 3), /expected size/);
  await assert.rejects(boundedBytes(new Response('tiny', { headers: { 'Content-Length': '24' } }), 4), /expected size/);
});
test('remote MCP negotiates, searches, reads resources and bounds all public tools through a real client', async()=>{
  const catalog=await loadCatalog(), deps={catalog,readSkill:async()=> 'Public fixture instructions',searchListings:async args=>({total:1,listings:[{name:'Public tool',type:args.type||'tool'}]})};
  const transport=new StreamableHTTPClientTransport(new URL('https://skills.maqamagent.com/mcp'),{fetch:async(input,init)=>handleMcp(new Request(input,init),deps)});
  const client=new Client({name:'skilldash-http-test',version:'1.0'});
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version,packageInfo.version);
    const tools=(await client.listTools()).tools;
    assert.equal(tools.length,6);assert.ok(tools.every(t=>t.annotations.readOnlyHint));
    const query=await client.callTool({name:'search_skills',arguments:{query:'mcp',limit:2}});
    const found=JSON.parse(query.content[0].text);assert.equal(found.skills.length,2);
    const read=await client.callTool({name:'read_skill',arguments:{id:found.skills[0].id}});
    assert.equal(JSON.parse(read.content[0].text).text,'Public fixture instructions');
    const listings=await client.callTool({name:'search_listings',arguments:{query:'test',type:'mcp',limit:1}});
    assert.equal(JSON.parse(listings.content[0].text).listings[0].type,'mcp');
    const invalid=await client.callTool({name:'search_skills',arguments:{query:'mcp',limit:21}});
    assert.equal(invalid.isError,true);
    assert.equal((await client.listResources()).resources[0].uri,'skilldash://connection-guide');
    const guide=await client.readResource({uri:'skilldash://connection-guide'});
    assert.equal(JSON.parse(guide.contents[0].text).mcp,'https://skills.maqamagent.com/mcp');
  }finally{await client.close();}
});
test('public skill reads fail closed on tampered bytes and over-size streamed bodies',async()=>{
  const text='# Public skill\n',bytes=Buffer.from(text),sha256=createHash('sha256').update(bytes).digest('hex');
  const manifest={files:[{path:'SKILL.md',bytes:bytes.length,sha256}]}, skill={id:'fixture',sha256};
  let corrupt=false;
  const env={ASSETS:{fetch:async request=>request.url.endsWith('.json') ? Response.json(manifest) : new Response(corrupt ? bytes.toString().replace('Public','Broken') : bytes)}};
  assert.equal(await readPublishedSkill(env,skill),text);
  corrupt=true;await assert.rejects(readPublishedSkill(env,skill),/checksum/);
  const huge=new Request('https://skills.maqamagent.com/mcp',{method:'POST',headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:'x'.repeat(9000)});
  const result=await handleMcp(huge,{catalog:await loadCatalog(),readSkill:async()=>'',searchListings:async()=>({listings:[]})});
  assert.equal(result.status,413);
  assert.equal((await handleMcp(new Request('https://skills.maqamagent.com/mcp'),{})).status,405);
});
