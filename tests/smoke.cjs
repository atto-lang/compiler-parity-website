/* Source-only structural smoke tests; no AttoLang compiler or guest execution. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const data=fs.readFileSync(path.join(root,'data.js'),'utf8');
for(const asset of ['styles.css','data.js','app.js'])assert.ok(page.includes(asset),'missing asset '+asset);
const views=['overview','prs','ledger','fixtures','parity','layouts','integrity','queue','checklists'];
for(const view of views){
 const els={},e=id=>els[id]??(els[id]={innerHTML:'',textContent:'',value:'',hidden:false,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){}});
 const ctx={window:{addEventListener(){},scrollTo(){}},document:{querySelector:()=>e('q'),getElementById:e,addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},location:{hash:'#'+view},navigator:{},console,Date,Set,JSON,Math,Object,Number,String,RegExp,Array,encodeURI,URL,Blob,setTimeout,clearTimeout};
 ctx.window.location=ctx.location;vm.createContext(ctx);vm.runInContext(data,ctx);vm.runInContext(source,ctx);
 const out=e('view').innerHTML;assert.ok(out.length>500,'empty view '+view);assert.ok(!out.includes('undefined'),'bad interpolation '+view);
 if(view==='overview'){assert.match(out,/Confirmed guest proofs/);assert.match(out,/NOT_EXECUTED/);assert.match(out,/steps=\[\]/)}
 if(view==='prs')assert.equal((out.match(/data-pr-open=/g)||[]).length,11);
 if(view==='ledger'){assert.equal((out.match(/data-workflow-open=/g)||[]).length,13);assert.match(out,/Runner not admitted/);assert.match(out,/Host-only/)}
 if(view==='fixtures')assert.match(out,/aosoa-tail-reset/);
 if(view==='parity')assert.match(out,/Contract only/);
 if(view==='layouts')assert.match(out,/STRUCTURE|Structure of Arrays/i);
 if(view==='integrity')assert.match(out,/Exact-head comparator/);
 if(view==='queue')assert.match(out,/Execute true LLVM LRU/);
 if(view==='checklists')assert.match(out,/Adversarial receipt/);
 process.stdout.write('PASS '+view+'\n');
}
console.log('PASS 9/9 static views; host-only smoke, guest execution NOT_EXECUTED.');
