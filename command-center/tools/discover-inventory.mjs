#!/usr/bin/env node
// Private, read-only open-PR inventory discovery. Output is untrusted metadata, never proof.
import fs from 'node:fs';
import path from 'node:path';
import {createGitHubReader,requireCompletePage} from './github-api.mjs';
import {SHA,REPO,POS,validateInputSnapshot} from './evidence-core.mjs';

export const DEFAULT_REPOS=Object.freeze([
 'ores-truffle-oreslang/oreslang-source.java','ores-truffle-oreslang/oreslang-source.llvm',
 'ores-truffle-oreslang/oreslang-source.net','ores-truffle-oreslang/oreslang-source.wasm',
 'ores-truffle-oreslang/oreslang-source.forge','ores-truffle-oreslang/oreslang-source.js',
 'ores-truffle-oreslang/oreslang-platform-conformance','ores-truffle-oreslang/attolang-language-spec.md',
 'ores-truffle-oreslang/compiler-parity-website','lru-cache-atto/lru-cache.atto',
 'atto-lang/atto-lang.github.io','atto-lang/atto-source.rs',
 'ores-truffle-oreslang/oreslang-http-routing','ores-truffle-oreslang/oreslang-otel'
]);
const MAX_PR_RECORDS=95,MAX_PAGES_PER_REPO=5;
const BACKEND_RULES=[
 [/oreslang-source\.java$/i,'Java / GraalVM'],[/oreslang-source\.llvm$/i,'LLVM'],
 [/oreslang-source\.net$/i,'.NET NativeAOT'],[/oreslang-source\.wasm$/i,'Wasm'],
 [/oreslang-source\.(?:forge|cranelift)$/i,'Forge / Cranelift'],[/oreslang-source\.js$/i,'JavaScript'],
 [/lru-cache\.atto$/i,'LLVM'],[/platform-conformance|language-spec/i,'Multi-backend'],
 [/atto-lang\.github\.io|atto-source\.rs/i,'Browser / Rust']
];
function backend(repo){return BACKEND_RULES.find(([re])=>re.test(repo))?.[1]||'Unclassified'}
function areas(title='',body=''){
 const s=(title+' '+body).toLowerCase(),out=[];
 for(const [re,label] of [[/borrow|ownership|move|option|result/,'Ownership / borrow'],[/actor|tenant|isolation|arena|region/,'Actor isolation'],[/task|suspend|await|cancel|structured/,'Structured concurrency'],[/reload|generation|fenc/,'Hot reload / fencing'],[/pub.?sub|topic|subscription|delivery/,'Pub-sub'],[/layout|aos|soa|aosoa|lru/,'Data layouts'],[/tlc|formal|invariant|model/,'Formal methods'],[/security|capability|sandbox|integrity/,'Security']])if(re.test(s))out.push(label);
 return out.length?out:['Compiler / runtime'];
}
function latestReviewStatus(reviews,author){
 const relevant=(reviews||[]).filter(r=>r?.user?.login&&r.user.login.toLowerCase()!==String(author||'').toLowerCase()&&['APPROVED','CHANGES_REQUESTED','COMMENTED','DISMISSED'].includes(r.state));
 const latest=new Map();for(const r of relevant)latest.set(r.user.login,r);
 const values=[...latest.values()];if(!values.length)return 'No submitted independent review';
 const approved=values.filter(r=>r.state==='APPROVED').map(r=>r.user.login),changes=values.filter(r=>r.state==='CHANGES_REQUESTED').map(r=>r.user.login);
 if(changes.length)return 'Changes requested: '+changes.join(', ');if(approved.length)return 'Approved: '+approved.join(', ');
 return 'Submitted comments only: '+values.map(r=>r.user.login).join(', ');
}
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'repo'}
function normalizePR(raw,tree,reviews,reviewsComplete){
 const repo=raw.base?.repo?.full_name,number=raw.number,head=raw.head?.sha;
 if(!REPO.test(repo||'')||!POS(number)||!SHA.test(head||''))throw Error('Malformed PR identity from GitHub');
 const assignees=(raw.assignees||[]).map(x=>x.login).filter(Boolean),requested=(raw.requested_reviewers||[]).map(x=>x.login).filter(Boolean);
 const title=String(raw.title||'Untitled PR').slice(0,300),body=String(raw.body||'').slice(0,6000);
 const treeSha=tree?.sha===head&&SHA.test(tree.tree?.sha||'')?tree.tree.sha:null;
 return {id:'inventory-'+slug(repo)+'-'+number,repo,number,backend:backend(repo),title,head,tree:treeSha,
  updated:raw.updated_at||new Date(0).toISOString(),areas:areas(title,body),fixtures:[],layouts:[],
  severity:/security|isolation|ownership|actor/i.test(title+' '+body)?'P0':'P1',
  blocker:!treeSha?'Root tree readback missing':!reviewsComplete?'Review pagination incomplete':'Workflow evidence not refreshed',
  agent:assignees[0]||requested[0]||'Unassigned',
  review:reviewsComplete?latestReviewStatus(reviews,raw.user?.login):'UNINSPECTED — review pagination incomplete',
  merge:raw.draft?'Draft':raw.state==='open'?'Open':'Closed',draft:Boolean(raw.draft),
  baseRef:raw.base?.ref||null,baseSha:raw.base?.sha||null,headRef:raw.head?.ref||null,headRepo:raw.head?.repo?.full_name||null,
  author:raw.user?.login||'unknown',requestedReviewers:requested,assignees,mergeableAdvisory:raw.mergeable??null,
  rootTreeStatus:treeSha?'READ_BACK':'UNVERIFIED',reviewStatusComplete:reviewsComplete,workflowInventory:'NOT_REFRESHED',
  evidenceClass:'UNINSPECTED',next:!treeSha?'Retry exact commit/root-tree readback':!reviewsComplete?'Fetch complete submitted-review history':'Fetch exact-head workflow runs/jobs/steps; do not infer guest proof',
  notes:'Live read-only GitHub inventory candidate. Metadata is untrusted input; no compiler, guest, artifact, formal or merge receipt is asserted.'
 };
}
export async function discoverInventory(snapshot,get,{repos=DEFAULT_REPOS,maxPRs=MAX_PR_RECORDS,maxPages=MAX_PAGES_PER_REPO}={}){
 validateInputSnapshot(snapshot);
 if(!Array.isArray(repos)||repos.length<1||repos.length>40||repos.some(r=>!REPO.test(r))||new Set(repos).size!==repos.length)throw Error('Invalid explicit repository allowlist');
 if(!Number.isSafeInteger(maxPRs)||maxPRs<1||maxPRs>MAX_PR_RECORDS||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES_PER_REPO)throw Error('Inventory bounds exceeded');
 const discovered=[],repoResults=[];let requestFailures=0,listPages=0,allListsComplete=true;
 for(const repo of repos){
  let page=1,complete=false,repoCount=0,pageError=null;
  while(page<=maxPages&&discovered.length<maxPRs){
   try{
    const response=await get('/repos/'+repo+'/pulls?state=open&per_page=100&page='+page);listPages++;
    if(!Array.isArray(response.data))throw Error('PR listing response is not an array');
    for(const raw of response.data){if(raw?.state!=='open')continue;repoCount++;discovered.push({raw,repo});if(discovered.length>=maxPRs)break}
    complete=response.complete===true;if(complete||response.data.length===0)break;page++;
   }catch(e){pageError=String(e.message).slice(0,180);requestFailures++;break}
  }
  const pageLimitHit=!complete&&!pageError&&page>maxPages,globalLimitHit=discovered.length>=maxPRs;
  if(!complete)allListsComplete=false;
  repoResults.push({repo,records:repoCount,pages:page,complete:complete&&!pageError&&!pageLimitHit&&!globalLimitHit,error:pageError,limitHit:pageLimitHit||globalLimitHit});
  if(globalLimitHit)break;
 }
 const detailed=[];
 for(const entry of discovered){
  let tree=null,reviews=[],reviewsComplete=false,treeError=null;
  const head=entry.raw.head?.sha,number=entry.raw.number;
  try{if(SHA.test(head||'')){const commit=requireCompletePage(await get('/repos/'+entry.repo+'/git/commits/'+head));if(commit.sha!==head||!SHA.test(commit.tree?.sha||''))throw Error('Commit or root tree identity mismatch');tree=commit}}
  catch(e){treeError=String(e.message).slice(0,180);requestFailures++}
  try{const page=await get('/repos/'+entry.repo+'/pulls/'+number+'/reviews?per_page=100&page=1');if(Array.isArray(page.data)){reviews=page.data;reviewsComplete=page.complete===true}}
  catch(e){requestFailures++}
  const row=normalizePR(entry.raw,tree,reviews,reviewsComplete);if(treeError)row.treeReadError=treeError;detailed.push(row);
 }
 const oldByKey=new Map(snapshot.prs.map(p=>[p.repo+'#'+p.number,p]));for(const row of detailed){const old=oldByKey.get(row.repo+'#'+row.number);if(old)row.id=old.id}
 const replaced=new Map(detailed.map(p=>[p.repo+'#'+p.number,p])),repoByName=new Map(repoResults.map(x=>[x.repo,x]));
 const retained=snapshot.prs.filter(p=>!replaced.has(p.repo+'#'+p.number)).map(p=>{
  const scan=repoByName.get(p.repo);
  if(scan?.complete)return {...p,merge:'Closed / not in open PR inventory',inventoryStatus:'CONFIRMED_NOT_OPEN',next:'Recheck closed PR metadata and preserve merge/closure evidence separately'};
  if(repos.includes(p.repo))return {...p,inventoryStatus:'NOT_SEEN_IN_INCOMPLETE_SCAN',blocker:'Inventory scan incomplete',review:'UNINSPECTED — not re-read'};
  return p;
 });
 const prs=[...retained,...detailed];if(prs.length>4000)throw Error('Combined snapshot PR ceiling exceeded');
 const detailsComplete=detailed.length===discovered.length&&detailed.every(p=>p.tree&&p.reviewStatusComplete);
 const complete=allListsComplete&&discovered.length<maxPRs&&detailsComplete&&requestFailures===0;
 return {...snapshot,prs,snapshot:new Date().toISOString(),source:'Private read-only paginated GitHub PR inventory; UNATTESTED METADATA CANDIDATE',
  inventory:{scope:repos,repoResults,discoveredPRs:discovered.length,detailsRead:detailed.length,listPages,requestFailures,listComplete:allListsComplete,detailsComplete:detailsComplete,complete,
   claim:complete?'COMPLETE_METADATA_INVENTORY_CANDIDATE':'PARTIAL_METADATA_INVENTORY_CANDIDATE',
   note:'Complete means open PR lists plus every selected PR root tree and submitted-review page were read. Workflow history, artifacts, guest parity, formal proof, approval authority and merge readiness are not verified.'},
  unverified:true};
}
function arg(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null}
function readInput(name){if(!name||name.startsWith('-'))throw Error('Provide --input snapshot.json');const st=fs.lstatSync(name);if(!st.isFile()||st.isSymbolicLink()||st.size>2*1024*1024)throw Error('Input must be a bounded regular non-symlink file');return JSON.parse(fs.readFileSync(name,'utf8'))}
function writeOutput(name,value){if(!name||name.startsWith('-'))throw Error('Provide --output new-private-inventory.json');const out=path.resolve(name),bytes=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(bytes)>2*1024*1024)throw Error('Output exceeds 2 MiB');const fd=fs.openSync(out,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
async function main(){const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;if(!token)throw Error('Read-only GITHUB_TOKEN required; never expose token to browser or PR code');const input=readInput(arg('--input')),result=await discoverInventory(input,createGitHubReader({token}));writeOutput(arg('--output'),result);console.log(JSON.stringify(result.inventory,null,2));if(!result.inventory.complete)process.exitCode=2}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('Inventory withheld: '+e.message);process.exitCode=1});
