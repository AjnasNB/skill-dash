import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'smol-toml';
import { connectHosts, connectionPlan, mergeConnection, inspectConnections, HOSTS } from '../lib/connect.mjs';
import { MCP_URL } from '../lib/mcp-tools.mjs';
test('host configuration follows verified personal and project paths and preserves unrelated fields', () => {
  const home = path.resolve('test-user'), cwd = path.resolve('test-project');
  assert.equal(connectionPlan('antigravity',{global:true,home}).path,path.join(home,'.gemini/config/mcp_config.json'));
  assert.equal(connectionPlan('antigravity',{cwd}).path,path.join(cwd,'.agents/mcp_config.json'));
  const original = { theme: 'custom', mcpServers: { other: { command: 'existing', env: { PRIVATE_VALUE: 'keep' } } } };
  for(const host of ['claude','cursor','antigravity']) {
    const merged = JSON.parse(mergeConnection(JSON.stringify(original),host));
    assert.deepEqual(merged.mcpServers.other,original.mcpServers.other);
    assert.equal(merged.theme,'custom');
    assert.equal(merged.mcpServers['skill-library'][host === 'antigravity' ? 'serverUrl' : 'url'],MCP_URL);
    if(host === 'claude')assert.equal(merged.mcpServers['skill-library'].type,'http');
  }
  const toml = '# preserved comment\nmodel = "chosen"\n[mcp_servers.other]\ncommand = "existing"\n';
  const merged = mergeConnection(toml,'codex');
  assert.ok(merged.startsWith(toml.trimEnd()));
  assert.equal(parse(merged).model,'chosen');
  assert.equal(parse(merged).mcp_servers['skill-library'].url,MCP_URL);
  assert.equal(mergeConnection(merged,'codex'),merged);
});
test('connection rejects malformed configs, name conflicts, disabled servers and custom policy', () => {
  assert.throws(()=>mergeConnection('invalid = [','codex'));
  assert.throws(()=>mergeConnection('{broken','claude'));
  assert.throws(()=>mergeConnection(JSON.stringify({mcpServers:{'skill-library':{url:'https://different.example/mcp'}}}),'cursor'),/unrelated/);
  for(const entry of [{url:MCP_URL,disabled:true},{url:MCP_URL,disabledTools:['read_skill']},{url:MCP_URL,headers:{Authorization:'private'}}])
    assert.throws(()=>mergeConnection(JSON.stringify({mcpServers:{'skill-library':entry}}),'cursor'));
});
test('dry run writes nothing, actual global setup backs up files, repeat setup is idempotent', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(),'skilldash-host-test-'));
  try {
    const config=connectionPlan('cursor',{global:true,home}).path;
    await fs.mkdir(path.dirname(config),{recursive:true});
    const original=JSON.stringify({theme:'keep',mcpServers:{existing:{command:'node'}}});
    await fs.writeFile(config,original);
    const dry=await connectHosts({host:'all',global:true,home,dryRun:true});
    assert.equal(dry.length,HOSTS.length);assert.ok(dry.every(x=>x.status==='planned'));
    assert.equal(await fs.readFile(config,'utf8'),original);
    assert.equal((await fs.readdir(home)).length,1);
    const actual=await connectHosts({host:'all',global:true,home});
    assert.ok(actual.every(x=>x.status==='connected'));
    assert.equal(await fs.readFile(actual.find(x=>x.host==='cursor').backup,'utf8'),original);
    const repeat=await connectHosts({host:'all',global:true,home});
    assert.ok(repeat.every(x=>x.status==='already-connected'));
    assert.ok((await inspectConnections({host:'all',global:true,home})).every(x=>x.status==='configured'));
  } finally {await fs.rm(home,{recursive:true,force:true});}
});
test('setup never follows a junction into another host profile', async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'skilldash-host-links-'));
  try{
    const home=path.join(base,'home'),outside=path.join(base,'outside');
    await fs.mkdir(home);await fs.mkdir(outside);
    await fs.symlink(outside,path.join(home,'.codex'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(connectHosts({host:'codex',global:true,home}),/linked/);
    assert.equal((await fs.readdir(outside)).length,0);
  }finally{await fs.rm(base,{recursive:true,force:true});}
});
test('all-host preflight prevents partial writes when another host is invalid', async () => {
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'skilldash-host-failure-'));
  try {
    await fs.writeFile(path.join(home,'.claude.json'),'{bad');
    await assert.rejects(connectHosts({host:'all',global:true,home}));
    await assert.rejects(fs.stat(path.join(home,'.codex/config.toml')),{code:'ENOENT'});
  } finally {await fs.rm(home,{recursive:true,force:true});}
});
test('global setup also connects an existing older Antigravity profile without creating it on new machines',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'skilldash-legacy-host-'));
  try{
    const legacy=path.join(home,'.gemini','antigravity','mcp_config.json');
    await fs.mkdir(path.dirname(legacy),{recursive:true});
    await fs.writeFile(legacy,JSON.stringify({mcpServers:{projectMemory:{command:'local-memory'}}}));
    const results=await connectHosts({host:'antigravity',global:true,home});
    assert.equal(results.length,2);assert.equal(results[1].legacy,true);
    const value=JSON.parse(await fs.readFile(legacy,'utf8'));
    assert.equal(value.mcpServers.projectMemory.command,'local-memory');
    assert.equal(value.mcpServers['skill-library'].serverUrl,MCP_URL);
    assert.ok((await inspectConnections({host:'antigravity',global:true,home})).every(x=>x.status==='configured'));
  }finally{await fs.rm(home,{recursive:true,force:true});}
});
