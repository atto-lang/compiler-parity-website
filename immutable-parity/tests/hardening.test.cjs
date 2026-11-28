'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function load(){
  const c={};c.window=c;c.globalThis=c;vm.createContext(c);
  vm.runInContext(scripts[0],c);vm.runInContext(scripts[1],c);
  return {P:c.ATTO_POLICY,seed:JSON.parse(JSON.stringify(c.ATTO_DATA))};
}
function mutate(fn){const {P,seed}=load();fn(seed);return P.validateImport(seed)}
test('unchanged canonical snapshot imports structurally without authenticating claims',()=>{
  const {P,seed}=load();assert.equal(P.validateImport(seed),null);
  assert.equal(P.receiptStatus({independentlyAudited:true,receiptVerified:true}).code,'UNTRUSTED_CLAIM');
});
test('malformed nested records are rejected without throwing',()=>{
  const cases=[
    d=>d.prs[0]=null,
    d=>d.runs[0].jobs=[null],
    d=>d.backends[0]=null,
    d=>d.fixtures[0]=null,
    d=>d.checklistTemplates[0].items=[null],
    d=>d.prs[0].coverage=[null],
    d=>d.runs[0].prId='nonexistent',
    d=>d.prs[0].repo='https://attacker.example',
    d=>d.prs[0].head='unverified',
    d=>d.runs[0].jobs[0].steps=1,
    d=>d.fixtures[0].source='X'.repeat(9000),
    d=>d.backends.splice(d.backends.findIndex(b=>b.id==='forge'),1)
  ];
  for(const [i,change] of cases.entries())assert.equal(typeof mutate(change),'string','mutation '+i);
});
test('duplicate PR, fixture, run, backend, job and checklist identities fail closed',()=>{
  const cases=[
    d=>d.prs.push({...d.prs[0]}),
    d=>d.fixtures.push({...d.fixtures[0]}),
    d=>d.runs.push({...d.runs[0]}),
    d=>d.backends.push({...d.backends[0]}),
    d=>d.checklistTemplates.push({...d.checklistTemplates[0]}),
    d=>d.runs[0].jobs.push({...d.runs[0].jobs[0]})
  ];
  for(const change of cases)assert.equal(typeof mutate(change),'string');
});
test('impossible UTC calendar/times are not executed-step evidence',()=>{
  const {P}=load();
  for(const bad of ['2026-02-30T00:00:00Z','2026-11-06T24:00:00Z','2026-11-06T09:60:00Z','2026-11-06T09:10:60Z','2026-11-06T09:10:00+24:00']){
    assert.equal(P.validTimestamp(bad),false);
    assert.equal(P.classifyJob({steps:[{started_at:bad}]}).code,'INVALID_STEP_RECORD');
  }
  assert.equal(P.validTimestamp('2024-02-29T23:59:59.999Z'),true);
});
test('started-step claims cannot override explicit zero-step jobs',()=>{
  const {P}=load(),valid={id:1,name:'compile',steps:[{started_at:'2026-11-06T00:00:00Z'}]};
  assert.equal(P.classifyRun({jobs:[valid,{id:2,name:'admission',steps:null}]}).code,'RUNNER_ADMISSION_FAILURE');
  assert.equal(P.classifyRun({jobs:[valid,{...valid,id:2}]}).code,'INVALID_STEP_RECORD');
  assert.equal(P.classifyRun({jobs:[valid,{...valid,name:'second'}]}).code,'INVALID_STEP_RECORD');
});
test('unknown steps remain uninspected and positive steps are not guest proof',()=>{
  const {P}=load();
  assert.equal(P.classifyJob({}).code,'UNINSPECTED');
  assert.equal(P.classifyRun({jobs:[]}).code,'UNINSPECTED');
  assert.equal(P.classifyJob({steps:[{started_at:'2026-11-06T00:00:00Z'}]}).code,'STEPS_EXECUTED_ONLY');
  assert.equal(P.prGate({head:'a'.repeat(40),tree:'b'.repeat(40),draft:false,mergeable:true},[{jobs:[{id:1,name:'c',steps:[{started_at:'2026-11-06T00:00:00Z'}]}]}]).code,'REVIEW_REQUIRED');
});
test('review notes strip prototype-style keys and nonboolean marks',()=>{
  const {P}=load();
  const checks=P.sanitizeChecks(JSON.parse('{"__proto__":true,"constructor":true,"identity-0":true,"identity-1":"true"}'));
  assert.equal(Object.getPrototypeOf(checks),null);
  assert.deepEqual(Object.keys(checks),['identity-0']);
});
test('unverified mut grammar, separate Forge/Cranelift and semantic fixture corpus remain present',()=>{
  const {seed}=load(),canonical=['java','llvm','net','wasm','forge'];
  assert.deepEqual(seed.backends.filter(b=>b.kind==='mandatory').map(b=>b.id),canonical);
  assert.equal(seed.backends.find(b=>b.id==='cranelift').kind,'optional');
  for(const form of ['int x = 7;','const x = 7;','const int x = 7;','let int x = 7;'])assert.ok(seed.fixtures.some(f=>f.source.includes(form)));
  assert.equal(seed.fixtures.find(f=>f.id==='idb-13').kind,'contract');
});
test('HTML keeps standalone offline scripts and untrusted import demotion',()=>{
  assert.equal(scripts.length,3);
  for(const s of scripts)new vm.Script(s);
  assert.match(html,/Imported execution claim · unverified/);
  assert.match(html,/UNTRUSTED HEAD CLAIMS/);
  assert.match(html,/if\(\(f\.repo\|\|f\.pr\|\|f\.backend\|\|f\.from\|\|f\.to\)/);
  assert.doesNotMatch(html,/<script[^>]+src=/);
});
