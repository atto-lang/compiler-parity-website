/* Source-only formal-security dashboard tests.
 * These tests DO NOT execute AttoLang compiler or guest code. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(root,'formal-security.html'),'utf8');
const data=fs.readFileSync(path.join(root,'formal-data.js'),'utf8');
const app=fs.readFileSync(path.join(root,'formal-security.js'),'utf8');
const css=fs.readFileSync(path.join(root,'formal-security.css'),'utf8');
for(const asset of ['formal-security.css','formal-data.js','formal-security.js'])
  assert.ok(page.includes(asset),'missing HTML asset '+asset);
assert.match(page,/id="fRepo"/);
assert.match(page,/id="fBackend"/);
assert.match(page,/id="fPr"/);
assert.match(page,/id="fInvariant"/);
assert.match(page,/id="fEvidence"/);
assert.match(page,/id="fSeverity"/);
assert.match(page,/id="fStatus"/);
assert.match(css,/@media\(max-width:760px\)/);
function mount(view,imported){
  const nodes={};
  const elem=id=>nodes[id]||(nodes[id]={
    id,innerHTML:'',textContent:'',value:'',hidden:false,dataset:{},style:{},
    classList:{add(){},remove(){},toggle(){}},addEventListener(){},
    setAttribute(){},removeAttribute(){},querySelector(){return null;},focus(){}
  });
  const document={
    getElementById:elem,querySelectorAll:()=>[],addEventListener(){},
    activeElement:{tagName:'BODY'},body:{style:{},appendChild(){}}
  };
  const location={hash:'#'+view};
  const window={addEventListener(){},scrollTo(){},location};
  const localStorage={
    getItem(key){return key==='atto.assurance.snapshot.v1'&&imported?JSON.stringify(imported):null;},
    setItem(){},removeItem(){}
  };
  const ctx={window,document,location,localStorage,navigator:{},Blob:class Blob{},URL:{createObjectURL(){},revokeObjectURL(){}},
    setTimeout(){return 1;},clearTimeout(){},console};
  vm.createContext(ctx);
  vm.runInContext(data,ctx,{filename:'formal-data.js'});
  vm.runInContext(app,ctx,{filename:'formal-security.js'});
  return {nodes,seed:window.ATTO_ASSURANCE_SEED,test:window.ATTO_ASSURANCE_TEST};
}
for(const view of ['overview','registry','invariants','evidence','queue','templates']){
  const x=mount(view);
  assert.ok(x.nodes.view.innerHTML.length>1000,'empty view '+view);
  assert.ok(x.nodes.metrics.innerHTML.includes('Audited guest parity'),'missing evidence metric');
  assert.equal(x.nodes.guestProofs.textContent,'0 independently verified');
  assert.equal(x.seed.backends.length,5);
  assert.equal(x.seed.templates.length,9);
  if(view==='registry'){
    assert.match(x.nodes.view.innerHTML,/Merged/);
    assert.match(x.nodes.view.innerHTML,/not verified/i);
  }
  if(view==='evidence'){
    assert.match(x.nodes.view.innerHTML,/Runner not admitted/);
    assert.match(x.nodes.view.innerHTML,/Guest UNPROVEN/);
  }
  if(view==='templates')assert.match(x.nodes.view.innerHTML,/Hot reload generation fencing/);
  console.log('PASS rendered '+view);
}
const {seed,test}=mount('overview');
const cases=[
  [null,'NOT_INSPECTED'],
  [{steps:null},'RUNNER_NOT_ADMITTED'],
  [{steps:[]},'RUNNER_NOT_ADMITTED'],
  [{steps:0},'RUNNER_NOT_ADMITTED'],
  [{steps:'UNKNOWN'},'NOT_INSPECTED'],
  [{steps:undefined},'NOT_INSPECTED'],
  [{steps:[{name:'checkout'}]},'STEPS_EXECUTED'],
  [{steps:2},'STEPS_EXECUTED']
];
for(const [job,expected] of cases)assert.equal(test.stepClassification(job),expected);
assert.match(test.mergeGate({state:'Draft'}),/^HOLD/);
assert.match(test.mergeGate({state:'Open'}),/^HOLD/);
assert.match(test.mergeGate({state:'Merged'}),/guest parity not implied/);
assert.equal(seed.prs.find(p=>p.id==='conf-482').workflow.steps,null);
assert.equal(seed.prs.find(p=>p.id==='forge-183').state,'Merged');
assert.equal(seed.prs.some(p=>p.guest==='EXECUTED'),false);
assert.equal(seed.invariants.length,9);
for(const t of seed.templates)assert.ok(seed.invariants.some(x=>x.id===t.invariant));
test.validate(seed);
function copy(x){return JSON.parse(JSON.stringify(x));}
const fake=copy(seed);fake.prs[0].head='broken';
assert.throws(()=>test.parseImport(JSON.stringify(fake)),/Invalid PR record/);
const duplicate=copy(seed);duplicate.tasks.push(copy(duplicate.tasks[0]));
assert.throws(()=>test.parseImport(JSON.stringify(duplicate)),/duplicate/);
const missing=copy(seed);missing.tasks[0].invariant='MISSING';
assert.throws(()=>test.parseImport(JSON.stringify(missing)),/missing PR or invariant/);
const claimed=copy(seed);claimed.prs[0].guest='EXECUTED';
claimed.prs[0].workflow.headBound=true;
const ingested=test.parseImport(JSON.stringify(claimed));
assert.equal(ingested.prs[0].guest,'NOT_INDEPENDENTLY_VERIFIED');
assert.equal(ingested.prs[0].workflow.headBound,false);
const malicious=copy(seed);malicious.prs[0].title='<img src=x onerror=alert(1)>';
const rendered=mount('registry',malicious).nodes.view.innerHTML;
assert.ok(!rendered.includes('<img src=x'),'unescaped imported PR title');
assert.match(rendered,/&lt;img/);
console.log('PASS evidence state machine, import rejection, XSS escape, merge gating');
console.log('PASS source-only dashboard tests; NO compiler-backed AttoLang guest proof');
