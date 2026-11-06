'use strict';
/*
 * Read-only GitHub evidence collector for the private AttoLang assurance site.
 * Never promotes metadata, a green workflow, model tests or host tests to guest proof.
 * GitHub API access is restricted to explicit repo/PR allowlist from trusted local seed.
 * No private-source downloads, no write endpoints, no browser token, no auto-merge.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const API = 'https://api.github.com';
const MAX_PAGES = 12;
const MAX_RUNS = 8;
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

class EvidenceError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'EvidenceError';
    this.code = code;
  }
}
function insist(test, code) { if (!test) throw new EvidenceError(code); }
function validateRepo(repo) { insist(typeof repo === 'string' && REPO.test(repo), 'BAD_REPOSITORY'); return repo; }
function validateSha(sha) { insist(typeof sha === 'string' && SHA.test(sha), 'BAD_SHA'); return sha; }
function number(value, code) { insist(Number.isSafeInteger(value) && value > 0, code); return value; }
function safeDate(input) { return typeof input === 'string' && !Number.isNaN(Date.parse(input)) ? input : null; }
function safeError(error) {
  return error instanceof EvidenceError ? error.code : 'API_UNAVAILABLE';
}
function stepAudit(steps) {
  if (steps === null || (Array.isArray(steps) && steps.length === 0)) {
    return { class: 'RUNNER_NOT_ADMITTED', observed: 0, rawCount: Array.isArray(steps) ? 0 : null };
  }
  if (!Array.isArray(steps)) return { class: 'NOT_INSPECTED', observed: null, rawCount: null };
  // A declared step may be skipped. Count only started, non-skipped steps.
  const observed = steps.filter(s => s && typeof s === 'object' &&
    typeof s.name === 'string' && safeDate(s.started_at) &&
    s.conclusion !== 'skipped' && ['completed', 'in_progress'].includes(s.status)).length;
  return { class: observed > 0 ? 'STEPS_OBSERVED' : 'STEP_RECORDS_NOT_EXECUTED',
    observed, rawCount: steps.length };
}
function makeClient({token, fetchImpl, base = API} = {}) {
  insist(typeof token === 'string' && token.length >= 10, 'READ_TOKEN_MISSING');
  insist(typeof fetchImpl === 'function', 'FETCH_UNAVAILABLE');
  insist(base === API, 'NON_GITHUB_API_ORIGIN');
  let requests = 0;
  async function get(urlPath, optional = false) {
    insist(typeof urlPath === 'string' && urlPath.startsWith('/repos/') &&
      !urlPath.includes('..') && !urlPath.includes('#'), 'UNSAFE_API_PATH');
    insist(++requests <= 1000, 'REQUEST_BUDGET_EXCEEDED');
    let response;
    try {
      response = await fetchImpl(base + urlPath, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'atto-assurance-readonly-collector'
        },
        signal: AbortSignal.timeout(16000),
        redirect: 'error'
      });
    } catch (err) { throw new EvidenceError('API_UNAVAILABLE'); }
    if (response.status === 404 && optional) return null;
    if (response.status === 401 || response.status === 403)
      throw new EvidenceError('API_ACCESS_DENIED');
    if (response.status === 429) throw new EvidenceError('API_RATE_LIMITED');
    if (!response.ok) throw new EvidenceError('API_HTTP_' + response.status);
    let text;
    try { text = await response.text(); } catch (err) { throw new EvidenceError('API_UNREADABLE'); }
    insist(text.length <= 4000000, 'API_BODY_TOO_LARGE');
    try { return JSON.parse(text); }
    catch (err) { throw new EvidenceError('API_INVALID_JSON'); }
  }
  async function pages(urlPath) {
    const rows = [];
    for (let n=1; n<=MAX_PAGES; n++) {
      const sep = urlPath.includes('?') ? '&' : '?';
      const result = await get(urlPath + sep + 'per_page=100&page=' + n);
      insist(Array.isArray(result), 'BAD_PAGE_SHAPE');
      rows.push(...result);
      if (result.length < 100) return rows;
    }
    throw new EvidenceError('API_PAGINATION_TRUNCATED');
  }
  return {get, pages, get requests() {return requests;}};
}
function latestApproval(reviews, author, head) {
  if (!Array.isArray(reviews)) return {status:'NOT_INSPECTED',reviewer:null};
  const latestByReviewer = new Map();
  for (const r of reviews) {
    const login = r && r.user && r.user.login;
    if (!login || typeof login !== 'string' || ['PENDING','COMMENTED'].includes(r.state)) continue;
    const key = login.toLowerCase();
    const when = safeDate(r.submitted_at);
    if (!when) continue;
    const prev = latestByReviewer.get(key);
    if (!prev || Date.parse(when) >= Date.parse(prev.submitted_at)) latestByReviewer.set(key,r);
  }
  const approved = [...latestByReviewer.values()].find(r =>
    r.state === 'APPROVED' &&
    r.commit_id === head &&
    r.user.login.toLowerCase() !== String(author||'').toLowerCase());
  return approved ? {status:'APPROVED_ON_HEAD',reviewer:approved.user.login} :
    {status:'INDEPENDENT_APPROVAL_UNVERIFIED',reviewer:null};
}
async function auditRun(client, repo, run, head) {
  if (!run || run.head_sha !== head || run.event !== 'pull_request') throw new EvidenceError('RUN_HEAD_MISMATCH');
  const attempt = run.run_attempt;
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    return {run:run.id,attempt:null,headVerified:true,jobs:[],class:'ATTEMPT_NOT_VERIFIED',complete:false};
  }
  number(run.id,'BAD_RUN_ID');
  const jobs = await client.pages('/repos/'+repo+'/actions/runs/'+run.id+'/attempts/'+attempt+'/jobs');
  const seen = new Set();
  const audited = jobs.map(job => {
    const id = number(job.id,'BAD_JOB_ID');
    const name = typeof job.name === 'string' ? job.name : '';
    insist(name && !seen.has(name), 'DUPLICATE_JOB_NAME');
    seen.add(name);
    const steps = stepAudit(job.steps);
    return { id, name, attempt, status:job.status||'unknown',conclusion:job.conclusion||null,
      runnerId:job.runner_id||null, observedSteps:steps.observed, stepRecords:steps.rawCount,
      class:steps.class, checkoutHeadVerified:false, compilerGuestVerified:false };
  });
  return {run:run.id,attempt,name:String(run.name||'unknown'),headVerified:true,
    runHead:head, status:run.status||'unknown',conclusion:run.conclusion||null,
    jobs:audited,complete:true};
}
async function auditPR(client, original, {maxRuns=MAX_RUNS} = {}) {
  const p = JSON.parse(JSON.stringify(original));
  validateRepo(p.repo); number(p.number,'BAD_PR_NUMBER');
  validateSha(p.head);
  const prefix='/repos/'+p.repo;
  // Every read begins with current PR identity; old seed SHA is never reused to certify current head.
  const remote = await client.get(prefix+'/pulls/'+p.number);
  insist(remote && remote.head && remote.base, 'BAD_PR_SHAPE');
  const head = validateSha(remote.head.sha);
  insist(remote.head.repo && remote.head.repo.full_name === p.repo,'CROSS_REPOSITORY_HEAD_NOT_SUPPORTED');
  const tree = await client.get(prefix+'/git/commits/'+head);
  insist(tree && tree.tree && SHA.test(tree.tree.sha),'TREE_READBACK_FAILED');
  const reviews = await client.pages(prefix+'/pulls/'+p.number+'/reviews');
  const approval = latestApproval(reviews, remote.user && remote.user.login, head);
  // GitHub may return a 404 for unprotected branches or restricted viewers; never infer protection from it.
  let protection = 'UNVERIFIED';
  const protectedEndpoint=await client.get(prefix+'/branches/'+encodeURIComponent(remote.base.ref)+'/protection',true);
  if (protectedEndpoint && typeof protectedEndpoint === 'object' &&
    protectedEndpoint.required_pull_request_reviews && protectedEndpoint.required_status_checks)
    protection='PROTECTION_RULES_OBSERVED';
  const runEnvelope=await client.get(prefix+'/actions/runs?head_sha='+head+'&event=pull_request&per_page=100');
  insist(runEnvelope && Array.isArray(runEnvelope.workflow_runs),'BAD_RUN_LIST');
  const matching=runEnvelope.workflow_runs.filter(r=>r && r.head_sha===head && r.event==='pull_request')
    .sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const truncated=matching.length>maxRuns || runEnvelope.total_count>runEnvelope.workflow_runs.length;
  const selected=matching.slice(0,maxRuns);
  const runs=[];
  for(const run of selected) runs.push(await auditRun(client,p.repo,run,head));
  const jobs=runs.flatMap(run => run.jobs.map(job=>({run:run.run, ...job})));
  const recent=jobs[0]||null;
  p.head=head;
  p.tree=tree.tree.sha;
  p.treeSource='GitHub REST git/commits readback; runner checkout NOT verified';
  p.state=remote.merged_at?'Merged':(remote.draft?'Draft':(remote.state==='closed'?'Closed':'Open'));
  p.review='API: '+approval.status+(approval.reviewer?' by '+approval.reviewer:'');
  p.guest='NOT_INDEPENDENTLY_VERIFIED';
  p.workflow=recent ? {
    run:recent.run, job:recent.name, jobId:recent.id, attempt:recent.attempt,
    steps:recent.observedSteps === null ? 'UNKNOWN' : recent.observedSteps,
    conclusion:recent.conclusion, headBound:false,
    apiReadback:true, rawStepRecords:recent.stepRecords, executionClass:recent.class
  } : null;
  p.verification={
    collector:'GITHUB_READ_ONLY',headReadback:true,rootTreeReadback:true,
    runnerCheckoutExactHead:false,compilerGuestVerified:false,
    approval,branchProtection:protection,
    allRunsInspected:!truncated,runCount:runs.length,jobCount:jobs.length,
    runs
  };
  if (original.head!==head) {
    p.note=(p.note||'')+' [Seed head became stale; prior workflow proof invalidated.]';
    p.verification.previousSeedHead=original.head;
  }
  p.next='Confirm checkout identity and executed test steps; independent guest proof and branch-review gates remain open.';
  return p;
}
async function collect(seed, client, options={}) {
  insist(seed && seed.schemaVersion===1 && Array.isArray(seed.prs) &&
    Array.isArray(seed.invariants) && Array.isArray(seed.tasks) && Array.isArray(seed.templates) &&
    seed.prs.length<=1000, 'BAD_SEED');
  const output = JSON.parse(JSON.stringify(seed));
  output.capturedAt=new Date().toISOString();
  output.source='Server-side GitHub REST readback; not a browser attestation';
  output.collectorVersion=1;
  output.imported=true;
  output.collection={status:'PARTIAL_OR_UNPROVEN',successes:0,failures:0};
  for(let i=0;i<output.prs.length;i++){
    const previous=output.prs[i];
    try {
      output.prs[i]=await auditPR(client,previous,options);
      output.collection.successes++;
    } catch (err) {
      const stale=JSON.parse(JSON.stringify(previous));
      stale.guest='NOT_INDEPENDENTLY_VERIFIED';
      stale.workflow=null;
      stale.tree=null;
      stale.treeSource='NOT_RECHECKED';
      stale.review='NOT_RECHECKED';
      stale.verification={status:'UNVERIFIED',error:safeError(err),
        headReadback:false,rootTreeReadback:false,runnerCheckoutExactHead:false,
        compilerGuestVerified:false};
      output.prs[i]=stale;
      output.collection.failures++;
    }
  }
  output.collection.status=output.collection.failures?'PARTIAL_ACCESS_FAILURE':'GITHUB_METADATA_READ';
  output.collection.note='GitHub API metadata is not authenticated in a static browser. No compiler guest receipts or checkout execution verified.';
  return output;
}
function loadTrustedSeed(filename) {
  const source=fs.readFileSync(filename,'utf8');
  insist(source.length<1024*1024,'SEED_TOO_LARGE');
  const sandbox={window:{}};
  vm.runInNewContext(source,sandbox,{filename:'formal-data.js',timeout:500});
  insist(sandbox.window.ATTO_ASSURANCE_SEED,'NO_ASSURANCE_SEED');
  return JSON.parse(JSON.stringify(sandbox.window.ATTO_ASSURANCE_SEED));
}
async function main() {
  const args=process.argv.slice(2);
  insist(args.length===2 && args[0]==='--output', 'USAGE_OUTPUT_REQUIRED');
  const destination=path.resolve(args[1]);
  // For CI artifacts only, not public web files and never the checked-in seed.
  const root=path.resolve(__dirname,'..');
  const artifacts=path.join(root,'artifacts');
  insist(destination.startsWith(artifacts+path.sep) && destination.endsWith('.json'),'OUTPUT_MUST_BE_PRIVATE_ARTIFACT');
  const token=process.env.ATTO_ASSURANCE_READER_TOKEN;
  const client=makeClient({token,fetchImpl:globalThis.fetch});
  const result=await collect(loadTrustedSeed(path.join(root,'formal-data.js')),client);
  // Bounded design-model output is separate from GitHub and guest evidence.
  result.modelReport=require('../formal/models/check-bounded-safety.cjs').verificationReport();
  if(result.modelReport.success!==true) throw new EvidenceError('BOUNDED_DESIGN_MODEL_FAILED');

  fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
  fs.writeFileSync(destination,JSON.stringify({snapshot:result,
    warning:'Metadata-only; imported JSON cannot establish runner checkout or compiler guest execution.'},null,2),{mode:0o600});
  process.stdout.write('Read-only evidence audit: '+result.collection.successes+' metadata readbacks, '+
    result.collection.failures+' unresolved; no guest parity certification.\n');
  if(result.collection.failures>0)process.exitCode=2;
}
if (require.main === module) main().catch(err => {
  // Do not print error bodies, URLs, env secrets, private GitHub metadata or API payloads.
  process.stderr.write('Collector blocked: '+safeError(err)+'\n');
  process.exitCode=1;
});
module.exports={EvidenceError,validateRepo,validateSha,stepAudit,latestApproval,makeClient,auditRun,auditPR,collect,loadTrustedSeed};
