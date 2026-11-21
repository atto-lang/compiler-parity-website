import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedGitHubJson} from '../tools/assurance-bounded-json-v1.mjs';
const B=s=>new TextEncoder().encode(s);
const res=(chunks,header={})=>({ok:true,body:new ReadableStream({start(c){chunks.forEach(x=>c.enqueue(x));c.close();}}),headers:{get:k=>header[k]??null}});
test('bounded valid JSON streams parse and preserve exact job identities',async()=>{
 const json='{"jobs":[{"id":5,"runner_id":null,"steps":null}]}';
 assert.deepEqual(await boundedGitHubJson(res([B(json.slice(0,14)),B(json.slice(14))]),100),
  {jobs:[{id:5,runner_id:null,steps:null}]});
});
test('exact size accepted, one byte too many fails',async()=>{
 assert.deepEqual(await boundedGitHubJson(res([B('{}')]),2),{});
 await assert.rejects(boundedGitHubJson(res([B('{}')]),1),/GITHUB_RESPONSE_TOO_LARGE/);
});
test('header oversize rejected immediately',async()=>{
 await assert.rejects(boundedGitHubJson(res([B('{}')],{'content-length':'999999999'}),100),/TOO_LARGE/);
});
test('dishonest header cannot bypass stream cap',async()=>{
 await assert.rejects(boundedGitHubJson(res([B('{"long":"value"}')],{'content-length':'1'}),6),/TOO_LARGE/);
});
test('invalid UTF-8, malformed JSON and missing body fail closed',async()=>{
 await assert.rejects(boundedGitHubJson(res([Uint8Array.of(0xff)]),10),/INVALID_GITHUB_RESPONSE_JSON/);
 await assert.rejects(boundedGitHubJson(res([B('{"oops":')]),10),/INVALID_GITHUB_RESPONSE_JSON/);
 await assert.rejects(boundedGitHubJson({ok:true},10),/MISSING_GITHUB_RESPONSE/);
});
test('mock JSON shape remains bounded and never a guest receipt',async()=>{
 const response={ok:true,json:async()=>({workflow_runs:[{id:4,head_sha:'a'.repeat(40)}]})};
 const result=await boundedGitHubJson(response,200);
 assert.equal(result.workflow_runs[0].id,4);
 await assert.rejects(boundedGitHubJson(response,3),/TOO_LARGE/);
});
test('abort non-OK, invalid caps and non-byte streams',async()=>{
 await assert.rejects(boundedGitHubJson({ok:false},100),/UNSUCCESSFUL/);
 await assert.rejects(boundedGitHubJson({ok:true},0),/INVALID_RESPONSE_LIMIT/);
 await assert.rejects(boundedGitHubJson({ok:true,body:{getReader(){return {read:async()=>({value:'str',done:false}),releaseLock(){},cancel:async()=>{}};}}},10),/INVALID_GITHUB_RESPONSE_CHUNK/);
});
