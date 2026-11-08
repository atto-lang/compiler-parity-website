// AttoLang assurance core. Pure gates; imported claims never become proof.
// These checks corroborate GitHub metadata only, not artifact bytes or guest semantics.
export const SHA=/^[0-9a-f]{40}$/;
export const POS=n=>Number.isSafeInteger(n)&&n>0;
export const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function jobClass(j) {
  const steps=j?.steps;
  if(steps===null||steps===0||(Array.isArray(steps)&&steps.length===0))return 'RUNNER_ADMISSION';
  if(!Array.isArray(steps))return 'UNINSPECTED';
  // A nonempty steps array is not necessarily proof of executed test steps.
  if(!steps.some(s=>s?.started_at&&s?.status==='completed'))return 'PREFLIGHT_ONLY';
  if(j?.sourceFree===true)return 'SOURCE_FREE_CANARY';
  if(j?.evidenceDomain==='host-model')return 'HOST_ONLY';
  return 'EXECUTED_STEPS_UNATTESTED';
}
export function validateInputSnapshot(x) {
  if(!x||x.schemaVersion!==2||!Array.isArray(x.prs)||!Array.isArray(x.jobs))throw Error('Invalid schemaVersion or registry arrays');
  if(x.prs.length<1||x.prs.length>50||x.jobs.length>5000)throw Error('Input record ceiling');
  const seen=new Set();
  for(const p of x.prs){
    if(typeof p.id!=='string'||p.id.length>96||seen.has(p.id)||!REPO.test(p.repo)||!POS(p.number)||!SHA.test(p.head))throw Error('Invalid PR registry entry');
    seen.add(p.id);
  }
  return x;
}
export function validateReviewerPin(pin){
  if(!pin||!REPO.test(pin.repo)||!POS(pin.number)||!SHA.test(pin.head)||!SHA.test(pin.tree)||!POS(pin.runId)||!POS(pin.attempt)||!POS(pin.jobId))throw Error('Invalid reviewer identity pin');
  if(typeof pin.workflowPath!=='string'||!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(pin.workflowPath))throw Error('Invalid workflow path pin');
  if(typeof pin.jobName!=='string'||!pin.jobName.trim()||pin.jobName.length>250)throw Error('Invalid job name pin');
  if(!Array.isArray(pin.requiredSteps)||pin.requiredSteps.length<2||pin.requiredSteps.length>50||pin.requiredSteps.some(s=>typeof s!=='string'||!s.trim()||s.length>250))throw Error('Expected checkout and execution step pins');
  if(pin.requiredSteps[0]===pin.requiredSteps[1]||new Set(pin.requiredSteps).size!==pin.requiredSteps.length)throw Error('Duplicate required step names');
  return pin;
}
function same(a,b,name){if(a!==b)throw Error(name+' mismatch')}
function validTime(s){return typeof s==='string'&&!Number.isNaN(Date.parse(s))}
export function corroborateMetadata(pin,facts){
  validateReviewerPin(pin);
  const {pr,commit,run,job,jobsComplete}=facts||{};
  if(!pr||!commit||!run||!job)throw Error('Missing authenticated records');
  if(jobsComplete!==true)throw Error('Uninspected or incomplete jobs pagination');
  same(pr.number,pin.number,'PR number');
  same(pr.base?.repo?.full_name,pin.repo,'PR repository');
  same(pr.head?.sha,pin.head,'PR head');
  same(commit.sha,pin.head,'Commit identity');
  same(commit.tree?.sha,pin.tree,'Root tree');
  same(run.id,pin.runId,'Run identity');
  same(run.head_sha,pin.head,'Workflow head');
  same(run.path,pin.workflowPath,'Workflow path');
  same(run.repository?.full_name,pin.repo,'Workflow repository');
  // An exact SHA is not sufficient if this workflow was triggered by a different PR.
  if(!Array.isArray(run.pull_requests)||!run.pull_requests.some(p=>p.number===pin.number&&p.head?.sha===pin.head))throw Error('Workflow has no matching PR association');
  same(run.run_attempt,pin.attempt,'Run attempt');
  if(!['pull_request','pull_request_target'].includes(run.event))throw Error('Wrong workflow event');
  if(run.status!=='completed'||run.conclusion!=='success')throw Error('Workflow not successful');
  same(job.id,pin.jobId,'Job identity');
  same(job.name,pin.jobName,'Job display name');
  same(job.run_id,pin.runId,'Job run');
  if(job.run_attempt!==undefined&&job.run_attempt!==pin.attempt)throw Error('Job run attempt mismatch');
  if(job.head_sha!==undefined&&job.head_sha!==pin.head)throw Error('Job head mismatch');
  if(job.status!=='completed'||job.conclusion!=='success')throw Error('Job failed/incomplete');
  if(!(POS(job.runner_id)||(typeof job.runner_name==='string'&&job.runner_name.trim())))throw Error('Runner assignment missing');
  const steps=job.steps;
  if(!Array.isArray(steps)||steps.length===0)throw Error('Runner admission: zero/null steps');
  const nums=new Set(),names=new Map();let previous=0;
  for(const s of steps){
    if(!POS(s.number)||nums.has(s.number)||s.number<=previous)throw Error('Duplicate or unordered step number');
    nums.add(s.number);previous=s.number;
    if(s.status!=='completed'||s.conclusion!=='success'||!validTime(s.started_at)||!validTime(s.completed_at)||Date.parse(s.completed_at)<Date.parse(s.started_at))throw Error('Unexecuted, unfinished or failed step');
    if(names.has(s.name))throw Error('Duplicate step name');
    names.set(s.name,s.number);
  }
  let last=0;
  for(const name of pin.requiredSteps){
    let n=names.get(name);
    if(!n||n<=last)throw Error('Missing or out-of-order checkout/execution step: '+name);
    last=n;
  }
  // Deliberately cannot confer guest, source compilation, binary integrity or merge authorization.
  return Object.freeze({verdict:'GITHUB_METADATA_CORROBORATED_CANDIDATE_ONLY',guestParity:'UNPROVEN',receiptVerified:false,mergeAuthorized:false,repo:pin.repo,head:pin.head,tree:pin.tree,runId:pin.runId,attempt:pin.attempt,jobId:pin.jobId,executedSteps:steps.length});
}
