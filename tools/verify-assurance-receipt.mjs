#!/usr/bin/env node
/**
 * Independent read-back gate for an untrusted CI receipt.
 *
 * GitHub API metadata is fetched live with a read-only token. Candidate
 * receipts are not signatures or evidence that guest semantics are correct.
 * No repository source, CI artifact ZIP or secret is downloaded by this tool.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  GitHubReadOnly, exactSha, safeRepo, stepState, OBSERVATION
} from './collect-assurance.mjs';

export const CANDIDATE_CLASS = 'GITHUB_METADATA_CORROBORATED_CANDIDATE_ONLY';
const TLC_SHA256='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
const hex64 = x => typeof x==='string' && /^[a-f0-9]{64}$/.test(x);
export const REQUIRED_STEPS = Object.freeze({
  TLC_BOUNDED_MODEL_ONLY: Object.freeze([
    'Checkout exact original head (never synthetic PR merge)',
    'Independently verify TLC model and runner script HEAD blobs',
    'Execute real TLC for five bounded models and three unsafe-mutant controls'
  ]),
  JAVA_JVM_GUEST_CANDIDATE: Object.freeze([
    'Checkout immutable original Java PR head',
    'Compile critical AST, Task authority and .ores Truffle guest tests'
  ])
});
export const EXPECTED_WORKFLOWS = Object.freeze({
  TLC_BOUNDED_MODEL_ONLY: '.github/workflows/assurance-tlc.yml',
  JAVA_JVM_GUEST_CANDIDATE: '.github/workflows/critical-suspends-java-admission.yml'
});
const integer = n => Number.isSafeInteger(n) && n > 0;
function requireEvidence(ok, reason) {
  if (!ok) throw new Error('EVIDENCE_REJECTED: '+reason);
}
function sameNumeric(actual, expected) {
  return integer(Number(actual)) && Number(actual) === expected &&
    /^(?:[1-9][0-9]*)$/.test(String(actual));
}
function validName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_.-]+$/.test(name);
}
export function validatePin(pin) {
  requireEvidence(pin && typeof pin === 'object' &&
    !Array.isArray(pin), 'invalid pin');
  requireEvidence(safeRepo(pin.repo), 'invalid repository selector');
  requireEvidence(integer(pin.pr) && exactSha(pin.head) && exactSha(pin.tree),
    'invalid PR or pinned source head/tree');
  requireEvidence(integer(pin.runId) && integer(pin.attempt) &&
    integer(pin.jobId) && integer(pin.workflowId) &&
    validName(pin.jobName) && validName(pin.jobKey),
    'invalid pinned workflow/run/job identity');
  requireEvidence(pin.workflowPath===EXPECTED_WORKFLOWS[pin.kind],
    'workflow path is not the canonical evidence-producing workflow');
  requireEvidence(['TLC_BOUNDED_MODEL_ONLY','JAVA_JVM_GUEST_CANDIDATE'].includes(pin.kind),
    'unsupported evidence kind');
  requireEvidence(pin.kind==='TLC_BOUNDED_MODEL_ONLY'
    ? pin.toolSha256===TLC_SHA256
    : hex64(pin.compilerSha256) && hex64(pin.fixtureSha256),
    'tool or fixture identity not pinned');
  requireEvidence(Array.isArray(pin.requiredSteps) && pin.requiredSteps.length >= 1 &&
    pin.requiredSteps.length <= 20 &&
    pin.requiredSteps.every(s => typeof s === 'string' && s.length > 0 && s.length <= 150) &&
    new Set(pin.requiredSteps).size === pin.requiredSteps.length,
    'missing/duplicate required step names');
  const mandatoryPositions=REQUIRED_STEPS[pin.kind].map(name=>pin.requiredSteps.indexOf(name));
  requireEvidence(mandatoryPositions.every((position,i)=>
    position>=0 && (i===0 || position>mandatoryPositions[i-1])),
    'required immutable checkout, original-head preflight and execution steps not pinned in order');
  return pin;
}
export function validateCandidateReceipt(pin, receipt) {
  requireEvidence(receipt && typeof receipt === 'object' && !Array.isArray(receipt),
    'missing/unparseable receipt');
  const isTlc=pin.kind === 'TLC_BOUNDED_MODEL_ONLY';
  const head=isTlc?receipt.source_head:receipt.head;
  const tree=isTlc?receipt.source_tree:receipt.tree;
  requireEvidence(head===pin.head && tree===pin.tree,
    'untrusted receipt source head/tree mismatch');
  requireEvidence(sameNumeric(receipt.run_id,pin.runId) &&
    sameNumeric(isTlc?receipt.run_attempt:receipt.attempt,pin.attempt),
    'untrusted receipt run/attempt mismatch');
  if(isTlc){
    requireEvidence(receipt.classification==='TLC_BOUNDED_MODEL_ONLY' &&
      receipt.verification==='UNATTESTED_TOOL_RUN' &&
      receipt.guest==='NOT_EXECUTED' &&
      receipt.baseline_models===5 &&
      receipt.expected_invariant_counterexamples===3 &&
      receipt.tool_sha256===pin.toolSha256 &&
      receipt.job===pin.jobKey,
      'TLC scoped receipt fields missing or elevated');
  } else {
    requireEvidence(receipt.classification==='SCOPED_SUREFIRE_CASES_OBSERVED' &&
      receipt.proof==='NOT_INDEPENDENTLY_VERIFIED' &&
      receipt.guest==='CANDIDATE_ONLY' && receipt.job===pin.jobKey &&
      receipt.compiler_class_sha256===pin.compilerSha256 &&
      receipt.fixture_sha256===pin.fixtureSha256,
      'Java scoped receipt fields missing or elevated');
  }
}
function finishedSuccess(step) {
  return step && typeof step.name==='string' &&
    step.status==='completed' && step.conclusion==='success' &&
    Number.isFinite(Date.parse(step.started_at)) &&
    Number.isFinite(Date.parse(step.completed_at)) &&
    Date.parse(step.completed_at)>=Date.parse(step.started_at);
}
export async function verifyLiveCandidate(api,pin,receipt) {
  validatePin(pin);
  validateCandidateReceipt(pin,receipt);
  const base='/repos/'+pin.repo;
  const [pull,commit,run,attemptJobs]=await Promise.all([
    api.get(base+'/pulls/'+pin.pr),
    api.get(base+'/git/commits/'+pin.head),
    api.get(base+'/actions/runs/'+pin.runId),
    api.get(base+'/actions/runs/'+pin.runId+'/attempts/'+pin.attempt+'/jobs?per_page=100')
  ]);
  requireEvidence(pull && pull.number===pin.pr && pull.head?.sha===pin.head,
    'PR moved or head was not corroborated');
  requireEvidence(commit && commit.tree?.sha===pin.tree,
    'commit root tree was not corroborated');
  requireEvidence(run && run.id===pin.runId && run.head_sha===pin.head &&
    run.event==='pull_request' &&
    run.workflow_id===pin.workflowId && run.path===pin.workflowPath &&
    run.run_attempt===pin.attempt &&
    run.status==='completed' && run.conclusion==='success',
    'run source/event/attempt/conclusion was not corroborated');
  requireEvidence(Array.isArray(run.pull_requests) &&
    run.pull_requests.some(p=>p.number===pin.pr && p.head?.sha===pin.head),
    'run has no confirmed association with the pinned PR and head');
  if(run.repository)
    requireEvidence(run.repository.full_name===pin.repo,
      'workflow repository identity mismatch');
  if(run.head_commit?.tree_id)
    requireEvidence(run.head_commit.tree_id===pin.tree,
      'workflow run head-commit tree mismatch');
  requireEvidence(attemptJobs && Array.isArray(attemptJobs.jobs) &&
    attemptJobs.jobs.length>0 && attemptJobs.jobs.length<100 &&
    attemptJobs.total_count===attemptJobs.jobs.length,
    'missing/partial paginated job set');
  const names=new Set(), ids=new Set();
  for(const j of attemptJobs.jobs){
    requireEvidence(j && integer(j.id) && typeof j.name==='string' &&
      j.name.length>0 && !names.has(j.name) && !ids.has(j.id),
      'duplicate/invalid attempt job identity');
    names.add(j.name); ids.add(j.id);
  }
  const job=attemptJobs.jobs.find(j=>j.id===pin.jobId);
  requireEvidence(job && job.name===pin.jobName &&
    job.status==='completed' && job.conclusion==='success' &&
    job.run_id===pin.runId && job.run_attempt===pin.attempt &&
    job.head_sha===pin.head &&
    job.check_run_url==='https://api.github.com'+base+'/check-runs/'+pin.jobId &&
    integer(job.runner_id) && typeof job.runner_name==='string' &&
    job.runner_name.trim().length>0 &&
    Array.isArray(job.steps) &&
    stepState(job.steps)===OBSERVATION.STEPS_EXECUTED,
    'selected job not genuinely stepful and successful');
  const named=new Map(), numbers=new Set();
  let lastNumber=0;
  for(const step of job.steps){
    requireEvidence(step && typeof step.name==='string' &&
      !named.has(step.name) && integer(step.number) &&
      !numbers.has(step.number) && step.number>lastNumber,
      'duplicate/out-of-order/invalid job step identity');
    requireEvidence(step.status==='completed' &&
      (step.conclusion==='success' || step.conclusion==='skipped'),
      'job contains a failed, cancelled or unfinished step');
    numbers.add(step.number);
    lastNumber=step.number;
    named.set(step.name,step);
  }
  const accepted=[];
  let lastRequiredNumber=0;
  for(const name of pin.requiredSteps){
    const step=named.get(name);
    requireEvidence(finishedSuccess(step) && step.number>lastRequiredNumber,
      'required step missing, skipped, out of order or unexecuted: '+name);
    lastRequiredNumber=step.number;
    accepted.push(name);
  }
  return Object.freeze({
    classification:CANDIDATE_CLASS,
    authenticatedSource:'GITHUB_API_JOB_METADATA',
    receiptAuthenticity:'NOT_INDEPENDENTLY_ESTABLISHED',
    guestExecution:'NOT_INDEPENDENTLY_VERIFIED',
    proof:'NOT_SIGNED_OR_INDEPENDENTLY_REVIEWED',
    kind:pin.kind,repo:pin.repo,pr:pin.pr,
    head:pin.head,tree:pin.tree,
    workflowId:pin.workflowId,workflowPath:pin.workflowPath,
    runId:pin.runId,attempt:pin.attempt,jobId:pin.jobId,
    jobKey:pin.jobKey,jobDisplayName:pin.jobName,
    runnerId:job.runner_id,startedSteps:job.steps.filter(finishedSuccess).length,
    requiredStepsVerified:accepted
  });
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==2)throw new Error(
    'Usage: ASSURANCE_READ_TOKEN=... node tools/verify-assurance-receipt.mjs <trusted-pin.json> <untrusted-receipt.json>');
  const token=process.env.ASSURANCE_READ_TOKEN;
  if(!token)throw new Error('ASSURANCE_READ_TOKEN required (read-only, no token printing)');
  const [pin,receipt]=await Promise.all(args.map(async f=>
    JSON.parse(await readFile(resolve(f),'utf8'))));
  const verified=await verifyLiveCandidate(new GitHubReadOnly(token),pin,receipt);
  console.log(JSON.stringify(verified,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{
    console.error(String(e.message||e));
    process.exitCode=1;
  });
}
