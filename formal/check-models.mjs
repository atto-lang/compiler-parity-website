#!/usr/bin/env node
/**
 * Bounded design checker for AttoLang actor/messaging safety contracts.
 * Executable finite-state reference models, NOT compiler/guest refinement
 * and NOT an unbounded theorem or temporal liveness proof.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const clone = x => structuredClone(x);
const key = s => JSON.stringify(s);
const changed = (s,patch) => Object.assign(clone(s),patch);
const other = owner => owner === 'A' ? 'B' : 'A';
const record = (name,state) => ({name,state});

export const models = {
  actor: {
    assumptions: 'Two actors, one state slot, one transfer, atomic acquire/release.',
    init: {owner:'A', reader:null, writer:null, epoch:0},
    successors(s,mutant) {
      const next=[];
      if(!s.writer && !s.reader){
        next.push(record('acquire-reader',changed(s,{reader:s.owner})));
        next.push(record('acquire-writer',changed(s,{writer:s.owner})));
        if(s.epoch<1)next.push(record('transfer-owner',changed(s,{owner:other(s.owner),epoch:s.epoch+1})));
        if(mutant==='foreign-writer')next.push(record('mutant-foreign-write',changed(s,{writer:other(s.owner)})));
      }
      if(s.reader)next.push(record('release-reader',changed(s,{reader:null})));
      if(s.writer)next.push(record('release-writer',changed(s,{writer:null})));
      return next;
    },
    violation(s) {
      if(s.writer && (s.reader || s.writer!==s.owner))return 'exclusive writer/ownership violation';
      if(s.reader && s.reader!==s.owner)return 'reader cross-owner violation';
      return null;
    }
  },
  cancellation: {
    assumptions: 'One bounded waiter, explicit cancellation and wakeup, fair enabled-wakeup scheduling.',
    init: {cancel:false,waiting:true,released:false,charged:1,completion:0},
    successors(s,mutant) {
      const next=[];
      if(s.waiting && !s.cancel) {
        next.push(record('request-cancel',changed(s,{cancel:true})));
        next.push(record('normal-timeout',changed(s,{waiting:false,released:true,charged:0,completion:1})));
      }
      if(s.waiting && s.cancel && mutant!=='lost-wakeup')
        next.push(record('wake-cancelled',changed(s,{waiting:false,released:true,charged:0,completion:mutant==='double-completion'?2:1})));
      return next;
    },
    violation(s,enabled) {
      if(s.charged<0 || s.charged>1 || s.completion>1)return 'quota or exactly-once completion violation';
      if(s.released && (s.waiting || s.charged!==0))return 'reclamation violation';
      if(s.cancel && s.waiting && !enabled.some(t=>t.name==='wake-cancelled'))
        return 'cancelled waiter has no enabled wakeup (conditional progress)';
      return null;
    }
  },
  pubsub: {
    assumptions: 'Two publishers, two sends each, capacity one, two subscription generations.',
    init: {generation:1,seqA:0,seqB:0,queue:null,delivered:[],acks:[],cancel:false},
    successors(s,mutant) {
      const next=[];
      for (const p of ['A','B']) {
        const field=p==='A'?'seqA':'seqB';
        if(!s.cancel && !s.queue && s[field]<2) {
          const item={publisher:p,sequence:s[field]+1,generation:s.generation};
          const updated=changed(s,{queue:item,[field]:s[field]+1});
          if(mutant==='early-ack')updated.acks.push(id(item));
          next.push(record('publish-'+p,updated));
        }
      }
      if(s.queue && !s.cancel){
        const item=s.queue;
        next.push(record('deliver',changed(s,{queue:null,delivered:[...s.delivered,id(item)]})));
      }
      for(const item of s.delivered){
        if(!s.cancel && !s.acks.includes(item) && item.endsWith('@'+s.generation))
          next.push(record('ack-'+item,changed(s,{acks:[...s.acks,item]})));
      }
      if(s.generation===1){
        next.push(record('leave-rejoin',changed(s,{
          generation:2,cancel:false,
          queue:mutant==='stale-queue'?s.queue:null
        })));
      }
      if(!s.cancel)next.push(record('cancel-subscription',changed(s,{cancel:true,queue:null})));
      return next;
    },
    violation(s){
      if(s.queue && s.queue.generation!==s.generation)return 'stale-generation queue after rejoin';
      if(s.queue && s.cancel)return 'queue retained after cancellation';
      if(new Set(s.acks).size!==s.acks.length)return 'duplicate reliable acknowledgement';
      if(s.acks.some(a=>!s.delivered.includes(a)))return 'early ACK before committed delivery';
      if(s.seqA>2 || s.seqB>2)return 'publish quota exceeded';
      return null;
    }
  },
  hotreload: {
    assumptions: 'One stable actor ref, two generations, one in-flight ticket and atomic freeze/swap.',
    init: {active:1,phase:'live',ticket:null,lastExecuted:null,rollback:false},
    successors(s,mutant){
      const next=[];
      if(s.phase==='live' && !s.ticket)next.push(record('issue-ticket',changed(s,{ticket:s.active})));
      if(s.phase==='live' && s.ticket===s.active)
        next.push(record('execute-ticket',changed(s,{ticket:null,lastExecuted:{ticket:s.ticket,at:s.active}})));
      if(s.active===1 && s.phase==='live')next.push(record('freeze',changed(s,{phase:'frozen'})));
      if(s.phase==='frozen'){
        next.push(record('swap-generation',changed(s,{active:2,phase:'live',ticket:mutant==='retain-stale-ticket'?s.ticket:null})));
        next.push(record('rollback-generation',changed(s,{active:1,phase:'live',ticket:null,rollback:true})));
      }
      return next;
    },
    violation(s){
      if(s.ticket!==null && s.ticket!==s.active)return 'stale-generation ticket retained';
      if(s.lastExecuted && s.lastExecuted.ticket!==s.lastExecuted.at)return 'retired guest execution';
      if(s.phase!=='live' && s.phase!=='frozen')return 'unknown hot-reload phase';
      return null;
    }
  }
};

function id(item){return item.publisher+':'+item.sequence+'@'+item.generation;}

/** BFS checks all reachable states under the explicit bounded model. */
export function explore(model, {mutant=null,maxStates=30000,maxDepth=16}={}) {
  if(!model || typeof model.successors!=='function')throw new Error('Invalid model');
  const seen=new Set(),queue=[{state:clone(model.init),trace:[],depth:0}];
  let edges=0,stoppedAtDepth=false;
  for(let i=0;i<queue.length;i++){
    const node=queue[i];
    const k=key(node.state);
    if(seen.has(k))continue;
    seen.add(k);
    if(seen.size>maxStates)throw new Error('State bound exceeded; inconclusive');
    const enabled=model.successors(node.state,mutant);
    const violation=model.violation(node.state,enabled);
    if(violation)return {ok:false,states:seen.size,edges,violation,trace:node.trace};
    if(node.depth>=maxDepth){
      if(enabled.length)stoppedAtDepth=true;
      continue;
    }
    for(const tr of enabled){
      edges++;
      if(!tr || !tr.state || !tr.name)throw new Error('Malformed transition');
      if(!seen.has(key(tr.state)))queue.push({state:tr.state,trace:[...node.trace,tr.name],depth:node.depth+1});
    }
  }
  return {ok:true,states:seen.size,edges,boundedDepth:maxDepth,depthTruncated:stoppedAtDepth};
}

export const mutationSuite = Object.freeze({
  actor:['foreign-writer'],
  cancellation:['lost-wakeup','double-completion'],
  pubsub:['early-ack','stale-queue'],
  hotreload:['retain-stale-ticket']
});

export function verifyAll(options={}){
  const results=[];
  for(const [name,model] of Object.entries(models)){
    const normal=explore(model,options);
    if(!normal.ok)throw new Error('Baseline model violation: '+name+' '+normal.violation);
    results.push({model:name,scope:'BOUNDED_DESIGN_MODEL_ONLY',assumptions:model.assumptions,states:normal.states,edges:normal.edges,depthTruncated:normal.depthTruncated});
    for(const mutant of mutationSuite[name]){
      const killed=explore(model,{...options,mutant});
      if(killed.ok)throw new Error('Negative mutant survived: '+name+'/'+mutant);
      if(!killed.trace.length)throw new Error('Mutation counterexample missing action trace');
      results.push({model:name,mutant,killed:true,counterexample:killed.trace,violation:killed.violation,scope:'BOUNDED_DESIGN_MODEL_ONLY'});
    }
  }
  return {classification:'BOUNDED_DESIGN_MODEL_ONLY',guestExecution:'NOT_EXECUTED',unboundedProof:false,refinementProven:false,results};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const outcome=verifyAll();
    if(process.argv.includes('--json'))console.log(JSON.stringify(outcome,null,2));
    else {
      for(const r of outcome.results)console.log(r.mutant ? 'KILLED '+r.model+'/'+r.mutant+' '+r.counterexample.join(' > ') : 'MODEL '+r.model+' states='+r.states+' edges='+r.edges+' depthTruncated='+r.depthTruncated);
      console.log('BOUND MODEL ONLY; production refinement, unbounded liveness and AttoLang guests NOT_EXECUTED');
    }
  }catch(err){console.error('MODEL_CHECK_FAILED '+err.message);process.exitCode=1;}
}
