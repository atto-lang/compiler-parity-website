import test from 'node:test';
import assert from 'node:assert/strict';
import {jobClass,validateInputSnapshot,validateReviewerPin,corroborateMetadata} from '../tools/evidence-core.mjs';
import {createGitHubReader,requireCompletePage} from '../tools/github-api.mjs';
import {refresh} from '../tools/refresh.mjs';
import {independentlyReadMetadata} from '../tools/verify-run.mjs';

const H='a'.repeat(40),T='b'.repeat(40);
const pin={repo:'ores-truffle-oreslang/compiler-parity-website',number:12,head:H,tree:T,runId:123,attempt:2,jobId:456,jobName:'source-only-command-center',workflowPath:'.github/workflows/command-center-ci.yml',requiredSteps:['Checkout exact HEAD','Execute source-only tests']};
const steps=[
{name:'Set up job',number:1,status:'completed',conclusion:'success',started_at:'2026-11-08T19:01:00Z',completed_at:'2026-11-08T19:01:02Z'},
{name:pin.requiredSteps[0],number:2,status:'completed',conclusion:'success',started_at:'2026-11-08T19:01:03Z',completed_at:'2026-11-08T19:01:10Z'},
{name:pin.requiredSteps[1],number:3,status:'completed',conclusion:'success',started_at:'2026-11-08T19:01:11Z',completed_at:'2026-11-08T19:01:20Z'}];
function facts(){return {
 pr:{number:12,base:{repo:{full_name:pin.repo}},head:{sha:H}},
 commit:{sha:H,tree:{sha:T}},
 run:{id:123,head_sha:H,path:pin.workflowPath,run_attempt:2,event:'pull_request',status:'completed',conclusion:'success'},
 job:{id:456,name:pin.jobName,run_id:123,run_attempt:2,status:'completed',conclusion:'success',runner_id:10,steps:structuredClone(steps)},
 jobsComplete:true
};}
const base=()=>({schemaVersion:2,prs:[{id:'site-12',repo:pin.repo,number:12,head:H,tree:null,updated:'2026-11-08T00:00:00Z',merge:'Draft',review:'UNKNOWN',attestedGuestReceipt:true}],jobs:[]});
test('runner admission preempts guest, canary and host labels',()=>{
 for(const x of [null,0,[]])assert.equal(jobClass({steps:x,sourceFree:true,evidenceDomain:'host-model'}),'RUNNER_ADMISSION');
 assert.equal(jobClass({steps:'UNKNOWN'}),'UNINSPECTED');
 assert.equal(jobClass({steps:[{status:'queued'}]}),'PREFLIGHT_ONLY');
 assert.equal(jobClass({steps,sourceFree:true}),'SOURCE_FREE_CANARY');
 assert.equal(jobClass({steps,evidenceDomain:'host-model'}),'HOST_ONLY');
 assert.equal(jobClass({steps,stage:'guest',receiptVerified:true}),'EXECUTED_STEPS_UNATTESTED');
});
test('snapshot and reviewer pins are structurally fail-closed',()=>{
 assert.equal(validateInputSnapshot(base()).prs.length,1);
 assert.equal(validateReviewerPin(pin).runId,123);
 for(const change of [{head:'z'.repeat(40)},{tree:'0'},{runId:0},{attempt:null},{workflowPath:'../../etc/passwd'},{requiredSteps:['only one']}])
   assert.throws(()=>validateReviewerPin({...pin,...change}));
 const bad=base();bad.prs.push({...bad.prs[0]});
 assert.throws(()=>validateInputSnapshot(bad));
});
test('a positive metadata check is still NOT a guest or merge receipt',()=>{
 const r=corroborateMetadata(pin,facts());
 assert.equal(r.verdict,'GITHUB_METADATA_CORROBORATED_CANDIDATE_ONLY');
 assert.equal(r.guestParity,'UNPROVEN');
 assert.equal(r.receiptVerified,false);
 assert.equal(r.mergeAuthorized,false);
 assert.equal(r.executedSteps,3);
});
test('17 integrity and adversarial negatives reject falsified metadata',()=>{
 const scenarios=[
 x=>x.pr.head.sha='c'.repeat(40),
 x=>x.pr.base.repo.full_name='outside/org',
 x=>x.commit.tree.sha='c'.repeat(40),
 x=>x.commit.sha='c'.repeat(40),
 x=>x.run.run_attempt=3,
 x=>x.run.path='.github/workflows/other.yml',
 x=>x.run.event='workflow_dispatch',
 x=>x.run.conclusion='failure',
 x=>x.job.id=457,
 x=>x.job.name='forged-display-job',
 x=>x.job.runner_id=0,
 x=>x.job.steps=[],
 x=>x.job.steps=null,
 x=>x.job.steps[1].conclusion='failure',
 x=>x.job.steps[1].number=1,
 x=>x.job.steps[2].name='Different test',
 x=>x.jobsComplete=false
 ];
 for(const change of scenarios){const x=facts();change(x);assert.throws(()=>corroborateMetadata(pin,x));}
});
test('time and step-order mutations fail closed',()=>{
 for(const change of [
 x=>x.job.steps[1].started_at=null,
 x=>x.job.steps[1].completed_at='2026-11-08T18:00:00Z',
 x=>x.job.steps[2].number=2,
 x=>{let s=x.job.steps[1];x.job.steps[1]=x.job.steps[2];x.job.steps[2]=s;}
 ]){const f=facts();change(f);assert.throws(()=>corroborateMetadata(pin,f));}
});
test('bounded metadata reader refuses bad routes, length, bytes and JSON',async()=>{
 const ok=createGitHubReader({token:'read-only-token',fetchImpl:async(_url,opts)=>{assert.equal(opts.method,'GET');return new Response(JSON.stringify({value:42}),{status:200,headers:{'Content-Type':'application/json'}})}});
 assert.deepEqual((await ok('/repos/a/b/pulls/12')).data,{value:42});
 await assert.rejects(()=>ok('/users/someone'));
 await assert.rejects(()=>ok('/repos/a/b/contents/private-file'));
 const sized=createGitHubReader({token:'read-only-token',fetchImpl:async()=>new Response('{}',{headers:{'content-length':'2097153'}})});
 await assert.rejects(()=>sized('/repos/a/b/pulls/12'),/size header/);
 const bad=createGitHubReader({token:'read-only-token',fetchImpl:async()=>new Response('not json')});
 await assert.rejects(()=>bad('/repos/a/b/pulls/12'),/Invalid GitHub JSON/);
 assert.throws(()=>requireCompletePage({complete:false,data:{jobs:[]}}),/Incomplete/);
 assert.throws(()=>requireCompletePage({complete:true,data:{jobs:[{}],total_count:2}}),/incomplete/);
});
test('independent reader matches one exact job/attempt only',async()=>{
 const x=facts();
 const get=async url=>({complete:true,data:url.endsWith('/pulls/12')?x.pr:url.endsWith('/git/commits/'+H)?x.commit:url.endsWith('/actions/runs/123')?x.run:{jobs:[x.job],total_count:1}});
 const r=await independentlyReadMetadata(pin,get);
 assert.equal(r.receiptVerified,false);
 const broken=async url=>({complete:true,data:url.endsWith('/pulls/12')?x.pr:url.endsWith('/git/commits/'+H)?x.commit:url.endsWith('/actions/runs/123')?x.run:{jobs:[x.job,{...x.job,id:888}],total_count:2}});
 await assert.rejects(()=>independentlyReadMetadata(pin,broken),/Duplicate display job/);
});
test('refresh uses exact current SHA/tree and strips imported proof claims',async()=>{
 const x=facts();
 const get=async url=>{
  if(url.endsWith('/pulls/12'))return {complete:true,data:{...x.pr,draft:true,state:'open',merged:false,updated_at:'2026-11-08T20:00:00Z',base:{...x.pr.base,ref:'main'}}};
  if(url.endsWith('/git/commits/'+H))return {complete:true,data:x.commit};
  if(url.includes('/actions/runs?'))return {complete:true,data:{workflow_runs:[{...x.run,name:'Source only',updated_at:'2026-11-08T20:00:00Z'}],total_count:1}};
  return {complete:true,data:{jobs:[x.job],total_count:1}};
 };
 const out=await refresh(base(),get);
 assert.equal(out.prs[0].tree,T);
 assert.equal(out.prs[0].attestedGuestReceipt,false);
 assert.equal(out.prs[0].exactHeadChecks,false);
 assert.equal(out.refresh.claim,'METADATA_CORROBORATED_CANDIDATE_ONLY');
 assert.equal(out.jobs[0].stage,'unclassified');
 assert.equal(out.jobs[0].metaOnly,true);
 assert.equal(out.jobs[0].sourceFree,false);
 assert.equal(out.jobs[0].steps.length,3);
});
test('readback mismatch cannot certify stale snapshot',async()=>{
 const get=async()=>({complete:true,data:{number:12,base:{repo:{full_name:pin.repo}},head:{sha:'c'.repeat(40)}}});
 const out=await refresh(base(),get);
 assert.equal(out.refresh.failedPrs,1);
 assert.equal(out.prs[0].tree,null);
 assert.equal(out.prs[0].attestedGuestReceipt,false);
});
