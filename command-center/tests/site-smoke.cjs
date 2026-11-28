'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert.ok(html.includes('Content-Security-Policy'));
assert.ok(html.includes('connect-src &#39;none&#39;')||html.includes("connect-src 'none'"));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.equal(scripts.length,2,'Expected seed + app inline scripts');
scripts.forEach((source,i)=>new vm.Script(source,{filename:'inline-'+i+'.js'}));
const seedCtx={window:{}};
vm.runInNewContext(scripts[0],seedCtx,{timeout:1500});
const seed=seedCtx.window.ATTO_SEED;
assert.equal(seed.schemaVersion,2);
assert.equal(seed.backends.length,5);
assert.ok(seed.prs.length>=15);
assert.ok(seed.queue.length>=14);
assert.equal(new Set(seed.prs.map(p=>p.id)).size,seed.prs.length);
assert.ok(seed.prs.every(p=>/^[a-f0-9]{40}$/.test(p.head)));
assert.ok(seed.prs.every(p=>p.merge==='Draft'));
class Element{
 constructor(){this.innerHTML='';this.value='';this.hidden=false;this.textContent='';this.dataset={};this.style={};this.classList={add(){},remove(){},toggle(){}}}
 addEventListener(){}
 querySelectorAll(){return []}
 focus(){}
 click(){}
}
const elems=new Map(),byId=id=>{if(!elems.has(id))elems.set(id,new Element());return elems.get(id)};
const callbacks={};
const ctx={
 window:{ATTO_SEED:seed,addEventListener:(n,f)=>callbacks[n]=f,scrollTo(){}},
 document:{getElementById:byId,body:{addEventListener(){},style:{}},addEventListener(){}},
 location:{hash:''},history:{replaceState(){}},localStorage:{getItem(){return null},setItem(){}},
 setTimeout(){return 0},clearTimeout(){},structuredClone,console,URL,Blob,Date,Number,String,Array,Math,Set,Map
};
vm.runInNewContext(scripts[1],ctx,{timeout:3000});
assert.ok(byId('view').innerHTML.length>500);
const a=ctx.window.AttoLab;
assert.equal(a.classifyJob({steps:null,sourceFree:true,stage:'guest'}),'RUNNER_ADMISSION');
assert.equal(a.classifyJob({steps:[],stage:'guest'}),'RUNNER_ADMISSION');
assert.equal(a.classifyJob({steps:0,stage:'guest'}),'RUNNER_ADMISSION');
assert.equal(a.classifyJob({steps:'UNKNOWN',stage:'guest'}),'UNINSPECTED');
assert.equal(a.classifyJob({steps:10,sourceFree:true,stage:'canary'}),'SOURCE_FREE_CANARY');
assert.equal(a.classifyJob({steps:23,stage:'host'}),'HOST_ONLY');
assert.equal(a.mergeReady({merge:'Open',attestedGuestReceipt:true,protectionApproved:true}),false);
for(const v of ['overview','merge','ledger','parity','semantics','assurance','layouts','queue','handoffs','playbooks']){
 ctx.location.hash='#'+v;callbacks.hashchange();
 assert.ok(byId('view').innerHTML.length>300,'Failed view '+v);
}
console.log('PASS: 10 command center views, candidate-only evidence and no auto-merge authorization');
