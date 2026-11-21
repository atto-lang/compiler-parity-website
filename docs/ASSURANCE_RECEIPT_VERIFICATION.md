# Independent AttoLang receipt readback — scoped candidate gate

This document describes a read-only **GitHub metadata corroboration gate**.
It does not turn a GitHub Actions green check, uploaded JSON, or local source
test into verified AttoLang compiler or runtime proof.

## What the new gate does

`tools/verify-assurance-receipt.mjs` receives two separate objects:

1. A **trusted pin** prepared by the independent reviewer, with repository,
   current PR/head/root tree, the canonical workflow file and immutable
   workflow ID, immutable run ID/attempt, selected GitHub
   numeric job ID, job **display name**, job **key** (`GITHUB_JOB`), expected
   step names and pinned compiler/TLC/fixture SHA-256 hashes.
2. A potentially **untrusted completion receipt** downloaded from the job's
   evidence artifact. Do not treat its fields as independently observed facts.

It then performs fresh, read-only GitHub API calls for the PR, Git commit,
workflow run, and the exact run-attempt jobs page. It fails if:

- The PR's current head or root Git tree differs from the independent pin.
- The GitHub workflow ID or path is not the canonical TLC/Java workflow,
  the workflow event or PR association is wrong, or the run head,
  run attempt or success status disagrees.
- Jobs are duplicated, missing or paginated beyond the inspected page,
  the job points to a different run/attempt/head/check-run URL, or the
  assigned runner has no ID/name.
- The chosen job lacks a real runner ID, successful conclusion or step records.
- A required step was never started, was skipped/failed, has invalid
  timestamps, appears out of order, or the job contains a hidden
  failed/unfinished step (including an ignored `continue-on-error` failure).
- Receipt head, tree, run, attempt, job key, hash or scope disagrees with the
  pinned and GitHub-observed values.
- A source-only TLC receipt claims an executed guest or a Java candidate
  receipt claims independently proven guest execution.

**Important:** A job display name is not necessarily `GITHUB_JOB`. For the
TLC workflow, the display name is
`exact-head-tlc-safety-and-counterexamples`, but `GITHUB_JOB` is
`tlc-bounded-design`. These must be separately pinned.

## How an independent reviewer runs it

Execute this from a clean trusted checkout of the **reviewed verifier code**,
not from an untrusted PR-execution context. Use a fine-grained, read-only
GitHub token with metadata, pull request and Actions run inspection access;
do not place the token in CI artifact files or PR logs.

```sh
ASSURANCE_READ_TOKEN=... node tools/verify-assurance-receipt.mjs \
  /secure/reviewer-pins/tlc-pin.json /secure/evidence/completed-source-only.json
```

For Java, pass a `JAVA_JVM_GUEST_CANDIDATE` pin and the
`suite-gate-completed.json` file, not the always-uploaded
`checkout.json`. The latter is **candidate-only even on failed tests**.

### Pinned fields

| Field | TLC | Java |
| --- | --- | --- |
| `repo`, `pr`, `head`, `tree` | Required exact original source | Required exact original source |
| `workflowPath`, `workflowId` | Canonical TLC workflow and API ID | Canonical Java workflow and API ID |
| `runId`, `attempt`, `jobId` | Exact job API identities | Exact job API identities |
| `jobName`, `jobKey` | Distinct display name and `GITHUB_JOB` | Usually the same; both required |
| `requiredSteps` | Checkout and executed TLC step | Checkout and Maven/Surefire validation step |
| `kind` | `TLC_BOUNDED_MODEL_ONLY` | `JAVA_JVM_GUEST_CANDIDATE` |
| `toolSha256` | Official TLC v1.7.4 SHA-256, required | Not used |
| `compilerSha256` | Not used | Compiled `OresCompiler.class` SHA-256 |
| `fixtureSha256` | Not used | Canonical `critical-actor-checked-v1.atto` SHA-256 |

The official TLC SHA-256 enforced by the verifier is
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
A zero-step job is **RUNNER_NOT_ADMITTED** and cannot be promoted. Retry only
after identifying and resolving the admission blocker.

The reviewer cannot weaken `requiredSteps` to a setup-only step or
reorder the mandatory steps. Java requires the immutable checkout followed
by the real Maven/Surefire execution step. TLC requires **three ordered
steps**: `Checkout exact original head (never synthetic PR merge)`, then
`Independently verify TLC model and runner script HEAD blobs`, then
`Execute real TLC for five bounded models and three unsafe-mutant controls`.
The independent preflight checks every model/config file **and the executed
runner script** against original Git blobs before invoking any PR script.
`steps=[]` or `steps=null` never qualifies as proof of admission.

The test suite `tests/assurance-receipt-verifier.test.mjs` uses mocked
readback responses. PR CI runs the mock suite **without a privileged token**.
No PR workflow may invoke the live verifier with cross-repository secrets.

## Original artifact archive byte verification

The trusted-reviewer verifier `tools/verify-assurance-artifact.mjs`
adds a separate **byte-level** layer on top of the exact-head metadata gate.
This does not run under an untrusted pull-request workflow.

1. Obtain the original **ZIP file** from the intended GitHub Actions
   run's artifact page, using a GitHub-authenticated account with read access.
   Do not supply an extracted directory, a repacked ZIP, a self-produced
   archive, or an artifact from a different attempt.
2. From a clean, independently reviewed checkout of the verifier, prepare the
   same trusted pin as above, with the additional independently checked
   `repositoryId` (the numeric GitHub repository ID).
3. For TLC, reconstruct the input manifest independently from a clean
   reviewer checkout at the pinned original `head` (not from the untrusted
   ZIP) and add `modelInputManifestSha256` to the TLC trusted-pin JSON:

```sh
# Run from the independently reviewed original Git commit:
test "$(git rev-parse HEAD)" = '<pinned-exact-head>'
sha256sum formal/specs/*.tla formal/specs/*.cfg tools/run-tlc-assurance.sh \
  | sha256sum | awk '{print $1}'
```

   The printed lowercase 64-hex digest is the SHA-256 of the complete
   `model-inputs.sha256` manifest **including exact paths and ordering**;
   the verifier rejects any alternate or missing input. Never derive this
   trusted pin by hashing the submitted artifact itself.
4. Install Java 21 on the trusted workstation: Java evidence invokes the
   reviewed `tools/VerifyArtifactGuestSurefire.java` in Java 21 source-file
   mode to parse actual XML with XXE disabled, rather than trusting XML text
   fragments or `tests="8"` alone.
5. Execute the read-only check from a trusted reviewer workstation:

```sh
ASSURANCE_READ_TOKEN=... node tools/verify-assurance-artifact.mjs \
  /secure/reviewer-pins/atto-pin.json /secure/evidence/original-github-artifact.zip
```

The verifier re-fetches GitHub's **exact run** and artifact list using
`Actions: read` permission; requires a unique canonical name for the
`runId` and `attempt`, matching original repository ID/head, a
non-expired artifact, a bounded size, and GitHub's SHA-256 digest.
It computes SHA-256 of the actual downloaded ZIP bytes and compares it to
the API digest. There is **no automatic redirect following or token forwarding
to an artifact CDN** inside this verifier.

The archive parser now checks central-directory and local-header CRC/size
consistency, bounds the complete local-record span (not just compressed
data), and validates streaming ZIP data descriptors where present. It
rejects unrecognized ZIP flag combinations, ZIP64 extra fields even when
the ordinary size fields look safe, and truncated/overlapping record
metadata. This avoids treating contradictory archive structures as
trusted ZIP evidence.

TLC's final state counts may be either ordinary decimal or correctly
comma-grouped thousands (for example `17,118 states generated`). The
model-log validator accepts both representations, while rejecting malformed
comma placement, impossible state totals and values beyond safe integer
precision. This is a compatibility and evidence-integrity check, not a
claim of TLC runtime execution.

The archive reader rejects unreferenced bytes before or between local
file records, even when ZIP metadata and CRCs are internally consistent.
Only the exact canonical evidence file set is accepted: five bounded-model
parser logs, five TLC baseline logs, three mutant counterexample logs and
their five provenance/manifest files; or eight Java XML suites and their
five receipt/manifest files. Extra files, directory entries and missing
evidence files fail closed. The archive also forbids ZIP EOCD comments,
per-entry central-directory comments, and local/central extra fields:
these are opaque byte containers not covered by the canonical evidence
filenames and may otherwise conceal unrelated data. For compatibility,
the artifact producer must emit a plain, canonical ZIP without these
metadata containers. The GitHub artifact digest still authenticates only
the bytes returned by the GitHub API; it does not certify what the tests ran.

The ZIP reader does not extract paths to disk. It verifies central/local
headers, CRC32, regular files only, unique safe names, supported compression,
and strict compressed/uncompressed size limits. It rejects ZIP traversal,
symlinks, duplicate paths, ZIP bombs, encryption, corruption and trailing
data. TLC receipts must include source/run provenance, five model baseline
and parser logs, three mutant traces, and a matching SHA-256 manifest.
Java candidate receipts must include compiler-class and canonical `.atto`
fixture SHA-256 manifests, matching checkout provenance and the guest
Surefire XML. A strict Java 21 DOM parser checks the exact eight expected
direct testcases, suite identity and declared totals, and rejects XXE,
duplicates, failures, skips, nested false positives and missing cases.
TLC parser logs must actually show SANY semantic processing, each baseline
must report successful full-state exploration with nonzero distinct states,
zero queued states and normal completion, while each unsafe mutation must
show the specific `Inv` invariant violation and a concrete initial trace.
These textual markers are **indicators, not proof of faithful computation**:
malicious PR code can still manufacture logs, so a trusted reviewer must
inspect the underlying model checker and guest tool invocations. Once the
archive checks pass, the original
`verifyLiveCandidate` gate must also corroborate the current PR,
root tree, canonical workflow, run attempt, assigned runner and required
successful execution steps.

**Output is still `GITHUB_ARTIFACT_BYTES_CORROBORATED_CANDIDATE_ONLY`.**
A GitHub API digest ties the supplied bytes to GitHub's artifact metadata;
it is **not a signed software attestation** or independent verification of
compiler/guest semantics. An untrusted PR author may have produced false
outputs inside a legitimately uploaded archive. A reviewer must still inspect
real guest traces and build results before release decisions.

The PR's own CI only runs synthetic ZIP + mocked GitHub-API negative tests,
without any `ASSURANCE_READ_TOKEN`, external archive download, private
source mirror, or guest-execution claim.

## What a passing result actually means

The ONLY successful classification is
`GITHUB_METADATA_CORROBORATED_CANDIDATE_ONLY`. The report always states:

- `receiptAuthenticity: NOT_INDEPENDENTLY_ESTABLISHED`
- `guestExecution: NOT_INDEPENDENTLY_VERIFIED`
- `proof: NOT_SIGNED_OR_INDEPENDENTLY_REVIEWED`

The independent reviewer must additionally download the artifact through an
authenticated GitHub run-artifact endpoint, validate its artifact origin and
actual bytes, inspect original-head checkout and relevant test output, compare
the test fixture and compiler identities to independently obtained hashes,
and obtain independent approval and applicable branch protection **before**
treating test execution as proof. The readback tool currently checks metadata
and claimed receipt consistency, not artifact signatures, TLC log semantics,
Native Image behavior, or runtime refinement.

The verifier fails closed; do not bypass a failure by relaxing exact-head,
runner-step or tool-hash constraints. All tests/fixtures in a PR are untrusted
until independently reviewed.

## Eight-suite Java Surefire evidence

The Java/GraalVM source workflow archives **all eight Surefire XML suites**
that the canonical `VerifyAssuranceSurefire.java` checked, together with
`surefire-xml-sha256.txt`. The independent verifier requires exactly
the expected eight XML filenames, unique complete manifest entries,
matching XML bytes and structural validation of each suite via
`tools/VerifyArtifactGuestSurefire.java` in trusted Java 21 source-file mode.
It requires all 33 specifically named safety tests across the five
named-gate suites, plus nonempty passing results for each of the three
additional suites. The canonical guest suite requires exactly its eight
method names, not merely `tests="8"` in an XML attribute.

The evidence gate rejects missing borrow/critical reports, partial suites,
duplicate testcases, unexpected or skipped/error nodes, XML external
entities, and reporter-supplied hashes that disagree with archived bytes.
This is **candidate-only** evidence: a malicious producer can fabricate a
structurally consistent ZIP, so actual runner allocation and independently
reviewed compiler/guest traces are still required.

