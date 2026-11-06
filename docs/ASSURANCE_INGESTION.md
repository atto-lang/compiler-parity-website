# Private AttoLang assurance ingestion and release gates

## Purpose

The static site shows a curated GitHub snapshot. The next-wave collector (bin/collect-assurance-evidence.cjs) is a **read-only metadata reader**, not a GitHub App, source mirror, merge bot, CI publisher, build executor or guest attestor. It does not touch other organizations' private source and does not automatically deploy the site.

The data flow is:

1. Trusted private checkout of the dashboard repository holds the explicit initial PR allowlist in formal-data.js.
2. A locally or manually executed Node 22 collector fetches each PR's current head, Git commit root-tree, review submissions, branch-protection metadata where readable, and pull-request workflow run attempts and job-step metadata.
3. The collector refuses to promote user-supplied or stale metadata, never classifies a workflow conclusion alone as compiler failure, and refuses to infer guest execution from a successful job.
4. Its JSON output is written only under the private artifacts directory, never to the static web root or a public Pages branch.
5. An authorized reviewer can import the result into formal-security.html for triage. Browser-imported claims are explicitly non-authenticating.
6. A separately executed bounded model checker attaches a design-model-only report. Its result cannot become an AttoLang runtime proof.

## One-time private setup

Configure a dedicated token for the APPROVED repositories with only read scopes for metadata, contents, pull requests and Actions. Prefer an installation-scoped, short-lived GitHub App token over a broad personal token. Store it under GitHub Actions secret ATTO_ASSURANCE_READER_TOKEN in the private dashboard repository. Never commit the token, pass it into browser JavaScript, use it on untrusted PR workflows, or mirror private source across organizations.

Trigger the manual GitHub Actions workflow named Private Atto assurance evidence collector when credentials and runner allocation are confirmed. The workflow is workflow_dispatch-only by design; enable a periodic schedule after the credential, run admission and private artifact visibility have been reviewed. The manual job fails without the restricted token. It uploads only a private, 3-day-retained metadata artifact; it does not commit generated snapshots or publish a public site.

Alternatively, in a secured machine with authorized read-only access:

    ATTO_ASSURANCE_READER_TOKEN=... node bin/collect-assurance-evidence.cjs --output artifacts/assurance-snapshot.json

Do not paste tokens into issue comments, shell history, shared reports or audit logs.

## Explicit trust states

| Evidence | Recorded classification | NOT established |
| --- | --- | --- |
| steps=[] or steps=null | RUNNER_NOT_ADMITTED | Compiler failure, test result, guest execution |
| Nonempty but all skipped/unstarted step records | STEP_RECORDS_NOT_EXECUTED | Executed test, guest proof |
| Positive timestamps on real job steps | STEPS_OBSERVED | Correct original checkout, compiler/guest execution |
| PR head and root Git tree from GitHub REST | GITHUB_METADATA_READ | Runner checked out that head/tree |
| Local/source-only finite-state check | BOUNDED_DESIGN_MODEL_ONLY | Unbounded formal proof or backend refinement |
| Authored .atto fixture or negative test | SOURCE_ONLY | Fixture executed against a real compiler |
| Browser-imported JSON | NOT_INDEPENDENTLY_VERIFIED | Authentic GitHub API/binary attestation |
| Independent submitted approval at the current head | APPROVED_ON_HEAD metadata | Branch policy satisfied, security hold lifted, merge ready |
| Branch-protection API inaccessible | UNVERIFIED | Protection disabled OR protection enabled |

The collector keeps per-run and per-job attempt data, and the site can show each job independently. It never equates GitHub's run head_sha with the actual checkout SHA. A job needs a separate, executed checkout readback bound to its attempt; source-only receipt artifacts do not authenticate a compiler guest run.

## Runner-admission recovery

At the time this implementation was prepared, the original dashboard PR #3 had two GitHub-hosted jobs reporting steps=null. Both are runner-admission failures. A workflow edit cannot allocate GitHub runners or add quota by itself. The next Actions workflow pins checkout to the ORIGINAL PR HEAD rather than GitHub's synthetic merge commit, records git rev-parse HEAD and HEAD^{tree}, and runs source-only model and mutation tests when admitted.

Before declaring the runner problem resolved, the authorized organization administrator should inspect runner assignment, billing/minutes, Actions policies, concurrency and hosted runner availability; then trigger one known-safe source-only canary. Record the exact job ID, run attempt, nonzero started steps, checkout head/tree and uploaded receipt. If no steps executed, keep classification RUNNER_NOT_ADMITTED and do not advertise source tests as passing hosted CI.

## Merge/readiness controls

A candidate remains on HOLD unless all relevant gates are independently verified: current full PR head and root tree, real executed steps with exact checkout, scoped test and mutation receipts, fresh submitted independent review, enforced branch protection, no unresolved transfer or security hold, and semantic conflict resolution. All actual compiler-backed AttoLang guest claims require additional backend-specific compile/link/AOT and runtime execution receipts. No merge, approval or branch-protection mutation is performed by this collector.

The site remains private. Any deployment or scheduled workflow must undergo a separate access and metadata-confidentiality review; do not auto-publish private repo URLs, branches, review metadata or workflow artifacts to a public CDN.

## Tests

Source-only checks:

    node --check bin/collect-assurance-evidence.cjs
    node --test tests/assurance-collector-models.test.cjs
    node formal/models/check-bounded-safety.cjs
    node tests/formal-security.test.cjs
    node tests/smoke.cjs

The collector's unit tests use mocked GET-only GitHub responses and verify stale-head invalidation, duplicate job-name rejection, 403 handling, independent approval, null/empty step semantics and bounded formal-model negative mutants. They are **not** network or GitHub Actions execution evidence. See formal/models/README.md for explicit finite-state assumptions.
