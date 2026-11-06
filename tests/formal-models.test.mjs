/* Bounded design-model tests; not AttoLang guest, TLC or unbounded proofs. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {models,explore,mutationSuite,verifyAll} from '../formal/check-models.mjs';

test('all five bounded safety reference models enumerate without violations',()=>{
  assert.deepEqual(Object.keys(models).sort(),['actor','actorBorrow','cancellation','hotreload','pubsub']);
  for(const [name,model] of Object.entries(models)){
    const r=explore(model);
    assert.equal(r.ok,true,name);
    assert.equal(r.depthTruncated,false,'model depth incomplete: '+name);
    assert.ok(r.states>1,name+' failed to explore');
    assert.ok(r.edges>0,name+' missing actions');
  }
});

test('all known unsafe mutations yield actionable counterexample traces',()=>{
  let killed=0;
  for(const [name,mutants] of Object.entries(mutationSuite)){
    for(const mutant of mutants){
      const result=explore(models[name],{mutant});
      assert.equal(result.ok,false,name+'/'+mutant);
      assert.ok(result.trace.length>0,'no counterexample trace '+name+'/'+mutant);
      assert.ok(result.violation.length>0,'no invariant explanation '+name+'/'+mutant);
      killed++;
    }
  }
  assert.equal(killed,8);
});

test('deepening or cutting exploration never promotes a bounded model to guest proof',()=>{
  const r=verifyAll();
  assert.equal(r.classification,'BOUNDED_DESIGN_MODEL_ONLY');
  assert.equal(r.guestExecution,'NOT_EXECUTED');
  assert.equal(r.unboundedProof,false);
  assert.equal(r.refinementProven,false);
  assert.equal(r.results.filter(x=>x.killed).length,8);
  assert.equal(r.results.filter(x=>!x.mutant).length,5);
  const short=explore(models.pubsub,{maxDepth:1});
  assert.equal(short.ok,true);
  assert.equal(short.depthTruncated,true);
});

test('bounded explorer rejects invalid/inconclusive resource bounds',()=>{
  assert.throws(()=>explore(null),/Invalid model/);
  assert.throws(()=>explore(models.pubsub,{maxStates:1}),/State bound exceeded/);
});

test('two active readers coexist, but writers cannot overlap or survive rt take generation',()=>{
  const safe=explore(models.actorBorrow);
  assert.equal(safe.ok,true);
  assert.equal(safe.depthTruncated,false);
  assert.ok(safe.states>=8);
  const writerOverlap=explore(models.actorBorrow,{mutant:'write-with-active-reader'});
  assert.equal(writerOverlap.ok,false);
  assert.match(writerOverlap.violation,/write overlaps shared borrow/);
  const stale=explore(models.actorBorrow,{mutant:'stale-writer-after-take'});
  assert.equal(stale.ok,false);
  assert.match(stale.violation,/wrong actor ownership/);
  assert.ok(stale.trace.includes('rt-take-owner-to-B'));
});
