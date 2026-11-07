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

The reviewer cannot weaken `requiredSteps` to a setup-only step. The verifier
requires **both** the immutable checkout and real execution step names for
each kind. On Java the checkout has the explicit name
`Checkout immutable original Java PR head` and the main execution step is
`Compile critical AST, Task authority and .ores Truffle guest tests`.
On TLC the required names are
`Checkout exact original head (never synthetic PR merge)` and
`Execute real TLC for five bounded models and three unsafe-mutant controls`.

The test suite `tests/assurance-receipt-verifier.test.mjs` uses mocked
readback responses. PR CI runs the mock suite **without a privileged token**.
No PR workflow may invoke the live verifier with cross-repository secrets.

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
