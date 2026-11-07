# AttoLang compiler-parity / immutable-default dashboard

Open **index.html** directly in a browser. It is completely self-contained and offline: no CDN, app server, login, GitHub token, data push or browser API polling.

This additive dashboard lives under `immutable-parity/` to avoid touching the active formal-assurance and collector PR stacks. It does **not** replace the existing engineering command center.

## Views

- Overview, exact-head PR registry, backend matrix, CI/receipt ledger, immutable semantics lab, fixture atlas, review checklists.
- Filters: repository, PR, backend, semantic area, date, free-text search. Detail drawers for PRs, inspected runs and fixtures.
- Global import/export JSON remains **untrusted**. Browser checklist marks are local notes, not evidence of independent review.
- Mandatory: Java/GraalVM, LLVM, .NET NativeAOT, Wasm and **independent Forge**. Optional Cranelift is separately unknown rather than substituted.
- Semantic contract: `int x = 7`, `const x = 7`, `const int x = 7` are equivalent readonly bindings; `let`/approved `mut` spelling is required for rebinding. Runtime const initializers are legal. Referent mutability and binding mutability are independent.

## Provenance and limits

The data is a **November 6, 2026** GitHub-connected point-in-time snapshot. It captures 6 relevant PR heads, associated immutable root Git trees, and 5 selected inspected workflow jobs. All five selected jobs returned **`steps:null`**. That means **runner admission failed for these samples**, not that the compiler tests passed or even executed. The exact run attempt and checkout-to-head/tree binding were not independently established. This is not an exhaustive Actions history.

The snapshot contains **zero authenticated compiler-backed guest receipts**, **zero independently verified negative mutation receipts** and **zero authenticated source-free canary receipts**. Source-free canaries and host-only tests are distinct from compiler-backed guest results. The static site cannot independently authenticate imported JSON claims; it never promotes such claims to green guest results.

The snippets are abbreviated semantic illustrations and design contracts, not executable, byte-pinned full guest programs. AttoLang is the current public name. Existing Oreslang repositories and `.ores` source compatibility remain unchanged.

## Test

From the repository root:

```sh
node --test immutable-parity/tests/dashboard.test.cjs
```

This validates script syntax, evidence admission rules, provenance shape, backend lanes, immutable-default coverage and forged receipt rejection. It does **not** run any AttoLang compiler or formal checker.

The optional `immutable-parity-static.yml` workflow is **source-only**, checks out the immutable PR head and tests the exact local source identity. Any job with `steps=null`/`[]`/zero remains an admission failure, even if an external workflow shows a conclusion.

## Release hold

Repository is private. **No public Pages deployment** and no tokens are included. Keep this PR in draft pending native stepful source-owned CI, security/confidentiality review, and independent approval. Do not infer merge eligibility from a clean local test or author-edited checklist.

## Security hardening audit — November 6, 2026

Audited and hardened within draft PR #8, without changing overlapping assurance or collector branches.

**P0 fixes:**
- Strict bounded validation of imported backend, PR, fixture, run, job and checklist records; enforce mandatory lanes, cross-references, unique IDs and names, exact SHA shape, Gregorian UTC timestamps and enums.
- Reject malformed records before rendering and roll back to previous snapshot if rendering fails.
- Demote every imported execution and head/tree field to an explicitly untrusted claim, including plausible started-step timestamps and self-asserted independentlyAudited or receiptVerified booleans.
- Reject duplicate job identities and impossible timestamp values. Inspected null/empty/zero steps indicate failed runner admission; missing/uninspected step records remain unknown.

**P1/P2 fixes:**
- Backend-only filtering now scopes fixture results.
- All job step counts are displayed, not just the first job.
- Date filters explicitly refer to PR update dates.
- Imported snapshots display IMPORTED SOURCE / UNVERIFIED, not the canonical seed's last-audited stamp.
- Keyboard activation for PR/run/fixture rows, drawer focus wrapping and focus restoration.
- Browser-stored checklist marks are sanitized and cannot authenticate GitHub approval.

**Verification:** 25/25 source/DOM harness tests executed locally under Node 22. The repository also includes new source-owned adversarial tests and the workflow runs all immutable-parity/tests/*.test.cjs on an admitted immutable PR head. On the latest head, hosted GitHub jobs still returned steps=null; therefore those jobs did not execute any test steps. No compiler-backed guest or formal proof is claimed.

**Held gates:** nonzero-step source-org CI, independent code/security review, verified five-backend compiler/guest receipts with byte-pinned fixtures and negative mutations, protected-branch review and private hosting safeguards.
