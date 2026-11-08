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
## Repository ownership and migration (2026-11-08)

**Public name:** AttoLang (formerly Oreslang). This remains `ores-truffle-oreslang/compiler-parity-website` until a real authorized repo transfer. Preserve established `.ores` inputs and old tool/package names; do not claim feature parity from a branding or README change.

- **Scope:** read-only dashboards of exact SHA, Git-tree, fixture coverage, CI execution and known gaps.
- **Not this repo:** modifying the source compiler or silently accepting invalid CI evidence.
- **Where code belongs:** [atto-lang](https://github.com/atto-lang) is the canonical home for specs, compilers, portable core/std, developer tooling, conformance and ecosystem examples. [atto-co](https://github.com/atto-co) separately governs deployment, identity, billing, tenant hosting and other managed infrastructure. Existing `atto-*` repos are not automatically transferred source identities.
- **Planned first-stage destination (not approved/executed):** `atto-lang/compiler-parity-website`, under the same name and GitHub numeric repository ID. Direct legacy-org → `atto-co` transfers are not authorized in this wave; future product carve-outs require separate review.

**Migration checklist:** announce precise repo/head/rollback owner in [coordination issue #26](https://github.com/ores-truffle-oreslang/.github/issues/26); use private [migration plan #25](https://github.com/ores-truffle-oreslang/.github/pull/25). Obtain source/target admins and independent security signoff, verify target availability/protections/access, capture numeric repo ID and exact head SHA/tree, PRs/releases, Actions/runners/secrets, packages, deploy keys, GitHub Apps, webhooks, Pages and consumers. Never clone private source into a new org to bypass approval. Confirm stable identity/history/tree after authorized GitHub transfer and rerun exact-head CI at destination. **Zero-step jobs (`steps=[]` or `null`) are `NOT_EXECUTED`; host-only or source-free probes are not compiler-backed AttoLang guest receipts.** Move package/import references and names only after validated cutover.
