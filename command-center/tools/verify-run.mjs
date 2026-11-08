#!/usr/bin/env node
// Independent reviewer-side GitHub metadata corroboration. Never run in PR-controlled CI
// with a privileged token. Does not download artifacts, interpret logs or approve merges.
import fs from 'node:fs';
import path from 'node:path';
import {createGitHubReader,requireCompletePage} from './github-api.mjs';
import {corroborateMetadata,validateReviewerPin} from './evidence-core.mjs';
function fileArg(){const i=process.argv.indexOf('--pin');return i<0?null:process.argv[i+1]}
function readPin(filename){
  if(!filename||filename.startsWith('-'))throw Error('Usage: node tools/verify-run.mjs --pin trusted-reviewer-pin.json');
  const st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||st.size>16*1024)throw Error('Reviewer pin must be a regular bounded file');
  return validateReviewerPin(JSON.parse(fs.readFileSync(filename,'utf8')));
}
export async function independentlyReadMetadata(pin,get){
  validateReviewerPin(pin);
  const prefix='/repos/'+pin.repo;
  const pr=requireCompletePage(await get(prefix+'/pulls/'+pin.number));
  const commit=requireCompletePage(await get(prefix+'/git/commits/'+pin.head));
  const run=requireCompletePage(await get(prefix+'/actions/runs/'+pin.runId));
  const jobsPage=await get(prefix+'/actions/runs/'+pin.runId+'/attempts/'+pin.attempt+'/jobs?per_page=100');
  const jobs=requireCompletePage(jobsPage,100);
  if(!Array.isArray(jobs.jobs))throw Error('Jobs list unavailable');
  const matching=jobs.jobs.filter(j=>j.id===pin.jobId);
  if(matching.length!==1)throw Error('Pinned job missing or duplicated');
  if(jobs.jobs.filter(j=>j.name===pin.jobName).length!==1)throw Error('Duplicate display job name');
  return corroborateMetadata(pin,{pr,commit,run,job:matching[0],jobsComplete:true});
}
async function main(){
  const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;
  if(!token)throw Error('Read-only reviewer token required');
  const pin=readPin(fileArg());
  const result=await independentlyReadMetadata(pin,createGitHubReader({token}));
  console.log(JSON.stringify({...result,notice:'CANDIDATE ONLY. This does not prove compiled AttoLang guest, native binary bytes, formal TLC, independent reviewer authority or branch protection.'},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('NO ATTESTATION: '+e.message);process.exitCode=1});
