import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { inspectConnections } from './connect.mjs';
import { MCP_URL } from './mcp-tools.mjs';
export async function libraryDoctor(options = {}) {
  const hosts = await inspectConnections(options), client = new Client({name:'skilldash-doctor',version:'1.0.0'});
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL),{fetch:(input,init)=>(options.fetcher || fetch)(input,{...init,signal:AbortSignal.timeout(20000)})});
  try {
    await client.connect(transport);
    const tools=(await client.listTools()).tools, expected=['get_library_info','plan_skill_install','read_skill','search_listings','search_skills','search_tools'];
    if(JSON.stringify(tools.map(t=>t.name).sort())!==JSON.stringify(expected)||tools.some(t=>!t.annotations?.readOnlyHint))throw new Error('Unexpected MCP tool contract.');
    const result=await client.callTool({name:'search_skills',arguments:{query:'mcp',limit:1}});
    if(result.isError)throw new Error('Live MCP search failed.');
    const found=JSON.parse(result.content.find(item=>item.type==='text').text);
    if(!found.skills?.length)throw new Error('Live library returned no MCP skills.');
    return {status:hosts.every(h=>h.status==='configured')?'ready':'setup-needed',hosts,remote:{url:MCP_URL,status:'healthy',server:client.getServerVersion(),tools:expected,probe:{query:'mcp',results:found.skills.length,firstSkill:found.skills[0].id}},hostRefreshRequired:true};
  }finally{await client.close();}
}
