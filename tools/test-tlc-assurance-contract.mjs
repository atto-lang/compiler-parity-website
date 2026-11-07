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
assert.match(script,/verification":"UNATTESTED_TOOL_RUN"/);
assert.match(script,/guest":"NOT_EXECUTED"/);

const syntax=spawnSync('bash',['-n','tools/run-tlc-assurance.sh'],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr||'TLC shell syntax invalid');
const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
assert.equal(head.status,0,head.stderr||'cannot inspect checked-out Git head');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atto-tlc-negative-'));
const receipt='private-artifacts/tlc/completed-source-only.json';
try {
  const fakeJar=path.join(tmp,'untrusted.jar');
  fs.writeFileSync(fakeJar,'untrusted\n');
  const env={...process.env,TLA2TOOLS_JAR:fakeJar,
    EXPECTED_HEAD:head.stdout.trim(),
    EXPECTED_JAR_SHA256:sha256,EXPECTED_JAR_SHA1:sha1,
    GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'negative-control'};
  const run=(overrides)=>spawnSync('bash',['tools/run-tlc-assurance.sh'],{
    encoding:'utf8',timeout:10000,env:{...env,...overrides}
  });
  const invalidJar=run({});
  assert.notEqual(invalidJar.status,0,'untrusted jar must be rejected');
  assert.match(invalidJar.stdout+invalidJar.stderr,/FAILED|computed checksum did NOT match/i,
    'wrong JAR must be rejected by the content hash, not an unrelated failure');
  assert.ok(!fs.existsSync(receipt),'invalid jar must never yield a completion receipt');
  const missingAttempt=run({GITHUB_RUN_ATTEMPT:''});
  assert.notEqual(missingAttempt.status,0,'missing attempt must be rejected');
  assert.match(missingAttempt.stderr,/Run attempt is required/,
    'invalid attempt must be rejected at its identity check');
  assert.ok(!fs.existsSync(receipt),'invalid attempt must not yield success');
  const wrongHead=run({EXPECTED_HEAD:'f'.repeat(40)});
  assert.notEqual(wrongHead.status,0,'wrong original source head must be rejected');
  const forgedDigest=createHash('sha256').update(fs.readFileSync(fakeJar)).digest('hex');
  const forgedJar=run({EXPECTED_JAR_SHA256:forgedDigest});
  assert.notEqual(forgedJar.status,0,'matching SHA256 with wrong upstream SHA1 must fail');
  assert.match(forgedJar.stdout+forgedJar.stderr,/FAILED|computed checksum did NOT match/i,
    'forged digest must fail because official upstream SHA1 disagrees');
  assert.ok(!fs.existsSync(receipt),'forged jar must not produce receipt');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS negative jar, expected-head, attempt, upstream-release hash and stale receipt gates');
console.log('SOURCE_ONLY: No TLC parser/model checker or AttoLang guest executed');
