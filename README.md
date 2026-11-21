# AttoLang Engineering Command Center

An interactive, responsive, dependency-free static site for the AttoLang / Oreslang engineering workflow, grounded in a **point-in-time GitHub connector snapshot from November 4, 2026**.

## Open the site

Open `index.html` in a modern browser. If your browser restricts local files, serve this folder:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

The deployable source is `index.html` plus `styles.css`, `data.js`, and `app.js`. **No runtime dependencies or API keys** are needed. The site does **not** automatically poll GitHub or trigger Actions, PR updates, approvals or merges.

## Views

| View | What it does |
| --- | --- |
| Overview | Evidence-wall warning, metrics, stepped/admission split, progressive verification funnel and priority actions |
| Pull request registry | Repositories, PRs, branches' exact head SHA, available tree SHA, review/draft status and next gates |
| Execution ledger | Workflow ID, job, attempt when available, step count, conclusion, host/compiler evidence classification |
| .atto fixture atlas | Canonical import, compiler/macro, LRU layout, security and adversarial fixtures; backend-oriented coverage |
| Backend parity | Java/GraalVM, LLVM, .NET NativeAOT, Wasm, and Forge/Cranelift evidence without collapsing authored/host/guest results |
| Layout lab | Interactive SoA, AoS2, AoS3, AoS4, and tiled AoSoA selectors, memory examples and invariants |
| Integrity & exact head | Compare claimed full Git head/tree against snapshot, structural checks, negative mutation checklist |
| Action queue | Prioritized P0/P1/P2 work with concrete, auditable acceptance criteria and locally editable status |
| Reusable checklists | Admission, compiler guest, adversarial receipt and independent merge-review templates with local checkboxes |

There are shared filters for **repository, PR, backend, workflow, fixture, layout, evidence class, gate, search and date range**. Choose **More filters** to expose the second row. Use **⌘/Ctrl + K** for command search. PRs, workflows, fixture cases and actions open a detailed inspector.

## Evidence semantics — fail closed

- `steps=[]`, `steps=null` or zero observed job steps means **runner admission was not established**. Do not report these jobs as source compilation failures.
- A workflow's `conclusion=failure` without inspected job steps means **unknown stage**, not automatically runner admission or compiler failure.
- Real stepped Rust reference, Node host-side tests and source-free GraalVM Native Image probes are **host-only evidence**. Those cannot establish `.atto` compiler or guest parity.
- `ATTO_GUEST_COMPILER_EXECUTION=NOT_EXECUTED` means **guest parity is not proven**.
- Authored fixtures, source-tree inspection, host-only mutation tests, an `ore`/`atto` launcher stub, and expected exit values are all distinct from actual guest execution.
- A native guest receipt needs an independently audited run and job attempt, nonzero steps, full head/tree identity, source compiler, native/AOT linking where required, exact fixture blobs, native guest exit/output and negative mutation controls.
- Workflow phase counters count `sourceCompiled` and `nativeLinked` only when a **bound audited receipt** is present. The import schema can carry `proof` fields for future auditable updates, but the site does **not** independently query a remote API to validate a claimed receipt. Always verify imported receipts against GitHub before trusting or publishing.
- Requested reviewers and Git mergeability do not substitute for submitted independent approval, branch protection, exact-head CI or a verified merge commit.

## Seed provenance

The initial **11 PRs, 13 workflow records, 19 fixture/test groups, 8 parity features, 5 layout options, and 11 prioritized actions** are from connected GitHub metadata and the corresponding PR descriptions. Example heads include Java #2422 `892c3220…`, LLVM #1415 `5031fb86…`, .NET #346 `e085c74a…`, Wasm #288 `61f6e997…`, Forge #183 `7678de0a…`, and LRU #15 `3cf9592a…`. All full stored head SHA values use the GitHub connector metadata.

**Important limitations:** Most root tree SHAs were not returned by the available GitHub connector method. When a root tree appears, it is attributed explicitly to PR description readback, **not** independently verified by this site. Some workflow jobs were inspected and had `steps=null`; others were not inspected, and are marked unknown. Run attempts and workflow-reported heads were not returned in the selected result fields. A workflow-success badge only means a workflow concluded successfully; it does **not** imply compiler-backed guest parity. All 11 seeded PRs are draft and no initial exact-head guest execution is certified.

This seed is a useful triage baseline, **not a claim that GitHub state is still current**. The app visibly marks data as a snapshot.

## Updating the command center

- Use **New record** to add a PR, workflow, or action. The entry lives in browser `localStorage` and does not update GitHub.
- Use **Import** to load a JSON snapshot conforming to `schemaVersion: 1` and the arrays `prs`, `workflows`, `fixtures`, `parity`, `layouts`, `actions`. Import *replaces* the local snapshot; export before replacing.
- Use **Export** for complete JSON with local action/checklist state, or filtered PR CSV. Local edits and checklist marks survive refresh in the same browser.
- For canonical re-verification, fetch PR `head_sha`, root `commit.tree.sha`, fixture blob SHAs, `run_attempt`, each job's `steps` and receipt assertions through an **authorized GitHub connector / CI reporter outside this static browser**; then import the snapshot. Do not put GitHub tokens in a static site or publicly expose private repo metadata.
- For multi-organization CI where source is private, do not mirror code without explicit approval. If an authorized source-free or exact-tree carrier is used, retain source identity, stepful evidence and controls against false guest claims.

## Tests and deployment

Run the local smoke tests with Node 18+:

```bash
node tests/smoke.cjs
```

The nine views are syntax/structurally smoke-tested. This **is not** a visual-browser or compiler-backed guest test. No real AttoLang program is executed by the dashboard.

You can host this repository on GitHub Pages, Cloudflare Pages, Netlify or any static host. **The repository is private; do not enable publicly reachable Pages without reviewing the PR metadata and hosting access policy.** Hosting is not automatically enabled.

## License

This generated dashboard is provided for your internal engineering workflow. No third-party UI libraries are bundled.
## Formal-methods and security assurance

Open [formal-security.html](formal-security.html) for the new dedicated formal-methods, security and repository-hardening site. It links back to the original engineering dashboard. Both are dependency-free static pages; this route uses its own data and browser state to avoid breaking the existing parity views.

The initial **point-in-time snapshot from 2026-11-06** contains 12 curated PRs across the platform-conformance, Java, LLVM, .NET, Wasm and Forge repositories, nine invariant/threat contracts, nine reusable formalization templates, and 12 P0–P2 hardening tasks. It is a **subset, not a complete scan** and does not live-poll GitHub. The snapshot includes full PR head SHAs and only known root-tree values, explicitly labeling a PR-described tree as not independently verified. Some runs and attempts were not inspected.

The interface provides six views: command overview, repository/PR registry, threats/invariants, workflow evidence, prioritized work queues and formal-specification templates. Shared filters cover repository, backend, PR, invariant, evidence class, severity, status and text search. Click a PR/invariant/task to inspect its threat, formal evidence, mutation coverage, known run, and next merge gate. Task status changes are browser-local only. JSON import/export and filtered CSV work offline without exposing a GitHub token.

### Non-promoting evidence rules

- `steps=[]`, `steps=null`, or numeric zero means **runner admission not established**; never call that compiler failure or successful execution.
- An uninspected workflow conclusion is **not inspected**, not automatically a zero-step run.
- A stepful run only establishes observed runner steps; the site does not infer what tests ran.
- Authored fixtures, reported local bounded models, local host-only tests, and source-free CI are not compiler-backed guest proof.
- Imported JSON is untrusted. The import routine resets guest execution claims to `NOT_INDEPENDENTLY_VERIFIED` and removes any claimed run-to-head binding. This static browser does not authenticate GitHub metadata, signatures, compiler binaries, source trees or independent reviews.
- Merged source-only work does not imply feature parity; no seeded PR is independently guest-certified or declared merge-ready.
- For CI portability, a real guest proof needs independently audited repo/head/tree/fixture blobs, run/attempt/job and positive steps, compiler digest, link/AOT output where applicable, native guest trace/exit, negative controls and independent review. Author controls cannot approve their own PR.

### Local validation and scope

Run `node --check formal-data.js`, `node --check formal-security.js` and `node tests/formal-security.test.cjs` with Node 22+. The dedicated workflow `.github/workflows/assurance-dashboard.yml` also runs the original site smoke test. These are **source-only site checks**, not AttoLang model-checker execution, compiler tests or five-backend guest parity.

The repository is private. **Do not enable public Pages/hosting without an explicit private-metadata and access review.** The site has no live GitHub credentials, server API, background agent or merge/approval controls. Refresh the snapshot through an authorized and independently audited ingestion pipeline before relying on it for operational approvals.

### Assurance execution and collection hardening (Nov 6)

The dedicated pull-request workflow now checks out the **immutable PR source
head** rather than the default synthetic pull-request merge ref. Once a runner
actually executes, it compares the Git head to the expected SHA, records the
full tree and run/attempt/job identity, and runs the original dashboard smoke,
assurance view tests, mocked collector tests, and bounded state models with
nine behavior-changing mutation controls. It uploads a private
**SOURCE_ONLY_SITE_TEST** receipt. Neither artifact nor workflow success
certifies AttoLang guest execution or independent receipt authentication.

The separate manual-only collector workflow reads only explicitly scoped GitHub
API metadata using the dedicated Actions secret named
ATTO_ASSURANCE_READ_TOKEN. An admin must provision an appropriately restricted
read-only credential authorized for the source repositories (contents metadata,
pull requests, Actions runs/jobs and branch protection as applicable). The
collector fails closed without that secret. It never fetches source files or
writes back to GitHub, does not automatically publish snapshot JSON into this
private static website, and emits a private artifact with seven-day retention.
Its periodic schedule is intentionally disabled pending administrator authorization and runner repair.

To run the collector locally, from the repo root:

    ASSURANCE_READ_TOKEN=<read-only-secret> node tools/collect-assurance.mjs --strict private-artifacts/assurance-latest.json

Use a secure local secret manager or ephemeral environment variable; never
commit the token or the resulting metadata. The ignored private-artifacts/
directory is deliberately excluded from publication. Import the generated
JSON into the dashboard only after reviewing its completeness and provenance:
the browser **still treats imported receipts as unverified**. No automated
evidence promotion is implemented.

The finite-state model suite and optional TLA+ reference modules are documented
in formal/README.md. The JavaScript checker is a bounded design model only;
TLA+ TLC execution, unbounded proofs and cross-backend refinement have not
been verified.

**CI admission limitation:** on Nov 6 the source-only website and assurance
workflows initially failed with steps=null. Their reruns were requested.
No claim of successful stepful hosted CI is made until job-step readback proves it.


### Unified collector / borrow-generation hardening

The next reviewable change set integrates the useful improvements from the
overlapping collector draft into the original canonical tools/collect-assurance.mjs
rather than enabling two token-bearing readers. Workflow attempt-scoped job records,
genuine started-step classification, duplicate job-name rejection and fail-closed
incomplete result pages now inform the dashboard's expanded per-job ledger.
An imported run-head match is never interpreted as proof of what source the runner
actually checked out.

The canonical bounded checker now includes a fifth actor borrow/generation model
(two concurrent readers, exclusive writer, rt take ownership generation), with nine
negative mutants across the five models. A new TLA+ specification and expected
unsafe-counterexample configs live under formal/specs/. The dedicated
assurance-tlc.yml workflow is source-only and uses a pinned tool digest. Both
model and collector output are private metadata; guest proof remains UNVERIFIED.

See formal/refinement/ACT-BORROW-V1.md for the planned Java-to-five-backend
refinement acceptance contract. Host/model evidence is not a substitute for a
real compiled .atto guest run, even when a workflow reports success.
