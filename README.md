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
| Binding semantics | Side-by-side semantic comparator for `int x = 7;`, `const x = 7;`, and `const int x = 7;`; independent `let`/`mut` permission matrix and 14 proposed positive/negative contracts |
| Integrity & exact head | Compare claimed full Git head/tree against snapshot, structural checks, negative mutation checklist |
| Action queue | Prioritized P0/P1/P2 work with concrete, auditable acceptance criteria and locally editable status |
| Reusable checklists | Admission, compiler guest, adversarial receipt and independent merge-review templates with local checkboxes |

There are shared filters for **repository, PR, backend, semantic area, workflow, fixture, layout, evidence class, gate, search and date range**. Choose **More filters** to expose the second row. Use **⌘/Ctrl + K** for command search. PRs, workflows, fixture cases and actions open a detailed inspector.

## Evidence semantics — fail closed

- `steps=[]`, `steps=null` or zero observed job steps (including string-form `[]`, `null`, or `0` from faulty imports) means **runner admission was not established**. Do not report these jobs as source compilation failures.
- A workflow's `conclusion=failure` without inspected job steps means **unknown stage**, not automatically runner admission or compiler failure.
- Real stepped Rust reference, Node host-side tests and source-free GraalVM Native Image probes are **host-only evidence**. Those cannot establish `.atto` compiler or guest parity.
- `ATTO_GUEST_COMPILER_EXECUTION=NOT_EXECUTED` means **guest parity is not proven**.
- Authored fixtures, source-tree inspection, host-only mutation tests, an `ore`/`atto` launcher stub, and expected exit values are all distinct from actual guest execution.
- A native guest receipt needs an independently audited run and job attempt, nonzero steps, full head/tree identity, source compiler, native/AOT linking where required, exact fixture blobs, native guest exit/output and negative mutation controls.
- **Imported `proof.independentlyAudited=true` is not sufficient.** This fully offline site has no trusted signature-verification root, so it never promotes an imported claim to green `GUEST_VERIFIED`. Structurally complete guest claims are labeled **Guest receipt · not independently verified** and malformed claims **Unsupported guest claim**. Compiler, link, receipt and merge-success metrics cannot be self-certified by JSON. A future trusted verifier must compare signed artifact hashes against immutable GitHub source/run/job/attempt records before promotion.
- The import schema can carry `receipts: [{kind,sha256,head,jobId,attempt}]` and `negativeMutations: [{id,expected,observed,receiptSha256}]` on each workflow. These are surfaced in the workflow inspector as **imported/unverified** and never converted into an executed assertion merely because a row exists.
- Requested reviewers and Git mergeability do not substitute for submitted independent approval, branch protection, exact-head CI or a verified merge commit.

## Seed provenance

The initial **11 PRs, 13 workflow records, 19 previously inventoried fixture/test groups, 8 parity features, 5 layout options, and 11 prioritized actions** are from connected GitHub metadata and the corresponding PR descriptions. The site separately bundles **14 proposed binding/mutability specification cases and one unproven five-backend parity row**. These 14 cases have **no authored source file proof, PR association, run attempt, source blob, or guest execution** and are never counted as tested fixtures. Example heads include Java #2422 `892c3220…`, LLVM #1415 `5031fb86…`, .NET #346 `e085c74a…`, Wasm #288 `61f6e997…`, Forge #183 `7678de0a…`, and LRU #15 `3cf9592a…`. All full stored head SHA values use the GitHub connector metadata.

**Important limitations:** Most root tree SHAs were not returned by the available GitHub connector method. When a root tree appears, it is attributed explicitly to PR description readback, **not** independently verified by this site. Some workflow jobs were inspected and had `steps=null`; others were not inspected, and are marked unknown. Run attempts and workflow-reported heads were not returned in the selected result fields. A workflow-success badge only means a workflow concluded successfully; it does **not** imply compiler-backed guest parity. All 11 seeded PRs are draft and no initial exact-head guest execution is certified.

This seed is a useful triage baseline, **not a claim that GitHub state is still current**. The app visibly marks data as a snapshot.

## Updating the command center

- Use **New record** to add a PR, workflow, or action. The entry lives in browser `localStorage` and does not update GitHub.
- Use **Import** to load a JSON snapshot conforming to `schemaVersion: 1` and the arrays `prs`, `workflows`, `fixtures`, `parity`, `layouts`, `actions`. Import replaces the local evidence snapshot; the site automatically restores its separately labeled **SPEC_ONLY** binding contracts into older snapshots. Export before replacing.
- Use **Export** for complete JSON with local action/checklist state, or filtered PR CSV. Local edits and checklist marks survive refresh in the same browser.
- For canonical re-verification, fetch PR `head_sha`, root `commit.tree.sha`, fixture blob SHAs, `run_attempt`, each job's `steps` and receipt assertions through an **authorized GitHub connector / CI reporter outside this static browser**; then import the snapshot. Do not put GitHub tokens in a static site or publicly expose private repo metadata.
- For multi-organization CI where source is private, do not mirror code without explicit approval. If an authorized source-free or exact-tree carrier is used, retain source identity, stepful evidence and controls against false guest claims.

## Tests and deployment

Run the local smoke tests with Node 18+:

```bash
node tests/smoke.cjs
node tests/binding-contract.cjs
```

The ten views are syntax/structurally smoke-tested. Binding contract tests additionally cover the unproven five-backend model, 14 proposed fixtures, zero-step admission classification, and imported guest claim counterexamples. This **is not** a visual-browser or compiler-backed guest test. No real AttoLang program is executed by the dashboard.

You can host this repository on GitHub Pages, Cloudflare Pages, Netlify or any static host. **The repository is private; do not enable publicly reachable Pages without reviewing the PR metadata and hosting access policy.** Hosting is not automatically enabled.

## License

This generated dashboard is provided for your internal engineering workflow. No third-party UI libraries are bundled.
## Binding and referent mutability acceptance contract

The language design treats `int x = 7;`, `const x = 7;` and `const int x = 7;` as equivalent **immutable int bindings**. They should all reject `x = 8;`. Explicit `let` permits reassignment subject to static typing and ownership, whereas a separate `mut` capability on an owned referent controls mutation of that referent; `let` alone never upgrades referent write rights. The illustrative syntax for mutable referents is still **unverified** against the compiler parsers. Primitive values are not mutated in place.

The 14 draft BND fixtures cover equivalent declarations, three negative rebinds, positive typed `let` rebinding, invalid retyping, immutable and mutable referents, borrow/share/take aliases, and actor ownership. The parity matrix shows **Unproven** across Java/GraalVM, LLVM, .NET NativeAOT, Wasm and Forge/Cranelift until real byte-identical `.atto` files, compiler diagnostics, guest programs and negative-mutation receipts are available. Existing Oreslang repository and `.ores` compatibility remains; no automatic extension rewrite is performed.

The site-CI workflow now checks out the immutable PR **head**, confirms `git rev-parse HEAD` equals the expected SHA, records the **root tree**, run and attempt, and executes Node source-only checks. This is **not** AttoLang execution, native linking, production proof or a merge authorization. If GitHub Actions reports zero steps, that remains **runner-admission failure**, regardless of a workflow conclusion.
