import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const sources=JSON.parse(await fs.readFile(new URL('../registry/tool-sources.json',import.meta.url),'utf8'));
const checkedAt=new Date().toISOString(), tools=[];
for(const source of sources){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repo))throw new Error('Invalid tool repository');
 const repo=JSON.parse(execFileSync('gh',['api',`repos/${source.repo}`],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
 if(repo.private||repo.archived||repo.stargazers_count<10000)throw new Error(`${source.repo} does not meet the active public 10,000-star source policy.`);
 const commit=JSON.parse(execFileSync('gh',['api',`repos/${repo.full_name}/commits/${repo.default_branch}`],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
 tools.push({...source,id:source.repo.toLowerCase().replaceAll('/','--'),repository:repo.html_url,description:repo.description||source.name,repositoryStars:repo.stargazers_count,checkedAt,revision:commit.sha,documentationUrl:`${repo.html_url}/tree/${commit.sha}`,license:repo.license?.spdx_id||'NOASSERTION',access:'See the upstream documentation for host requirements, credentials and service pricing.',selection:'Curated public repository metadata; not a security certification.'});
 console.log(`${repo.full_name}: ${repo.stargazers_count} stars`);
}
await fs.writeFile(new URL('../registry/agent-tools.json',import.meta.url),JSON.stringify({schemaVersion:1,generatedAt:checkedAt,minimumRepositoryStars:10000,total:tools.length,tools},null,2)+'\n');
