import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { connectHosts } from '../lib/connect.mjs';
import { libraryDoctor } from '../lib/doctor.mjs';
import { handleMcp } from '../worker/mcp.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
test('doctor distinguishes missing host setup from a healthy real MCP endpoint',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'skilldash-doctor-'));
  const catalog=await loadCatalog();
  const fetcher=(input,init)=>handleMcp(new Request(input,init),{catalog,readSkill:async()=>'',searchListings:async()=>({listings:[],total:0})});
  try{
    const missing=await libraryDoctor({host:'all',global:true,home,fetcher});
    assert.equal(missing.status,'setup-needed');assert.equal(missing.remote.status,'healthy');
    assert.ok(missing.hosts.every(h=>h.status==='not-configured'));
    await connectHosts({host:'all',global:true,home});
    const ready=await libraryDoctor({host:'all',global:true,home,fetcher});
    assert.equal(ready.status,'ready');assert.equal(ready.remote.tools.length,6);assert.equal(ready.remote.probe.results,1);
    assert.ok(ready.hosts.every(h=>h.status==='configured'));
  }finally{await fs.rm(home,{recursive:true,force:true});}
});
