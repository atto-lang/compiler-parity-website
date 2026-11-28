// Bounded, GET-only private GitHub metadata reader.
// Do not use in untrusted pull_request code with secrets; never expose output publicly.
const MAX_BYTES=2*1024*1024,MAX_CALLS=220;
const URI=/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:pulls\?state=open&per_page=100&page=\d+|pulls\/\d+\/reviews\?per_page=100&page=\d+|pulls\/\d+(?:\/reviews)?|git\/commits\/[a-f0-9]{40}|actions\/runs(?:\?[^#]*)?|actions\/runs\/\d+(?:\/attempts\/\d+\/jobs(?:\?[^#]*)?)?)$/;
export function createGitHubReader({token,fetchImpl=fetch,timeoutMs=15000}={}){
 if(typeof token!=='string'||token.length<8)throw Error('Read-only token required');let count=0;
 return async function get(endpoint){
  if(typeof endpoint!=='string'||!URI.test(endpoint)||endpoint.includes('%')||endpoint.includes('..'))throw Error('Disallowed API path');
  if(++count>MAX_CALLS)throw Error('GitHub request ceiling exceeded');
  const timer=new AbortController();const timeout=setTimeout(()=>timer.abort(),timeoutMs);
  try{
   const response=await fetchImpl('https://api.github.com'+endpoint,{method:'GET',redirect:'error',signal:timer.signal,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'attolang-command-center-private-reader'}});
   if(!response.ok)throw Error('GitHub GET failed with HTTP '+response.status);
   const rawLen=response.headers.get('content-length');
   if(rawLen!==null&&(!/^\d+$/.test(rawLen)||Number(rawLen)>MAX_BYTES))throw Error('GitHub response size header rejected');
   if(!response.body||!response.body.getReader)throw Error('Missing bounded GitHub response stream');
   const reader=response.body.getReader();let total=0;const chunks=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES)throw Error('GitHub response stream exceeds 2 MiB');chunks.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}
   const merged=new Uint8Array(total);let p=0;for(const c of chunks){merged.set(c,p);p+=c.byteLength}
   const decoded=new TextDecoder('utf-8',{fatal:true}).decode(merged);let data;try{data=JSON.parse(decoded)}catch{throw Error('Invalid GitHub JSON')}
   const link=response.headers.get('link')||'';return {data,complete:!/(?:rel="next"|rel=next)/.test(link),sizeBytes:total};
  }finally{clearTimeout(timeout)}
 };
}
export function requireCompletePage(page,max=100){
 if(!page?.complete||!page?.data||typeof page.data!=='object')throw Error('Incomplete or malformed GitHub pagination');
 if(Array.isArray(page.data)&&page.data.length>=max)throw Error('Pagination boundary ambiguous; inspect following pages');
 if(Array.isArray(page.data?.jobs)&&(page.data.jobs.length>=max||page.data.total_count>page.data.jobs.length))throw Error('Job pagination incomplete');
 return page.data;
}
