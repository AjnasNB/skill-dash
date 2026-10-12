import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHash } from 'node:crypto';
const url = new URL(process.argv[2] || 'https://skills.maqamagent.com/mcp');
if(url.username || url.password || url.search || url.hash || url.pathname!=='/mcp' || url.protocol!=='https:' && !['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Use a public HTTPS or loopback MCP endpoint without credentials.');
const client = new Client({name:'skilldash-first-user-probe',version:'1.0.0'});
const data = value => {if(value.isError)throw new Error(value.content[0].text);return JSON.parse(value.content.find(x=>x.type==='text').text);};
try{
 await client.connect(new StreamableHTTPClientTransport(url,{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}));
 const tools=(await client.listTools()).tools;
 const found=data(await client.callTool({name:'search_skills',arguments:{query:'mcp developer',limit:3}}));
 if(!found.skills.length)throw new Error('No MCP development skills returned.');
 const inspected=data(await client.callTool({name:'read_skill',arguments:{id:found.skills[0].id}}));
 const independentHash = !inspected.truncated && createHash('sha256').update(inspected.text).digest('hex')===inspected.skill.sha256;
 if(!inspected.truncated&&!independentHash)throw new Error('Returned content does not match the catalog checksum.');
 const directory=data(await client.callTool({name:'search_listings',arguments:{query:'',type:'mcp',limit:3}}));
 const guide=await client.readResource({uri:'skilldash://connection-guide'});
 console.log(JSON.stringify({endpoint:url.href,server:client.getServerVersion(),tools:tools.map(x=>x.name),readOnly:tools.every(x=>x.annotations?.readOnlyHint),query:'mcp developer',found:found.skills.map(({id,license,sourceUrl})=>({id,license,sourceUrl})),inspected:{id:inspected.skill.id,characters:inspected.text.length,truncated:inspected.truncated,independentChecksumVerified:independentHash},reviewedMcpListings:directory.total,guide:JSON.parse(guide.contents[0].text)},null,2));
}finally{await client.close();}
