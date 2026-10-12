import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {validateAgentDetails,validateContact} from '../lib/listing-details.mjs';
const base='https://skills.maqamagent.com';
test('one link exposes agent instructions, manifest, software tools and submission schema without authentication',async()=>{
 const markdown=await worker.fetch(new Request(base,{headers:{Accept:'text/markdown'}}),{});
 assert.equal(markdown.status,200);assert.match(markdown.headers.get('Content-Type'),/text\/markdown/);assert.equal(markdown.headers.get('Vary'),'Accept');
 const text=await markdown.text();assert.match(text,/5,126|[5-9],\d{3}/);assert.ok(text.includes('/api/submission-schema'));assert.ok(text.includes('search_tools'));assert.ok(!text.includes('format-validated'));
 const info=await (await worker.fetch(new Request(base+'/.well-known/agent.json'),{})).json();assert.ok(info.skillCount>=4000);assert.equal(info.minimumRepositoryStars,10000);assert.equal(info.submission.types.includes('chatbot'),true);
 const schema=await (await worker.fetch(new Request(info.submission.schema),{})).json();assert.equal(schema.properties.rights.const,true);assert.ok(schema.properties.phone.description.includes('Optional'));
 const plugins=await (await worker.fetch(new Request(base+'/api/tools?type=plugin'),{})).json();assert.ok(plugins.total>0);assert.ok(plugins.tools.every(tool=>tool.type==='plugin'&&tool.repositoryStars>=10000));
 assert.equal((await worker.fetch(new Request(base+'/api/tools?type=invalid'),{})).status,400);
 const head=await worker.fetch(new Request(base+'/agent.md',{method:'HEAD'}),{});assert.equal((await head.text()).length,0);
});
test('skill proposals reject traversal and credential URLs while keeping contact email owner-bound and phone optional',()=>{
 assert.throws(()=>validateAgentDetails({repository:'https://github.com/owner/repo',skillPath:'../secret'},'skill'));
 assert.throws(()=>validateAgentDetails({repository:'https://user:secret@github.com/owner/repo',skillPath:'skills/name'},'skill'));
 assert.throws(()=>validateAgentDetails({},'skill'));
 assert.equal(validateAgentDetails({repository:'https://github.com/owner/repo',skillPath:'.'},'skill').skillPath,'.');
 assert.deepEqual(validateContact({},'owner@example.com'),{email:'owner@example.com',phone:'',phoneValidation:'not-provided'});
 assert.equal(validateContact({phone:'Call after 4pm - office line'},'owner@example.com').phoneValidation,'not-verified');
 assert.throws(()=>validateContact({contactEmail:'somebodyelse@example.com'},'owner@example.com'));
});
