#!/usr/bin/env node
/* Self-contained source-only TLC gate regression; NO model checker execution. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = fs.readFileSync('.github/workflows/assurance-tlc.yml','utf8');
const script = fs.readFileSync('tools/run-tlc-assurance.sh','utf8');
const OFFICIAL = 'https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar';
const DIGEST = 'e22f8ffb4bacdea0a871f444dd94fe5fb0d8013b3388ae39e82e26f852c735d5';

assert.ok(workflow.includes(OFFICIAL),'TLC must come from official upstream');
assert.ok(workflow.includes(DIGEST),'TLC binary must be content-pinned');
assert.ok(!workflow.includes('github.com/zactionsz/'),'no unreviewed third-party TLC distribution');
assert.match(workflow,/sha256sum -c -/,'actual download hash must be verified');
assert.match(workflow,/github\.event\.pull_request\.head\.sha \|\| github\.sha/,'original source head required');
assert.match(workflow,/persist-credentials: false/,'workflow cannot retain token');
assert.match(workflow,/SOURCE_ONLY|source-only|TLC finite-state safety/);
assert.match(script,/Invariant\[\[:space:\]\]\+Inv/,'unsafe mutants must yield invariant counterexample');
assert.match(script,/expected_invariant_counterexamples":2/);
assert.match(script,/verification":"UNATTESTED_TOOL_RUN"/);
assert.match(script,/guest":"NOT_EXECUTED"/);

const syntax=spawnSync('bash',['-n','tools/run-tlc-assurance.sh'],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr||'bash -n failed');

const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
assert.equal(head.status,0,head.stderr||'cannot inspect checked out source');
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'atto-tlc-negative-'));
try {
  const dummy=path.join(workspace,'not-tlc.jar');
  fs.writeFileSync(dummy,'not a model-checker jar\n');
  const env={...process.env,TLA2TOOLS_JAR:dummy,
    EXPECTED_HEAD:head.stdout.trim(),
    EXPECTED_JAR_SHA256:'0'.repeat(64),
    GITHUB_RUN_ID:'source-only-mock',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'negative-control'};
  const result=spawnSync('bash',['tools/run-tlc-assurance.sh'],{
    encoding:'utf8',env,timeout:8000
  });
  assert.notEqual(result.status,0,'wrong jar digest must fail closed');
  assert.ok(!fs.existsSync('private-artifacts/tlc/completed-source-only.json'),
    'hash-mismatched TLC must not produce a success receipt');
  console.log('PASS non-promotion: wrong TLC digest rejected before execution');
} finally {
  fs.rmSync(workspace,{recursive:true,force:true});
}
console.log('PASS TLC workflow source, pinned upstream, exact head, script syntax, and negative digest admission');
console.log('SOURCE_ONLY test. No TLC parser/model checker, AttoLang compiler or guest was executed.');
