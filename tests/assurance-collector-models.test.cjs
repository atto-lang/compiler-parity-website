'use strict';
/* Source-only, fully mocked collector API tests; no private source or network. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  EvidenceError,stepAudit,latestApproval,makeClient,auditRun,auditPR,collect
}=require('../bin/collect-assurance-evidence.cjs');
const model=require('../formal/models/check-bounded-safety.cjs');
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const REPO='ores-truffle-oreslang/oreslang-source.java';
const base='/repos/'+REPO;
const original={
  id:'java-demo',repo:REPO,number:42,head:C,tree:null,
  evidence:'SOURCE_ONLY',state:'Draft',invariants:['ACT-01'],guest:'NOT_EXECUTED',
  title:'source-only demo',next:''
};
function response(body,status=200){
  return {ok:status>=200&&status<300,status,async text(){return JSON.stringify(body);}};
}
function makeFixture({steps=null,runHead=A,withReview=true,duplicate=false,
                      deny=false,changeHead=false,missingAttempt=false,
                      sameAuthorApproval=false}={}){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'error');
    assert.ok(url.startsWith('https://api.github.com/repos/'));
    assert.ok(!JSON.stringify(opts).includes('source_code'));
    const path=url.slice('https://api.github.com'.length);
    calls.push(path);
    if(deny)return response({message:'forbidden'},403);
    if(path===base+'/pulls/42')
      return response({head:{sha:changeHead?B:A,repo:{full_name:REPO}},
        base:{ref:'main'},user:{login:'author'},draft:true,state:'open',merged_at:null});
    if(path===base+'/git/commits/'+(changeHead?B:A))
      return response({tree:{sha:C}});
    if(path.startsWith(base+'/pulls/42/reviews?'))
      return response(withReview ? [{state:'APPROVED',commit_id:changeHead?B:A,
        user:{login:sameAuthorApproval?'author':'independent'},
        submitted_at:'2026-11-06T20:01:00Z'}] : []);
    if(path===base+'/branches/main/protection')
      return response({required_pull_request_reviews:{},required_status_checks:{}});
    if(path.startsWith(base+'/actions/runs?'))
      return response({total_count:1,workflow_runs:[
        {id:33,head_sha:runHead,event:'pull_request',run_attempt:missingAttempt?null:2,
          name:'source-only',status:'completed',conclusion:'failure'}]});
    if(path.startsWith(base+'/actions/runs/33/attempts/2/jobs?')){
      return response(duplicate?[
        {id:101,name:'same',steps:null},{id:102,name:'same',steps:null}
      ]:[
        {id:101,name:'test',steps,status:'completed',conclusion:'failure',runner_id:null}
      ]);
    }
    return response({message:'not found'},404);
  };
  return {client:makeClient({token:'test-fixture-token',fetchImpl}),calls};
}
test('empty and null steps are runner admission, never compiler failure',()=>{
  for(const steps of [null,[]]){
    assert.equal(stepAudit(steps).class,'RUNNER_NOT_ADMITTED');
    assert.equal(stepAudit(steps).observed,0);
  }
  assert.equal(stepAudit(undefined).class,'NOT_INSPECTED');
  assert.equal(stepAudit([{name:'setup',status:'completed',started_at:null}]).class,'STEP_RECORDS_NOT_EXECUTED');
  assert.equal(stepAudit([{name:'skip',status:'completed',conclusion:'skipped',started_at:'2026-11-06T20:00:00Z'}]).observed,0);
  assert.equal(stepAudit([{name:'test',status:'completed',conclusion:'success',started_at:'2026-11-06T20:00:00Z'}]).class,'STEPS_OBSERVED');
});
test('independent submitted review must match exact head',()=>{
  const mk=(user,commit,state='APPROVED',time='2026-11-06T20:00:00Z')=>
    ({state,commit_id:commit,user:{login:user},submitted_at:time});
  assert.equal(latestApproval([mk('author',A)],'author',A).status,'INDEPENDENT_APPROVAL_UNVERIFIED');
  assert.equal(latestApproval([mk('reviewer',B)],'author',A).status,'INDEPENDENT_APPROVAL_UNVERIFIED');
  assert.equal(latestApproval([mk('reviewer',A)],'author',A).status,'APPROVED_ON_HEAD');
  assert.equal(latestApproval([mk('reviewer',A),mk('reviewer',A,'CHANGES_REQUESTED','2026-11-06T20:02:00Z')],'author',A).status,'INDEPENDENT_APPROVAL_UNVERIFIED');
});
test('read-only collection binds current PR head and root tree, but not checkout/guest',async()=>{
  const {client,calls}=makeFixture();
  const p=await auditPR(client,original);
  assert.equal(p.head,A);
  assert.equal(p.tree,C);
  assert.match(p.treeSource,/runner checkout NOT verified/);
  assert.equal(p.workflow.steps,0);
  assert.equal(p.workflow.attempt,2);
  assert.equal(p.workflow.executionClass,'RUNNER_NOT_ADMITTED');
  assert.equal(p.workflow.headBound,false);
  assert.equal(p.verification.approval.status,'APPROVED_ON_HEAD');
  assert.equal(p.verification.runnerCheckoutExactHead,false);
  assert.equal(p.verification.compilerGuestVerified,false);
  assert.equal(p.guest,'NOT_INDEPENDENTLY_VERIFIED');
  assert.ok(calls.every(s=>s.startsWith('/repos/')));
  assert.ok(calls.some(s=>s.includes('/attempts/2/jobs')));
});
test('stale seed SHAs invalidate old metadata and remain explicitly visible',async()=>{
  const p=await auditPR(makeFixture({changeHead:true,runHead:B}).client,original);
  assert.equal(p.head,B);
  assert.equal(p.verification.previousSeedHead,C);
  assert.equal(p.workflow.headBound,false);
});
test('self-review never satisfies independent approval',async()=>{
  const p=await auditPR(makeFixture({sameAuthorApproval:true}).client,original);
  assert.equal(p.verification.approval.status,'INDEPENDENT_APPROVAL_UNVERIFIED');
});
test('wrong-run head is never used as a valid workflow result',async()=>{
  const p=await auditPR(makeFixture({runHead:B}).client,original);
  assert.equal(p.workflow,null);
  assert.equal(p.verification.jobCount,0);
  assert.equal(p.guest,'NOT_INDEPENDENTLY_VERIFIED');
});
test('unknown run attempt cannot create inspected-job evidence',async()=>{
  const p=await auditPR(makeFixture({missingAttempt:true}).client,original);
  assert.equal(p.workflow,null);
  assert.equal(p.verification.runs[0].class,'ATTEMPT_NOT_VERIFIED');
});
test('duplicate job names fail closed',async()=>{
  await assert.rejects(()=>auditPR(makeFixture({duplicate:true}).client,original),e=>e.code==='DUPLICATE_JOB_NAME');
});
test('inaccessible GitHub metadata remains unverified without retaining a stale proof',async()=>{
  const seed={schemaVersion:1,prs:[original],invariants:[],tasks:[],templates:[]};
  const out=await collect(seed,makeFixture({deny:true}).client);
  assert.equal(out.collection.failures,1);
  assert.equal(out.collection.status,'PARTIAL_ACCESS_FAILURE');
  assert.equal(out.prs[0].workflow,null);
  assert.equal(out.prs[0].tree,null);
  assert.equal(out.prs[0].verification.error,'API_ACCESS_DENIED');
  assert.equal(out.prs[0].guest,'NOT_INDEPENDENTLY_VERIFIED');
});
test('API tokens and uncontrolled origins never become admissible evidence',()=>{
  assert.throws(()=>makeClient({token:'short',fetchImpl:async()=>{}}),e=>e.code==='READ_TOKEN_MISSING');
  assert.throws(()=>makeClient({token:'long-token-here',fetchImpl:async()=>{},base:'https://attacker.test'}),e=>e.code==='NON_GITHUB_API_ORIGIN');
});
test('bounded actor and pub-sub safety models have reachable finite-state results',()=>{
  const out=model.verificationReport();
  assert.equal(out.success,true);
  assert.equal(out.classification,'BOUNDED_DESIGN_MODEL_ONLY');
  assert.ok(out.models.every(x=>x.result==='BOUNDED_SAFETY_HOLDS' && x.states>1 && x.edges>0));
  assert.equal(out.negativeControls.length,4);
  assert.ok(out.negativeControls.every(x=>x.result.result==='COUNTEREXAMPLE' && x.result.trace.length>0));
});
test('each unsafe mutation is killed by a concrete safety invariant',()=>{
  assert.equal(model.actorModel('allow-write-during-read').violation,'READ_WRITE_OVERLAP');
  assert.equal(model.actorModel('allow-stale-writer').violation,'WRONG_ACTOR_OWNER');
  assert.equal(model.pubModel('early-ack').violation,'EARLY_ACK_OR_UNCOMMITTED_DELIVERY');
  assert.equal(model.pubModel('retain-old-queue').violation,'STALE_SUBSCRIPTION_GENERATION');
});
