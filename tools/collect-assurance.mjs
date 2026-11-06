#!/usr/bin/env node
/**
 * AttoLang read-only evidence collector.
 *
 * Only metadata from the explicitly scoped GitHub API is fetched. No source,
 * secrets, binary artifacts or private Git trees are copied. This program
 * cannot independently certify CI checkout or guest execution.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
export const MAX_RECORDS = 100;
export const OBSERVATION = Object.freeze({
  NOT_INSPECTED: 'NOT_INSPECTED',
  RUNNER_NOT_ADMITTED: 'RUNNER_NOT_ADMITTED',
  STEPS_EXECUTED: 'STEPS_EXECUTED'
});

export function stepState(steps) {
  if (steps === null || steps === 0 || (Array.isArray(steps) && steps.length === 0))
    return OBSERVATION.RUNNER_NOT_ADMITTED;
  if (Number.isSafeInteger(steps) && steps > 0) return OBSERVATION.STEPS_EXECUTED;
  if (Array.isArray(steps) && steps.length > 0) return OBSERVATION.STEPS_EXECUTED;
  return OBSERVATION.NOT_INSPECTED;
}

export function exactSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

export function safeRepo(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) &&
    value.split('/').every(part => part !== '.' && part !== '..');
}

export function encodeRepo(value) {
  if (!safeRepo(value)) throw new Error('Unsafe repository selector');
  return value.split('/').map(encodeURIComponent).join('/');
}

export class GitHubReadOnly {
  constructor(token, fetchImpl = globalThis.fetch) {
    if (!token || !/^[\x21-\x7e]{8,512}$/.test(token)) throw new Error('ASSURANCE_READ_TOKEN missing/invalid');
    if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation');
    this.token = token;
    this.fetch = fetchImpl;
    this.requestCount = 0;
  }
  async get(path, { optional404 = false } = {}) {
    if (!/^\/repos\/[a-zA-Z0-9_.%-]+\/[a-zA-Z0-9_.%-]+\//.test(path) ||
        path.includes('..') || path.includes('\\') || path.includes('#') ||
        this.requestCount++ > 400)
      throw new Error('Unsafe API path or request ceiling');
    const response = await this.fetch(API + path, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + this.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'attolang-assurance-readonly-v1'
      },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 404 && optional404) return null;
    if (!response.ok) throw new Error('GitHub metadata request failed (HTTP ' + response.status + ')');
    return response.json();
  }
}

async function tryRead(fn, errors, code) {
  try { return await fn(); }
  catch (err) { errors.push(code + ': ' + String(err && err.message || err)); return null; }
}

function pickLatestRun(runs, expectedHead) {
  if (!Array.isArray(runs)) return null;
  const checked = runs.filter(r => r && exactSha(r.head_sha) && r.head_sha === expectedHead);
  checked.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id || 0) - Number(a.id || 0));
  return checked[0] || null;
}

function analyzeJobs(jobs, expectedHead, run) {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const names = new Set();
  let duplicate = false;
  for (const job of jobs) {
    if (names.has(job.name)) duplicate = true;
    names.add(job.name);
  }
  // Conservative: a "success" badge cannot bind checkout to source head or
  // compiler execution. Job step metadata alone is at most runner evidence.
  const withSteps = jobs.filter(j => stepState(j.steps) === OBSERVATION.STEPS_EXECUTED);
  const selected = withSteps[0] || jobs[0];
  const rawSteps = selected.steps;
  return {
    run: Number(run.id),
    job: selected.name || 'Unknown',
    jobId: Number(selected.id) || null,
    attempt: Number.isSafeInteger(run.run_attempt) ? run.run_attempt : null,
    conclusion: selected.conclusion || 'unknown',
    steps: Array.isArray(rawSteps) ? rawSteps.length : (rawSteps === null ? null : 'UNKNOWN'),
    phase: stepState(rawSteps) === OBSERVATION.RUNNER_NOT_ADMITTED ? 'runner' : 'unknown',
    head: exactSha(run.head_sha) ? run.head_sha : null,
    runHeadMatches: run.head_sha === expectedHead,
    headBound: false,
    guest: 'NOT_INDEPENDENTLY_VERIFIED',
    duplicateJobNames: duplicate,
    runnerIdPresent: selected.runner_id != null,
    note: duplicate ? 'Duplicate job names; never promote this receipt' :
      'Observed job metadata only. Original-head checkout, binary and guest execution are not attested.'
  };
}

function approvedReviewCount(reviews, author, expectedHead) {
  if (!Array.isArray(reviews)) return 0;
  const latest = new Map();
  for (const r of reviews) {
    const login = r && r.user && r.user.login;
    if (!login || login.toLowerCase() === String(author).toLowerCase() || !r.submitted_at) continue;
    const previous = latest.get(login.toLowerCase());
    if (!previous || String(previous.submitted_at) < String(r.submitted_at))
      latest.set(login.toLowerCase(), r);
  }
  return Array.from(latest.values()).filter(r => r.state === 'APPROVED' && r.commit_id === expectedHead).length;
}

export async function collectRecord(api, initial) {
  const p = structuredClone(initial);
  const errors = [];
  p.guest = 'NOT_INDEPENDENTLY_VERIFIED';
  p.metadataStatus = 'INCOMPLETE';
  p.tree = null;
  p.treeSource = 'Not independently fetched at this collection';
  p.workflow = null;
  p.review = 'Current submitted independent approval not verified';
  p.approvalsOnHead = 0;
  const base = '/repos/' + encodeRepo(p.repo);
  const pull = await tryRead(() => api.get(base+'/pulls/'+Number(p.number)), errors, 'PULL');
  if (!pull || !exactSha(pull.head && pull.head.sha)) {
    p.formal = 'STALE UNVERIFIED SOURCE: ' + String(initial.formal || '');
    p.metadataErrors = errors.length ? errors : ['Missing exact PR head'];
    return p;
  }
  const head = pull.head.sha;
  p.head = head;
  p.title = String(pull.title || p.title).slice(0,500);
  p.state = pull.merged_at ? 'Merged' : pull.state === 'closed' ? 'Closed' : pull.draft ? 'Draft' : 'Open';
  p.draft = Boolean(pull.draft);
  p.author = pull.user && pull.user.login || null;
  p.currentHeadChanged = head !== initial.head;
  if (p.currentHeadChanged) {
    p.formal = 'STALE PRIOR-HEAD CLAIM (model not revalidated): ' + String(initial.formal || '');
    p.mutation = 'STALE PRIOR-HEAD CLAIM (negative tests not rerun): ' + String(initial.mutation || '');
    p.evidence = 'SOURCE_ONLY';
  }
  const [gitCommit, reviews, runs, protection] = await Promise.all([
    tryRead(() => api.get(base+'/git/commits/'+encodeURIComponent(head)), errors, 'TREE'),
    tryRead(() => api.get(base+'/pulls/'+Number(p.number)+'/reviews?per_page=100'), errors, 'REVIEWS'),
    tryRead(() => api.get(base+'/actions/runs?head_sha='+encodeURIComponent(head)+'&per_page=50'), errors, 'RUNS'),
    tryRead(() => api.get(base+'/branches/'+encodeURIComponent((pull.base&&pull.base.ref)||'main')+'/protection',{optional404:true}), errors, 'PROTECTION')
  ]);
  if (gitCommit && exactSha(gitCommit.tree && gitCommit.tree.sha)) {
    p.tree = gitCommit.tree.sha;
    p.treeSource = 'GitHub API git/commits/{head} metadata';
  } else errors.push('TREE: Full root tree not independently resolved');
  p.approvalsOnHead = approvedReviewCount(reviews, p.author, head);
  p.review = p.approvalsOnHead > 0 ? 'Submitted independent review matched current head (API metadata)' : 'No submitted independent APPROVED review on current head';
  // null protection with 404 could be unprotected or unauthorized; never
  // display that condition as a proven protected branch.
  p.protectionVerified = Boolean(protection && protection.enabled !== false);
  p.protectionNote = p.protectionVerified ? 'Protection API policy returned; enforcement must be assessed per rule' : 'Not independently verified protected';
  const run = pickLatestRun(runs && runs.workflow_runs, head);
  if (run) {
    const jobsResponse = await tryRead(() => api.get(base+'/actions/runs/'+Number(run.id)+'/jobs?filter=latest&per_page=100'), errors, 'JOBS');
    p.workflow = analyzeJobs(jobsResponse && jobsResponse.jobs, head, run);
    if (!p.workflow) errors.push('JOBS: No independently inspected job steps');
  } else errors.push('RUNS: No run with an exact matching run-head SHA was found');
  p.metadataStatus = errors.length ? 'INCOMPLETE' : 'COLLECTED_METADATA_ONLY';
  p.metadataErrors = errors;
  // Review, status, and run-head matching alone can never set guest proof.
  p.mergeReady = false;
  return p;
}

export async function collectSnapshot(api, seed, { clock = () => new Date().toISOString() } = {}) {
  if (!seed || seed.schemaVersion !== 1 || !Array.isArray(seed.prs) ||
      seed.prs.length > MAX_RECORDS || !Array.isArray(seed.invariants) ||
      !Array.isArray(seed.tasks) || !Array.isArray(seed.templates))
    throw new Error('Unsupported or oversized seed');
  const ids = new Set();
  for (const p of seed.prs) {
    if (!p || !safeRepo(p.repo) || !Number.isSafeInteger(p.number) || p.number < 1 ||
        !exactSha(p.head) || typeof p.id !== 'string' || ids.has(p.id)) throw new Error('Invalid seed PR');
    ids.add(p.id);
  }
  // Explicit bounded concurrency. Never query arbitrary repos from user input.
  const records = Array(seed.prs.length);
  let idx = 0;
  await Promise.all(Array.from({length: Math.min(3,seed.prs.length)}, async () => {
    while (idx < seed.prs.length) {
      const n = idx++;
      records[n] = await collectRecord(api,seed.prs[n]);
    }
  }));
  const complete = records.filter(p => p.metadataStatus === 'COLLECTED_METADATA_ONLY').length;
  return {
    schemaVersion: 1,
    capturedAt: clock(),
    source: 'Authorized private GitHub read-only metadata collection; NO independent compiled guest attestation',
    collector: {
      version: '1',
      completeness: complete === records.length ? 'METADATA_COLLECTED' : 'PARTIAL_UNVERIFIED',
      records: records.length,
      complete,
      requests: api.requestCount,
      scope: 'GitHub API metadata only; no source checkout or guest attestation',
      warning: 'A stepful Actions job does not certify source checkout or guest execution; imported snapshots are untrusted.'
    },
    backends: structuredClone(seed.backends || []),
    prs: records,
    invariants: structuredClone(seed.invariants),
    tasks: structuredClone(seed.tasks),
    templates: structuredClone(seed.templates)
  };
}

async function main() {
  const token = process.env.ASSURANCE_READ_TOKEN;
  if (!token) throw new Error('ASSURANCE_READ_TOKEN required; do not use a public browser token');
  const args = process.argv.slice(2);
  if (args.length > 2 || args.some(a=>a.startsWith('-') && a !== '--strict'))
    throw new Error('Usage: node tools/collect-assurance.mjs [--strict] [output-file]');
  const strict = args.includes('--strict');
  const output = resolve(args.find(a=>a!=='--strict') || 'private-artifacts/assurance-latest.json');
  const source = await readFile(resolve('formal-data.js'),'utf8');
  const context = {window:{}};
  vm.runInNewContext(source,context,{timeout:2000,filename:'formal-data.js'});
  const api = new GitHubReadOnly(token);
  const snapshot = await collectSnapshot(api,context.window.ATTO_ASSURANCE_SEED);
  await mkdir(dirname(output),{recursive:true,mode:0o700});
  await writeFile(output,JSON.stringify(snapshot,null,2)+'\n',{mode:0o600,flag:'w'});
  console.log('ASSURANCE_METADATA_ONLY '+JSON.stringify({
    records:snapshot.collector.records,complete:snapshot.collector.complete,
    classification:snapshot.collector.completeness,
    runner_not_admitted:snapshot.prs.filter(p=>p.workflow && stepState(p.workflow.steps)===OBSERVATION.RUNNER_NOT_ADMITTED).length,
    independently_verified_guest:0
  }));
  if (strict && snapshot.collector.completeness !== 'METADATA_COLLECTED') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(err => {
    console.error('ASSURANCE_COLLECTOR_FAILED: '+String(err && err.message || err));
    process.exitCode = 1;
  });
}
