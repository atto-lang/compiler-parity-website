/* Independent metadata readback contract. Mocked GitHub responses are not live attestations. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  CANDIDATE_CLASS, validatePin, validateCandidateReceipt, verifyLiveCandidate
} from '../tools/verify-assurance-receipt.mjs';

const H='b'.repeat(40),T='c'.repeat(40),DIGEST='d'.repeat(64);
const STEP_CHECKOUT='Checkout exact original head (never synthetic PR merge)';
const STEP_TLC='Execute real TLC for five bounded models and three unsafe-mutant controls';
const time='2026-11-06T10:00:00Z';
const pin=()=>({
  repo:'example-org/private-project',pr:7,head:H,tree:T,
  runId:45,attempt:2,jobId:101,
  jobName:'exact-head-tlc-safety-and-counterexamples',jobKey:'tlc-bounded-design',
  requiredSteps:[STEP_CHECKOUT,STEP_TLC],
  kind:'TLC_BOUNDED_MODEL_ONLY',toolSha256:'936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
});
const receipt=()=>({
  classification:'TLC_BOUNDED_MODEL_ONLY',
  verification:'UNATTESTED_TOOL_RUN',guest:'NOT_EXECUTED',
  baseline_models:5,expected_invariant_counterexamples:3,
  source_head:H,source_tree:T,tool_sha256:'936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88',
  run_id:'45',run_attempt:'2',job:'tlc-bounded-design'
});
const step=name=>({
  name,status:'completed',conclusion:'success',
  started_at:time,completed_at:'2026-11-06T10:00:01Z'
});
function fixture(){
  const apiBase='/repos/example-org/private-project';
  const payloads={
    [apiBase+'/pulls/7']:{
      number:7,head:{sha:H},base:{ref:'main'},state:'open'
    },
    [apiBase+'/git/commits/'+H]:{tree:{sha:T}},
    [apiBase+'/actions/runs/45']:{
      id:45,event:'pull_request',head_sha:H,
      run_attempt:2,status:'completed',conclusion:'success',
      pull_requests:[{number:7,head:{sha:H}}]
    },
    [apiBase+'/actions/runs/45/attempts/2/jobs?per_page=100']:{
      total_count:1,jobs:[{
        id:101,name:'exact-head-tlc-safety-and-counterexamples',
        runner_id:8,status:'completed',conclusion:'success',
        steps:[step(STEP_CHECKOUT),step(STEP_TLC)]
      }]
    }
  };
  const api={
    calls:[],
    async get(url){
      this.calls.push(url);
      if(!Object.hasOwn(payloads,url)) throw new Error('Unexpected endpoint: '+url);
      return structuredClone(payloads[url]);
    }
  };
  return {api,payloads,base:apiBase,pin:pin(),receipt:receipt()};
}
async function denied(modify, match=/EVIDENCE_REJECTED/){
  const f=fixture();
  modify(f);
  await assert.rejects(()=>verifyLiveCandidate(f.api,f.pin,f.receipt),match);
}
test('matching source, tree, attempt, job and two real steps yield only candidate metadata',async()=>{
  const f=fixture();
  const out=await verifyLiveCandidate(f.api,f.pin,f.receipt);
  assert.equal(out.classification,CANDIDATE_CLASS);
  assert.equal(out.receiptAuthenticity,'NOT_INDEPENDENTLY_ESTABLISHED');
  assert.equal(out.guestExecution,'NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(out.proof,'NOT_SIGNED_OR_INDEPENDENTLY_REVIEWED');
  assert.equal(out.startedSteps,2);
  assert.equal(out.runnerId,8);
  assert.deepEqual(out.requiredStepsVerified,[STEP_CHECKOUT,STEP_TLC]);
  assert.equal(f.api.calls.length,4);
});
test('equivalent scoped Java candidate is never promoted to independent guest proof',async()=>{
  const f=fixture();
  f.pin.kind='JAVA_JVM_GUEST_CANDIDATE';
  f.pin.compilerSha256=DIGEST;
  f.pin.fixtureSha256=DIGEST;
  f.receipt={
    classification:'SCOPED_SUREFIRE_CASES_OBSERVED',
    proof:'NOT_INDEPENDENTLY_VERIFIED',guest:'CANDIDATE_ONLY',
    head:H,tree:T,run_id:'45',attempt:'2',job:'tlc-bounded-design',
    compiler_class_sha256:DIGEST,fixture_sha256:DIGEST
  };
  const out=await verifyLiveCandidate(f.api,f.pin,f.receipt);
  assert.equal(out.kind,'JAVA_JVM_GUEST_CANDIDATE');
  assert.equal(out.guestExecution,'NOT_INDEPENDENTLY_VERIFIED');
});
test('invalid pin inputs fail closed before any network request',()=>{
  for(const [field,value] of [
    ['repo','../private-project'],['head','not-a-hash'],['tree','!'.repeat(40)],
    ['pr',0],['runId',0],['attempt',-1],['jobId',null],
    ['jobName','job name with spaces'],['jobKey','contains spaces'],['kind','GUEST_PROVEN'],
    ['requiredSteps',[]],['requiredSteps',[STEP_TLC,STEP_TLC]],
    ['requiredSteps',[5]]
  ]){
    const p=pin();p[field]=value;
    assert.throws(()=>validatePin(p),/EVIDENCE_REJECTED/,field);
  }
});
test('zero, missing, numeric and skipped step sets cannot become green',async()=>{
  for(const steps of [null,[],0,undefined,1,
    [step(STEP_CHECKOUT),{...step(STEP_TLC),conclusion:'skipped'}],
    [step(STEP_CHECKOUT),{...step(STEP_TLC),status:'queued'}],
    [{...step(STEP_CHECKOUT),started_at:null},step(STEP_TLC)]])
    await denied(f=>{f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs[0].steps=steps;});
});
test('failed/unknown runner, job and run conclusions reject candidate',async()=>{
  for(const [source,change] of [
    ['run',r=>{r.conclusion='failure'}],
    ['run',r=>{r.status='in_progress'}],
    ['run',r=>{r.event='workflow_dispatch'}],
    ['run',r=>{r.run_attempt=1}],
    ['run',r=>{r.head_sha='a'.repeat(40)}],
    ['job',j=>{j.runner_id=null}],
    ['job',j=>{j.runner_id=0}],
    ['job',j=>{j.conclusion='failure'}],
    ['job',j=>{j.name='other-job'}],
    ['job',j=>{j.id=102}]
  ]){
    await denied(f=>{
      const r=f.payloads[f.base+'/actions/runs/45'];
      const j=f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs[0];
      change(source==='run'?r:j);
    });
  }
});
test('stale/mismatched PR, tree and wrong PR association reject metadata',async()=>{
  await denied(f=>{f.payloads[f.base+'/pulls/7'].head.sha='a'.repeat(40)});
  await denied(f=>{f.payloads[f.base+'/pulls/7'].number=6});
  await denied(f=>{f.payloads[f.base+'/git/commits/'+H].tree.sha='a'.repeat(40)});
  await denied(f=>{f.payloads[f.base+'/actions/runs/45'].pull_requests=[{number:19,head:{sha:H}}]});
  await denied(f=>{f.payloads[f.base+'/actions/runs/45'].pull_requests=[{number:7,head:{sha:'a'.repeat(40)}}]});
});
test('job pagination truncation and duplicate job identities fail closed',async()=>{
  await denied(f=>{f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].total_count=2});
  await denied(f=>{f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs=[]});
  for(const target of ['name','id']){
    await denied(f=>{
      const obj=f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'];
      const next=structuredClone(obj.jobs[0]);
      next[target==='name'?'id':'name']=target==='name'?102:'other-job';
      obj.jobs.push(next);obj.total_count=2;
    });
  }
  await denied(f=>{
    const obj=f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'];
    obj.jobs=[...Array(100)].map((_,i)=>({
      id:i+1,name:'job'+i,status:'completed',conclusion:'success',
      runner_id:8,steps:[step(STEP_CHECKOUT),step(STEP_TLC)]
    }));obj.total_count=100;
  });
});
test('missing required step, duplicates and invalid timestamps reject candidate',async()=>{
  await denied(f=>{
    f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs[0].steps=[step(STEP_CHECKOUT)];
  });
  await denied(f=>{
    f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs[0].steps.push(step(STEP_TLC));
  });
  await denied(f=>{
    f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs[0].steps[1].completed_at='2026-11-06T09:00:00Z';
  });
  await denied(f=>{
    f.payloads[f.base+'/actions/runs/45/attempts/2/jobs?per_page=100'].jobs[0].steps[1].completed_at='bad';
  });
});
test('replayed, forged and elevated TLC receipt fields are rejected',async()=>{
  for(const [field,value] of [
    ['source_head','a'.repeat(40)],['source_tree','a'.repeat(40)],
    ['run_id','46'],['run_attempt','1'],['job','other-job'],
    ['classification','REAL_GUEST_PASSED'],['verification','VERIFIED'],
    ['guest','EXECUTED'],['baseline_models',0],
    ['expected_invariant_counterexamples',2],['tool_sha256','deadbeef']
  ])await denied(f=>{f.receipt[field]=value});
});
test('Java self-labeled guest proof and changed source are not accepted',async()=>{
  for(const [field,value] of [
    ['proof','VERIFIED'],['guest','EXECUTED'],
    ['classification','GUEST_PARITY_PROVED'],['head','a'.repeat(40)],
    ['tree','a'.repeat(40)],['run_id','0'],['attempt','0']
  ])await denied(f=>{
    f.pin.kind='JAVA_JVM_GUEST_CANDIDATE';
    f.pin.compilerSha256=DIGEST;
    f.pin.fixtureSha256=DIGEST;
    f.receipt={
      classification:'SCOPED_SUREFIRE_CASES_OBSERVED',
      proof:'NOT_INDEPENDENTLY_VERIFIED',guest:'CANDIDATE_ONLY',
      head:H,tree:T,run_id:'45',attempt:'2',job:'tlc-bounded-design',
      compiler_class_sha256:DIGEST,fixture_sha256:DIGEST,[field]:value
    };
  });
});

test('toolchain and fixture identities cannot be asserted without pins',async()=>{
  await denied(f=>{f.pin.toolSha256='e'.repeat(64)});
  await denied(f=>{f.receipt.tool_sha256='e'.repeat(64)});
  await denied(f=>{f.pin.kind='JAVA_JVM_GUEST_CANDIDATE'});
  await denied(f=>{
    f.pin.kind='JAVA_JVM_GUEST_CANDIDATE';
    f.pin.compilerSha256=DIGEST;f.pin.fixtureSha256=DIGEST;
    f.receipt={
      classification:'SCOPED_SUREFIRE_CASES_OBSERVED',
      proof:'NOT_INDEPENDENTLY_VERIFIED',guest:'CANDIDATE_ONLY',
      head:H,tree:T,run_id:'45',attempt:'2',job:'tlc-bounded-design',
      compiler_class_sha256:'e'.repeat(64),fixture_sha256:DIGEST
    };
  });
});
