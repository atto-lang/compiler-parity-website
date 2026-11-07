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
assert.ok(workflow.includes('Independently verify TLC model and runner script HEAD blobs'),
  'an independent workflow step must enforce the original-head blob preflight');
assert.match(workflow,/for model_input in formal\/specs\/\*\.tla formal\/specs\/\*\.cfg tools\/run-tlc-assurance\.sh; do/,
  'workflow must verify all TLC model/config and runner-script blobs independently');
assert.match(workflow,/git hash-object -- "\$model_input"/,
  'preflight must check on-disk bytes against the original HEAD tree');
assert.ok(workflow.indexOf('Independently verify TLC model and runner script HEAD blobs') <
  workflow.indexOf('Execute real TLC for five bounded models and three unsafe-mutant controls'),
  'the original-head blob preflight must precede TLC execution');
assert.match(script,/^rm -rf -- private-artifacts\/tlc$/m,
  'stale successful artifacts and stale model logs must be invalidated before checking');
assert.match(script,/model-inputs\.sha256/,
  'source model and config files must be content hashed');
assert.ok(script.includes("readonly TLC_174_SHA256='"+sha256+"'"),
  'runner itself must refuse caller-controlled SHA256 re-pins');
assert.ok(script.includes("readonly TLC_174_SHA1='"+sha1+"'"),
  'runner itself must refuse caller-controlled SHA1 re-pins');
assert.match(script,/UNAUTHORIZED_TLC_SHA256_REPIN/);
assert.match(script,/UNAUTHORIZED_TLC_SHA1_REPIN/);
assert.match(script,/UNTRACKED_MODEL_INPUT/,
  'ignore Git HEAD alone is not enough: untracked TLA modules must be rejected');
assert.match(script,/git ls-files --error-unmatch -- "\$model_input"/,
  'each compiled .tla/.cfg must be a tracked Git-tree input');
assert.match(script,/MODEL_INPUT_BLOB_MISMATCH/);
assert.match(script,/git hash-object -- "\$model_input"/);
assert.match(script,/git rev-parse --verify "HEAD:\$model_input"/);
assert.match(script,/for model_input in formal\/specs\/\*\.tla formal\/specs\/\*\.cfg tools\/run-tlc-assurance\.sh; do/,
  'the executed TLC shell script must be pinned to the immutable Git HEAD blob');
assert.match(script,/TLA2TOOLS_JAR="\$\(realpath -e -- "\$TLA2TOOLS_JAR"\)"/,
  'normalize JAR to absolute path before TLC changes directory');
assert.ok(script.indexOf('realpath -e --') < script.indexOf('pushd formal/specs'),
  'relative JAR paths must be fixed before changing directory');
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

function parseStaticReceiptFormat(field) {
  const line = script.split('\n').find(value=>
    value.startsWith("printf '{") && value.includes('"' + field + '":'));
  assert.ok(line,field+' receipt formatter must exist');
  const format = line.split("'")[1];
  assert.ok(format?.endsWith("\\n"),'receipt must end with escaped newline');
  const expanded = format.replace(/%s/g,'0').replace(/\\n$/,'');
  const report = JSON.parse(expanded);
  assert.ok(report.head || report.source_head,'receipt must bind a source head');
  assert.ok(report.tree || report.source_tree,'receipt must bind a source tree');
  assert.equal(report.guest,'NOT_EXECUTED','source-only gate must not claim guests');
  assert.ok(report.run_id && report.run_attempt && report.job,
    'receipt must bind a run, attempt and job');
  return report;
}
assert.equal(parseStaticReceiptFormat('scope').scope,'TLC_BOUNDED_MODEL_ONLY');
assert.equal(parseStaticReceiptFormat('classification').classification,'TLC_BOUNDED_MODEL_ONLY');


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
  fs.writeFileSync('private-artifacts/tlc/ActorIsolation.baseline.log',
    'FORGED HISTORICAL BASELINE SUCCESS\n');
  reject('stale receipt and invalid jar',{},/FAILED|computed checksum did NOT match/i);
  assert.equal(fs.existsSync('private-artifacts/tlc/ActorIsolation.baseline.log'),false,
    'prior model log must not be incorporated into a future receipt');
  const injectedModel='formal/specs/AssuranceUntrackedInjection.tla';
  fs.writeFileSync(injectedModel,'---- MODULE AssuranceUntrackedInjection ----\n====\n');
  try {
    reject('untracked model input escapes git status --untracked-files=no',
      {},/UNTRACKED_MODEL_INPUT/);
  } finally {
    fs.rmSync(injectedModel,{force:true});
  }
  // The Git status cleanliness check can be deceived by assume-unchanged.
  // Reproduce that mutation in a fresh temporary repository, never by
  // modifying tracked files in the real assurance checkout.
  const scratch=path.join(tmp,'synthetic-model-head');
  fs.mkdirSync(path.join(scratch,'tools'),{recursive:true});
  fs.mkdirSync(path.join(scratch,'formal','specs'),{recursive:true});
  fs.copyFileSync('tools/run-tlc-assurance.sh',
    path.join(scratch,'tools','run-tlc-assurance.sh'));
  const scratchModel=path.join(scratch,'formal','specs','Synthetic.tla');
  fs.writeFileSync(scratchModel,'---- MODULE Synthetic ----\n====\n');
  fs.writeFileSync(path.join(scratch,'formal','specs','Synthetic.cfg'),
    'SPECIFICATION Spec\n');
  const git=args=>{
    const output=spawnSync('git',args,{cwd:scratch,encoding:'utf8',timeout:10000});
    assert.equal(output.status,0,output.stderr||'scratch git failed');
    return output.stdout.trim();
  };
  git(['init','-q']);
  git(['config','user.name','Assurance Negative Fixture']);
  git(['config','user.email','assurance-fixture@example.invalid']);
  git(['add','tools/run-tlc-assurance.sh','formal/specs/Synthetic.tla',
    'formal/specs/Synthetic.cfg']);
  git(['commit','-qm','pinned synthetic model inputs']);
  const scratchHead=git(['rev-parse','HEAD']);
  git(['update-index','--assume-unchanged','--','formal/specs/Synthetic.tla']);
  fs.appendFileSync(scratchModel,'\\* injected untracked bytes\n');
  assert.equal(git(['status','--porcelain','--untracked-files=no']),'',
    'scratch fixture must simulate a dirty tracked file omitted by git status');
  const hiddenMutation=spawnSync('bash',['tools/run-tlc-assurance.sh'],{
    cwd:scratch,encoding:'utf8',timeout:10000,
    env:{...env,EXPECTED_HEAD:scratchHead}
  });
  assert.notEqual(hiddenMutation.status,0,
    'assume-unchanged mutation cannot pass model admission');
  assert.match(hiddenMutation.stdout+hiddenMutation.stderr,/MODEL_INPUT_BLOB_MISMATCH/,
    'must reject on exact HEAD blob rather than later fake JAR checksum');
  assert.equal(fs.existsSync(path.join(scratch,receipt)),false,
    'no completion receipt may survive a hidden model mutation');
  controls++;
  git(['update-index','--no-assume-unchanged','--','formal/specs/Synthetic.tla']);
  git(['checkout','--','formal/specs/Synthetic.tla']);
  const scratchScript=path.join(scratch,'tools','run-tlc-assurance.sh');
  git(['update-index','--assume-unchanged','--','tools/run-tlc-assurance.sh']);
  fs.appendFileSync(scratchScript,'\n# local runner mutation not in HEAD\n');
  assert.equal(git(['status','--porcelain','--untracked-files=no']),'',
    'runner-script negative fixture must evade ordinary tracked git status');
  const hiddenRunnerScript=spawnSync('bash',['tools/run-tlc-assurance.sh'],{
    cwd:scratch,encoding:'utf8',timeout:10000,
    env:{...env,EXPECTED_HEAD:scratchHead}
  });
  assert.notEqual(hiddenRunnerScript.status,0,
    'an altered TLC runner script cannot count as exact-head execution');
  assert.match(hiddenRunnerScript.stdout+hiddenRunnerScript.stderr,
    /MODEL_INPUT_BLOB_MISMATCH.*tools\/run-tlc-assurance\.sh/,
    'runner script must be checked directly against its original HEAD blob');
  assert.equal(fs.existsSync(path.join(scratch,receipt)),false,
    'a mutated runner may not leave a success completion receipt');
  controls++;
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
  reject('caller re-pinning SHA-256 to forged JAR',
    {EXPECTED_JAR_SHA256:forgedDigest},/UNAUTHORIZED_TLC_SHA256_REPIN/);
  reject('caller re-pinning SHA-1',
    {EXPECTED_JAR_SHA1:'a'.repeat(40)},/UNAUTHORIZED_TLC_SHA1_REPIN/);
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
assert.equal(controls,18,'all 18 negative admission controls must execute');
console.log('PASS '+controls+' source-only negative controls: stale receipt, '+
  'wrong jar/hash, missing/mismatched head, run/attempt, injection and invalid job');
console.log('SOURCE_ONLY: No TLC parser/model checker or AttoLang guest executed');
