/* Deterministic source-only contract tests. No AttoLang compiler executes here. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dataJs=fs.readFileSync(path.join(root,'data.js'),'utf8');
const appJs=fs.readFileSync(path.join(root,'app.js'),'utf8');
function seed(){const ctx={window:{}};vm.createContext(ctx);vm.runInContext(dataJs,ctx);return ctx.window.ATTO_SEED;}
function render(view,mutate){const d=seed();if(mutate)mutate(d);
 const nodes={},el=id=>nodes[id]??(nodes[id]={innerHTML:'',textContent:'',hidden:false,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){}});
 const location={hash:'#'+view};
 const ctx={window:{ATTO_SEED:d,location,scrollTo(){},addEventListener(){}},location,document:{getElementById:el,querySelector:()=>el('q'),addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},console,Date,Set,JSON,Math,Object,Number,String,RegExp,Array,encodeURI,URL,Blob,setTimeout,clearTimeout,navigator:{}};
 vm.createContext(ctx);vm.runInContext(appJs,ctx);return {html:el('view').innerHTML,filters:el('filterArea').innerHTML};}
const d=seed(),cases=d.fixtures.filter(x=>x.group==='Bindings & mutability');
assert.equal(cases.length,14,'14 binding cases expected');
assert.equal(new Set(cases.map(x=>x.id)).size,14,'unique fixture IDs');
assert.ok(cases.every(x=>x.evidence==='SPEC_ONLY'&&x.prs.length===0&&x.observedAt===null),'no fabricated PR/CI provenance');
assert.ok(cases.every(x=>x.path.startsWith('PROPOSED: ')&&x.path.endsWith('.atto')),'proposed paths must not look checked in');
const parity=d.parity.find(x=>x.feature==='Binding & referent mutability v1');
assert.ok(parity);
assert.equal(parity.related.length,0,'no fabricated PR association');
assert.equal(Object.keys(parity.states).length,5);
assert.ok(Object.values(parity.states).every(v=>v==='Unproven'),'all five guest backends unproven');
const view=render('bindings');
for(const form of ['int x = 7;','const x = 7;','const int x = 7;'])assert.ok(view.html.includes(form),'missing declaration '+form);
for(const id of ['BIND-001','BIND-007','BIND-012','BIND-014'])assert.ok(view.html.includes(id),'missing fixture '+id);
assert.ok(view.html.includes('rt borrow')&&view.html.includes('rt take'),'ownership negatives absent');
assert.ok(view.html.includes('SEMANTIC CONTRACT')&&view.html.includes('NOT AN OBSERVED AST'),'model not labeled');
assert.ok(view.filters.includes('Semantic area'),'semantic filter missing');
const pr=render('prs');assert.ok(pr.filters.includes('Backend')&&pr.filters.includes('From date')===false,'date under advanced filters');
for(const steps of [null,[],0,'0','[]','null','UNKNOWN',4]){
 const {html}=render('ledger',d=>d.workflows.push({id:'fake-proof',prId:'java-2422',name:'SYNTHETIC_FORGED_GUEST',run:99999999999,job:'guest',jobId:101,attempt:1,steps,head:d.prs[0].head,tree:d.prs[0].tree,phase:'guest',guest:'EXECUTED',conclusion:'success',proof:{compilerBacked:true,guestExecuted:true,receiptVerified:true,independentlyAudited:false}}));
 assert.ok(html.includes('SYNTHETIC_FORGED_GUEST'));
 const card=html.slice(html.indexOf('SYNTHETIC_FORGED_GUEST')-250,html.indexOf('SYNTHETIC_FORGED_GUEST')+900);
 if(steps===null||steps===0||steps==='0'||steps==='[]'||steps==='null'||Array.isArray(steps))assert.ok(card.includes('Runner not admitted'),'zero step promoted: '+String(steps));
 if(steps==='UNKNOWN')assert.ok(card.includes('Steps uninspected'),'uninspected promoted');
 assert.ok(!card.includes('Guest verified'),'forged guest must remain unverified');
}
const candidate=render('ledger',d=>d.workflows.push({id:'claimed-proof',prId:'java-2422',name:'SYNTHETIC_CLAIMED_FULL_PROOF',run:99999999998,job:'guest',jobId:999,attempt:1,steps:7,head:d.prs[0].head,tree:d.prs[0].tree,phase:'guest',guest:'EXECUTED',conclusion:'success',proof:{compilerBacked:true,guestExecuted:true,receiptVerified:true,independentlyAudited:true}}));
const pos=candidate.html.indexOf('SYNTHETIC_CLAIMED_FULL_PROOF');
const claimCard=candidate.html.slice(pos-280,pos+800);
assert.ok(claimCard.includes('Guest receipt · not independently verified'),'JSON booleans must not self-certify a guest');
assert.ok(!claimCard.includes('badge green">Guest verified'),'imported attestations must never be green');
console.log('PASS 14/14 proposed binding cases; 5/5 unproven backend states; 9/9 forged/zero-step controls. Source-only.');
