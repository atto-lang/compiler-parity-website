/* Source-only artifact archive and metadata adversarial controls. No live GitHub calls. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {
  inspectZip,receiptFromArtifact,validateArtifactMetadata,expectedArtifactName,
  verifyArtifactCandidate
} from '../tools/verify-assurance-artifact.mjs';

const H='b'.repeat(40),T='c'.repeat(40),D='d'.repeat(64);
const TLC='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
const TLC_KIND='TLC_BOUNDED_MODEL_ONLY', JAVA_KIND='JAVA_JVM_GUEST_CANDIDATE';
const sha=x=>createHash('sha256').update(x).digest('hex');
function crc32(b) {
  let c=0xffffffff;
  for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}
  return (c^0xffffffff)>>>0;
}
function zip(files,{method=8,symlink=false}={}) {
  const local=[],central=[];let pos=0;
  for(const [name,data] of files) {
    const nb=Buffer.from(name),plain=Buffer.from(data);
    const body=method===8?deflateRawSync(plain):plain;
    const a=Buffer.alloc(30),b=Buffer.alloc(46),crc=crc32(plain);
    a.writeUInt32LE(0x04034b50,0);a.writeUInt16LE(20,4);
    a.writeUInt16LE(method,8);a.writeUInt32LE(crc,14);
    a.writeUInt32LE(body.length,18);a.writeUInt32LE(plain.length,22);
    a.writeUInt16LE(nb.length,26);
    b.writeUInt32LE(0x02014b50,0);b.writeUInt16LE(0x031e,4);
    b.writeUInt16LE(20,6);b.writeUInt16LE(method,10);
    b.writeUInt32LE(crc,16);b.writeUInt32LE(body.length,20);
    b.writeUInt32LE(plain.length,24);b.writeUInt16LE(nb.length,28);
    b.writeUInt32LE(((symlink?0o120777:0o100644)<<16)>>>0,38);
    b.writeUInt32LE(pos,42);
    local.push(a,nb,body);central.push(b,nb);
    pos+=a.length+nb.length+body.length;
  }
  const dir=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);
  end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);
  end.writeUInt32LE(pos,16);
  return Buffer.concat([...local,dir,end]);
}
function pin(kind=TLC_KIND) {
  return {
    kind,repo:'example-org/private-project',repositoryId:901,pr:7,
    head:H,tree:T,workflowId:777,
    workflowPath:kind===TLC_KIND?'.github/workflows/assurance-tlc.yml':
      '.github/workflows/critical-suspends-java-admission.yml',
    runId:45,attempt:2,jobId:101,
    jobName:kind===TLC_KIND?'exact-head-tlc-safety-and-counterexamples':
      'critical-guest-verification',
    jobKey:kind===TLC_KIND?'tlc-bounded-design':'critical-guest-verification',
    toolSha256:TLC,compilerSha256:D,fixtureSha256:D,
    requiredSteps:kind===TLC_KIND?
      ['Checkout exact original head (never synthetic PR merge)',
       'Execute real TLC for five bounded models and three unsafe-mutant controls']:
      ['Checkout immutable original Java PR head',
       'Compile critical AST, Task authority and .ores Truffle guest tests']
  };
}
function tlcFiles(p=pin()) {
  const receipt={classification:TLC_KIND,verification:'UNATTESTED_TOOL_RUN',
    guest:'NOT_EXECUTED',baseline_models:5,expected_invariant_counterexamples:3,
    source_head:p.head,source_tree:p.tree,tool_sha256:p.toolSha256,
    run_id:String(p.runId),run_attempt:String(p.attempt),job:p.jobKey};
  const prov={scope:TLC_KIND,guest:'NOT_EXECUTED',head:p.head,tree:p.tree,
    jar_sha256:p.toolSha256,run_id:String(p.runId),
    run_attempt:String(p.attempt),job:p.jobKey};
  const models=['ActorIsolation','CancellationAwait','HotReloadFencing',
    'ReliablePubSub','ActorBorrowGeneration'];
  const logs=[...models.flatMap(x=>[
      [x+'.parse.log','Parsing successful'],
      [x+'.baseline.log','Model checking completed. No error has been found.']
    ]),...['overlap','stale','read-transfer'].map(x=>[
      'ActorBorrowGeneration.'+x+'.counterexample.log',
      'Error: Invariant Inv is violated.\nError: The behavior up to this point is:\nState 1: <ok>'
    ])];
  const manifest=logs.map(([n,txt])=>sha(Buffer.from(txt))+
    '  private-artifacts/tlc/'+n).join('\n')+'\n';
  return [
    ['completed-source-only.json',JSON.stringify(receipt)],
    ['provenance.json',JSON.stringify(prov)],
    ['logs.sha256',manifest],
    ['model-inputs.sha256','a'.repeat(64)+'  formal/specs/ActorIsolation.tla\n'],
    ['java-version.txt','openjdk version "21"\n'],
    ...logs
  ];
}
function javaFiles(p=pin(JAVA_KIND)){
  const receipt={classification:'SCOPED_SUREFIRE_CASES_OBSERVED',
    proof:'NOT_INDEPENDENTLY_VERIFIED',guest:'CANDIDATE_ONLY',
    head:p.head,tree:p.tree,run_id:String(p.runId),attempt:String(p.attempt),
    job:p.jobKey,compiler_class_sha256:p.compilerSha256,fixture_sha256:p.fixtureSha256};
  return [
    ['suite-gate-completed.json',JSON.stringify(receipt)],
    ['checkout.json',JSON.stringify({proof:'NOT_INDEPENDENTLY_VERIFIED',
      source_head:p.head,source_tree:p.tree,run_id:String(p.runId),
      attempt:String(p.attempt),job:p.jobKey})],
    ['fixture-sha256.txt',p.fixtureSha256+
      '  examples/critical-actor-checked-v1.atto\n'],
    ['compiler-class-sha256.txt',p.compilerSha256+
      '  target/classes/dev/oreslang/compiler/OresCompiler.class\n'],
    ['TEST-dev.oreslang.CriticalActorGuestExecutionTest.xml',
      '<testsuite name="dev.oreslang.CriticalActorGuestExecutionTest" tests="8"/>']
  ];
}
function fixture(p,bytes){
  const artifact={id:76,name:expectedArtifactName(p),
    size_in_bytes:bytes.length,digest:'sha256:'+sha(bytes),expired:false,
    archive_download_url:'https://api.github.com/repos/'+p.repo+'/actions/artifacts/76/zip',
    workflow_run:{id:p.runId,head_sha:p.head,repository_id:p.repositoryId,
      head_repository_id:p.repositoryId}};
  const run={id:p.runId,head_sha:p.head,repository:{
    id:p.repositoryId,full_name:p.repo}};
  const listing={total_count:1,artifacts:[artifact]};
  const api={async get(url){
    if(url.endsWith('/artifacts?per_page=100'))return listing;
    if(url.endsWith('/actions/runs/'+p.runId))return run;
    throw Error('Mock does not serve live job metadata: '+url);
  }};
  return {api,run,artifact,listing};
}
test('stored and deflated safe ZIP members round-trip with CRC checks',()=>{
  for(const method of [0,8]) {
    const items=inspectZip(zip([['receipt.json','ok'],['logs/trace.log','trace']],{method}));
    assert.equal(items.get('receipt.json').toString(),'ok');
    assert.equal(items.get('logs/trace.log').toString(),'trace');
  }
});
test('both TLC and Java synthetic pass-only archive layouts decode',()=>{
  for(const kind of [TLC_KIND,JAVA_KIND]) {
    const p=pin(kind);
    const record=receiptFromArtifact(p,inspectZip(zip(kind===TLC_KIND?
      tlcFiles(p):javaFiles(p))));
    assert.ok(record.classification);
    assert.notEqual(record.guest,'EXECUTED');
  }
});
test('path traversal, duplicate names, case collisions and symlinks rejected',()=>{
  for(const name of ['../escape','/root','foo/../escape','a\\b','x//y','./x'])
    assert.throws(()=>inspectZip(zip([[name,'x']])),/ARTIFACT_REJECTED/);
  for(const files of [[['dup','a'],['dup','b']],
    [['DUP','a'],['dup','b']]])
    assert.throws(()=>inspectZip(zip(files)),/ARTIFACT_REJECTED/);
  assert.throws(()=>inspectZip(zip([['link','target']],{symlink:true})),
    /ARTIFACT_REJECTED/);
});
test('corrupt ZIP headers, trailing bytes and inflation bombs rejected',()=>{
  const good=zip([['x','abc']]);
  for(const mutate of [
    b=>{b[b.length-1]=1},b=>{b[0]=0},
    b=>{b[b.length-23]=17},b=>{b[45]^=255}
  ]){
    const bad=Buffer.from(good);mutate(bad);
    assert.throws(()=>inspectZip(bad),/ARTIFACT_REJECTED/);
  }
  assert.throws(()=>inspectZip(zip([['bomb','A'.repeat(3*1024*1024)]])),
    /ARTIFACT_REJECTED/);
  assert.throws(()=>inspectZip(Buffer.concat([good,Buffer.from('injected')])),
    /ARTIFACT_REJECTED/);
});
test('artifact metadata pins official digest, run, repo and archive URL',()=>{
  const p=pin(),z=zip(tlcFiles(p));
  assert.equal(validateArtifactMetadata(p,null,fixture(p,z).listing,fixture(p,z).run).id,76);
  for(const mutate of [
    a=>a.digest=undefined,a=>a.digest='sha256:00',a=>a.expired=true,
    a=>a.workflow_run.head_sha='e'.repeat(40),
    a=>a.workflow_run.head_repository_id=123,
    a=>a.workflow_run.id=55,
    a=>a.archive_download_url='https://evil.example/swap.zip'
  ]){
    const f=fixture(p,z);mutate(f.artifact);
    assert.throws(()=>validateArtifactMetadata(p,null,f.listing,f.run),
      /ARTIFACT_REJECTED/);
  }
});
test('duplicate or truncated artifact listings and cross-repo source are rejected',()=>{
  const p=pin(),z=zip(tlcFiles(p));
  const a=fixture(p,z);a.listing.artifacts.push(structuredClone(a.artifact));
  a.listing.total_count=2;
  assert.throws(()=>validateArtifactMetadata(p,null,a.listing,a.run),/ARTIFACT_REJECTED/);
  const b=fixture(p,z);b.listing.total_count=101;
  assert.throws(()=>validateArtifactMetadata(p,null,b.listing,b.run),/ARTIFACT_REJECTED/);
  const c=fixture(p,z);c.run.repository.full_name='attacker/other';
  assert.throws(()=>validateArtifactMetadata(p,null,c.listing,c.run),/ARTIFACT_REJECTED/);
});
test('tampered original ZIP rejected against correct GitHub digest',async()=>{
  const p=pin(),original=zip(tlcFiles(p)),f=fixture(p,original);
  const edited=Buffer.from(original);edited[20]^=1;
  await assert.rejects(verifyArtifactCandidate(f.api,p,edited),/ARTIFACT_REJECTED/);
});
test('forged official digest and switched artifact name rejected',async()=>{
  const p=pin(JAVA_KIND),z=zip(javaFiles(p)),f=fixture(p,z);
  f.artifact.digest='sha256:'+'a'.repeat(64);
  await assert.rejects(verifyArtifactCandidate(f.api,p,z),/ARTIFACT_REJECTED/);
  const s=fixture(p,z);s.artifact.name='unrelated';
  await assert.rejects(verifyArtifactCandidate(s.api,p,z),/ARTIFACT_REJECTED/);
});
test('TLC forged log digest, missing manifest and altered provenance rejected',()=>{
  const p=pin();
  const modified=tlcFiles(p);modified.find(x=>x[0]==='ActorIsolation.baseline.log')[1]='fake';
  assert.throws(()=>receiptFromArtifact(p,inspectZip(zip(modified))),/ARTIFACT_REJECTED/);
  const badProv=tlcFiles(p);badProv.find(x=>x[0]==='provenance.json')[1]='{}';
  assert.throws(()=>receiptFromArtifact(p,inspectZip(zip(badProv))),/ARTIFACT_REJECTED/);
  const missing=tlcFiles(p).filter(x=>x[0]!=='logs.sha256');
  assert.throws(()=>receiptFromArtifact(p,inspectZip(zip(missing))),/ARTIFACT_REJECTED/);
});
test('Java forged compiler hash, missing XML and failed XML rejected',()=>{
  const p=pin(JAVA_KIND),modified=javaFiles(p);
  modified.find(x=>x[0]==='compiler-class-sha256.txt')[1]='e'.repeat(64)+
    '  target/classes/dev/oreslang/compiler/OresCompiler.class\n';
  assert.throws(()=>receiptFromArtifact(p,inspectZip(zip(modified))),/ARTIFACT_REJECTED/);
  const missing=javaFiles(p).filter(x=>!x[0].endsWith('.xml'));
  assert.throws(()=>receiptFromArtifact(p,inspectZip(zip(missing))),/ARTIFACT_REJECTED/);
  const failed=javaFiles(p);failed.find(x=>x[0].endsWith('.xml'))[1]=
    '<testsuite><failure>oops</failure></testsuite>';
  assert.throws(()=>receiptFromArtifact(p,inspectZip(zip(failed))),/ARTIFACT_REJECTED/);
});

test('complete simulated API readback stays candidate-only even when artifact and job match',async()=>{
  const p=pin(),archive=zip(tlcFiles(p)),source=fixture(p,archive);
  const api={async get(url){
    if(url.endsWith('/actions/runs/45/artifacts?per_page=100'))return source.listing;
    if(url.endsWith('/actions/runs/45'))return {
      ...source.run,event:'pull_request',workflow_id:p.workflowId,
      path:p.workflowPath,run_attempt:p.attempt,
      status:'completed',conclusion:'success',head_commit:{tree_id:p.tree},
      pull_requests:[{number:p.pr,head:{sha:p.head}}]
    };
    if(url.endsWith('/pulls/7'))return {number:p.pr,head:{sha:p.head}};
    if(url.endsWith('/git/commits/'+p.head))return {tree:{sha:p.tree}};
    if(url.endsWith('/actions/runs/45/attempts/2/jobs?per_page=100'))return {
      total_count:1,jobs:[{
        id:p.jobId,name:p.jobName,run_id:p.runId,run_attempt:p.attempt,
        head_sha:p.head,check_run_url:'https://api.github.com/repos/'+p.repo+
          '/check-runs/'+p.jobId,
        runner_id:9001,runner_name:'GitHub Actions 9001',
        status:'completed',conclusion:'success',
        steps:p.requiredSteps.map((name,i)=>({
          number:i+1,name,status:'completed',conclusion:'success',
          started_at:'2026-11-07T10:00:00Z',
          completed_at:'2026-11-07T10:00:01Z'
        }))
      }]
    };
    throw Error('Unexpected private GitHub endpoint: '+url);
  }};
  const result=await verifyArtifactCandidate(api,p,archive);
  assert.equal(result.classification,'GITHUB_ARTIFACT_BYTES_CORROBORATED_CANDIDATE_ONLY');
  assert.equal(result.artifactDigest,'sha256:'+sha(archive));
  assert.equal(result.guestExecution,'NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(result.proof,'NOT_SIGNED_OR_INDEPENDENTLY_REVIEWED');
  assert.equal(result.runnerId,9001);
});
