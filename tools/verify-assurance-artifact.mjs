#!/usr/bin/env node
/** Trusted-reviewer-only verification of GitHub artifact ZIP bytes.
 * The ZIP comes from a reviewer download; GitHub API digest and immutable
 * workflow metadata are fetched separately. This is NEVER guest proof.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {inflateRawSync} from 'node:zlib';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {GitHubReadOnly} from './collect-assurance.mjs';
import {verifyLiveCandidate, validatePin} from './verify-assurance-receipt.mjs';

const MAX_ZIP = 16 * 1024 * 1024;
const MAX_MEMBER = 2 * 1024 * 1024;
const MAX_TOTAL = 16 * 1024 * 1024;
const MAX_MEMBERS = 80;
const DECODER = new TextDecoder('utf-8', {fatal:true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => {throw Error('ARTIFACT_REJECTED: '+reason);};
const must = (ok, reason) => {if (!ok) fail(reason);};
const safeUInt = x => Number.isSafeInteger(x) && x > 0;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i=0; i<8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pathIsSafe(name) {
  if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.startsWith('/') ||
      name.includes('//')) return false;
  return name.split('/').every(part => part !== '.' && part !== '..');
}
/** Decode a deliberately bounded ZIP subset. No extraction or filesystem writes.
 * Reject ZIP64, multidisk, links, encryption, duplicate/colliding names,
 * trailing data, oversized payloads, corrupted CRC, or unsupported methods.
 */
export function inspectZip(bytes) {
  must(Buffer.isBuffer(bytes) && bytes.length >= 22 && bytes.length <= MAX_ZIP,
    'missing or oversized ZIP');
  let eocd=-1;
  for(let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) {
    if (bytes.readUInt32LE(i)===0x06054b50 &&
        i+22+bytes.readUInt16LE(i+20)===bytes.length) {eocd=i;break;}
  }
  must(eocd>=0, 'ZIP end record missing or trailing bytes');
  const disk=bytes.readUInt16LE(eocd+4), centralDisk=bytes.readUInt16LE(eocd+6);
  const onDisk=bytes.readUInt16LE(eocd+8), count=bytes.readUInt16LE(eocd+10);
  const centralSize=bytes.readUInt32LE(eocd+12), centralAt=bytes.readUInt32LE(eocd+16);
  must(disk===0 && centralDisk===0 && onDisk===count &&
    count>0 && count<=MAX_MEMBERS && count!==65535 &&
    centralSize!==0xffffffff && centralAt!==0xffffffff &&
    centralAt+centralSize===eocd, 'unsupported ZIP layout or entry count');
  const result=new Map(), seenNames=new Set(), usedRanges=[];
  let cursor=centralAt, total=0;
  for(let n=0;n<count;n++) {
    must(cursor+46<=eocd && bytes.readUInt32LE(cursor)===0x02014b50,
      'invalid central-directory record');
    const madeBy=bytes.readUInt16LE(cursor+4);
    const flags=bytes.readUInt16LE(cursor+8), method=bytes.readUInt16LE(cursor+10);
    const storedCrc=bytes.readUInt32LE(cursor+16);
    const compressed=bytes.readUInt32LE(cursor+20), uncompressed=bytes.readUInt32LE(cursor+24);
    const nameLen=bytes.readUInt16LE(cursor+28), extraLen=bytes.readUInt16LE(cursor+30);
    const commentLen=bytes.readUInt16LE(cursor+32), startDisk=bytes.readUInt16LE(cursor+34);
    const external=bytes.readUInt32LE(cursor+38), local=bytes.readUInt32LE(cursor+42);
    const next=cursor+46+nameLen+extraLen+commentLen;
    must(next<=eocd && startDisk===0 && nameLen>0 &&
      compressed<=MAX_ZIP && uncompressed<=MAX_MEMBER &&
      method!==99 && (method===0 || method===8) &&
      (flags & 0x0001)===0 && compressed!==0xffffffff &&
      uncompressed!==0xffffffff && local!==0xffffffff,
      'invalid/oversized/encrypted ZIP member');
    let name;
    try {name=DECODER.decode(bytes.subarray(cursor+46,cursor+46+nameLen));}
    catch {fail('non-UTF8 ZIP name');}
    must(pathIsSafe(name) && !name.endsWith('/') &&
      !seenNames.has(name.toLowerCase()), 'unsafe/duplicate ZIP path');
    seenNames.add(name.toLowerCase());
    if ((madeBy>>>8)===3) {
      const kind=(external>>>16) & 0o170000;
      must(kind===0 || kind===0o100000, 'ZIP symlink or non-regular file');
    }
    must(local+30<=centralAt && bytes.readUInt32LE(local)===0x04034b50,
      'missing ZIP local header');
    const localFlags=bytes.readUInt16LE(local+6), localMethod=bytes.readUInt16LE(local+8);
    const localNameLen=bytes.readUInt16LE(local+26), localExtra=bytes.readUInt16LE(local+28);
    const dataAt=local+30+localNameLen+localExtra;
    must(localFlags===flags && localMethod===method &&
      localNameLen===nameLen && dataAt+compressed<=centralAt &&
      (flags & ~0x0808)===0 &&
      bytes.subarray(local+30,local+30+nameLen).equals(
        bytes.subarray(cursor+46,cursor+46+nameLen)),
      'mismatched/overrunning ZIP local header');
    // Reject unsupported ZIP64 extra data even when a malicious header avoids
    // the usual 0xffffffff size sentinels. Reject truncated extra fields too.
    for(const [start,length] of [
      [cursor+46+nameLen,extraLen],[local+30+nameLen,localExtra]
    ]){
      const end=start+length;
      must(end<=bytes.length,'ZIP extra-field overrun');
      let offset=start;
      while(offset<end) {
        must(offset+4<=end,'truncated ZIP extra-field header');
        const type=bytes.readUInt16LE(offset),n=bytes.readUInt16LE(offset+2);
        must(type!==1 && offset+4+n<=end,'ZIP64 or malformed extra field');
        offset+=4+n;
      }
    }
    let memberEnd=dataAt+compressed;
    const localCrc=bytes.readUInt32LE(local+14);
    const localCompressed=bytes.readUInt32LE(local+18);
    const localUncompressed=bytes.readUInt32LE(local+22);
    if ((flags & 0x0008)!==0) {
      // Streaming ZIPs use a data descriptor following the compressed bytes.
      // Require its exact CRC/sizes and forbid ZIP64 length descriptors.
      must((localCrc===0 || localCrc===storedCrc) &&
        (localCompressed===0 || localCompressed===compressed) &&
        (localUncompressed===0 || localUncompressed===uncompressed),
        'inconsistent ZIP streaming local header');
      const hasSig=memberEnd+4<=centralAt &&
        bytes.readUInt32LE(memberEnd)===0x08074b50;
      if(hasSig)memberEnd+=4;
      must(memberEnd+12<=centralAt &&
        bytes.readUInt32LE(memberEnd)===storedCrc &&
        bytes.readUInt32LE(memberEnd+4)===compressed &&
        bytes.readUInt32LE(memberEnd+8)===uncompressed,
        'ZIP data descriptor missing or inconsistent');
      memberEnd+=12;
    } else {
      must(localCrc===storedCrc && localCompressed===compressed &&
        localUncompressed===uncompressed,
        'central/local ZIP CRC or size mismatch');
    }
    must(!usedRanges.some(([a,b])=>local < b && memberEnd > a),
      'overlapping ZIP local file records');
    usedRanges.push([local,memberEnd]);
    total+=uncompressed;
    must(total<=MAX_TOTAL, 'uncompressed ZIP budget exceeded');
    const packed=bytes.subarray(dataAt,dataAt+compressed);
    let payload;
    try {payload=method===0?packed:inflateRawSync(packed,{maxOutputLength:MAX_MEMBER+1});}
    catch {fail('ZIP inflation failed or exceeded limit');}
    must(payload.length===uncompressed && crc32(payload)===storedCrc,
      'ZIP size/CRC mismatch');
    result.set(name,Buffer.from(payload));
    cursor=next;
  }
  must(cursor===eocd, 'unexpected central-directory bytes');
  return result;
}
export function expectedArtifactName(pin) {
  validatePin(pin);
  return pin.kind==='TLC_BOUNDED_MODEL_ONLY'
    ? 'tlc-bounded-source-only-'+pin.runId+'-'+pin.attempt
    : 'java-truffle-atto-guest-source-only-receipt-'+pin.runId+'-'+pin.attempt;
}
export function validateArtifactMetadata(pin, record, listing, run) {
  const expected=expectedArtifactName(pin);
  must(listing && Array.isArray(listing.artifacts) &&
    listing.total_count===listing.artifacts.length &&
    listing.artifacts.length<100, 'incomplete artifact listing');
  const matches=listing.artifacts.filter(x=>x?.name===expected);
  must(matches.length===1, 'missing or duplicate expected artifact');
  const artifact=matches[0];
  must(run?.id===pin.runId && run?.head_sha===pin.head &&
    run?.repository?.full_name===pin.repo &&
    safeUInt(run.repository.id) &&
    safeUInt(pin.repositoryId) && run.repository.id===pin.repositoryId,
    'run repository binding absent or mismatched');
  must(safeUInt(artifact.id) && artifact.expired===false &&
    safeUInt(artifact.size_in_bytes) && artifact.size_in_bytes<=MAX_ZIP &&
    artifact.workflow_run?.id===pin.runId &&
    artifact.workflow_run?.head_sha===pin.head &&
    artifact.workflow_run?.repository_id===pin.repositoryId &&
    artifact.workflow_run?.head_repository_id===pin.repositoryId,
    'artifact origin, liveness or size mismatch');
  must(artifact.archive_download_url===
    'https://api.github.com/repos/'+pin.repo+'/actions/artifacts/'+artifact.id+'/zip',
    'artifact API download URL mismatch');
  must(/^sha256:[a-f0-9]{64}$/.test(artifact.digest),
    'missing official GitHub SHA256 artifact digest');
  return artifact;
}
function textOf(entries,name) {
  const bytes=entries.get(name);
  must(bytes && bytes.length>0 && bytes.length<=MAX_MEMBER,
    'required artifact file missing: '+name);
  try {return DECODER.decode(bytes);}
  catch {fail('artifact file not valid UTF8: '+name);}
}
function jsonOf(entries,name) {
  let parsed;
  try {parsed=JSON.parse(textOf(entries,name));}
  catch {fail('invalid artifact JSON: '+name);}
  must(parsed && typeof parsed==='object' && !Array.isArray(parsed),
    'invalid artifact JSON object: '+name);
  return parsed;
}
const MODELS=['ActorIsolation','CancellationAwait','HotReloadFencing',
  'ReliablePubSub','ActorBorrowGeneration'];
const MUTATIONS=['overlap','stale','read-transfer'];
const MODEL_INPUTS=Object.freeze([
  ...MODELS.map(x=>'formal/specs/'+x+'.tla'),
  ...[...MODELS.map(x=>'formal/specs/'+x+'.cfg'),
    ...MUTATIONS.map(x=>'formal/specs/ActorBorrowGeneration.'+x+'-mutant.cfg')],
  'tools/run-tlc-assurance.sh'
]);
function parseHashManifest(manifest, expectedPaths, scope) {
  const lines=manifest.trimEnd().split('\n');
  const remaining=new Set(expectedPaths);
  must(lines.length===remaining.size, scope+' hash manifest cardinality mismatch');
  for(const line of lines){
    const match=/^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/.exec(line);
    must(match && remaining.delete(match[2]),
      scope+' hash manifest has a missing, repeated or unexpected path');
  }
  must(remaining.size===0,scope+' hash manifest incomplete');
}
function checkTlcParserLog(text,model){
  must(text.includes('Parsing file') &&
    text.includes('Semantic processing of module '+model) &&
    !/(?:^|\n)\s*(?:Error:|Exception in thread|\*\*\* Error)/m.test(text),
    'TLC/SANY parser or semantic pass not demonstrated: '+model);
}
function checkTlcBaselineLog(text,model){
  const success='Model checking completed. No error has been found.';
  // TLC prints both plain and comma-grouped counts; reject malformed commas
  // and integers beyond Number.MAX_SAFE_INTEGER before comparing state totals.
  const match=/^([0-9][0-9,]*) states generated, ([0-9][0-9,]*) distinct states found, ([0-9][0-9,]*) states left on queue\.$/m.exec(text);
  const validCount=x=>/^(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(x);
  const counts=match && match.slice(1).every(validCount)
    ? match.slice(1).map(x=>Number(x.replaceAll(',',''))) : [];
  must(text.includes('TLC2 Version') &&
    text.split(success).length===2 &&
    counts.length===3 && counts.every(Number.isSafeInteger) &&
    counts[0]>=counts[1] && counts[1]>0 && counts[2]===0 &&
    /^Finished in [^\n]{1,100} at \([^)]+\)$/m.test(text) &&
    !/(?:^|\n)\s*(?:Error:|Exception in thread|\*\*\* Error)/m.test(text),
    'TLC baseline lacks genuine full-search success markers: '+model);
}
function checkTlcCounterexample(text,mutation){
  must(text.includes('TLC2 Version') &&
    (text.match(/^Error: Invariant Inv is violated\.$/gm)||[]).length===1 &&
    text.includes('Error: The behavior up to this point is:') &&
    /^State 1: .+/m.test(text) &&
    !text.includes('Model checking completed. No error has been found.') &&
    !/(?:^|\n)\s*(?:Exception in thread|\*\*\* Error)/m.test(text),
    'TLC mutation lacks invariant violation plus state trace: '+mutation);
}
function verifyGuestXmlWithJava(xml){
  const source=fileURLToPath(new URL('./VerifyArtifactGuestSurefire.java',import.meta.url));
  const result=spawnSync('java',['--source','21',source],{
    input:xml,encoding:'utf8',timeout:30000,maxBuffer:131072,
    shell:false,windowsHide:true
  });
  must(!result.error && result.status===0 &&
    result.stdout.trim()==='VALID_GUEST_SUREFIRE_XML tests=8',
    'Java guest Surefire XML structural validation rejected');
}

export function receiptFromArtifact(pin,entries) {
  const isTlc=pin.kind==='TLC_BOUNDED_MODEL_ONLY';
  const receipt=jsonOf(entries,isTlc?'completed-source-only.json':'suite-gate-completed.json');
  if(isTlc) {
    const prov=jsonOf(entries,'provenance.json');
    must(prov.scope==='TLC_BOUNDED_MODEL_ONLY' &&
      prov.guest==='NOT_EXECUTED' && prov.head===pin.head &&
      prov.tree===pin.tree && prov.jar_sha256===pin.toolSha256 &&
      String(prov.run_id)===String(pin.runId) &&
      String(prov.run_attempt)===String(pin.attempt) &&
      prov.job===pin.jobKey, 'TLC runtime provenance mismatch');
    const manifest=textOf(entries,'logs.sha256');
    const lines=manifest.trimEnd().split('\n');
    const expected=new Set([
      ...MODELS.flatMap(x=>[x+'.parse.log',x+'.baseline.log']),
      ...MUTATIONS.map(x=>'ActorBorrowGeneration.'+x+'.counterexample.log')
    ]);
    must(lines.length===expected.size,'TLC log-manifest cardinality mismatch');
    for(const line of lines){
      const match=/^([a-f0-9]{64})  private-artifacts\/tlc\/([A-Za-z0-9._-]+\.log)$/.exec(line);
      must(match && expected.has(match[2]),'TLC log manifest has unknown entry');
      const bytes=entries.get(match[2]);
      must(bytes && hash(bytes)===match[1], 'TLC log digest mismatch: '+match[2]);
      expected.delete(match[2]);
    }
    must(expected.size===0,'missing TLC log evidence');
    for(const model of MODELS){
      checkTlcParserLog(textOf(entries,model+'.parse.log'),model);
      checkTlcBaselineLog(textOf(entries,model+'.baseline.log'),model);
    }
    for(const mutation of MUTATIONS)
      checkTlcCounterexample(
        textOf(entries,'ActorBorrowGeneration.'+mutation+'.counterexample.log'),
        mutation);
    must(typeof pin.modelInputManifestSha256==='string' &&
      /^[a-f0-9]{64}$/.test(pin.modelInputManifestSha256),
      'independently prepared TLC input-manifest hash pin missing');
    const sourceManifest=textOf(entries,'model-inputs.sha256');
    must(hash(Buffer.from(sourceManifest,'utf8'))===pin.modelInputManifestSha256,
      'TLC input manifest digest differs from trusted reviewer pin');
    parseHashManifest(sourceManifest,MODEL_INPUTS,'TLC source');
    must(textOf(entries,'java-version.txt').includes('version'),
      'Java runtime identity missing');
  } else {
    const src=textOf(entries,'fixture-sha256.txt');
    must(src.split('\n').some(l=>l.startsWith(pin.fixtureSha256+
      '  examples/critical-actor-checked-v1.atto')),
      'canonical fixture file hash not corroborated');
    const cls=textOf(entries,'compiler-class-sha256.txt');
    must(cls.split('\n').some(l=>l.startsWith(pin.compilerSha256+
      '  target/classes/dev/oreslang/compiler/OresCompiler.class')),
      'compiled compiler-class hash not corroborated');
    const checkout=jsonOf(entries,'checkout.json');
    must(checkout.source_head===pin.head && checkout.source_tree===pin.tree &&
      checkout.proof==='NOT_INDEPENDENTLY_VERIFIED' &&
      String(checkout.run_id)===String(pin.runId) &&
      String(checkout.attempt)===String(pin.attempt) &&
      checkout.job===pin.jobKey, 'Java checkout evidence mismatch');
    const xml=textOf(entries,'TEST-dev.oreslang.CriticalActorGuestExecutionTest.xml');
    verifyGuestXmlWithJava(xml);
  }
  return receipt;
}
export async function verifyArtifactCandidate(api,pin,zipBytes) {
  validatePin(pin);
  const [listing,run]=await Promise.all([
    api.get('/repos/'+pin.repo+'/actions/runs/'+pin.runId+'/artifacts?per_page=100'),
    api.get('/repos/'+pin.repo+'/actions/runs/'+pin.runId)
  ]);
  const record=validateArtifactMetadata(pin,null,listing,run);
  must(Buffer.isBuffer(zipBytes) && zipBytes.length===record.size_in_bytes,
    'downloaded ZIP size mismatch');
  const zipDigest=hash(zipBytes);
  must('sha256:'+zipDigest===record.digest,'downloaded ZIP SHA256 mismatch');
  const entries=inspectZip(zipBytes);
  const receipt=receiptFromArtifact(pin,entries);
  const check=await verifyLiveCandidate(api,pin,receipt);
  return Object.freeze({
    ...check,classification:'GITHUB_ARTIFACT_BYTES_CORROBORATED_CANDIDATE_ONLY',
    artifactId:record.id,artifactName:record.name,artifactDigest:record.digest,
    archiveMemberCount:entries.size,
    artifactIntegrity:'GITHUB_API_SHA256_MATCHED',
    artifactOrigin:'GITHUB_RUN_AND_REPO_METADATA_MATCHED',
    receiptAuthenticity:'GITHUB_ARCHIVE_DIGEST_CORROBORATED_NOT_SIGNED',
    guestExecution:'NOT_INDEPENDENTLY_VERIFIED',
    proof:'NOT_SIGNED_OR_INDEPENDENTLY_REVIEWED'
  });
}
async function main(){
  if(process.argv.length!==4)throw Error(
    'Usage: ASSURANCE_READ_TOKEN=... node tools/verify-assurance-artifact.mjs <trusted-pin.json> <original-artifact.zip>');
  const token=process.env.ASSURANCE_READ_TOKEN;
  if(!token)throw Error('ASSURANCE_READ_TOKEN required');
  const [pin,archive]=await Promise.all([
    readFile(resolve(process.argv[2]),'utf8').then(JSON.parse),
    readFile(resolve(process.argv[3]))
  ]);
  console.log(JSON.stringify(await verifyArtifactCandidate(
    new GitHubReadOnly(token),pin,archive),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
