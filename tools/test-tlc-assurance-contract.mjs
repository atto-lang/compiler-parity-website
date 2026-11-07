#!/usr/bin/env node
/* Source-only verification of TLC admission. No TLA+ checker or AttoLang guest is executed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const workflow=fs.readFileSync('.github/workflows/assurance-tlc.yml','utf8');
const script=fs.readFileSync('tools/run-tlc-assurance.sh','utf8');
const sourceUrl='https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar';
const sha256='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
const sha1='bee4a54f3ee3d4afc347c3240ec2d9e93b075104';
assert.ok(workflow.includes(sourceUrl),'only use fixed upstream v1.7.4 release');
assert.ok(workflow.includes(sha256),'candidate SHA256 must be pinned');
assert.ok(workflow.includes(sha1),'upstream release SHA1 must be pinned');
assert.ok(!workflow.includes('releases/download/v1.8.0/'),'mutable prerelease is not permitted');
assert.ok(!workflow.includes('github.com/zactionsz/'),'unreviewed mirror cannot be used');
assert.match(workflow,/sha256sum -c -/);
assert.match(workflow,/sha1sum -c -/);
assert.match(workflow,/github\.event\.pull_request\.head\.sha \|\| github\.sha/);
assert.match(workflow,/persist-credentials: false/);
assert.match(script,/^rm -f private-artifacts\/tlc\/completed-source-only\.json/m,
  'stale successful artifacts must be invalidated before checking');
assert.match(script,/^  if ! grep -Fx 'Error: Invariant Inv is violated\.'/m,
  'mutant must have invariant-specific failure');
assert.match(script,/State 1:/,'mutant must have reachable trace');
assert.ok(script.includes('read-transfer'),'active-reader transfer mutant must be executed');
assert.match(script,/expected_invariant_counterexamples":3/);
assert.ok(fs.readFileSync('formal/specs/ActorBorrowGeneration.tla','utf8')
  .includes('NoOldReader'),'reader generation invariant must be present');
assert.match(fs.readFileSync('formal/specs/ActorBorrowGeneration.read-transfer-mutant.cfg','utf8'),
  /SPECIFICATION MutantReadTransferSpec/);
assert.match(script,/verification":"UNATTESTED_TOOL_RUN"/);
assert.match(script,/guest":"NOT_EXECUTED"/);

const syntax=spawnSync('bash',['-n','tools/run-tlc-assurance.sh'],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr||'TLC shell syntax invalid');
const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
assert.equal(head.status,0,head.stderr||'cannot inspect checked-out Git head');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atto-tlc-negative-'));
const receipt='private-artifacts/tlc/completed-source-only.json';
let controls=0;
try {
  const fakeJar=path.join(tmp,'untrusted with spaces.jar');
  fs.writeFileSync(fakeJar,'untrusted\n');
  const env={...process.env,TLA2TOOLS_JAR:fakeJar,
    EXPECTED_HEAD:head.stdout.trim(),
    EXPECTED_JAR_SHA256:sha256,EXPECTED_JAR_SHA1:sha1,
    GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'negative-control'};
  const run=(overrides)=>spawnSync('bash',['tools/run-tlc-assurance.sh'],{
    encoding:'utf8',timeout:10000,env:{...env,...overrides}
  });
  const reject=(label,override,reason)=>{
    const result=run(override);
    assert.notEqual(result.status,0,label+' unexpectedly passed');
    assert.match(result.stdout+result.stderr,reason,
      label+' failed for the wrong reason');
    assert.equal(fs.existsSync(receipt),false,
      label+' must never leave a success receipt');
    controls++;
  };
  fs.mkdirSync(path.dirname(receipt),{recursive:true});
  fs.writeFileSync(receipt,'{"forged":"stale-success"}\n');
  reject('stale receipt and invalid jar',{},/FAILED|computed checksum did NOT match/i);
  reject('missing jar',{TLA2TOOLS_JAR:path.join(tmp,'missing.jar')},/TLC_JAR_MISSING/);
  reject('missing source head',{EXPECTED_HEAD:''},/source HEAD is required/);
  reject('invalid source head',{EXPECTED_HEAD:'not-a-full-sha'},/Invalid source SHA/);
  reject('wrong original source head',{EXPECTED_HEAD:'f'.repeat(40)},/SOURCE_HEAD_MISMATCH/);
  reject('missing run ID',{GITHUB_RUN_ID:''},/Run identity is required/);
  reject('zero run ID',{GITHUB_RUN_ID:'0'},/Invalid run ID/);
  reject('zero attempt',{GITHUB_RUN_ATTEMPT:'0'},/Invalid attempt/);
  reject('missing attempt',{GITHUB_RUN_ATTEMPT:''},/Run attempt is required/);
  reject('command-injection-shaped attempt',{GITHUB_RUN_ATTEMPT:'1;true'},/Invalid attempt/);
  reject('invalid job identity',{GITHUB_JOB:'two job names'},/Invalid job identity/);
  reject('invalid SHA-256 length',{EXPECTED_JAR_SHA256:'a'.repeat(63)},/Invalid jar SHA-256/);
  reject('invalid SHA-1 length',{EXPECTED_JAR_SHA1:'b'.repeat(39)},/Invalid jar SHA-1/);
  const forgedDigest=createHash('sha256').update(fs.readFileSync(fakeJar)).digest('hex');
  reject('forged SHA-256 with mismatched official SHA-1',
    {EXPECTED_JAR_SHA256:forgedDigest},/FAILED|computed checksum did NOT match/i);
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
assert.equal(controls,14,'all 14 negative admission controls must execute');
console.log('PASS '+controls+' source-only negative controls: stale receipt, '+
  'wrong jar/hash, missing/mismatched head, run/attempt, injection and invalid job');
console.log('SOURCE_ONLY: No TLC parser/model checker or AttoLang guest executed');
