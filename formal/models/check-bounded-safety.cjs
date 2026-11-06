'use strict';
/*
 * Small, dependency-free, exhaustive safety-state checker for DESIGN models only.
 * No production runtime, AttoLang compiler or guest execution is performed here.
 * Bounds and assumptions are explicit; liveness/fairness and refinement remain open.
 */
const assert = require('node:assert/strict');
const MAX_STATES = 60000;
function clone(s) { return JSON.parse(JSON.stringify(s)); }
function modelCheck({name, initial, transitions, invariant, maxStates=MAX_STATES}) {
  assert.ok(Number.isInteger(maxStates) && maxStates>0 && maxStates<=MAX_STATES);
  const key = s => JSON.stringify(s);
  const visited = new Set([key(initial)]);
  const todo = [{state:initial,path:[]}];
  let edges = 0;
  for(let i=0;i<todo.length;i++){
    const {state,path} = todo[i];
    const violation = invariant(state);
    if(violation) return {model:name,result:'COUNTEREXAMPLE',states:visited.size,edges,
      violation,trace:path,state};
    for(const [label,child] of transitions(state)){
      edges++;
      const k=key(child);
      if(visited.has(k))continue;
      visited.add(k);
      if(visited.size>maxStates) return {model:name,result:'BOUND_EXHAUSTED',states:visited.size,
        edges, bound:maxStates};
      todo.push({state:child,path:[...path,label]});
    }
  }
  return {model:name,result:'BOUNDED_SAFETY_HOLDS',states:visited.size,edges,bound:maxStates};
}
function actorTransitions(s, mutant){
  const out=[];
  function add(label,fn){const t=clone(s);fn(t);out.push([label,t]);}
  if(s.readers<2 && s.writer===null)
    add('read-borrow-active-owner',t=>{t.readers++;});
  if(s.readers>0)add('release-read-borrow',t=>{t.readers--;});
  if(s.writer===null && (s.readers===0 || mutant==='allow-write-during-read'))
    add('acquire-exclusive-write',t=>{
      t.writer={actor:t.owner,generation:t.generation};
    });
  if(s.writer!==null)add('release-exclusive-write',t=>{t.writer=null;});
  if(s.readers===0 && s.writer===null && s.generation===0)
    add('transfer-owned-arena',t=>{
      t.owner='B'; t.generation=1;
    });
  if(s.generation===1 && s.writer===null && mutant==='allow-stale-writer')
    add('mutant-stale-write-from-prior-generation',t=>{
      t.writer={actor:'A',generation:0};
    });
  return out;
}
function actorInvariant(s) {
  if(s.readers>0 && s.writer!==null) return 'READ_WRITE_OVERLAP';
  if(s.readers>2 || s.readers<0) return 'BORROW_COUNT_OUT_OF_BOUND';
  if(s.writer && s.writer.actor!==s.owner) return 'WRONG_ACTOR_OWNER';
  if(s.writer && s.writer.generation!==s.generation) return 'STALE_WRITER_GENERATION';
  return null;
}
function actorModel(mutant=null) {
  return modelCheck({name:'ACT-01/OWN-01 actor isolation',initial:{
    owner:'A',generation:0,readers:0,writer:null
  },transitions:s=>actorTransitions(s,mutant),invariant:actorInvariant});
}
function pubTransitions(s, mutant){
  const out=[];
  function add(label,fn){const t=clone(s);fn(t);out.push([label,t]);}
  for(let i=0;i<2;i++){
    if(s.open && !s.cancelled[i] && !s.queue && s.next[i]<2)
      add('publish-'+i+'-seq-'+(s.next[i]+1),t=>{
        t.next[i]++;t.queue={publisher:i,seq:t.next[i],generation:t.generation};
      });
    if(s.open && !s.cancelled[i])
      add('cancel-publisher-'+i,t=>{
        t.cancelled[i]=true;
        if(t.queue && t.queue.publisher===i)t.queue=null;
      });
  }
  if(s.queue && s.queue.generation===s.generation) {
    add('commit-deliver-then-ack',t=>{
      const i=t.queue.publisher;
      t.delivered[i]=t.queue.seq;
      t.acked[i]=t.queue.seq;
      t.queue=null;
    });
    if(mutant==='early-ack') add('mutant-ack-before-commit',t=>{
      t.acked[t.queue.publisher]=t.queue.seq;
    });
  }
  if(s.open && s.generation===0) {
    add(mutant==='retain-old-queue'?'mutant-rejoin-with-old-queue':'leave-and-rejoin',t=>{
      t.generation=1;
      if(mutant!=='retain-old-queue')t.queue=null;
      t.next=[0,0];t.delivered=[0,0];t.acked=[0,0];
      t.cancelled=[false,false];
    });
  }
  if(s.open)add('close-group',t=>{t.open=false;t.queue=null;});
  return out;
}
function pubInvariant(s){
  if(s.queue && !s.open) return 'DELIVERY_AFTER_GROUP_CLOSE';
  if(s.queue && s.queue.generation!==s.generation) return 'STALE_SUBSCRIPTION_GENERATION';
  if(s.queue && (!Number.isInteger(s.queue.publisher) || s.queue.publisher<0 || s.queue.publisher>1))
    return 'INVALID_PUBLISHER';
  for(let i=0;i<2;i++){
    if(!(s.acked[i]<=s.delivered[i] && s.delivered[i]<=s.next[i]))
      return 'EARLY_ACK_OR_UNCOMMITTED_DELIVERY';
    if(s.cancelled[i] && s.queue && s.queue.publisher===i)
      return 'CANCELLED_PUBLISHER_HAS_QUEUED_DELIVERY';
    if(s.next[i]<0 || s.next[i]>2 || s.delivered[i]<0 || s.acked[i]<0)
      return 'SEQUENCE_BOUND_VIOLATION';
  }
  if(s.queue && s.queue.seq<=s.delivered[s.queue.publisher])
    return 'DUPLICATE_OR_OUT_OF_ORDER_DELIVERY';
  return null;
}
function pubModel(mutant=null) {
  return modelCheck({name:'PUB-01/CANCEL-01/GEN-01 reliable pub-sub',initial:{
    generation:0,open:true,next:[0,0],delivered:[0,0],acked:[0,0],
    cancelled:[false,false],queue:null
  },transitions:s=>pubTransitions(s,mutant),invariant:pubInvariant});
}
function verificationReport(){
  const actor=actorModel(),pubsub=pubModel();
  const negatives=[
    {model:'actor write/read exclusion',mutant:'allow-write-during-read',result:actorModel('allow-write-during-read')},
    {model:'actor generation fencing',mutant:'allow-stale-writer',result:actorModel('allow-stale-writer')},
    {model:'reliable publish ACK safety',mutant:'early-ack',result:pubModel('early-ack')},
    {model:'pub-sub subscription generation',mutant:'retain-old-queue',result:pubModel('retain-old-queue')}
  ];
  const models=[actor,pubsub];
  const success=models.every(x=>x.result==='BOUNDED_SAFETY_HOLDS') &&
    negatives.every(x=>x.result.result==='COUNTEREXAMPLE' && x.result.trace.length>0);
  return {schemaVersion:1,classification:'BOUNDED_DESIGN_MODEL_ONLY',
    assumptions:{
      actor:'One arena, two read-borrow slots, two ownership generations A→B; exclusive writer; abstract atomic transitions.',
      pubsub:'Two publishers, two sequence numbers each per generation, one queued message, two generations, atomic delivery+ACK.',
      limitations:'No unbounded temporal proof, fairness/liveness result, compiler-backed guest run, source refinement, production runtime, or scheduler proof.'
    },models,negativeControls:negatives,success,
    note:'Safety holds only within enumerated model bounds. Mutants must produce safety counterexample traces.'};
}
if(require.main===module){
  const result=verificationReport();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.success)process.exitCode=1;
}
module.exports={modelCheck,actorModel,pubModel,verificationReport,actorTransitions,actorInvariant,pubTransitions,pubInvariant};
