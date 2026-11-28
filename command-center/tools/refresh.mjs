#!/usr/bin/env node
// Authenticated read-only candidate snapshot refresher.
// Operates only on an operator-exported schemaVersion=2 command-center snapshot.
// Output is private; metadata readback is NOT a compiler, guest, TLC or merge receipt.
import fs from 'node:fs';
import path from 'node:path';
import {createGitHubReader,requireCompletePage} from './github-api.mjs';
import {SHA,POS,validateInputSnapshot} from './evidence-core.mjs';
function value(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null}
function readInput(filename){
  if(!filename||filename.startsWith('-'))throw Error('Provide --input exported-snapshot.json');
  const st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||st.size>2*1024*1024)throw Error('Input must be a bounded regular JSON file');
  return validateInputSnapshot(JSON.parse(fs.readFileSync(filename,'utf8')));
}
function writeOutput(filename,x){
  if(!filename||filename.startsWith('-'))throw Error('Provide --output new-private-snapshot.json');
  const dst=path.resolve(filename);
  const bytes=JSON.stringify(x,null,2)+'\n';
  if(Buffer.byteLength(bytes)>2*1024*1024)throw Error('Output exceeds UI import limit (2 MiB)');
  // Exclusive create prevents overwriting previous provenance records; no symlink following.
  const fd=fs.openSync(dst,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
export async function refresh(snapshot,get,{maxRuns=2}={}){
  validateInputSnapshot(snapshot);
  const prs=snapshot.prs.map(p=>({...p}));
  const jobs=[];let successes=0,failures=0;
  for(const prRow of prs){
    const prefix='/repos/'+prRow.repo;
    try{
      const pr=requireCompletePage(await get(prefix+'/pulls/'+prRow.number));
      if(pr.number!==prRow.number||pr.base?.repo?.full_name!==prRow.repo||!SHA.test(pr.head?.sha))throw Error('PR identity or current head is invalid');
      const head=pr.head.sha;
      const commit=requireCompletePage(await get(prefix+'/git/commits/'+head));
      if(commit.sha!==head||!SHA.test(commit.tree?.sha))throw Error('Root Git tree readback mismatch');
      prRow.head=head;
      prRow.tree=commit.tree.sha;
      prRow.updated=pr.updated_at||prRow.updated;
      prRow.merge=pr.merged?'Merged':pr.draft?'Draft':pr.state==='open'?'Open':'Closed';
      prRow.baseSha=pr.base?.sha||null;
      prRow.baseRef=pr.base?.ref||null;
      prRow.mergeableRaw=pr.mergeable??null;
      prRow.review='Unverified; independent reviewer and effective branch rules not evaluated';
      // Avoid preserving an imported "attested" flag from an untrusted browser export.
      prRow.attestedGuestReceipt=false;
      prRow.exactHeadChecks=false;
      prRow.protectionApproved=false;
      const response=await get(prefix+'/actions/runs?head_sha='+head+'&per_page=30');
      if(!Array.isArray(response.data?.workflow_runs))throw Error('Malformed workflow run page');
      // Latest-run sampling is intentionally NON-exhaustive; incompleteness is explicit.
      // No run-count or absence-of-evidence claim is made from this bounded window.
      prRow.runWindowTruncated=!response.complete||Number(response.data.total_count)>response.data.workflow_runs.length;
      const runs=response.data.workflow_runs.filter(r=>r.head_sha===head&&POS(r.id)).slice(0,maxRuns);
      for(const run of runs){
        if(!POS(run.run_attempt))throw Error('Missing workflow run attempt');
        const page=await get(prefix+'/actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
        const payload=requireCompletePage(page,100);
        if(!Array.isArray(payload.jobs))throw Error('Malformed jobs response');
        for(const j of payload.jobs){
          if(!POS(j.id))throw Error('Invalid GitHub job ID');
          // Only GitHub-observed metadata is stored, no claim that job steps ran AttoLang.
          const steps=Array.isArray(j.steps)?j.steps.map(s=>({name:s.name,number:s.number,status:s.status,conclusion:s.conclusion,started_at:s.started_at,completed_at:s.completed_at})):j.steps===null?null:'UNKNOWN';
          jobs.push({
            id:'gh-'+prRow.id+'-'+run.id+'-'+run.run_attempt+'-'+j.id,
            prId:prRow.id,run:run.id,jobId:j.id,name:j.name||'unnamed-job',
            workflow:run.name||'unknown',workflowPath:run.path||null,attempt:run.run_attempt,
            steps,conclusion:j.conclusion||'unknown',date:j.completed_at||run.updated_at||null,
            head:run.head_sha,headMatch:run.head_sha===head,stage:'unclassified',
            sourceFree:false,metaOnly:true,guest:'NOT_EXECUTED',
            note:'Authenticated GitHub metadata CANDIDATE ONLY; source-free status, compiler stages, artifacts and guest output require independent verification.'
          });
        }
      }
      successes++;
    }catch(e){
      failures++;
      // Source metadata remains from the historical snapshot, never present as current proof.
      prRow.refreshError=String(e.message).slice(0,180);
      prRow.tree=null;
      prRow.review='UNINSPECTED — failed readback';
      prRow.attestedGuestReceipt=false;
    }
  }
  return {...snapshot,prs,jobs,snapshot:new Date().toISOString(),source:'Private authenticated read-only GitHub metadata candidate; NOT independently attested',
    refresh:{successfulPrs:successes,failedPrs:failures,jobRecords:jobs.length,claim:'METADATA_CORROBORATED_CANDIDATE_ONLY',guestParity:'UNPROVEN',
      scope:'Selected PRs only, up to '+maxRuns+' exact-head runs and max 100 jobs/run; incomplete pages fail closed'},
    unverified:true};
}
async function main(){
  const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;
  if(!token)throw Error('GITHUB_TOKEN required; do not expose token to browser or pull_request CI');
  const input=readInput(value('--input'));
  const get=createGitHubReader({token});
  const result=await refresh(input,get);
  writeOutput(value('--output'),result);
  console.log('Private candidate snapshot: '+result.refresh.successfulPrs+' PRs refreshed, '+result.refresh.failedPrs+' errors, '+result.jobs.length+' job records. Guest parity remains UNPROVEN.');
  if(result.refresh.failedPrs)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('Refresh withheld: '+e.message);process.exitCode=1});
