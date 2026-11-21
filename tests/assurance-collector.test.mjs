/* Read-only metadata collector contract tests. Fully mocked; no GitHub calls. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  GitHubReadOnly, stepState, OBSERVATION, collectRecord,
  collectSnapshot, exactSha, safeRepo
} from '../tools/collect-assurance.mjs';

const OLD='a'.repeat(40), HEAD='b'.repeat(40), TREE='c'.repeat(40);
const repo='example-org/example-private-repo';
const record={
  id:'private-7',repo,number:7,head:HEAD,tree:null,treeSource:'Unknown',
  title:'bounded source model',backend:'Multi-backend',severity:'Critical',
  state:'Draft',evidence:'BOUNDED_MODEL',guest:'EXECUTED',
  invariants:['ACT-01'],formal:'local model reported',mutation:'local mutation reported'
};
function response(payload,status=200){
  return {status,ok:status>=200&&status<300,async json(){return payload;}};
}
function fixture({head=HEAD,steps=null,reviews=true,failReview=false,run=true}={}){
  const requests=[];
  const routes={
    ['/repos/'+repo+'/pulls/7']:{head:{sha:head},state:'open',draft:true,author_association:'OWNER',title:'Current GitHub PR',base:{ref:'main'},user:{login:'author'}},
    ['/repos/'+repo+'/git/commits/'+head]:{tree:{sha:TREE}},
    ['/repos/'+repo+'/pulls/7/reviews?per_page=100']:reviews?[{user:{login:'different-reviewer'},state:'APPROVED',commit_id:head,submitted_at:'2026-11-06T00:00:00Z'}]:[],
    ['/repos/'+repo+'/actions/runs?head_sha='+head+'&per_page=50']:{workflow_runs:run?[{id:45,head_sha:head,run_attempt:2,created_at:'2026-11-06T00:01:00Z'}]:[]},
    ['/repos/'+repo+'/actions/runs/45/jobs?filter=latest&per_page=100']:{jobs:[{id:101,name:'compile',conclusion:'failure',steps,runner_id:null}]}
  };
  const api = new GitHubReadOnly('only_mock_token_123',async(url,options)=>{
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    assert.ok(url.startsWith('https://api.github.com'));
    assert.equal(options.headers.Authorization,'Bearer only_mock_token_123');
    const pathname=url.slice('https://api.github.com'.length);
    requests.push(pathname);
    if(pathname.endsWith('/protection'))return response({},404);
    if(failReview && pathname.includes('/reviews?'))return response({},500);
    if(Object.hasOwn(routes,pathname))return response(routes[pathname]);
    throw new Error('Unexpected read-only API path: '+pathname);
  });
  return {api,requests};
}

test('strictly distinguishes no steps, unknown steps and executed steps',()=>{
  for(const steps of [null,[],0])assert.equal(stepState(steps),OBSERVATION.RUNNER_NOT_ADMITTED);
  for(const steps of [undefined,'UNKNOWN'])assert.equal(stepState(steps),OBSERVATION.NOT_INSPECTED);
  for(const steps of [[{name:'checkout'}],2])assert.equal(stepState(steps),OBSERVATION.STEPS_EXECUTED);
  assert.equal(exactSha('a'.repeat(40)),true);
  assert.equal(exactSha('invalid'),false);
  assert.equal(safeRepo('owner/repo'),true);
  for(const attack of ['../repo','owner/..','owner/repo/path','owner\\repo'])
    assert.equal(safeRepo(attack),false,attack);
});

test('an exact run-head with null steps is runner evidence, never guest proof',async()=>{
  const {api,requests}=fixture();
  const result=await collectRecord(api,record);
  assert.equal(result.head,HEAD);
  assert.equal(result.tree,TREE);
  assert.equal(result.treeSource,'GitHub API git/commits/{head} metadata');
  assert.equal(result.approvalsOnHead,1);
  assert.equal(result.workflow.steps,null);
  assert.equal(stepState(result.workflow.steps),OBSERVATION.RUNNER_NOT_ADMITTED);
  assert.equal(result.workflow.attempt,2);
  assert.equal(result.workflow.runHeadMatches,true);
  assert.equal(result.workflow.headBound,false);
  assert.equal(result.guest,'NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(result.mergeReady,false);
  assert.ok(requests.length>=6);
});

test('head moves invalidate all prior-hosted model claims',async()=>{
  const {api}=fixture({head:HEAD});
  const result=await collectRecord(api,{...record,head:OLD});
  assert.equal(result.currentHeadChanged,true);
  assert.equal(result.evidence,'SOURCE_ONLY');
  assert.match(result.formal,/STALE PRIOR-HEAD CLAIM/);
  assert.match(result.mutation,/STALE PRIOR-HEAD CLAIM/);
  assert.equal(result.guest,'NOT_INDEPENDENTLY_VERIFIED');
});

test('a source run with steps does not authenticate a guest or checkout',async()=>{
  const {api}=fixture({steps:[{name:'Checkout',conclusion:'success'},{name:'Host lint',conclusion:'success'}]});
  const result=await collectRecord(api,record);
  assert.equal(result.workflow.steps,2);
  assert.equal(stepState(result.workflow.steps),OBSERVATION.STEPS_EXECUTED);
  assert.equal(result.workflow.headBound,false);
  assert.equal(result.guest,'NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(result.mergeReady,false);
});

test('review API failure fails closed rather than inferring approval',async()=>{
  const {api}=fixture({failReview:true});
  const result=await collectRecord(api,record);
  assert.equal(result.approvalsOnHead,0);
  assert.equal(result.metadataStatus,'INCOMPLETE');
  assert.ok(result.metadataErrors.some(x=>x.startsWith('REVIEWS:')));
});

test('missing run is uninspected, never counted as runner failure',async()=>{
  const {api}=fixture({run:false});
  const result=await collectRecord(api,record);
  assert.equal(result.workflow,null);
  assert.equal(result.metadataStatus,'INCOMPLETE');
  assert.equal(result.guest,'NOT_INDEPENDENTLY_VERIFIED');
});

test('snapshot keeps catalog and emits metadata-only scope',async()=>{
  const {api}=fixture();
  const seed={
    schemaVersion:1,prs:[record],backends:['Java / GraalVM'],
    invariants:[{id:'ACT-01'}],tasks:[],templates:[]
  };
  const result=await collectSnapshot(api,seed,{clock:()=> '2026-11-06T21:00:00.000Z'});
  assert.equal(result.prs.length,1);
  assert.equal(result.prs[0].workflow.steps,null);
  assert.equal(result.collector.complete,1);
  assert.equal(result.collector.completeness,'METADATA_COLLECTED');
  assert.equal(result.capturedAt,'2026-11-06T21:00:00.000Z');
  assert.equal(result.prs[0].guest,'NOT_INDEPENDENTLY_VERIFIED');
  assert.match(result.collector.warning,/guest execution/i);
  const tokenJson=JSON.stringify(result);
  assert.equal(tokenJson.includes('only_mock_token_123'),false);
  assert.equal(tokenJson.includes('Bearer'),false);
});

test('no arbitrary repositories or oversized catalog ingestion',async()=>{
  const {api}=fixture();
  const seed={schemaVersion:1,prs:[{...record,repo:'../other'}],invariants:[],tasks:[],templates:[]};
  await assert.rejects(collectSnapshot(api,seed),/Invalid seed PR/);
});
