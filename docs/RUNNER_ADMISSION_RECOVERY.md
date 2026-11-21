# P0 — Recover GitHub Actions runner admission (not a compiler failure)

## Diagnostic isolation

The **source-free** workflow `.github/workflows/runner-admission-canary.yml`
intentionally has no checkout, repository source, third-party actions or
credentials. It executes only shell statements and labels itself
`SOURCE_FREE_RUNNER_STEP_EXECUTED` once a runner actually starts.

At the first attempted PR execution:

- Workflow: https://github.com/ores-truffle-oreslang/compiler-parity-website/actions/runs/42336776567
- Job ID: `128295353278`
- Status: completed, conclusion: failure, `steps=null`
- Parallel original-head dashboard workflow:
  https://github.com/ores-truffle-oreslang/compiler-parity-website/actions/runs/42336776545
- Dashboard job ID: `128295353703`, `steps=null`.

Both are **RUNNER_NOT_ADMITTED** as a local evidence classification. An API
result with missing steps cannot prove that any shell script, source-only test,
formal model, compiler or guest ran. It does not by itself distinguish billing,
private-repo policy, an unavailable runner group or platform incident.

## Cross-repository admission control (November 7, 2026)

A source-free **private** canary failed at 2026-11-07T04:22Z, while
**public** CI in the same `ores-truffle-oreslang` organization executed jobs
at 2026-11-07T04:23Z. This means the incident is **not a blanket inability
of the organization to run any GitHub Actions jobs**.

| Repository visibility | Run / job | Observed status | Actual step records |
| --- | --- | --- | --- |
| Private dashboard | [42338157742](https://github.com/ores-truffle-oreslang/compiler-parity-website/actions/runs/42338157742), job `128299669790` | Failure | `null` |
| Private Java | [42338172312](https://github.com/ores-truffle-oreslang/oreslang-source.java/actions/runs/42338172312), job `128299715101` | Failure | `null` |
| Private platform conformance | [42393361263](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/actions/runs/42393361263) | Failure | `null` |
| Private Wasm | [42387174395](https://github.com/ores-truffle-oreslang/oreslang-source.wasm/actions/runs/42387174395) | Failure | `null` |
| Public CLI | [42338255954](https://github.com/ores-truffle-oreslang/oreslang-cli/actions/runs/42338255954) | Success | 6 and 12 |
| Public CLI CI | [42338255919](https://github.com/ores-truffle-oreslang/oreslang-cli/actions/runs/42338255919) | Success | 11 |
| Public marketing site | [42387087806](https://github.com/ores-truffle-oreslang/ores-truffle-oreslang.github.io/actions/runs/42387087806) | Success | 31 |

All observed private failures are classified `RUNNER_NOT_ADMITTED`.
Public-run step records establish that hosted execution is possible in the
organization; they **do not** establish private-runner eligibility or
prove that billing is the sole root cause.

### Get the actual GitHub annotation

The run's error annotation can be **outside the job logs**. A failed job with
`steps=null` may also have no downloadable logs, so `gh run view --log-failed`
is not a reliable source for the admission reason. Have an authorized org
administrator examine the **Annotations** section of the source-free run,
or use an authenticated GitHub CLI session with checks read permission:

```sh
gh api repos/ores-truffle-oreslang/compiler-parity-website/check-runs/128299669790/annotations \
  --jq '.[] | select(.annotation_level == "failure") | .message'
```

The connected repository API used by this audit can fetch Actions runs,
jobs and commit check-run **summaries**, but cannot fetch this
`check-runs/{id}/annotations` endpoint; the failed private job's log endpoint
returned HTTP 404 / `BlobNotFound`. The source-free canary's job API confirms
`runner_id=0`, `runner_name=""`, `steps=[]`, and its check-run summary
reports **two annotations** (`annotations_count=2`). The same count is
present on the other two checks attached to that PR head.
**Do not infer an exact billing message from the mere annotation count or
empty logs.**

### Prioritized owner checks

1. Under **ores-truffle-oreslang** (the owning organization, *not* the
   personal account), review the Actions spending limit, included monthly
   private compute usage, outstanding payment/entitlement issues and
   organization billing-group ownership. Budget alerts and a hard spending
   cap can be distinct.
2. Inspect the exact annotation. If it reports a payment or spending limit
   hold, resolve it through the **organization's** billing administrator;
   no agent should make unapproved purchases or silently change spending.
3. If the annotation instead reports required manual approval, incompatible
   job policy, restricted runner groups or provisioning, fix **that exact
   control** rather than altering compiler tests or toolchain hashes.
4. Re-run the **private source-free canary only** after the implicated
   condition is corrected. Demand an assigned runner and a started shell
   step. Then run the assurance and Java exact-head workflows in order.
5. If the annotation and billing state disagree, use the failed run URLs,
   job IDs and public/private comparison above in a GitHub Support ticket.
   Share no secrets or private source through public support threads.

GitHub documentation: https://docs.github.com/en/actions/concepts/billing-and-usage
(GitHub-hosted Actions are free for public repositories, whereas private
repositories consume account-plan allowances). The diagnostic comparison
alone cannot prove that the private allowance is exhausted.

## Administrator checklist (run in this order)

1. Read the source-free workflow's run page and any **workflow-level** error
   banner / organization policy annotation. Record exact reason without
   generalizing from a zero-step result.
2. With authorized access, inspect GitHub account/organization **Billing &
   licensing → Actions**: remaining included minutes, spending limits and
   payment/usage restrictions. Do not make unapproved billing changes.
3. Check **repository/org Settings → Actions → General** for Actions enabled,
   allowed actions, policy restrictions, PR workflow approvals and workflow
   permissions. The source-free canary requires no elevated token permissions.
4. Check **Actions → Runners** and inherited runner groups for eligibility,
   capacity and assignments. This canary requests `ubuntu-latest` on a
   GitHub-hosted runner.
5. If an approved **funded** carrier is available, run a separate source-free
   canary there to isolate whether the problem is account, organization or
   repository scoped. **Do not mirror private source** into another organization
   or repository without independent authorization.
6. Retry the source-free canary only after a specific admission change or
   maintenance recovery. Capture the run ID, run attempt, job ID, runner
   allocation, and **at least one started step** from GitHub's job-step API.
   `steps=[]`, `steps=null` and zero started steps do not qualify.
7. Once the canary works, run
   `.github/workflows/assurance-dashboard.yml` and
   `.github/workflows/assurance-tlc.yml` on the **immutable current PR head**,
   then the Java critical-suspends guest workflow in `oreslang-source.java`.
   Verify original checkout head/tree, actual executed steps, tool hashes,
   compiler/test results, and negative controls independently.

## Evidence classes — do not promote across them

| Event | Maximum justified conclusion |
| --- | --- |
| PR workflow created with `steps=null` | `RUNNER_NOT_ADMITTED` |
| Source-free canary has a started shell step | Runner admission works **for that job** |
| Dashboard Node and JS bounded models execute | `SOURCE_ONLY_DESIGN_MODEL` |
| Trusted TLC jar and all reference/mutant checks execute | `TLC_BOUNDED_MODEL_ONLY` |
| Original-head Java compiler parses/checks and Graal guests execute | Scoped JVM guest evidence |
| All five compilers and native guests execute byte-identical `.atto` fixtures | Candidate parity evidence, still subject to independent attestation |

No category by itself proves unbounded liveness, production refinement or
cross-backend parity. Reviews, protected source branches and signed/independent
receipt verification are separate merge gates.

## Independent readback before any proof promotion

After the canary and the real compiler/TLC workflow have started steps, use
`tools/verify-assurance-receipt.mjs` with a reviewer-pinned JSON identity
and the scoped pass-only receipt. See
[`ASSURANCE_RECEIPT_VERIFICATION.md`](./ASSURANCE_RECEIPT_VERIFICATION.md).
Run the live readback in a trusted reviewer environment; PR-source workflows
only execute mocked negative tests and must not receive a privileged token.
Metadata-corroborated evidence remains **candidate-only** until authenticated
artifact bytes, guest/TLC logs, checksums and independent approvals are
reviewed.

## Minimal operator receipt

Record `repo`, PR, original 40-hex `head`, job's actual checked-out tree
when a checkout exists, `run_id`, `run_attempt`, `job_id`,
`runner_id`, started step names/IDs, conclusion, toolchain version/digest
and executed fixture/test hashes. The source-free canary intentionally has no
checkout tree; it must never report one as attested.
