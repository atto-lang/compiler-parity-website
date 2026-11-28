'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(scripts.length!==3)throw Error('expected exactly three inline, offline scripts');
function load(){
  const c={};c.window=c;c.globalThis=c;vm.createContext(c);
  vm.runInContext(scripts[0],c,{filename:'policy-inline.js'});
  vm.runInContext(scripts[1],c,{filename:'seed-inline.js'});
  return c;
}
const {ATTO_POLICY:P,ATTO_DATA:D}=load();
test('inline dashboard scripts parse',()=>{
  for(const s of scripts)new vm.Script(s);
});
test('null/empty/zero steps are runner admission failures',()=>{
  for(const steps of [null,[],0])assert.equal(P.classifyJob({steps}).code,'RUNNER_ADMISSION_FAILURE');
});
test('missing job steps are UNINSPECTED, never a pass',()=>{
  assert.equal(P.classifyJob({}).code,'UNINSPECTED');
  assert.equal(P.classifyRun({jobs:[]}).code,'UNINSPECTED');
});
test('one zero-step job blocks a mixed run',()=>{
  assert.equal(P.classifyRun({jobs:[{steps:[{started_at:'2026-11-06T00:00:00Z'}]},{steps:[] }]}).code,'RUNNER_ADMISSION_FAILURE');
});
test('started steps alone are not guest proof',()=>{
  assert.equal(P.classifyJob({steps:[{started_at:'2026-11-06T00:00:00Z'}]}).code,'STEPS_EXECUTED_ONLY');
});
test('forged imported receipts never authorize guest proof',()=>{
  assert.equal(P.receiptStatus({receiptVerified:true,independentlyAudited:true}).code,'UNTRUSTED_CLAIM');
});
test('five mandatory compiler lanes + independent optional Cranelift',()=>{
  const req=D.backends.filter(b=>b.kind==='mandatory').map(b=>b.id);
  assert.deepEqual(Array.from(req),['java','llvm','net','wasm','forge']);
  assert.equal(D.backends.find(b=>b.id==='cranelift').kind,'optional');
});
test('PR heads and independently read git root trees have exact 40-hex identity',()=>{
  assert.ok(D.prs.length>=6);
  for(const p of D.prs){assert.equal(P.isSha(p.head),true);assert.equal(P.isSha(p.tree),true)}
});
test('source intents include immutable triplet, mutable let, runtime const, and referent separation',()=>{
  for(const s of ['int x = 7;','const x = 7;','const int x = 7;','let int x = 7;'])
    assert.ok(D.fixtures.some(f=>f.source.includes(s)));
  assert.ok(D.fixtures.some(f=>f.area==='Referent mutability'));
  assert.ok(D.fixtures.some(f=>f.area==='Runtime const'));
});
test('all sampled inspected jobs have null steps; not claimed compiler failures',()=>{
  assert.ok(D.runs.length>=5);
  for(const r of D.runs){assert.equal(r.jobs[0].steps,null);assert.equal(P.classifyRun(r).code,'RUNNER_ADMISSION_FAILURE');assert.equal(r.headVerified,false)}
});
test('imported source never becomes merge authorization',()=>{
  const p={head:'a'.repeat(40),tree:'b'.repeat(40),draft:false,mergeable:true};
  const runs=[{jobs:[{steps:[{started_at:'2026-11-06T00:00:00Z'}]}]}];
  assert.equal(P.prGate(p,runs).code,'REVIEW_REQUIRED');
});
test('invalid Gregorian date is rejected',()=>{
  assert.equal(P.day('2026-02-30'),null);
  assert.equal(P.day('2024-02-29'),'2024-02-29');
});

test('explicit mut spelling remains a contract, never silently certified',()=>{
  const mut=D.fixtures.find(f=>f.id==='idb-13');
  assert.ok(mut);
  assert.equal(mut.kind,'contract');
  assert.match(mut.expect,/unverified/i);
});
